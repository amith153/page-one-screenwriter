//! Wi-Fi sync plumbing. The sync logic itself lives in the web UI (`src/state/sync.ts`); this side only
//! does what a webview can't: listen for requests from the phone (passed up to the UI as events and
//! answered with `lan_respond`) and make plain HTTP requests to the phone and to other computers.
//! Nothing here touches the internet; it talks to addresses on your own network.

use serde::Serialize;
use std::collections::HashMap;
use std::io::{ErrorKind, Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream, ToSocketAddrs, UdpSocket};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::Emitter;

const MAX_BODY: usize = 64 * 1024 * 1024;

static GEN: AtomicU64 = AtomicU64::new(0);
static NEXT: AtomicU64 = AtomicU64::new(1);
type Reply = (u16, String);
fn pending() -> &'static Mutex<HashMap<u64, Sender<Reply>>> {
    static P: OnceLock<Mutex<HashMap<u64, Sender<Reply>>>> = OnceLock::new();
    P.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Serialize, Clone)]
struct Incoming {
    id: u64,
    method: String,
    path: String,
    auth: String,
    remote: String,
    body: String,
}

fn find(hay: &[u8], needle: &[u8]) -> Option<usize> {
    hay.windows(needle.len()).position(|w| w == needle)
}

/// Read one HTTP request: (method, path, headers lowercased, body).
fn read_request(s: &mut TcpStream) -> Result<(String, String, HashMap<String, String>, Vec<u8>), String> {
    s.set_read_timeout(Some(Duration::from_secs(20))).ok();
    let mut buf: Vec<u8> = Vec::new();
    let mut tmp = [0u8; 8192];
    let head_end = loop {
        if let Some(i) = find(&buf, b"\r\n\r\n") {
            break i;
        }
        if buf.len() > 64 * 1024 {
            return Err("header too large".into());
        }
        let n = s.read(&mut tmp).map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("closed".into());
        }
        buf.extend_from_slice(&tmp[..n]);
    };
    let head = String::from_utf8_lossy(&buf[..head_end]).into_owned();
    let mut lines = head.split("\r\n");
    let first = lines.next().unwrap_or("");
    let mut parts = first.split_whitespace();
    let method = parts.next().unwrap_or("").to_string();
    let path = parts.next().unwrap_or("/").to_string();
    let mut headers = HashMap::new();
    for l in lines {
        if let Some((k, v)) = l.split_once(':') {
            headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }
    }
    let len: usize = headers.get("content-length").and_then(|v| v.parse().ok()).unwrap_or(0);
    if len > MAX_BODY {
        return Err("body too large".into());
    }
    let mut body = buf[head_end + 4..].to_vec();
    while body.len() < len {
        let n = s.read(&mut tmp).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&tmp[..n]);
    }
    body.truncate(len);
    Ok((method, path, headers, body))
}

fn respond(s: &mut TcpStream, status: u16, body: &str) {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        401 => "Unauthorized",
        404 => "Not Found",
        409 => "Conflict",
        _ => "Error",
    };
    let head = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = s.write_all(head.as_bytes());
    let _ = s.write_all(body.as_bytes());
    let _ = s.flush();
}

fn handle(app: tauri::AppHandle, mut s: TcpStream, remote: String) {
    let (method, path, headers, body) = match read_request(&mut s) {
        Ok(r) => r,
        Err(_) => return respond(&mut s, 400, "{\"error\":\"bad request\"}"),
    };
    let id = NEXT.fetch_add(1, Ordering::SeqCst);
    let (tx, rx) = channel::<Reply>();
    pending().lock().unwrap().insert(id, tx);
    let ev = Incoming {
        id,
        method,
        path,
        auth: headers.get("authorization").cloned().unwrap_or_default(),
        remote,
        body: String::from_utf8_lossy(&body).into_owned(),
    };
    if app.emit("lan-request", ev).is_err() {
        pending().lock().unwrap().remove(&id);
        return respond(&mut s, 500, "{\"error\":\"app not ready\"}");
    }
    match rx.recv_timeout(Duration::from_secs(60)) {
        Ok((status, text)) => respond(&mut s, status, &text),
        Err(_) => {
            pending().lock().unwrap().remove(&id);
            respond(&mut s, 504, "{\"error\":\"timed out\"}")
        }
    }
}

/// Start listening for the phone (replacing an earlier listener). Returns the port.
#[tauri::command]
pub fn lan_serve(app: tauri::AppHandle, port: u16) -> Result<u16, String> {
    let me = GEN.fetch_add(1, Ordering::SeqCst) + 1;
    // Give an earlier listener a moment to notice and let go of the port.
    let mut listener = None;
    let until = Instant::now() + Duration::from_millis(1500);
    while Instant::now() < until {
        match TcpListener::bind(("0.0.0.0", port)) {
            Ok(l) => {
                listener = Some(l);
                break;
            }
            Err(_) => std::thread::sleep(Duration::from_millis(100)),
        }
    }
    let listener = listener.ok_or_else(|| format!("Port {port} is already in use. Close what is using it and try again."))?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    std::thread::spawn(move || loop {
        if GEN.load(Ordering::SeqCst) != me {
            return;
        }
        match listener.accept() {
            Ok((s, addr)) => {
                let _ = s.set_nonblocking(false);
                let app = app.clone();
                let remote = addr.ip().to_string();
                std::thread::spawn(move || handle(app, s, remote));
            }
            Err(e) if e.kind() == ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(40)),
            Err(_) => std::thread::sleep(Duration::from_millis(200)),
        }
    });
    Ok(port)
}

#[tauri::command]
pub fn lan_stop() {
    GEN.fetch_add(1, Ordering::SeqCst);
}

#[tauri::command]
pub fn lan_respond(id: u64, status: u16, body: String) {
    if let Some(tx) = pending().lock().unwrap().remove(&id) {
        let _ = tx.send((status, body));
    }
}

/// One HTTP request to an address on the local network. `target` is "host:port/path".
#[tauri::command]
pub async fn lan_fetch(target: String, method: String, auth: String, body: String, timeout_ms: u64) -> Result<(u16, String), String> {
    tauri::async_runtime::spawn_blocking(move || fetch(&target, &method, &auth, &body, timeout_ms))
        .await
        .map_err(|e| e.to_string())?
}

fn fetch(target: &str, method: &str, auth: &str, body: &str, timeout_ms: u64) -> Result<(u16, String), String> {
    let (hostport, path) = match target.find('/') {
        Some(i) => (&target[..i], &target[i..]),
        None => (target, "/"),
    };
    let to = Duration::from_millis(timeout_ms.max(100));
    let addr: SocketAddr = hostport
        .to_socket_addrs()
        .map_err(|e| e.to_string())?
        .find(|a| a.is_ipv4())
        .ok_or("no address")?;
    // Only addresses on a local network are ever contacted.
    if let IpAddr::V4(v4) = addr.ip() {
        if !(v4.is_private() || v4.is_loopback() || v4.is_link_local()) {
            return Err("not a local-network address".into());
        }
    }
    let mut s = TcpStream::connect_timeout(&addr, to).map_err(|e| e.to_string())?;
    s.set_read_timeout(Some(Duration::from_secs(60))).ok();
    s.set_write_timeout(Some(Duration::from_secs(60))).ok();
    let mut req = format!("{method} {path} HTTP/1.1\r\nHost: {hostport}\r\nConnection: close\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\n", body.len());
    if !auth.is_empty() {
        req.push_str(&format!("Authorization: {auth}\r\n"));
    }
    req.push_str("\r\n");
    s.write_all(req.as_bytes()).map_err(|e| e.to_string())?;
    s.write_all(body.as_bytes()).map_err(|e| e.to_string())?;
    let mut raw = Vec::new();
    s.read_to_end(&mut raw).map_err(|e| e.to_string())?;
    let end = find(&raw, b"\r\n\r\n").ok_or("bad response")?;
    let head = String::from_utf8_lossy(&raw[..end]).into_owned();
    let status: u16 = head.split_whitespace().nth(1).and_then(|v| v.parse().ok()).ok_or("bad status")?;
    Ok((status, String::from_utf8_lossy(&raw[end + 4..]).into_owned()))
}

/// This computer's address on the local network (the one a phone on the same Wi-Fi would reach).
#[tauri::command]
pub fn lan_ips() -> Vec<String> {
    let mut out = vec![];
    if let Ok(sock) = UdpSocket::bind("0.0.0.0:0") {
        // Nothing is sent: connecting a UDP socket only picks the network card that would be used.
        if sock.connect((Ipv4Addr::new(192, 168, 255, 255), 9)).is_ok() {
            if let Ok(a) = sock.local_addr() {
                if let IpAddr::V4(v4) = a.ip() {
                    if !v4.is_unspecified() && !v4.is_loopback() {
                        out.push(v4.to_string());
                    }
                }
            }
        }
    }
    out
}
