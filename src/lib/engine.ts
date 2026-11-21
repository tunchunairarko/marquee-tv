import type HlsType from "hls.js";
import type { ErrorData } from "hls.js";
import type MpegtsType from "mpegts.js";
import { proxied } from "./native";

// Engines are loaded on demand so the UI boots fast.
let hlsMod: Promise<typeof HlsType> | undefined;
let tsMod: Promise<typeof MpegtsType> | undefined;
const loadHls = () => (hlsMod ??= import("hls.js").then((m) => m.default));
const loadTs = () => (tsMod ??= import("mpegts.js").then((m) => m.default));

/** Warm the engine chunks (e.g. when hovering a play button). */
export function preloadEngines() {
  loadHls();
  loadTs();
}

export interface Track {
  id: number;
  label: string;
}

export interface EngineTracks {
  qualities: Track[];
  quality: number;
  audios: Track[];
  audio: number;
  subs: Track[];
  sub: number;
}

export interface EngineEvents {
  onTracks?(t: EngineTracks): void;
  /** Called when every candidate URL has failed. */
  onFatal?(message: string): void;
  /** Called when switching to a fallback candidate. */
  onFallback?(url: string): void;
}

type Kind = "hls" | "mpegts" | "native";

function kindOf(url: string): Kind {
  const path = url.split(/[?#]/)[0].toLowerCase();
  if (path.endsWith(".m3u8") || path.endsWith(".m3u")) return "hls";
  if (path.endsWith(".ts") || path.endsWith(".mts") || path.endsWith(".m2ts")) return "mpegts";
  if (path.endsWith(".flv")) return "mpegts";
  if (/\.(mp4|m4v|mkv|webm|mov|avi|mp3|aac|ogg|wmv)$/.test(path)) return "native";
  // Extension-less live URLs (common in M3U lists) are almost always MPEG-TS.
  return "mpegts";
}

const LIVE_POLL = 0.25; // s between buffer checks while holding a live start
const LIVE_MAX_WAIT = 3; // s after the first data before starting anyway
const LIVE_LAG = 3; // s behind the buffered edge to start (headroom for bursty delivery)

/**
 * Where to start a live stream, or undefined to keep waiting. Waits while the buffer
 * grows much faster than real time (the provider's connect-time backlog burst).
 */
export function liveStart(prevEnd: number, end: number, start: number, waited: number): number | undefined {
  if (end <= 0) return undefined;
  const bursting = prevEnd <= 0 || end - prevEnd > LIVE_POLL * 1.5;
  if (bursting && waited < LIVE_MAX_WAIT) return undefined;
  return Math.max(start, end - LIVE_LAG);
}

const EMPTY: EngineTracks = { qualities: [], quality: -1, audios: [], audio: -1, subs: [], sub: -1 };

/**
 * Plays one of several candidate URLs into a <video>, picking the right
 * engine per URL and falling back to the next candidate on fatal errors.
 */
export class Playback {
  private hls?: HlsType;
  private ts?: MpegtsType.Player;
  private gen = 0;
  private idx = -1;
  private destroyed = false;
  private recoveries = 0;
  private tracks: EngineTracks = EMPTY;
  private nativeErr = () => this.fail(this.video.error?.message || "This video format isn't supported");

  constructor(
    private video: HTMLVideoElement,
    private candidates: string[],
    private live: boolean,
    private ev: EngineEvents = {},
    private startAt = 0,
  ) {
    this.next();
  }

  get currentUrl(): string | undefined {
    return this.candidates[this.idx];
  }

  get engine(): Kind | undefined {
    return this.currentUrl ? kindOf(this.currentUrl) : undefined;
  }

  private teardown() {
    this.video.removeEventListener("error", this.nativeErr);
    if (this.hls) {
      this.hls.destroy();
      this.hls = undefined;
    }
    if (this.ts) {
      try {
        this.ts.pause();
        this.ts.unload();
        this.ts.detachMediaElement();
        this.ts.destroy();
      } catch {
        /* ignore */
      }
      this.ts = undefined;
    }
    this.video.removeAttribute("src");
    this.video.load();
  }

  private async next() {
    this.teardown();
    this.idx++;
    this.recoveries = 0;
    this.setTracks(EMPTY);
    const url = this.currentUrl;
    if (!url || this.destroyed) return;
    if (this.idx > 0) this.ev.onFallback?.(url);
    const src = proxied(url);
    const kind = kindOf(url);
    const gen = ++this.gen;

    try {
      if (kind === "hls") {
        const Hls = await loadHls();
        if (gen !== this.gen || this.destroyed) return;
        if (Hls.isSupported()) return this.startHls(Hls, src);
        if (this.video.canPlayType("application/vnd.apple.mpegurl")) return this.startNative(src);
      } else if (kind === "mpegts") {
        const mpegts = await loadTs();
        if (gen !== this.gen || this.destroyed) return;
        if (mpegts.isSupported()) return this.startTs(mpegts, src, url);
      }
      this.startNative(src);
    } catch (e) {
      this.fail(e instanceof Error ? e.message : String(e));
    }
  }

  private fail(message: string) {
    if (this.destroyed) return;
    if (this.idx + 1 < this.candidates.length) this.next();
    else {
      this.teardown();
      this.ev.onFatal?.(message);
    }
  }

  private play() {
    this.video.play().catch(() => {
      /* autoplay may be blocked until user gesture; controls handle it */
    });
  }

  private startNative(src: string) {
    this.video.addEventListener("error", this.nativeErr);
    this.video.src = src;
    if (this.startAt > 0) this.video.currentTime = this.startAt;
    this.play();
    this.video.addEventListener(
      "loadedmetadata",
      () => {
        const subs = Array.from(this.video.textTracks).map((t, i) => ({ id: i, label: t.label || t.language || `Track ${i + 1}` }));
        this.setTracks({ ...EMPTY, subs });
      },
      { once: true },
    );
  }

  private startTs(mpegts: typeof MpegtsType, src: string, url: string) {
    const isFlv = url.toLowerCase().split("?")[0].endsWith(".flv");
    const player = mpegts.createPlayer(
      { type: isFlv ? "flv" : "mpegts", isLive: this.live, url: src },
      {
        enableWorker: true,
        enableStashBuffer: !this.live,
        stashInitialSize: this.live ? 128 * 1024 : 512 * 1024,
        lazyLoad: !this.live,
        autoCleanupSourceBuffer: true,
        liveBufferLatencyChasing: this.live,
        liveBufferLatencyMaxLatency: 6,
        liveBufferLatencyMinRemain: 1.5,
        fixAudioTimestampGap: true,
      },
    );
    this.ts = player;
    player.on(mpegts.Events.ERROR, (type: string, detail: string) => {
      if (this.recoveries++ < 2 && type === mpegts.ErrorTypes.NETWORK_ERROR && this.live) {
        setTimeout(() => {
          if (this.ts !== player) return;
          player.unload();
          player.load();
          this.startAtLiveEdge(player);
        }, 800);
        return;
      }
      this.fail(`${type}: ${detail}`);
    });
    player.attachMediaElement(this.video);
    player.load();
    if (this.live) return this.startAtLiveEdge(player);
    if (this.startAt > 0) this.video.currentTime = this.startAt;
    this.play();
  }

  /**
   * Many providers burst 20-30 s of backlog the moment a live TS stream connects.
   * Playing right away starts at the oldest frame, and the latency chaser then seeks
   * forward several times while the burst lands, which looks like a fast-forward.
   * Stay paused until the burst is in, then start once near the live edge.
   */
  private startAtLiveEdge(player: MpegtsType.Player) {
    let prevEnd = 0;
    let waited = 0;
    const tick = () => {
      if (this.ts !== player || this.destroyed) return;
      const b = this.video.buffered;
      const end = b.length ? b.end(b.length - 1) : 0;
      const at = liveStart(prevEnd, end, b.length ? b.start(0) : 0, waited);
      if (at === undefined) {
        if (end > 0) waited += LIVE_POLL;
        prevEnd = end;
        setTimeout(tick, LIVE_POLL * 1000);
        return;
      }
      this.video.currentTime = at;
      this.play();
    };
    setTimeout(tick, LIVE_POLL * 1000);
  }

  private startHls(Hls: typeof HlsType, src: string) {
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: this.live ? 20 : 60,
      maxBufferLength: 30,
      maxMaxBufferLength: 120,
      liveSyncDurationCount: 3,
      startPosition: this.startAt > 0 ? this.startAt : -1,
      capLevelToPlayerSize: false,
      manifestLoadPolicy: {
        default: {
          maxTimeToFirstByteMs: 10000,
          maxLoadTimeMs: 20000,
          timeoutRetry: { maxNumRetry: 2, retryDelayMs: 0, maxRetryDelayMs: 0 },
          errorRetry: { maxNumRetry: 2, retryDelayMs: 800, maxRetryDelayMs: 4000 },
        },
      },
    });
    this.hls = hls;

    const sync = () => {
      const qualities = hls.levels
        .map((l, i) => ({
          id: i,
          label: l.height ? `${l.height}p` : l.bitrate ? `${Math.round(l.bitrate / 1000)} kbps` : `Level ${i + 1}`,
          h: l.height || l.bitrate,
        }))
        .sort((a, b) => b.h - a.h)
        .map(({ id, label }) => ({ id, label }));
      this.setTracks({
        qualities,
        quality: hls.autoLevelEnabled ? -1 : hls.currentLevel,
        audios: hls.audioTracks.map((t, i) => ({ id: i, label: t.name || t.lang || `Audio ${i + 1}` })),
        audio: hls.audioTrack,
        subs: hls.subtitleTracks.map((t, i) => ({ id: i, label: t.name || t.lang || `Subtitle ${i + 1}` })),
        sub: hls.subtitleTrack,
      });
    };

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      sync();
      this.play();
    });
    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, sync);
    hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, sync);
    hls.on(Hls.Events.LEVEL_SWITCHED, sync);
    hls.on(Hls.Events.ERROR, (_e, data: ErrorData) => {
      if (!data.fatal) return;
      if (this.recoveries++ < 3) {
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) return hls.recoverMediaError();
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && data.details !== Hls.ErrorDetails.MANIFEST_LOAD_ERROR)
          return hls.startLoad();
      }
      this.fail(data.details || "Stream failed to load");
    });
    hls.loadSource(src);
    hls.attachMedia(this.video);
  }

  private setTracks(t: EngineTracks) {
    this.tracks = t;
    this.ev.onTracks?.(t);
  }

  setQuality(id: number) {
    if (!this.hls) return;
    this.hls.currentLevel = id;
    this.setTracks({ ...this.tracks, quality: id });
  }

  setAudio(id: number) {
    if (!this.hls) return;
    this.hls.audioTrack = id;
    this.setTracks({ ...this.tracks, audio: id });
  }

  setSub(id: number) {
    if (this.hls) {
      this.hls.subtitleTrack = id;
      this.hls.subtitleDisplay = id >= 0;
    } else {
      Array.from(this.video.textTracks).forEach((t, i) => (t.mode = i === id ? "showing" : "disabled"));
    }
    this.setTracks({ ...this.tracks, sub: id });
  }

  /** Jump to the live edge (live streams only). */
  goLive() {
    if (this.hls && this.hls.liveSyncPosition) this.video.currentTime = this.hls.liveSyncPosition;
    else if (this.video.buffered.length) this.video.currentTime = this.video.buffered.end(this.video.buffered.length - 1) - 1;
  }

  retry() {
    this.idx = -1;
    this.next();
  }

  destroy() {
    this.destroyed = true;
    this.gen++;
    this.teardown();
  }
}
