//! PeerHop core: LAN file/text transfer server shared by the desktop GUI and the CLI.
//!
//! Layout:
//! - [`store`]: transaction + client bookkeeping (pure, synchronous).
//! - [`hub`]: one server session's shared state and its WebSocket broadcast channel.
//! - [`server`]: the HTTP/WebSocket API consumed by the mobile web UI.
//! - [`settings`], [`net`], [`platform`], [`util`]: supporting pieces.
//! - [`analytics`]: anonymous per-country usage counters.

pub mod analytics;
pub mod hub;
pub mod net;
pub mod p2p;
pub mod platform;
pub mod server;
pub mod settings;
pub mod store;
pub mod util;

pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
