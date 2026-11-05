//! Real-time updates to web clients.

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, State};
use axum::response::Response;
use std::net::SocketAddr;
use std::time::Duration;
use tokio::sync::broadcast::error::RecvError;

use super::{AppState, client_ip};

pub async fn handle(State(hub): State<AppState>, ConnectInfo(addr): ConnectInfo<SocketAddr>, ws: WebSocketUpgrade) -> Response {
    let ip = client_ip(addr).to_string();
    ws.on_upgrade(move |socket| run(hub, ip, socket))
}

async fn run(hub: AppState, ip: String, mut socket: WebSocket) {
    // Subscribe before taking the snapshot so no update falls in between.
    let mut rx = hub.subscribe();
    for m in hub.init_messages() {
        if socket.send(Message::Text(m.json.as_ref().into())).await.is_err() {
            return;
        }
    }
    let mut ping = tokio::time::interval(Duration::from_secs(30));
    ping.tick().await;

    loop {
        tokio::select! {
            msg = rx.recv() => match msg {
                Ok(m) => {
                    // Blocked devices only learn about device-list changes (their blocked state).
                    let allowed = !hub.clients.lock().is_blocked(&ip) || m.kind.starts_with("devices_");
                    if allowed && socket.send(Message::Text(m.json.as_ref().into())).await.is_err() {
                        return;
                    }
                }
                Err(RecvError::Lagged(_)) => {
                    // Fell behind: resend a full snapshot instead of dropping state.
                    for m in hub.init_messages() {
                        if socket.send(Message::Text(m.json.as_ref().into())).await.is_err() {
                            return;
                        }
                    }
                }
                Err(RecvError::Closed) => return,
            },
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => return,
                Some(Ok(_)) => {}
            },
            _ = ping.tick() => {
                if socket.send(Message::Ping(Vec::new().into())).await.is_err() {
                    return;
                }
            }
            _ = hub.closed() => {
                let _ = socket.send(Message::Close(None)).await;
                return;
            }
        }
    }
}
