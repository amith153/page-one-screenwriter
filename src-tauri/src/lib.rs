//! Page One desktop shell. The app itself is the web UI in `../src`; this side only does
//! what a webview can't: files on disk (atomic saves, the library folder) and native dialogs.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::Manager;

#[derive(Serialize)]
struct Entry {
    name: String,
    path: String,
    is_dir: bool,
    modified: u64,
    size: u64,
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// The library folder: Documents/Page One, laid out like the phone's
/// (scripts/<id>.json, versions/<id>/<time>.json), so a synced folder works on both.
#[tauri::command]
fn data_root(app: tauri::AppHandle) -> Result<String, String> {
    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(err)?;
    let root = base.join("Page One");
    fs::create_dir_all(root.join("scripts")).map_err(err)?;
    fs::create_dir_all(root.join("versions")).map_err(err)?;
    Ok(root.to_string_lossy().into_owned())
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<Entry>, String> {
    let dir = Path::new(&path);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out = vec![];
    for e in fs::read_dir(dir).map_err(err)? {
        let e = e.map_err(err)?;
        let md = e.metadata().map_err(err)?;
        let modified = md
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        out.push(Entry {
            name: e.file_name().to_string_lossy().into_owned(),
            path: e.path().to_string_lossy().into_owned(),
            is_dir: md.is_dir(),
            modified,
            size: md.len(),
        });
    }
    Ok(out)
}

#[tauri::command]
fn read_text(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(err)
}

#[tauri::command]
fn read_bytes(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(err)
}

/// Write to a temp file and rename over the target, so a crash can never leave half a script.
fn write_atomic(path: &str, data: &[u8]) -> Result<(), String> {
    let target = PathBuf::from(path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    let tmp = target.with_extension("tmp~");
    fs::write(&tmp, data).map_err(err)?;
    fs::rename(&tmp, &target).map_err(err)
}

#[tauri::command]
fn write_text(path: String, contents: String) -> Result<(), String> {
    write_atomic(&path, contents.as_bytes())
}

#[tauri::command]
fn write_bytes(path: String, contents: Vec<u8>) -> Result<(), String> {
    write_atomic(&path, &contents)
}

#[tauri::command]
fn remove_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(err)
    } else if p.exists() {
        fs::remove_file(p).map_err(err)
    } else {
        Ok(())
    }
}

/// Open a file with its default app (an exported PDF) or show a folder.
#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let r = std::process::Command::new("explorer").arg(&path).spawn();
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg(&path).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let r = std::process::Command::new("xdg-open").arg(&path).spawn();
    r.map(|_| ()).map_err(err)
}

fn open_url(url: &str) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    let r = std::process::Command::new("rundll32").args(["url.dll,FileProtocolHandler", url]).spawn();
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg(url).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let r = std::process::Command::new("xdg-open").arg(url).spawn();
    r.map(|_| ())
}

/// Bumped by each sign-in and by `oauth_cancel`; a waiting sign-in stops once it is no longer the latest.
static OAUTH_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Google won't sign in inside an embedded webview, so Drive signs in through the system
/// browser: open the consent page, then wait on a loopback port for Google to redirect back.
/// The token arrives in the URL fragment, which only the browser sees, so the first page we
/// serve hands it back to us as a query string. Returns that query string.
fn loopback(url: String, port: u16) -> Result<String, String> {
    use std::io::{ErrorKind, Read, Write};
    use std::net::TcpListener;
    use std::sync::atomic::Ordering;
    use std::time::{Duration, Instant};

    const RELAY: &str = "<!doctype html><meta charset=utf-8><title>Page One</title><body style='font:15px system-ui;padding:40px'>Finishing sign-in…<script>location.replace('/done?'+(location.hash.slice(1)||location.search.slice(1)))</script>";
    const DONE: &str = "<!doctype html><meta charset=utf-8><title>Page One</title><body style='font:15px system-ui;padding:40px;text-align:center'><h2>Page One is connected to Google Drive</h2><p>You can close this tab and go back to the app.</p>";

    // Supersede an earlier sign-in still waiting (say the window was closed), then wait for it to free the port.
    let me = OAUTH_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let bind = || -> Vec<TcpListener> {
        ["127.0.0.1", "[::1]"]
            .iter()
            .filter_map(|h| TcpListener::bind(format!("{h}:{port}")).ok())
            .collect()
    };
    let mut listeners = bind();
    let retry_until = Instant::now() + Duration::from_millis(1500);
    while listeners.is_empty() && Instant::now() < retry_until {
        std::thread::sleep(Duration::from_millis(100));
        listeners = bind();
    }
    if listeners.is_empty() {
        return Err(format!("Port {port} is in use, so Google can't reach Page One. Close what's using it and try again."));
    }
    for l in &listeners {
        l.set_nonblocking(true).map_err(err)?;
    }
    open_url(&url).map_err(err)?;
    let deadline = Instant::now() + Duration::from_secs(300);
    while Instant::now() < deadline {
        if OAUTH_GEN.load(Ordering::SeqCst) != me {
            return Err("cancelled".into());
        }
        for l in &listeners {
            match l.accept() {
                Ok((mut s, _)) => {
                    let _ = s.set_nonblocking(false);
                    let _ = s.set_read_timeout(Some(Duration::from_secs(5)));
                    let mut buf = [0u8; 16384];
                    let n = s.read(&mut buf).unwrap_or(0);
                    let req = String::from_utf8_lossy(&buf[..n]).into_owned();
                    let path = req.split_whitespace().nth(1).unwrap_or("/").to_string();
                    let done = path.strip_prefix("/done?").map(str::to_string);
                    let body = if done.is_some() { DONE } else { RELAY };
                    let _ = write!(s, "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
                    if let Some(q) = done {
                        return Ok(q);
                    }
                }
                Err(e) if e.kind() == ErrorKind::WouldBlock => {}
                Err(e) => return Err(err(e)),
            }
        }
        std::thread::sleep(Duration::from_millis(60));
    }
    Err("Google sign-in timed out. Try connecting again.".into())
}

#[tauri::command]
async fn oauth_loopback(url: String, port: u16) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || loopback(url, port)).await.map_err(err)?
}

#[tauri::command]
fn oauth_cancel() {
    OAUTH_GEN.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            data_root,
            list_dir,
            read_text,
            read_bytes,
            write_text,
            write_bytes,
            remove_path,
            open_path,
            oauth_loopback,
            oauth_cancel
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
