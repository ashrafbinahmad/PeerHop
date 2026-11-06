//! Streaming multipart uploads from devices straight to disk.

use axum::extract::{ConnectInfo, Multipart, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json, Response};
use serde_json::json;
use std::net::SocketAddr;
use std::path::Path;
use std::time::{Duration, Instant};
use tokio::io::AsyncWriteExt;

use super::{AppState, client_ip};
use crate::hub::Mode;
use crate::store::{Status, Transaction};

const PROGRESS_EVERY: Duration = Duration::from_millis(200);

enum Abort {
    Cancelled,
    Blocked,
    Failed(String),
}

pub async fn handle(State(hub): State<AppState>, ConnectInfo(addr): ConnectInfo<SocketAddr>, mut form: Multipart) -> Response {
    let ip = client_ip(addr).to_string();
    if hub.clients.lock().is_sending_blocked(&ip) {
        return (StatusCode::FORBIDDEN, "Sending is blocked").into_response();
    }
    let dir = match hub.mode {
        Mode::CliReceive => std::env::current_dir().unwrap_or_else(|_| ".".into()),
        _ => hub.shared().download_dir,
    };
    if let Err(e) = tokio::fs::create_dir_all(&dir).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, format!("Cannot create download folder: {e}")).into_response();
    }

    let mut saved = Vec::new();
    let mut ids = Vec::new();
    let mut declared_size: u64 = 0;

    loop {
        let mut field = match form.next_field().await {
            Ok(Some(f)) => f,
            Ok(None) => break,
            Err(e) => return (StatusCode::BAD_REQUEST, format!("Invalid multipart data: {e}")).into_response(),
        };
        match field.name() {
            Some("file_size") => {
                declared_size = field.text().await.ok().and_then(|t| t.trim().parse().ok()).unwrap_or(0);
                continue;
            }
            Some("file") => {}
            _ => continue, // unread fields are skipped by the parser
        }
        let Some(name) = field.file_name().and_then(crate::util::sanitize_filename) else { continue };
        let path = crate::util::unique_path(&dir, &name);
        let stored_name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or(name);

        let id = hub.txs.lock().add(Transaction::incoming_file(&ip, &stored_name, declared_size, &path));
        hub.broadcast_txn(id);
        ids.push(id);

        match receive(&hub, &ip, id, &path, &mut field, declared_size).await {
            Ok(written) => {
                hub.file_received(id, &stored_name, written);
                crate::log_info!("Received {stored_name} ({written} bytes) from {ip}");
                saved.push(stored_name);
            }
            Err(abort) => {
                let _ = tokio::fs::remove_file(&path).await;
                let (status, code, msg) = match abort {
                    Abort::Cancelled => (Status::Cancelled, StatusCode::from_u16(499).unwrap(), "Upload cancelled".to_string()),
                    Abort::Blocked => (Status::Cancelled, StatusCode::FORBIDDEN, "Client blocked".to_string()),
                    Abort::Failed(e) => (Status::Failed, StatusCode::INTERNAL_SERVER_ERROR, format!("Error saving file: {e}")),
                };
                hub.end_transfer(id, status);
                return (code, msg).into_response();
            }
        }
        declared_size = 0;
    }

    Json(json!({ "success": true, "files": saved, "count": saved.len(), "transactionIds": ids })).into_response()
}

async fn receive(
    hub: &AppState,
    ip: &str,
    id: u64,
    path: &Path,
    field: &mut axum::extract::multipart::Field<'_>,
    declared: u64,
) -> Result<u64, Abort> {
    let file = tokio::fs::File::create(path).await.map_err(|e| Abort::Failed(e.to_string()))?;
    let mut out = tokio::io::BufWriter::with_capacity(1 << 20, file);
    let mut written: u64 = 0;
    let mut last = Instant::now();
    loop {
        let chunk = tokio::select! {
            c = field.chunk() => c,
            _ = hub.closed() => return Err(Abort::Cancelled),
        };
        // A read error means the device disconnected or aborted the request.
        let Some(chunk) = chunk.map_err(|_| Abort::Cancelled)? else { break };
        out.write_all(&chunk).await.map_err(|e| Abort::Failed(e.to_string()))?;
        written += chunk.len() as u64;

        if hub.txs.lock().is_cancelled(id) {
            return Err(Abort::Cancelled);
        }
        if last.elapsed() >= PROGRESS_EVERY {
            last = Instant::now();
            if hub.clients.lock().is_sending_blocked(ip) {
                return Err(Abort::Blocked);
            }
            // Stay below 100% until the stream actually ends; unknown size reports bytes only.
            let total = if declared > 0 { declared.max(written + 1) } else { 0 };
            hub.txs.lock().update_progress(id, written, total);
            hub.broadcast_txn(id);
        }
    }
    out.flush().await.map_err(|e| Abort::Failed(e.to_string()))?;
    Ok(written)
}
