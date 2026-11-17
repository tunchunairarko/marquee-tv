// A fake Xtream Codes / M3U provider used by the end-to-end suites.
//
//   node e2e/support/mock-server.mjs [port]
//
// Credentials: demo / secret.   Inspect traffic: GET /__requests
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { ensureMedia, MEDIA_DIR } from "./media.mjs";

ensureMedia();
const PORT = Number(process.argv[2] ?? process.env.MOCK_PORT ?? 4599);
const BASE = `http://127.0.0.1:${PORT}`;
const USER = "demo";
const PASS = "secret";

const liveCats = [
  { category_id: "1", category_name: "UK | News" },
  { category_id: "2", category_name: "UK | Sport" },
  { category_id: "3", category_name: "Kids" },
];
const live = [
  ["Mock News One", "1"], ["Mock News Two", "1"], ["Business Today", "1"], ["World Report", "1"],
  ["Sport Arena", "2"], ["Goal Channel", "2"], ["Tennis Live", "2"],
  ["Toon Time", "3"], ["Junior TV", "3"],
].map(([name, cat], i) => ({
  num: i + 1, name, stream_type: "live", stream_id: 100 + i, stream_icon: `${BASE}/logo/${i}.svg`,
  epg_channel_id: `ch${i}`, category_id: cat, tv_archive: 0,
}));

const vodCats = [{ category_id: "10", category_name: "Action" }, { category_id: "11", category_name: "Comedy" }];
const now = Math.floor(Date.now() / 1000);
const movies = [
  ["Rocket Rangers", "10"], ["Steel Harbour", "10"], ["Night Chase", "10"], ["Thunder Road", "10"],
  ["The Funny Farm", "11"], ["Laugh Lines", "11"], ["Office Antics", "11"], ["Holiday Mixup", "11"],
].map(([name, cat], i) => ({
  num: i + 1, name, stream_type: "movie", stream_id: 500 + i, stream_icon: `${BASE}/poster/${i}.svg`,
  rating: "7.5", rating_5based: 3.8, added: String(now - i * 3600), category_id: cat, container_extension: "mp4",
}));

const seriesCats = [{ category_id: "20", category_name: "Drama Series" }];
const series = [
  ["Harbour Lights", 900], ["The Detectives", 901], ["Moonborne", 902],
].map(([name, id], i) => ({
  num: i + 1, name, series_id: id, cover: `${BASE}/poster/${10 + i}.svg`, plot: `${name} plot.`,
  cast: "A. Actor, B. Actor", genre: "Drama", releaseDate: "2023-01-01", last_modified: String(now - i * 100),
  rating: "8", rating_5based: 4, backdrop_path: [], category_id: "20",
}));

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

function api(q) {
  if (q.get("username") !== USER || q.get("password") !== PASS) return { user_info: { auth: 0 } };
  switch (q.get("action")) {
    case null:
      return {
        user_info: { auth: 1, status: "Active", exp_date: String(now + 86400 * 90), max_connections: "2", active_cons: "0" },
        server_info: { url: "127.0.0.1", port: String(PORT) },
      };
    case "get_live_categories": return liveCats;
    case "get_vod_categories": return vodCats;
    case "get_series_categories": return seriesCats;
    case "get_live_streams": return live;
    case "get_vod_streams": return movies;
    case "get_series": return series;
    case "get_vod_info": {
      const m = movies.find((x) => String(x.stream_id) === q.get("vod_id"));
      return { info: { plot: `The plot of ${m?.name}.`, cast: "Jane Doe", director: "John Roe", genre: "Action", duration: "1h 30m", releasedate: "2024-05-01", rating: "7.5", backdrop_path: [] }, movie_data: m };
    }
    case "get_series_info": {
      const s = series.find((x) => String(x.series_id) === q.get("series_id"));
      const ep = (season, n) => ({ id: `${s.series_id}${season}${n}`, episode_num: n, title: `Episode ${n}`, container_extension: "mp4", season, info: { plot: `S${season}E${n} plot`, duration: "00:45:00" } });
      return {
        info: { name: s.name, plot: s.plot, cast: s.cast, genre: s.genre, releaseDate: s.releaseDate, rating: "8" },
        seasons: [{ season_number: 1 }, { season_number: 2 }],
        episodes: { 1: [ep(1, 1), ep(1, 2), ep(1, 3)], 2: [ep(2, 1), ep(2, 2)] },
      };
    }
    case "get_short_epg": {
      const slot = 1800;
      const base = Math.floor(now / slot) * slot;
      const limit = Number(q.get("limit") ?? 4);
      return {
        epg_listings: Array.from({ length: limit }, (_, k) => ({
          title: b64(k === 0 ? `Now on ${q.get("stream_id")}` : `Later show ${k}`),
          description: b64("A programme description."),
          start_timestamp: String(base + k * slot),
          stop_timestamp: String(base + (k + 1) * slot),
        })),
      };
    }
    default: return [];
  }
}

function m3u() {
  const lines = [`#EXTM3U url-tvg="${BASE}/epg.xml"`];
  for (const c of live) {
    const cat = liveCats.find((x) => x.category_id === c.category_id).category_name;
    lines.push(`#EXTINF:-1 tvg-id="${c.epg_channel_id}" tvg-logo="${c.stream_icon}" group-title="${cat}",${c.name}`, `${BASE}/live/${USER}/${PASS}/${c.stream_id}.m3u8`);
  }
  for (const m of movies) lines.push(`#EXTINF:-1 group-title="Movies",${m.name}`, `${BASE}/movie/${USER}/${PASS}/${m.stream_id}.mp4`);
  for (const [s, e] of [[1, 1], [1, 2], [2, 1]]) lines.push(`#EXTINF:-1 group-title="Shows",Harbour Lights S0${s} E0${e}`, `${BASE}/series/${USER}/${PASS}/9${s}${e}.mp4`);
  return lines.join("\n") + "\n";
}

function svg(label, w, h, hue) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="hsl(${hue},60%,40%)"/><text x="50%" y="55%" font-size="${w / 6}" text-anchor="middle" fill="#fff" font-family="sans-serif">${label}</text></svg>`;
}

const requests = [];
const TYPES = { ".m3u8": "application/vnd.apple.mpegurl", ".m4s": "video/iso.segment", ".mp4": "video/mp4" };

function sendFile(req, res, file) {
  const size = statSync(file).size;
  const type = TYPES[extname(file)] ?? "application/octet-stream";
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    res.writeHead(206, { "Content-Type": type, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes" });
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  const url = new URL(req.url, BASE);
  const p = url.pathname;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range");
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  if (!p.startsWith("/__")) requests.push({ path: p, ua: req.headers["user-agent"] ?? "", at: Date.now() });

  const json = (v) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(v)); };
  let m;
  if (p === "/__requests") return json(requests);
  if (p === "/__reset") { requests.length = 0; return json({ ok: true }); }
  if (p === "/player_api.php") return json(api(url.searchParams));
  if (p === "/get.php") {
    if (url.searchParams.get("username") !== USER) return res.writeHead(401).end();
    res.writeHead(200, { "Content-Type": "audio/x-mpegurl" });
    return res.end(m3u());
  }
  if ((m = p.match(/^\/(logo|poster)\/(\d+)\.svg$/))) {
    res.writeHead(200, { "Content-Type": "image/svg+xml" });
    const n = Number(m[2]);
    return res.end(m[1] === "logo" ? svg(`C${n}`, 200, 200, n * 37) : svg(`P${n}`, 300, 450, n * 53));
  }
  // Live: .ts deliberately fails so the player must fall back to HLS.
  if ((m = p.match(/^\/live\/[^/]+\/[^/]+\/\d+\.(ts|m3u8)$/))) {
    if (m[1] === "ts") return res.writeHead(404).end("no ts here");
    res.writeHead(302, { Location: `${BASE}/hls/index.m3u8` });
    return res.end();
  }
  if ((m = p.match(/^\/hls\/([\w.]+)$/))) return sendFile(req, res, join(MEDIA_DIR, "hls", m[1]));
  if (/^\/(movie|series)\/[^/]+\/[^/]+\/\d+\.mp4$/.test(p)) return sendFile(req, res, join(MEDIA_DIR, "movie.mp4"));
  res.writeHead(404).end("not found");
}).listen(PORT, "127.0.0.1", () => console.log(`mock IPTV server on ${BASE}`));

