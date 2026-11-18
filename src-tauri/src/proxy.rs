//! A tiny local HTTP proxy bound to 127.0.0.1.
//!
//! The webview cannot talk to most IPTV servers directly: they rarely send
//! CORS headers, often sit behind redirects, may require a specific
//! User-Agent and frequently serve plain `http://`. This proxy fixes all of
//! that in one place:
//!
//! * adds permissive CORS headers so `fetch`, hls.js and mpegts.js work,
//! * streams bodies straight through (live MPEG-TS never ends),
//! * forwards `Range` so VOD seeking works,
//! * rewrites HLS playlists so every segment/key/variant is proxied too.
//!
//! Every route is guarded by a random per-launch token so other local
//! software (or a website in a browser) cannot use it as an open relay.

use std::{net::SocketAddr, sync::Arc, time::Duration};

use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::any,
    Router,
};
use futures_util::TryStreamExt;
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use serde::Deserialize;
use tokio::sync::RwLock;
use url::Url;

pub const DEFAULT_USER_AGENT: &str = "VLC/3.0.21 LibVLC/3.0.21";

/// Upper bound for buffering something that looks like an HLS playlist.
const MAX_PLAYLIST_BYTES: u64 = 8 * 1024 * 1024;

/// How long an upstream may go silent (no headers / no body bytes) before we
/// give up. Every proxied request shares one origin, and WebKit allows only 6
/// connections per origin, so a request that hangs forever would eventually
/// block all playback. Only counts time spent waiting on the upstream, so a
/// paused player that stops reading is not affected.
const READ_TIMEOUT: Duration = if cfg!(test) {
    Duration::from_secs(1)
} else {
    Duration::from_secs(30)
};

pub struct ProxyInner {
    pub client: reqwest::Client,
    pub token: String,
    pub port: u16,
    pub user_agent: RwLock<String>,
}

pub type ProxyState = Arc<ProxyInner>;

impl ProxyInner {
    pub fn proxied(&self, target: &str) -> String {
        format!(
            "http://127.0.0.1:{}/{}/s?u={}",
            self.port,
            self.token,
            utf8_percent_encode(target, NON_ALPHANUMERIC)
        )
    }
}

pub fn build_client() -> reqwest::Client {
    // rustls needs a process-wide crypto provider; ignore "already installed".
    let _ = rustls::crypto::ring::default_provider().install_default();
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(12))
        .read_timeout(READ_TIMEOUT)
        .pool_idle_timeout(Duration::from_secs(60))
        .pool_max_idle_per_host(16)
        .tcp_nodelay(true)
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .expect("failed to build HTTP client")
}

/// Bind the proxy on a random loopback port and serve it in the background.
pub async fn start() -> std::io::Result<ProxyState> {
    let listener = tokio::net::TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0))).await?;
    let port = listener.local_addr()?.port();
    let token = random_token();

    let state: ProxyState = Arc::new(ProxyInner {
        client: build_client(),
        token,
        port,
        user_agent: RwLock::new(DEFAULT_USER_AGENT.to_string()),
    });

    let app = Router::new()
        .route("/{token}/s", any(handle))
        .with_state(state.clone());

    tokio::spawn(async move {
        if let Err(err) = axum::serve(listener, app).await {
            log::error!("proxy server stopped: {err}");
        }
    });

    Ok(state)
}

fn random_token() -> String {
    use rand::RngExt;
    let mut rng = rand::rng();
    (0..32)
        .map(|_| {
            let n: u8 = rng.random_range(0..36);
            (if n < 10 { b'0' + n } else { b'a' + n - 10 }) as char
        })
        .collect()
}

#[derive(Deserialize)]
struct ProxyQuery {
    u: String,
    /// `raw=1` disables HLS playlist rewriting (used for API/M3U fetches).
    raw: Option<u8>,
}

fn cors(headers: &mut HeaderMap) {
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("GET, HEAD, OPTIONS"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("*"),
    );
    headers.insert(
        header::ACCESS_CONTROL_EXPOSE_HEADERS,
        HeaderValue::from_static("Content-Length, Content-Range, Accept-Ranges, Content-Type"),
    );
}

fn error(status: StatusCode, msg: impl Into<String>) -> Response {
    let mut res = (status, msg.into()).into_response();
    cors(res.headers_mut());
    res
}

async fn handle(
    State(state): State<ProxyState>,
    Path(token): Path<String>,
    method: Method,
    Query(q): Query<ProxyQuery>,
    req_headers: HeaderMap,
) -> Response {
    if token != state.token {
        return (StatusCode::FORBIDDEN, "forbidden").into_response();
    }
    if method == Method::OPTIONS {
        let mut res = StatusCode::NO_CONTENT.into_response();
        cors(res.headers_mut());
        return res;
    }

    let target = match Url::parse(&q.u) {
        Ok(u) if matches!(u.scheme(), "http" | "https") => u,
        _ => return error(StatusCode::BAD_REQUEST, "invalid url"),
    };

    let ua = state.user_agent.read().await.clone();
    let mut upstream = if method == Method::HEAD {
        state.client.head(target.clone())
    } else {
        state.client.get(target.clone())
    }
    .header(reqwest::header::USER_AGENT, ua)
    .header(reqwest::header::ACCEPT, "*/*");

    if let Some(range) = req_headers.get(header::RANGE) {
        upstream = upstream.header(reqwest::header::RANGE, range.as_bytes());
    }

    let resp = match upstream.send().await {
        Ok(r) => r,
        Err(err) => {
            log::warn!("proxy upstream error for {target}: {err}");
            return error(StatusCode::BAD_GATEWAY, format!("upstream error: {err}"));
        }
    };

    let status = StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let final_url = resp.url().clone();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();

    let looks_like_playlist = q.raw.unwrap_or(0) == 0
        && method == Method::GET
        && status.is_success()
        && (content_type.contains("mpegurl")
            || final_url.path().ends_with(".m3u8")
            || target.path().ends_with(".m3u8"))
        && resp
            .content_length()
            .is_none_or(|l| l <= MAX_PLAYLIST_BYTES);

    if looks_like_playlist {
        let body = match resp.text().await {
            Ok(b) => b,
            Err(err) => return error(StatusCode::BAD_GATEWAY, format!("read error: {err}")),
        };
        let out = if body.contains("#EXT-X-") {
            rewrite_hls(&body, &final_url, &state)
        } else {
            body
        };
        let mut res = (status, out).into_response();
        let h = res.headers_mut();
        h.insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/vnd.apple.mpegurl"),
        );
        h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
        cors(h);
        return res;
    }

    let mut builder = Response::builder().status(status);
    {
        let h = builder.headers_mut().expect("fresh builder");
        for name in [
            header::CONTENT_TYPE,
            header::CONTENT_LENGTH,
            header::CONTENT_RANGE,
            header::ACCEPT_RANGES,
            header::CACHE_CONTROL,
            header::LAST_MODIFIED,
            header::ETAG,
            header::EXPIRES,
        ] {
            if let Some(v) = resp.headers().get(name.as_str()) {
                if let Ok(v) = HeaderValue::from_bytes(v.as_bytes()) {
                    h.insert(name, v);
                }
            }
        }
        cors(h);
    }

    let body = if method == Method::HEAD {
        Body::empty()
    } else {
        Body::from_stream(resp.bytes_stream().map_err(std::io::Error::other))
    };
    builder
        .body(body)
        .unwrap_or_else(|_| error(StatusCode::INTERNAL_SERVER_ERROR, "response build failed"))
}

/// Rewrite every URI inside an HLS playlist to an absolute, proxied URL.
fn rewrite_hls(body: &str, base: &Url, state: &ProxyInner) -> String {
    let mut out = String::with_capacity(body.len() * 2);
    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            out.push('\n');
            continue;
        }
        if trimmed.starts_with('#') {
            out.push_str(&rewrite_uri_attrs(trimmed, base, state));
        } else if let Ok(abs) = base.join(trimmed) {
            out.push_str(&state.proxied(abs.as_str()));
        } else {
            out.push_str(trimmed);
        }
        out.push('\n');
    }
    out
}

fn rewrite_uri_attrs(line: &str, base: &Url, state: &ProxyInner) -> String {
    const NEEDLE: &str = "URI=\"";
    if !line.contains(NEEDLE) {
        return line.to_string();
    }
    let mut out = String::with_capacity(line.len() * 2);
    let mut rest = line;
    while let Some(start) = rest.find(NEEDLE) {
        let (head, tail) = rest.split_at(start + NEEDLE.len());
        out.push_str(head);
        match tail.find('"') {
            Some(end) => {
                let uri = &tail[..end];
                match base.join(uri) {
                    Ok(abs) if !uri.starts_with("data:") => {
                        out.push_str(&state.proxied(abs.as_str()))
                    }
                    _ => out.push_str(uri),
                }
                rest = &tail[end..];
            }
            None => {
                rest = tail;
                break;
            }
        }
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state() -> ProxyInner {
        ProxyInner {
            client: build_client(),
            token: "tok".into(),
            port: 1234,
            user_agent: RwLock::new(String::new()),
        }
    }

    #[test]
    fn rewrites_segments_and_keys() {
        let s = state();
        let base = Url::parse("http://example.com/live/a/b/index.m3u8").unwrap();
        let src = "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\"\n#EXTINF:4,\nseg1.ts\nhttp://cdn.example.com/seg2.ts\n";
        let out = rewrite_hls(src, &base, &s);
        assert!(out.contains("URI=\"http://127.0.0.1:1234/tok/s?u=http%3A%2F%2Fexample%2Ecom%2Flive%2Fa%2Fb%2Fkey%2Ebin\""));
        assert!(out.contains("u=http%3A%2F%2Fexample%2Ecom%2Flive%2Fa%2Fb%2Fseg1%2Ets"));
        assert!(out.contains("u=http%3A%2F%2Fcdn%2Eexample%2Ecom%2Fseg2%2Ets"));
        assert!(out.starts_with("#EXTM3U\n"));
    }

    /// Spin up a fake upstream + the real proxy and talk to it over HTTP.
    mod http {
        use super::super::*;
        use axum::routing::get;

        async fn upstream() -> String {
            let app = Router::new()
                .route(
                    "/live/index.m3u8",
                    get(|| async {
                        (
                            [(header::CONTENT_TYPE, "application/vnd.apple.mpegurl")],
                            "#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\nseg0.ts\n",
                        )
                    }),
                )
                .route(
                    "/file.bin",
                    get(|headers: HeaderMap| async move {
                        let data: Vec<u8> = (0u8..=99).collect();
                        match headers.get(header::RANGE).and_then(|v| v.to_str().ok()) {
                            Some("bytes=10-19") => (
                                StatusCode::PARTIAL_CONTENT,
                                [(header::CONTENT_RANGE, "bytes 10-19/100")],
                                data[10..20].to_vec(),
                            )
                                .into_response(),
                            _ => data.into_response(),
                        }
                    }),
                )
                .route(
                    "/redirect",
                    get(|| async { (StatusCode::FOUND, [(header::LOCATION, "/live/index.m3u8")]) }),
                )
                .route(
                    "/ua",
                    get(|headers: HeaderMap| async move {
                        headers
                            .get(header::USER_AGENT)
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or("")
                            .to_string()
                    }),
                );
            let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let addr = l.local_addr().unwrap();
            tokio::spawn(async move { axum::serve(l, app).await.unwrap() });
            format!("http://{addr}")
        }

        /// An upstream that accepts the connection and then goes silent must not
        /// pin a proxy connection forever (it would eat one of WebKit's 6 slots).
        #[tokio::test]
        async fn silent_upstream_times_out() {
            use tokio::io::{AsyncReadExt, AsyncWriteExt};
            let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let up = format!("http://{}", l.local_addr().unwrap());
            tokio::spawn(async move {
                loop {
                    let (mut s, _) = l.accept().await.unwrap();
                    tokio::spawn(async move {
                        let mut buf = [0u8; 4096];
                        let n = s.read(&mut buf).await.unwrap();
                        if buf[..n].starts_with(b"GET /stall") {
                            // headers + a few bytes, then nothing
                            let _ = s
                                .write_all(
                                    b"HTTP/1.1 200 OK\r\nContent-Type: video/mp2t\r\n\r\nabc",
                                )
                                .await;
                        }
                        tokio::time::sleep(Duration::from_secs(3600)).await;
                        drop(s);
                    });
                }
            });
            let proxy = start().await.unwrap();
            let c = reqwest::Client::new();
            let limit = READ_TIMEOUT * 5;

            // no response headers at all
            let res =
                tokio::time::timeout(limit, c.get(proxy.proxied(&format!("{up}/hang"))).send())
                    .await
                    .expect("proxy hung on a silent upstream")
                    .unwrap();
            assert_eq!(res.status(), 502);

            // body starts, then stalls
            let res = c
                .get(proxy.proxied(&format!("{up}/stall")))
                .send()
                .await
                .unwrap();
            assert_eq!(res.status(), 200);
            let body = tokio::time::timeout(limit, res.bytes())
                .await
                .expect("proxy hung on a stalled body");
            assert!(body.is_err(), "stalled body should end with an error");
        }

        #[tokio::test]
        async fn proxies_with_cors_range_and_rewrite() {
            let up = upstream().await;
            let proxy = start().await.unwrap();
            let c = reqwest::Client::new();

            // token is enforced
            let bad = format!("http://127.0.0.1:{}/nope/s?u=x", proxy.port);
            assert_eq!(c.get(bad).send().await.unwrap().status(), 403);

            // byte ranges are forwarded for seeking
            let res = c
                .get(proxy.proxied(&format!("{up}/file.bin")))
                .header("Range", "bytes=10-19")
                .send()
                .await
                .unwrap();
            assert_eq!(res.status(), 206);
            assert_eq!(res.headers()["access-control-allow-origin"], "*");
            assert_eq!(res.headers()["content-range"], "bytes 10-19/100");
            assert_eq!(
                res.bytes().await.unwrap().to_vec(),
                (10u8..20).collect::<Vec<_>>()
            );

            // redirects are followed and playlists rewritten against the final URL
            let body = c
                .get(proxy.proxied(&format!("{up}/redirect")))
                .send()
                .await
                .unwrap()
                .text()
                .await
                .unwrap();
            let seg = proxy.proxied(&format!("{up}/live/seg0.ts"));
            assert!(body.contains(&seg), "playlist not rewritten: {body}");

            // configured User-Agent is sent upstream
            *proxy.user_agent.write().await = "TestAgent/1.0".into();
            let ua = c
                .get(proxy.proxied(&format!("{up}/ua")))
                .send()
                .await
                .unwrap()
                .text()
                .await
                .unwrap();
            assert_eq!(ua, "TestAgent/1.0");
        }
    }
}
