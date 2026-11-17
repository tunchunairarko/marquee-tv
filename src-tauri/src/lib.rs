mod external;
mod m3u;
mod proxy;

use serde::Serialize;
use tauri::{ipc::Response, Manager, State};

use crate::proxy::ProxyState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProxyInfo {
    port: u16,
    token: String,
}

/// Address + secret of the local streaming proxy.
#[tauri::command]
fn proxy_info(state: State<'_, ProxyState>) -> ProxyInfo {
    ProxyInfo {
        port: state.port,
        token: state.token.clone(),
    }
}

/// Change the User-Agent sent to IPTV servers (some providers whitelist UAs).
#[tauri::command]
async fn set_user_agent(state: State<'_, ProxyState>, user_agent: String) -> Result<(), String> {
    let ua = user_agent.trim();
    *state.user_agent.write().await = if ua.is_empty() {
        proxy::DEFAULT_USER_AGENT.to_string()
    } else {
        ua.to_string()
    };
    Ok(())
}

/// Download (or read from disk) and parse an M3U playlist.
/// Returns raw JSON bytes so large playlists skip a serde round-trip in IPC.
#[tauri::command]
async fn load_m3u(state: State<'_, ProxyState>, source: String) -> Result<Response, String> {
    let source = source.trim().to_string();
    let text = if source.starts_with("http://") || source.starts_with("https://") {
        let ua = state.user_agent.read().await.clone();
        let resp = state
            .client
            .get(&source)
            .header(reqwest::header::USER_AGENT, ua)
            .send()
            .await
            .map_err(|e| format!("Could not download playlist: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("Playlist server returned HTTP {}", resp.status()));
        }
        resp.text()
            .await
            .map_err(|e| format!("Could not read playlist: {e}"))?
    } else {
        let path = source
            .strip_prefix("file://")
            .unwrap_or(&source)
            .to_string();
        tokio::task::spawn_blocking(move || std::fs::read_to_string(path))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| format!("Could not read playlist file: {e}"))?
    };

    let json = tokio::task::spawn_blocking(move || {
        let pl = m3u::parse(&text);
        serde_json::to_vec(&pl)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    Ok(Response::new(json))
}

/// Hand a stream over to VLC / mpv / IINA when the built-in engine can't decode it.
#[tauri::command]
fn open_in_external_player(url: String, title: Option<String>) -> Result<String, String> {
    external::open(&url, title.as_deref())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let state = tauri::async_runtime::block_on(proxy::start())?;
            log::info!("streaming proxy listening on 127.0.0.1:{}", state.port);
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            proxy_info,
            set_user_agent,
            load_m3u,
            open_in_external_player
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
