// JS mirror of src-tauri/src/m3u.rs, used when running outside Tauri.
import type { M3uEntry, M3uPlaylist } from "./native";

function attr(line: string, key: string): string | undefined {
  const re = new RegExp(`(?:^|[\\s,:])${key}=(?:"([^"]*)"|([^\\s,]*))`);
  const m = line.match(re);
  return m ? (m[1] ?? m[2]) : undefined;
}

function titleSplit(line: string): number {
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === "," && !q) return i;
  }
  return -1;
}

function classify(url: string): M3uEntry["kind"] {
  const l = url.toLowerCase();
  if (l.includes("/series/")) return "series";
  if (l.includes("/movie/")) return "movie";
  const path = l.split(/[?#]/)[0];
  return /\.(mp4|mkv|avi|mov|m4v|wmv|webm|flv)$/.test(path) ? "movie" : "live";
}

export function parseM3u(text: string): M3uPlaylist {
  const out: M3uPlaylist = { epgUrl: null, entries: [] };
  let pending: Omit<M3uEntry, "url" | "kind"> | null = null;
  let grp: string | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXTM3U")) {
      out.epgUrl = attr(line, "url-tvg") ?? attr(line, "x-tvg-url") ?? null;
      continue;
    }
    if (line.startsWith("#EXTINF:")) {
      const rest = line.slice(8);
      const i = titleSplit(rest);
      const attrs = i >= 0 ? rest.slice(0, i) : rest;
      const title = i >= 0 ? rest.slice(i + 1).trim() : "";
      const catchup = parseInt(attr(attrs, "catchup-days") ?? attr(attrs, "tvg-rec") ?? "", 10);
      pending = {
        name: title || attr(attrs, "tvg-name") || "Untitled",
        group: attr(attrs, "group-title") ?? "",
        logo: attr(attrs, "tvg-logo") || undefined,
        tvgId: attr(attrs, "tvg-id") || undefined,
        catchupDays: catchup > 0 ? catchup : undefined,
      };
      continue;
    }
    if (line.startsWith("#EXTGRP:")) {
      grp = line.slice(8).trim();
      continue;
    }
    if (line.startsWith("#")) continue;
    const p = pending ?? { name: line, group: "" };
    pending = null;
    if (!p.group) {
      p.group = grp ?? "Uncategorised";
      grp = undefined;
    }
    out.entries.push({ ...p, url: line, kind: classify(line) });
  }
  return out;
}
