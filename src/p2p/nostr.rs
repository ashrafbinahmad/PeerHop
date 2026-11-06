//! Minimal Nostr client: signed ephemeral events over a pool of public relays.
//! Used only as a rendezvous for presence and WebRTC offers/answers.

use futures_util::{SinkExt, StreamExt};
use k256::schnorr::{Signature, SigningKey, VerifyingKey};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;
use tokio::sync::{broadcast, mpsc};
use tokio_tungstenite::tungstenite::Message;

/// Ephemeral kind (20000–29999): relays forward to live subscribers and never store it.
pub const KIND: u32 = 25051;

/// Shared with the web client; every peer must use the same list.
pub const RELAYS: &[&str] = &[
    "relay.damus.io",
    "nos.lol",
    "relay.snort.social",
    "nostr.mom",
    "nostr-01.yakihonne.com",
    "nostr-01.uid.ovh",
    "basspistol.org",
    "bucket.coracle.social",
    "nostr.islandarea.net",
    "nostr.data.haus",
    "purplerelay.com",
    "relay.sigit.io",
];

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Event {
    pub id: String,
    pub pubkey: String,
    pub created_at: i64,
    pub kind: u32,
    pub tags: Vec<Vec<String>>,
    pub content: String,
    pub sig: String,
}

fn event_hash(pubkey: &str, created_at: i64, kind: u32, tags: &[Vec<String>], content: &str) -> [u8; 32] {
    let canonical = json!([0, pubkey, created_at, kind, tags, content]).to_string();
    Sha256::digest(canonical.as_bytes()).into()
}

impl Event {
    /// Checks the id and the BIP-340 signature; never trust what a relay hands us.
    pub fn verify(&self) -> bool {
        let hash = event_hash(&self.pubkey, self.created_at, self.kind, &self.tags, &self.content);
        if hex::encode(hash) != self.id {
            return false;
        }
        let (Ok(pk), Ok(sig)) = (hex::decode(&self.pubkey), hex::decode(&self.sig)) else { return false };
        let Ok(pk) = <[u8; 32]>::try_from(pk.as_slice()) else { return false };
        let Ok(vk) = VerifyingKey::from_bytes(&pk.into()) else { return false };
        let Ok(sig) = Signature::try_from(sig.as_slice()) else { return false };
        vk.verify_raw(&hash, &sig).is_ok()
    }
}

/// Per-session identity. A fresh key each launch: peers are identified for the
/// lifetime of a session only, so nothing links a device across sessions.
pub struct Keys {
    sk: SigningKey,
    pub public: String,
}

impl Keys {
    pub fn generate() -> Self {
        loop {
            let bytes: [u8; 32] = rand::random();
            if let Ok(sk) = SigningKey::from_bytes(&bytes.into()) {
                let public = hex::encode(sk.verifying_key().to_bytes());
                return Self { sk, public };
            }
        }
    }

    pub fn sign(&self, topic: &str, content: String) -> Event {
        let created_at = chrono::Utc::now().timestamp();
        let tags = vec![vec!["t".to_string(), topic.to_string()]];
        let hash = event_hash(&self.public, created_at, KIND, &tags, &content);
        let aux: [u8; 32] = rand::random();
        let sig = self.sk.sign_raw(&hash, &aux).expect("schnorr signing");
        Event {
            id: hex::encode(hash),
            pubkey: self.public.clone(),
            created_at,
            kind: KIND,
            tags,
            content,
            sig: hex::encode(sig.to_bytes()),
        }
    }
}

/// Connections to every relay, each reconnecting on its own with backoff.
pub struct Pool {
    out: broadcast::Sender<Arc<str>>,
    connected: Arc<AtomicUsize>,
    tasks: Vec<tokio::task::JoinHandle<()>>,
}

impl Pool {
    /// Subscribes to `topic` on all relays; verified-later events arrive on `inbox`.
    pub fn start(topic: &str, inbox: mpsc::Sender<Event>) -> Self {
        let (out, _) = broadcast::channel::<Arc<str>>(64);
        let connected = Arc::new(AtomicUsize::new(0));
        let tasks = RELAYS
            .iter()
            .map(|host| {
                let url = format!("wss://{host}");
                tokio::spawn(relay_task(url, topic.to_string(), out.subscribe(), inbox.clone(), connected.clone()))
            })
            .collect();
        Self { out, connected, tasks }
    }

    pub fn publish(&self, ev: &Event) {
        let frame = json!(["EVENT", ev]).to_string();
        let _ = self.out.send(frame.into());
    }

    pub fn connected(&self) -> usize {
        self.connected.load(Ordering::Relaxed)
    }
}

impl Drop for Pool {
    fn drop(&mut self) {
        for t in &self.tasks {
            t.abort();
        }
    }
}

async fn relay_task(url: String, topic: String, mut out: broadcast::Receiver<Arc<str>>, inbox: mpsc::Sender<Event>, connected: Arc<AtomicUsize>) {
    let mut backoff = Duration::from_secs(1);
    loop {
        let conn = tokio::time::timeout(Duration::from_secs(8), tokio_tungstenite::connect_async(url.as_str())).await;
        if let Ok(Ok((ws, _))) = conn {
            backoff = Duration::from_secs(1);
            connected.fetch_add(1, Ordering::Relaxed);
            let (mut tx, mut rx) = ws.split();
            let sub = json!(["REQ", "ph", { "kinds": [KIND], "#t": [topic], "since": chrono::Utc::now().timestamp() - 5 }]).to_string();
            if tx.send(Message::text(sub)).await.is_ok() {
                // Drop anything queued while we were offline (stale presence/offers).
                out = out.resubscribe();
                loop {
                    tokio::select! {
                        msg = rx.next() => match msg {
                            Some(Ok(Message::Text(text))) => {
                                if let Some(ev) = parse_event(&text) {
                                    let _ = inbox.try_send(ev);
                                }
                            }
                            Some(Ok(Message::Ping(p))) => { let _ = tx.send(Message::Pong(p)).await; }
                            Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                            _ => {}
                        },
                        frame = out.recv() => match frame {
                            Ok(f) => if tx.send(Message::text(f.as_ref())).await.is_err() { break },
                            Err(broadcast::error::RecvError::Lagged(_)) => {}
                            Err(_) => return,
                        },
                    }
                }
            }
            connected.fetch_sub(1, Ordering::Relaxed);
        }
        tokio::time::sleep(backoff).await;
        backoff = (backoff * 2).min(Duration::from_secs(60));
    }
}

/// `["EVENT", <sub>, {event}]` → event. Anything else (EOSE, OK, NOTICE) is ignored.
fn parse_event(text: &str) -> Option<Event> {
    let v: serde_json::Value = serde_json::from_str(text).ok()?;
    let arr = v.as_array()?;
    if arr.first()?.as_str()? != "EVENT" {
        return None;
    }
    let ev: Event = serde_json::from_value(arr.get(2)?.clone()).ok()?;
    (ev.kind == KIND).then_some(ev)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signed_events_verify_and_tampering_fails() {
        let keys = Keys::generate();
        let ev = keys.sign("topic", "content".into());
        assert!(ev.verify());
        let mut bad = ev.clone();
        bad.content = "other".into();
        assert!(!bad.verify());
        let mut forged = ev;
        forged.pubkey = Keys::generate().public;
        assert!(!forged.verify());
    }
}
