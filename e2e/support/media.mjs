// Generates tiny test streams with ffmpeg (VP9 + Opus so they decode in the
// open-source Chromium used by Playwright *and* in WebKitGTK/GStreamer).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const MEDIA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", ".media");

const src = [
  "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25",
  "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
];
const enc = ["-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "400k", "-g", "50", "-c:a", "libopus", "-b:a", "64k"];

export function ensureMedia() {
  const hls = join(MEDIA_DIR, "hls", "index.m3u8");
  const mp4 = join(MEDIA_DIR, "movie.mp4");
  if (existsSync(hls) && existsSync(mp4)) return;
  mkdirSync(dirname(hls), { recursive: true });
  const ff = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
  ff([...src, "-t", "30", ...enc, "-f", "hls", "-hls_time", "2", "-hls_playlist_type", "vod", "-hls_segment_type", "fmp4",
      "-hls_fmp4_init_filename", "init.mp4", "-hls_segment_filename", join(MEDIA_DIR, "hls", "seg%03d.m4s"), hls]);
  ff([...src, "-t", "60", ...enc, "-movflags", "+faststart", mp4]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) ensureMedia();
