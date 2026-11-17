//! Launch a stream in an installed external player (VLC, mpv, IINA...).

use std::process::{Command, Stdio};

fn spawn(program: &str, args: &[&str]) -> bool {
    Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .is_ok()
}

pub fn open(url: &str, title: Option<&str>) -> Result<String, String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("Only http(s) streams can be opened externally".into());
    }
    let title = title.unwrap_or("IPTV");
    let mpv_title = format!("--force-media-title={title}");
    let vlc_title = format!("--meta-title={title}");

    #[cfg(target_os = "macos")]
    {
        for app in ["IINA", "VLC", "mpv"] {
            if Command::new("open")
                .args(["-a", app, url])
                .status()
                .map(|s| s.success())
                .unwrap_or(false)
            {
                return Ok(app.to_string());
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let mut candidates: Vec<String> = Vec::new();
        for var in ["ProgramFiles", "ProgramFiles(x86)"] {
            if let Ok(base) = std::env::var(var) {
                candidates.push(format!(r"{base}\VideoLAN\VLC\vlc.exe"));
            }
        }
        for c in &candidates {
            if std::path::Path::new(c).exists() && spawn(c, &[&vlc_title, url]) {
                return Ok("VLC".into());
            }
        }
    }

    if spawn("mpv", &[&mpv_title, url]) {
        return Ok("mpv".into());
    }
    if spawn("vlc", &[&vlc_title, url]) {
        return Ok("VLC".into());
    }
    if spawn("celluloid", &[url]) {
        return Ok("Celluloid".into());
    }
    Err("No external player found. Install VLC or mpv.".into())
}
