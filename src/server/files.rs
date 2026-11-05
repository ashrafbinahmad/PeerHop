//! File downloads with HTTP Range support and per-client progress tracking.

use axum::body::Body;
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use futures_util::Stream;
use std::io;
use std::net::IpAddr;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;

use crate::hub::{Hub, HubEvent};
use crate::store::Progress;

const CHUNK: usize = 256 * 1024;
const PROGRESS_EVERY: Duration = Duration::from_millis(200);

/// Parse a single `bytes=` range against `len`. `Err(())` means unsatisfiable.
fn parse_range(value: &str, len: u64) -> Result<Option<(u64, u64)>, ()> {
    let Some(spec) = value.trim().strip_prefix("bytes=") else { return Ok(None) };
    // Multi-range requests are rare; serve the whole file instead.
    if spec.contains(',') {
        return Ok(None);
    }
    let (a, b) = spec.split_once('-').ok_or(())?;
    let (a, b) = (a.trim(), b.trim());
    if len == 0 {
        return Err(());
    }
    let (start, end) = if a.is_empty() {
        let n: u64 = b.parse().map_err(|_| ())?;
        if n == 0 {
            return Err(());
        }
        (len.saturating_sub(n), len - 1)
    } else {
        let start: u64 = a.parse().map_err(|_| ())?;
        let end = if b.is_empty() { len - 1 } else { b.parse::<u64>().map_err(|_| ())?.min(len - 1) };
        (start, end)
    };
    if start > end || start >= len {
        return Err(());
    }
    Ok(Some((start, end)))
}

fn content_disposition(kind: &str, name: &str) -> HeaderValue {
    let ascii: String = name.chars().map(|c| if c.is_ascii_graphic() && c != '"' && c != '\\' || c == ' ' { c } else { '_' }).collect();
    let encoded: String = name
        .bytes()
        .map(|b| if b.is_ascii_alphanumeric() || b"-._~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") })
        .collect();
    HeaderValue::from_str(&format!("{kind}; filename=\"{ascii}\"; filename*=UTF-8''{encoded}"))
        .unwrap_or_else(|_| HeaderValue::from_static("attachment"))
}

pub async fn serve(hub: Arc<Hub>, path: PathBuf, txn_id: Option<u64>, ip: IpAddr, headers: &HeaderMap, preview: bool) -> Response {
    let ip_s = ip.to_string();
    let mut file = match tokio::fs::File::open(&path).await {
        Ok(f) => f,
        Err(_) => return (StatusCode::NOT_FOUND, "File not found").into_response(),
    };
    let len = match file.metadata().await {
        Ok(m) => m.len(),
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Could not read file").into_response(),
    };
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "file".into());

    let range = match headers.get(header::RANGE).and_then(|v| v.to_str().ok()) {
        Some(v) => match parse_range(v, len) {
            Ok(r) => r,
            Err(()) => {
                return Response::builder()
                    .status(StatusCode::RANGE_NOT_SATISFIABLE)
                    .header(header::CONTENT_RANGE, format!("bytes */{len}"))
                    .body(Body::empty())
                    .unwrap();
            }
        },
        None => None,
    };
    let (start, end) = range.unwrap_or((0, len.saturating_sub(1)));
    let body_len = if len == 0 { 0 } else { end - start + 1 };
    if start > 0 && file.seek(io::SeekFrom::Start(start)).await.is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Seek failed").into_response();
    }
    let reader = ReaderStream::with_capacity(file.take(body_len), CHUNK);

    let mut builder = Response::builder()
        .status(if range.is_some() { StatusCode::PARTIAL_CONTENT } else { StatusCode::OK })
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, body_len);
    if range.is_some() {
        builder = builder.header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{len}"));
    }

    let body = if preview {
        // Thumbnails: no progress tracking, render inline.
        let mime = mime_guess::from_path(&path).first_or_octet_stream();
        builder = builder
            .header(header::CONTENT_TYPE, mime.as_ref())
            .header(header::CONTENT_DISPOSITION, content_disposition("inline", &name));
        Body::from_stream(Tracked { inner: reader, hub, ip: ip_s, txn: None, start, sent: 0, total: len, last: Instant::now() })
    } else {
        builder = builder
            .header(header::CONTENT_TYPE, "application/octet-stream")
            .header(header::CONTENT_DISPOSITION, content_disposition("attachment", &name));
        Body::from_stream(Tracked { inner: reader, hub, ip: ip_s, txn: txn_id, start, sent: 0, total: len, last: Instant::now() - PROGRESS_EVERY })
    };
    builder.body(body).unwrap()
}

/// Byte stream that reports progress and aborts on cancel/block/shutdown.
struct Tracked<S> {
    inner: S,
    hub: Arc<Hub>,
    ip: String,
    txn: Option<u64>,
    start: u64,
    sent: u64,
    total: u64,
    last: Instant,
}

impl<S> Tracked<S> {
    fn should_abort(&self) -> bool {
        if self.hub.is_closed() || self.hub.clients.lock().is_blocked(&self.ip) {
            return true;
        }
        match self.txn {
            Some(id) => {
                let mut txs = self.hub.txs.lock();
                txs.is_cancelled(id) || txs.is_client_cancelled(id, &self.ip)
            }
            None => false,
        }
    }

    fn report(&mut self) {
        let Some(id) = self.txn else { return };
        if self.sent == 0 {
            return;
        }
        let end = self.start + self.sent - 1;
        let outcome = self.hub.txs.lock().record_client_range(id, &self.ip, self.start, end, self.total);
        if outcome == Progress::Ignored {
            return;
        }
        self.hub.broadcast_txn(id);
        if outcome == Progress::ClientCompleted {
            let name = self.hub.txs.lock().get(id).map(|t| t.filename.clone()).unwrap_or_default();
            self.hub.emit(HubEvent::ClientFinished { ip: self.ip.clone(), name, size: self.total });
        }
    }
}

impl<S> Stream for Tracked<S>
where
    S: Stream<Item = io::Result<axum::body::Bytes>> + Unpin,
{
    type Item = io::Result<axum::body::Bytes>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        if self.should_abort() {
            return Poll::Ready(Some(Err(io::Error::other("transfer cancelled"))));
        }
        let polled = Pin::new(&mut self.inner).poll_next(cx);
        if let Poll::Ready(Some(Ok(chunk))) = &polled {
            self.sent += chunk.len() as u64;
            let done = self.start + self.sent >= self.total;
            if done || self.last.elapsed() >= PROGRESS_EVERY {
                self.last = Instant::now();
                self.report();
            }
        }
        polled
    }
}

#[cfg(test)]
mod tests {
    use super::parse_range;

    #[test]
    fn ranges() {
        assert_eq!(parse_range("bytes=0-99", 1000), Ok(Some((0, 99))));
        assert_eq!(parse_range("bytes=900-", 1000), Ok(Some((900, 999))));
        assert_eq!(parse_range("bytes=-100", 1000), Ok(Some((900, 999))));
        assert_eq!(parse_range("bytes=0-5000", 1000), Ok(Some((0, 999))));
        assert_eq!(parse_range("bytes=1000-", 1000), Err(()));
        assert_eq!(parse_range("items=0-1", 1000), Ok(None));
    }
}
