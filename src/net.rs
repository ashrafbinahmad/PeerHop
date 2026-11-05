//! Local network discovery: IPs, Wi-Fi SSIDs and the Windows mobile hotspot.

use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::net::{IpAddr, Ipv4Addr, UdpSocket};
use std::process::{Command, Stdio};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum NetKind {
    Hotspot,
    Wifi,
    Ethernet,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct NetworkProfile {
    pub name: String,
    pub ip: Ipv4Addr,
    pub ssid: String,
    pub password: String,
    pub kind: NetKind,
}

/// The IP used for outbound traffic (no packets are sent), falling back to the
/// first non-loopback IPv4 and finally to loopback.
pub fn primary_ip() -> Ipv4Addr {
    let routed = UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| {
            s.connect("8.8.8.8:80")?;
            s.local_addr()
        })
        .ok()
        .and_then(|a| match a.ip() {
            IpAddr::V4(v4) if !v4.is_unspecified() => Some(v4),
            _ => None,
        });
    routed
        .or_else(|| {
            local_ips().into_iter().find_map(|ip| match ip {
                IpAddr::V4(v4) if !v4.is_loopback() => Some(v4),
                _ => None,
            })
        })
        .unwrap_or(Ipv4Addr::LOCALHOST)
}

/// Every address assigned to this machine (used to hide the host from the device list).
pub fn local_ips() -> HashSet<IpAddr> {
    if_addrs::get_if_addrs().unwrap_or_default().into_iter().map(|i| i.ip()).collect()
}

/// Wi-Fi join QR payload (`WIFI:` URI), escaping the reserved characters.
pub fn wifi_qr_payload(ssid: &str, password: &str) -> String {
    let esc = |s: &str| s.chars().fold(String::new(), |mut o, c| {
        if matches!(c, '\\' | ';' | ',' | ':' | '"') {
            o.push('\\');
        }
        o.push(c);
        o
    });
    if password.is_empty() {
        format!("WIFI:S:{};T:nopass;;", esc(ssid))
    } else {
        format!("WIFI:S:{};T:WPA;P:{};;", esc(ssid), esc(password))
    }
}

pub(crate) fn command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    cmd.stdin(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

fn output(program: &str, args: &[&str]) -> Option<String> {
    let out = command(program).args(args).output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

/// All up, non-loopback IPv4 interfaces, sorted Wi-Fi → hotspot → Ethernet.
pub fn network_profiles() -> Vec<NetworkProfile> {
    let ssids = wifi_ssids();
    let hotspot = hotspot_config();
    let mut out: Vec<NetworkProfile> = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter(|i| !i.is_loopback() && i.oper_status == if_addrs::IfOperStatus::Up)
        .filter_map(|i| {
            let IpAddr::V4(v4) = i.ip() else { return None };
            let mut p = NetworkProfile {
                name: i.name.clone(),
                ip: v4,
                ssid: String::new(),
                password: String::new(),
                kind: NetKind::Ethernet,
            };
            if let Some(ssid) = ssids.get(&i.name) {
                p.kind = NetKind::Wifi;
                p.ssid = ssid.clone();
            } else if v4 == Ipv4Addr::new(192, 168, 137, 1) || (hotspot.is_some() && i.name.contains('*')) {
                p.kind = NetKind::Hotspot;
                if let Some((ssid, pass)) = &hotspot {
                    p.ssid = ssid.clone();
                    p.password = pass.clone();
                }
                if p.ssid.is_empty() {
                    p.ssid = "Mobile Hotspot".into();
                }
            } else if is_wireless(&i.name) {
                p.kind = NetKind::Wifi;
                p.ssid = linux_ssid(&i.name).unwrap_or_default();
            }
            Some(p)
        })
        .collect();
    let rank = |k: NetKind| match k {
        NetKind::Wifi => 0,
        NetKind::Hotspot => 1,
        NetKind::Ethernet => 2,
    };
    out.sort_by_key(|p| rank(p.kind));
    out
}

/// Interface name → SSID for connected Wi-Fi adapters.
fn wifi_ssids() -> HashMap<String, String> {
    let mut map = HashMap::new();
    if cfg!(windows) {
        let Some(text) = output("netsh", &["wlan", "show", "interfaces"]) else { return map };
        let mut iface = None;
        for line in text.lines().map(str::trim) {
            let Some((key, value)) = line.split_once(':') else { continue };
            let (key, value) = (key.trim(), value.trim().to_string());
            if key == "Name" {
                iface = Some(value);
            } else if key == "SSID" {
                if let Some(name) = iface.clone() {
                    map.insert(name, value);
                }
            }
        }
    } else if let Some(text) = output("nmcli", &["-t", "-f", "DEVICE,ACTIVE,SSID", "dev", "wifi"]) {
        for line in text.lines() {
            let mut parts = line.splitn(3, ':');
            if let (Some(dev), Some("yes"), Some(ssid)) = (parts.next(), parts.next(), parts.next()) {
                if !ssid.is_empty() && ssid != "--" {
                    map.insert(dev.into(), ssid.replace("\\:", ":"));
                }
            }
        }
    }
    map
}

fn is_wireless(name: &str) -> bool {
    cfg!(target_os = "linux")
        && (std::path::Path::new(&format!("/sys/class/net/{name}/wireless")).exists()
            || std::path::Path::new(&format!("/sys/class/net/{name}/phy80211")).exists())
}

fn linux_ssid(name: &str) -> Option<String> {
    if !cfg!(target_os = "linux") {
        return None;
    }
    output("iwgetid", &[name, "-r"]).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).or_else(|| {
        output("iw", &["dev", name, "link"])?
            .lines()
            .find_map(|l| l.split_once("SSID:").map(|(_, s)| s.trim().to_string()))
    })
}

const PS_TETHERING: &str = r#"
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$cp = [Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType=WindowsRuntime]::GetInternetConnectionProfile()
if ($null -eq $cp) { exit }
$tm = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType=WindowsRuntime]::CreateFromConnectionProfile($cp)
if ($null -eq $tm) { exit }
"#;

fn powershell(script: &str) -> Option<String> {
    output("powershell", &["-NoProfile", "-NonInteractive", "-Command", script])
}

/// SSID and passphrase of the Windows mobile hotspot, if configured.
fn hotspot_config() -> Option<(String, String)> {
    if !cfg!(windows) {
        return None;
    }
    let script = format!("{PS_TETHERING}$c = $tm.GetCurrentAccessPointConfiguration()\nWrite-Output \"$($c.Ssid)|$($c.Passphrase)\"");
    let out = powershell(&script)?;
    let (ssid, pass) = out.trim().split_once('|')?;
    (!ssid.is_empty()).then(|| (ssid.into(), pass.into()))
}

/// Best-effort: turn on the Windows mobile hotspot so phones can join directly.
pub fn try_enable_hotspot() {
    if !cfg!(windows) {
        return;
    }
    let script = format!(
        r#"{PS_TETHERING}
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {{ $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.IsGenericMethod }})[0]
if ($tm.TetheringOperationalState -ne 'On') {{
  $t = $asTask.MakeGenericMethod([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult]).Invoke($null, @($tm.StartTetheringAsync()))
  $t.Wait(10000) | Out-Null
}}"#
    );
    let _ = powershell(&script);
}

#[cfg(test)]
mod tests {
    #[test]
    fn wifi_payload_escapes() {
        assert_eq!(super::wifi_qr_payload("My;Net", "p:w"), r"WIFI:S:My\;Net;T:WPA;P:p\:w;;");
        assert_eq!(super::wifi_qr_payload("Open", ""), "WIFI:S:Open;T:nopass;;");
    }
}
