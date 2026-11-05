//! HTTP + WebSocket API used by the mobile/browser web UI.
//!
//! Endpoint shapes are unchanged from the Go version so the existing web UI works as-is.
//! The desktop UI no longer goes through HTTP: it calls [`Hub`] directly, so the old
//! admin-token endpoints are gone.

mod assets;
mod files;
mod upload;
mod ws;

use axum::Router;
use axum::extract::{ConnectInfo, DefaultBodyLimit, Path as UrlPath, Query, Request, State};
use axum::http::{HeaderMap, Method, StatusCode, header};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Json, Response};
use axum::routing::{get, post};
use serde::Deserialize;
use serde_json::json;
use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use tokio::net::TcpListener;

use crate::hub::{Hub, Mode};

pub type AppState = Arc<Hub>;

/// Running server. Dropping it does not stop it; call [`Server::stop`].
pub struct Server {
    pub hub: Arc<Hub>,
    pub port: u16,
    stop_tx: Option<tokio::sync::oneshot::Sender<()>>,
}

impl Server {
    /// Bind `0.0.0.0:port` (0 = any free port) and start serving.
    pub async fn start(hub: Arc<Hub>, port: u16) -> std::io::Result<Server> {
        let listener = TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], port))).await?;
        let port = listener.local_addr()?.port();
        let (stop_tx, stop_rx) = tokio::sync::oneshot::channel::<()>();
        let app = router(hub.clone()).into_make_service_with_connect_info::<SocketAddr>();
        tokio::spawn(async move {
            let res = axum::serve(listener, app)
                .with_graceful_shutdown(async {
                    let _ = stop_rx.await;
                })
                .await;
            if let Err(e) = res {
                crate::log_warn!("Server error: {e}");
            }
        });
        tokio::spawn(device_monitor(hub.clone()));
        crate::log_info!("Server listening on port {port}");
        Ok(Server { hub, port, stop_tx: Some(stop_tx) })
    }

    /// Cancel transfers, disconnect clients and release the port.
    pub fn stop(&mut self) {
        self.hub.close();
        if let Some(tx) = self.stop_tx.take() {
            let _ = tx.send(());
        }
    }
}

/// Clients expire after 5 minutes of inactivity; push the updated list when that happens.
async fn device_monitor(hub: Arc<Hub>) {
    let mut last = usize::MAX;
    let mut tick = tokio::time::interval(std::time::Duration::from_secs(2));
    loop {
        tokio::select! {
            _ = tick.tick() => {}
            _ = hub.closed() => return,
        }
        let n = hub.clients.lock().active().len();
        if n != last {
            if last != usize::MAX {
                hub.broadcast_devices();
            }
            last = n;
        }
    }
}

fn router(hub: Arc<Hub>) -> Router {
    Router::new()
        .route("/api/meta", get(meta))
        .route("/api/download", get(download_current))
        .route("/api/download-file/{id}", get(download_by_id))
        .route("/api/upload", post(upload::handle).layer(DefaultBodyLimit::max(50 << 30)))
        .route("/api/clients", get(clients))
        .route("/api/my-ip", get(my_ip))
        .route("/api/theme", get(theme))
        .route("/api/settings", get(settings))
        .route("/api/transactions", get(transactions))
        .route("/api/send-text", post(send_text))
        .route("/api/cancel-download/{id}", post(cancel_download))
        .route("/api/cancel-transaction/{id}", post(cancel_transaction))
        .route("/api/delete-transaction/{id}", post(delete_transaction))
        .route("/api/ws", get(ws::handle))
        .fallback(assets::serve)
        .layer(middleware::from_fn_with_state(hub.clone(), guard))
        .with_state(hub)
}

pub(crate) fn client_ip(addr: SocketAddr) -> IpAddr {
    match addr.ip() {
        IpAddr::V6(v6) => v6.to_ipv4_mapped().map(IpAddr::V4).unwrap_or(IpAddr::V6(v6)),
        ip => ip,
    }
}

fn is_public(method: &Method, path: &str) -> bool {
    let is_asset = path == "/"
        || path == "/index.html"
        || path.starts_with("/assets/")
        || path == "/favicon.ico"
        || [".js", ".mjs", ".css", ".map", ".png", ".svg", ".ico", ".woff2", ".webmanifest"].iter().any(|s| path.ends_with(s));
    is_asset || path == "/api/meta" || (method == Method::GET && (path == "/api/settings" || path == "/api/theme"))
}

/// Tracks devices, enforces blocking and the security token.
async fn guard(State(hub): State<AppState>, ConnectInfo(addr): ConnectInfo<SocketAddr>, req: Request, next: Next) -> Response {
    if hub.is_closed() {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    }
    let ip = client_ip(addr);
    let path = req.uri().path().to_string();
    // Blocked devices may still load the page and the socket (to learn they are blocked).
    if hub.clients.lock().is_blocked(&ip.to_string())
        && (req.method() == Method::POST || path.contains("/download") || path.contains("/upload"))
    {
        return (StatusCode::FORBIDDEN, "Access denied").into_response();
    }

    let authorized = !hub.shared().security_enabled || {
        let token = req.uri().query().and_then(|q| url_param(q, "security")).unwrap_or_default();
        crate::util::token_eq(&token, &hub.security_token)
    };
    if !authorized && !is_public(req.method(), &path) {
        return (StatusCode::UNAUTHORIZED, "Invalid or missing security token").into_response();
    }
    // Only authorized traffic counts as a connected device: a stale page still
    // polling with an old token must not appear in the device list.
    if authorized {
        let ua = req.headers().get(header::USER_AGENT).and_then(|v| v.to_str().ok()).unwrap_or("");
        hub.touch_client(ua, ip);
    }
    next.run(req).await
}

fn url_param(query: &str, key: &str) -> Option<String> {
    query.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=')?;
        (k == key).then(|| v.to_string())
    })
}

// ---- handlers ---------------------------------------------------------------

async fn meta(State(hub): State<AppState>) -> Json<serde_json::Value> {
    let app = if hub.mode == Mode::Desktop { "ui" } else { "cli" };
    match (hub.mode, hub.current_file()) {
        (Mode::CliReceive, _) | (_, None) => Json(json!({ "mode": "upload", "app": app })),
        (_, Some(path)) => {
            let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            Json(json!({ "mode": "download", "filename": name, "size": size, "app": app }))
        }
    }
}

async fn download_current(
    State(hub): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let Some(path) = hub.current_file() else {
        return (StatusCode::NOT_FOUND, "No file available for download").into_response();
    };
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let id = hub.txs.lock().latest_outgoing_by_name(&name);
    files::serve(hub, path, id, client_ip(addr), &headers, q.get("preview").is_some_and(|v| v == "true")).await
}

async fn download_by_id(
    State(hub): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    UrlPath(id): UrlPath<u64>,
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let path = hub.txs.lock().get(id).and_then(|t| t.local_path());
    let Some(path) = path else {
        return (StatusCode::NOT_FOUND, "File not found").into_response();
    };
    files::serve(hub, path, Some(id), client_ip(addr), &headers, q.get("preview").is_some_and(|v| v == "true")).await
}

async fn clients(State(hub): State<AppState>) -> Json<serde_json::Value> {
    Json(json!({ "clients": hub.clients.lock().active() }))
}

async fn my_ip(ConnectInfo(addr): ConnectInfo<SocketAddr>) -> Json<serde_json::Value> {
    Json(json!({ "ip": client_ip(addr).to_string() }))
}

async fn theme(State(hub): State<AppState>) -> Json<serde_json::Value> {
    let s = hub.shared();
    Json(json!({ "isDarkMode": s.is_dark, "themeId": s.theme_id, "accentId": s.accent_id }))
}

async fn settings(State(hub): State<AppState>) -> Json<serde_json::Value> {
    let s = hub.shared();
    Json(json!({
        "textTransferEnabled": s.text_transfer_enabled,
        "securityEnabled": s.security_enabled,
        "isDesktop": false,
    }))
}

async fn transactions(State(hub): State<AppState>) -> Json<serde_json::Value> {
    Json(json!({ "transactions": hub.txs.lock().all() }))
}

#[derive(Deserialize)]
struct SendTextReq {
    text: String,
}

async fn send_text(State(hub): State<AppState>, ConnectInfo(addr): ConnectInfo<SocketAddr>, Json(req): Json<SendTextReq>) -> Response {
    let ip = client_ip(addr).to_string();
    if hub.clients.lock().is_sending_blocked(&ip) {
        return (StatusCode::FORBIDDEN, "Sending is blocked").into_response();
    }
    if !hub.shared().text_transfer_enabled {
        return (StatusCode::FORBIDDEN, "Text transfer is disabled").into_response();
    }
    // The sender is always the requesting device; clients cannot impersonate the desktop.
    let id = hub.send_text(&ip, &ip, req.text);
    Json(json!({ "success": true, "id": id })).into_response()
}

async fn cancel_download(State(hub): State<AppState>, ConnectInfo(addr): ConnectInfo<SocketAddr>, UrlPath(id): UrlPath<u64>) -> Response {
    // A device may only cancel its own download.
    if hub.cancel_client_download(id, &client_ip(addr).to_string()) {
        Json(json!({ "success": true })).into_response()
    } else {
        (StatusCode::NOT_FOUND, "Transaction not found").into_response()
    }
}

/// Lets a device stop its own in-flight upload.
async fn cancel_transaction(State(hub): State<AppState>, ConnectInfo(addr): ConnectInfo<SocketAddr>, UrlPath(id): UrlPath<u64>) -> Response {
    let ip = client_ip(addr).to_string();
    let owned = hub.txs.lock().get(id).map(|t| t.sender_id == ip);
    match owned {
        Some(true) => {
            hub.cancel_transaction(id);
            Json(json!({ "success": true })).into_response()
        }
        Some(false) => (StatusCode::FORBIDDEN, "Not your transfer").into_response(),
        None => (StatusCode::NOT_FOUND, "Transaction not found").into_response(),
    }
}

/// Mobile "delete" removes the entry from history; files on the desktop are never
/// deleted on a remote device's request.
async fn delete_transaction(State(hub): State<AppState>, UrlPath(id): UrlPath<u64>) -> Response {
    if hub.delete_transaction(id, false) {
        Json(json!({ "success": true })).into_response()
    } else {
        (StatusCode::NOT_FOUND, "Transaction not found").into_response()
    }
}
