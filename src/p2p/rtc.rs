//! WebRTC data-channel transport on top of str0m (sans-IO): we own the sockets
//! and feed packets/timeouts in; str0m does ICE, DTLS and SCTP.

use std::io;
use std::net::{IpAddr, SocketAddr};
use std::sync::{Arc, Once};
use std::time::Instant;

use str0m::change::{SdpAnswer, SdpOffer, SdpPendingOffer};
use str0m::channel::ChannelId;
use str0m::net::{Protocol, Receive};
use str0m::{Candidate, Event, Input, Output, Rtc};
use tokio::net::UdpSocket;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

pub const CHANNEL_LABEL: &str = "peerhop";
pub const SEND_BUFFER: usize = 4 * 1024 * 1024;

struct Packet {
    data: Vec<u8>,
    source: SocketAddr,
    destination: SocketAddr,
}

pub struct Transport {
    pub rtc: Rtc,
    sockets: Vec<Arc<UdpSocket>>,
    packets: mpsc::Receiver<Packet>,
    readers: Vec<JoinHandle<()>>,
}

fn install_crypto() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| str0m::crypto::from_feature_flags().install_process_default());
}

impl Transport {
    /// Binds one UDP socket per usable local IPv4 address and advertises each as a host candidate.
    pub async fn new() -> io::Result<Self> {
        install_crypto();
        // A deeper SCTP send buffer keeps a fast LAN link full (default is 128 KiB).
        let mut rtc = Rtc::builder().set_sctp_max_buffered_amount(SEND_BUFFER).build(Instant::now());
        let (tx, packets) = mpsc::channel(1024);
        let mut sockets = Vec::new();
        let mut readers = Vec::new();
        let mut ips: Vec<IpAddr> = crate::net::local_ips()
            .into_iter()
            .filter(|ip| matches!(ip, IpAddr::V4(v4) if !v4.is_loopback() && !v4.is_link_local() && !v4.is_unspecified()))
            .collect();
        ips.sort();
        for ip in ips {
            let Ok(sock) = UdpSocket::bind(SocketAddr::new(ip, 0)).await else { continue };
            let Ok(local) = sock.local_addr() else { continue };
            let Ok(candidate) = Candidate::host(local, "udp") else { continue };
            rtc.add_local_candidate(candidate);
            let sock = Arc::new(sock);
            readers.push(tokio::spawn(read_loop(sock.clone(), local, tx.clone())));
            sockets.push(sock);
        }
        if sockets.is_empty() {
            return Err(io::Error::new(io::ErrorKind::AddrNotAvailable, "no usable network interface"));
        }
        Ok(Self { rtc, sockets, packets, readers })
    }

    /// Starts a connection: one reliable, ordered data channel.
    pub fn create_offer(&mut self) -> (String, SdpPendingOffer, ChannelId) {
        let mut api = self.rtc.sdp_api();
        let channel = api.add_channel(CHANNEL_LABEL.to_string());
        let (offer, pending) = api.apply().expect("adding a channel always produces an offer");
        (offer.to_sdp_string(), pending, channel)
    }

    pub fn accept_offer(&mut self, sdp: &str) -> Result<String, String> {
        let offer = SdpOffer::from_sdp_string(&strip_unresolvable(sdp)).map_err(|e| e.to_string())?;
        let answer = self.rtc.sdp_api().accept_offer(offer).map_err(|e| e.to_string())?;
        Ok(answer.to_sdp_string())
    }

    pub fn accept_answer(&mut self, pending: SdpPendingOffer, sdp: &str) -> Result<(), String> {
        let answer = SdpAnswer::from_sdp_string(&strip_unresolvable(sdp)).map_err(|e| e.to_string())?;
        self.rtc.sdp_api().accept_answer(pending, answer).map_err(|e| e.to_string())
    }

    /// Runs str0m until it wants to wait: transmits packets, collects events.
    /// Returns the deadline at which `Input::Timeout` must be fed.
    pub fn drain(&mut self, events: &mut Vec<Event>) -> Result<Instant, String> {
        loop {
            match self.rtc.poll_output().map_err(|e| e.to_string())? {
                Output::Timeout(at) => return Ok(at),
                Output::Transmit(t) => {
                    let sock = self.sockets.iter().find(|s| s.local_addr().is_ok_and(|a| a == t.source)).or(self.sockets.first());
                    if let Some(sock) = sock {
                        // UDP is lossy anyway; SCTP retransmits if the OS buffer is momentarily full.
                        let _ = sock.try_send_to(&t.contents, t.destination);
                    }
                }
                Output::Event(e) => events.push(e),
            }
        }
    }

    /// Waits for the next packet (or `deadline`) and feeds it to str0m.
    pub async fn step(&mut self, deadline: Instant) -> Result<(), String> {
        let input = tokio::select! {
            p = self.packets.recv() => match p {
                Some(p) => Some(p),
                None => return Err("sockets closed".into()),
            },
            _ = tokio::time::sleep_until(deadline.into()) => None,
        };
        self.feed(input)
    }

    /// Feeds one packet, or a timeout tick when `None`.
    fn feed(&mut self, packet: Option<Packet>) -> Result<(), String> {
        let now = Instant::now();
        let input = match &packet {
            Some(p) => match p.data.as_slice().try_into() {
                Ok(contents) => Input::Receive(now, Receive { proto: Protocol::Udp, source: p.source, destination: p.destination, contents }),
                Err(_) => return Ok(()), // not a WebRTC packet
            },
            None => Input::Timeout(now),
        };
        self.rtc.handle_input(input).map_err(|e| e.to_string())
    }

}

impl Drop for Transport {
    fn drop(&mut self) {
        for r in &self.readers {
            r.abort();
        }
    }
}

async fn read_loop(sock: Arc<UdpSocket>, local: SocketAddr, tx: mpsc::Sender<Packet>) {
    let mut buf = vec![0u8; 2048];
    loop {
        match sock.recv_from(&mut buf).await {
            Ok((n, source)) => {
                if tx.send(Packet { data: buf[..n].to_vec(), source, destination: local }).await.is_err() {
                    return;
                }
            }
            // Windows reports ICMP "port unreachable" as a recv error; keep listening.
            Err(e) if e.kind() == io::ErrorKind::ConnectionReset => continue,
            Err(_) => return,
        }
    }
}

/// Browsers hide LAN addresses behind mDNS `*.local` names and may offer TCP
/// candidates; neither is usable here. ICE still finds the browser: its checks to
/// our host candidates reveal its real address (peer-reflexive).
fn strip_unresolvable(sdp: &str) -> String {
    sdp.split("\r\n")
        .filter(|l| !(l.starts_with("a=candidate") && (l.contains(".local ") || l.contains(" tcp ") || l.contains(" TCP "))))
        .collect::<Vec<_>>()
        .join("\r\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    /// Two native endpoints (desktop ↔ desktop) connect over the LAN and move data intact.
    #[tokio::test]
    async fn native_peers_connect_and_transfer() {
        const TOTAL: usize = 16 * 1024 * 1024;
        const CHUNK: usize = 64 * 1024;
        let pattern = |i: usize| (i % 251) as u8;

        let (mut a, mut b) = (Transport::new().await.unwrap(), Transport::new().await.unwrap());
        let (offer, pending, _) = a.create_offer();
        let answer = b.accept_offer(&offer).unwrap();
        a.accept_answer(pending, &answer).unwrap();

        let started = Instant::now();
        let (mut ea, mut eb) = (Vec::new(), Vec::new());
        let (mut channel, mut writable, mut sent, mut received) = (None, false, 0usize, 0usize);
        let run = async {
            while received < TOTAL {
                let da = a.drain(&mut ea).unwrap();
                let db = b.drain(&mut eb).unwrap();
                for e in ea.drain(..) {
                    match e {
                        Event::ChannelOpen(id, _) => {
                            channel = Some(id);
                            writable = true;
                            a.rtc.channel(id).unwrap().set_buffered_amount_low_threshold(1024 * 1024);
                        }
                        Event::ChannelBufferedAmountLow(_) => writable = true,
                        _ => {}
                    }
                }
                for e in eb.drain(..) {
                    if let Event::ChannelData(d) = e {
                        assert!(d.binary);
                        assert!(d.data.iter().enumerate().all(|(i, &x)| x == pattern(received + i)), "corrupt data at {received}");
                        received += d.data.len();
                    }
                }
                let mut busy = false;
                if let Some(id) = channel {
                    while writable && sent < TOTAL {
                        let n = CHUNK.min(TOTAL - sent);
                        let buf: Vec<u8> = (sent..sent + n).map(pattern).collect();
                        if a.rtc.channel(id).unwrap().write(true, &buf).unwrap() {
                            sent += n;
                            busy = true;
                            if sent % (16 * CHUNK) == 0 {
                                break; // let the engines flush between bursts
                            }
                        } else {
                            writable = false;
                        }
                    }
                }
                let now = Instant::now();
                tokio::select! {
                    r = a.step(if busy { now } else { da }) => r.unwrap(),
                    r = b.step(if busy { now } else { db }) => r.unwrap(),
                }
            }
        };
        tokio::time::timeout(Duration::from_secs(30), run).await.expect("transfer timed out");
        assert_eq!(received, TOTAL);
        let secs = started.elapsed().as_secs_f64();
        println!("connect + {} MB in {secs:.2}s = {:.1} MB/s", TOTAL >> 20, TOTAL as f64 / 1048576.0 / secs);
    }
}
