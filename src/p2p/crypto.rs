//! Room-scoped signaling keys. Relays only ever see a topic hash and AES-GCM
//! ciphertext; the room id itself (derived from the network) never leaves the peers.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::Aes256Gcm;
use base64::Engine;
use base64::engine::general_purpose::STANDARD as B64;
use hkdf::Hkdf;
use sha2::{Digest, Sha256};

/// Protocol tag; bump on incompatible changes (web and desktop must match).
pub const PROTOCOL: &str = "peerhop-v1";

pub struct RoomKeys {
    /// Hex topic used as the Nostr `t` tag.
    pub topic: String,
    cipher: Aes256Gcm,
}

impl RoomKeys {
    pub fn new(room: &str) -> Self {
        let topic = hex::encode(Sha256::digest(format!("{PROTOCOL}|topic|{room}").as_bytes()));
        let hk = Hkdf::<Sha256>::new(Some(PROTOCOL.as_bytes()), room.as_bytes());
        let mut key = [0u8; 32];
        hk.expand(b"signal", &mut key).expect("32 bytes is a valid HKDF output length");
        let cipher = Aes256Gcm::new_from_slice(&key).expect("32-byte key");
        Self { topic, cipher }
    }

    /// base64(nonce ‖ ciphertext+tag)
    pub fn seal(&self, plain: &[u8]) -> String {
        let nonce: [u8; 12] = rand::random();
        let ct = self.cipher.encrypt((&nonce).into(), plain).expect("AES-GCM encryption cannot fail");
        let mut out = nonce.to_vec();
        out.extend_from_slice(&ct);
        B64.encode(out)
    }

    pub fn open(&self, sealed: &str) -> Option<Vec<u8>> {
        let raw = B64.decode(sealed).ok()?;
        if raw.len() < 12 + 16 {
            return None;
        }
        let (nonce, ct) = raw.split_at(12);
        let nonce: &[u8; 12] = nonce.try_into().ok()?;
        self.cipher.decrypt(nonce.into(), ct).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seal_round_trip_and_room_isolation() {
        let a = RoomKeys::new("room-a");
        let b = RoomKeys::new("room-b");
        let sealed = a.seal(b"hello");
        assert_eq!(a.open(&sealed).as_deref(), Some(&b"hello"[..]));
        assert!(b.open(&sealed).is_none());
        assert_ne!(a.topic, b.topic);
        assert_eq!(a.topic.len(), 64);
    }
}
