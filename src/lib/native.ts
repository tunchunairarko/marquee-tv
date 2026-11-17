import { invoke, isTauri } from "@tauri-apps/api/core";

interface ProxyInfo {
  port: number;
  token: string;
}

let proxyBase: string | null = null;

export const inTauri = isTauri();

/** Must be awaited once at startup before any network access. */
export async function initNative(): Promise<void> {
  if (!inTauri) return;
  const info = await invoke<ProxyInfo>("proxy_info");
  proxyBase = `http://127.0.0.1:${info.port}/${info.token}/s?u=`;
}

/**
 * Route a remote URL through the local Rust proxy (adds CORS, follows
 * redirects, rewrites HLS). In a plain browser (vite dev without Tauri)
 * the URL is returned untouched.
 */
export function proxied(url: string, raw = false): string {
  if (!proxyBase || !/^https?:\/\//i.test(url)) return url;
  return proxyBase + encodeURIComponent(url) + (raw ? "&raw=1" : "");
}

export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(proxied(url, true), { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`.trim());
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Server returned an invalid response");
  }
}

export async function setUserAgent(userAgent: string): Promise<void> {
  if (inTauri) await invoke("set_user_agent", { userAgent });
}

export async function loadM3u(source: string): Promise<M3uPlaylist> {
  if (inTauri) {
    const buf = await invoke<ArrayBuffer>("load_m3u", { source });
    return JSON.parse(new TextDecoder().decode(buf)) as M3uPlaylist;
  }
  // Browser fallback (dev / e2e): fetch + parse in JS.
  const res = await fetch(source);
  if (!res.ok) throw new Error(`Playlist server returned HTTP ${res.status}`);
  const { parseM3u } = await import("./m3u");
  return parseM3u(await res.text());
}

export async function openExternal(url: string, title?: string): Promise<string> {
  if (!inTauri) {
    window.open(url, "_blank");
    return "browser";
  }
  return invoke<string>("open_in_external_player", { url, title });
}

export async function setFullscreen(on: boolean): Promise<void> {
  if (inTauri) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setFullscreen(on);
  } else if (on) {
    await document.documentElement.requestFullscreen?.();
  } else if (document.fullscreenElement) {
    await document.exitFullscreen();
  }
}

export async function isFullscreen(): Promise<boolean> {
  if (inTauri) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow().isFullscreen();
  }
  return !!document.fullscreenElement;
}

export interface M3uEntry {
  name: string;
  url: string;
  group: string;
  logo?: string;
  tvgId?: string;
  kind: "live" | "movie" | "series";
  catchupDays?: number;
}

export interface M3uPlaylist {
  epgUrl: string | null;
  entries: M3uEntry[];
}
