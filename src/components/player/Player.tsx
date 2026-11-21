import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  List,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Settings2,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Playback, type EngineTracks } from "../../lib/engine";
import { resolve } from "../../lib/media";
import { isFullscreen, openExternal, setFullscreen } from "../../lib/native";
import { clamp, cleanName, cx, formatClock, formatTime } from "../../lib/util";
import type { EpgEntry, LiveChannel } from "../../providers";
import { activeProvider, flushUserData, useApp, type PlayRequest } from "../../store/app";
import { Img } from "../Img";
import { Spinner } from "../Spinner";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function PlayerHost() {
  const req = useApp((s) => s.player);
  if (!req) return null;
  return <Player req={req} />;
}

function useEpg(channel?: LiveChannel) {
  const [epg, setEpg] = useState<EpgEntry[]>([]);
  useEffect(() => {
    setEpg([]);
    if (!channel) return;
    let alive = true;
    const load = () =>
      activeProvider()
        ?.shortEpg(channel, 6)
        .then((e) => alive && setEpg(e))
        .catch(() => {});
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [channel]);
  return epg;
}

function Player({ req }: { req: PlayRequest }) {
  const video = useRef<HTMLVideoElement>(null);
  const engine = useRef<Playback | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const play = useApp((s) => s.play);
  const saveProgress = useApp((s) => s.saveProgress);
  const notify = useApp((s) => s.notify);

  const media = useMemo(() => resolve(req), [req]);
  const channel = req.kind === "live" ? req.channel : undefined;
  const epg = useEpg(channel);
  const now = epg.find((e) => e.start <= Date.now() && e.end > Date.now()) ?? epg[0];
  const nextProg = epg[epg.indexOf(now!) + 1];

  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [error, setError] = useState<string>();
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [idle, setIdle] = useState(false);
  const [fs, setFs] = useState(false);
  const [tracks, setTracks] = useState<EngineTracks>();
  const [menu, setMenu] = useState<null | "settings">(null);
  const [drawer, setDrawer] = useState(false);
  const [flash, setFlash] = useState<{ id: number; icon: "play" | "pause" | "fwd" | "back" }>();
  const [hover, setHover] = useState<{ x: number; t: number }>();
  const [speed, setSpeed] = useState(1);
  const [upNext, setUpNext] = useState<number>();

  const queue = req.kind === "episode" ? req.queue : undefined;
  const nextEpisode = useMemo(() => {
    if (req.kind !== "episode" || !queue) return undefined;
    const i = queue.findIndex((e) => e.id === req.episode.id);
    return i >= 0 ? queue[i + 1] : undefined;
  }, [req, queue]);

  // ---- engine lifecycle -------------------------------------------------
  useEffect(() => {
    const v = video.current!;
    setError(undefined);
    setWaiting(true);
    setTime(0);
    setDuration(0);
    setUpNext(undefined);
    const resume = req.kind !== "live" ? (req.resume ?? 0) : 0;
    const pb = new Playback(
      v,
      media.urls,
      media.live,
      {
        onTracks: setTracks,
        onFatal: (msg) => {
          setWaiting(false);
          setError(msg);
        },
      },
      resume > 5 ? resume : 0,
    );
    engine.current = pb;
    return () => {
      pb.destroy();
      engine.current = null;
    };
  }, [media, req]);

  // Volume follows persisted settings.
  useEffect(() => {
    const v = video.current!;
    v.volume = settings.volume;
    v.muted = settings.muted;
  }, [settings.volume, settings.muted]);

  useEffect(() => {
    if (video.current) video.current.playbackRate = speed;
  }, [speed]);

  // ---- progress persistence -------------------------------------------
  const persist = useCallback(() => {
    const v = video.current;
    if (!v || media.live || !v.duration || !Number.isFinite(v.duration) || v.currentTime < 5) return;
    if (req.kind === "movie") saveProgress({ key: media.key, item: req.movie, position: v.currentTime, duration: v.duration });
    if (req.kind === "episode")
      saveProgress({ key: media.key, item: req.series, episode: req.episode, position: v.currentTime, duration: v.duration });
  }, [media, req, saveProgress]);

  useEffect(() => {
    const t = setInterval(persist, 5000);
    return () => {
      clearInterval(t);
      persist();
      flushUserData();
    };
  }, [persist]);

  // ---- fullscreen -------------------------------------------------------
  useEffect(() => {
    isFullscreen().then(setFs);
  }, []);

  const toggleFs = useCallback(async () => {
    const next = !(await isFullscreen());
    await setFullscreen(next);
    setFs(next);
  }, []);

  const close = useCallback(async () => {
    persist();
    flushUserData();
    if (await isFullscreen()) await setFullscreen(false);
    play(undefined);
  }, [persist, play]);

  // ---- controls ---------------------------------------------------------
  const poke = useCallback(() => {
    setIdle(false);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setIdle(true), 3000);
  }, []);

  useEffect(() => {
    poke();
    return () => clearTimeout(hideTimer.current);
  }, [poke]);

  const showFlash = (icon: "play" | "pause" | "fwd" | "back") => setFlash({ id: Date.now(), icon });

  const togglePlay = useCallback(() => {
    const v = video.current!;
    if (v.paused) {
      v.play().catch(() => {});
      showFlash("play");
    } else {
      v.pause();
      showFlash("pause");
    }
  }, []);

  const seekBy = useCallback(
    (d: number) => {
      const v = video.current!;
      if (media.live) return;
      v.currentTime = clamp(v.currentTime + d, 0, v.duration || Infinity);
      showFlash(d > 0 ? "fwd" : "back");
      poke();
    },
    [media.live, poke],
  );

  const setVolume = useCallback(
    (vol: number) => updateSettings({ volume: clamp(vol, 0, 1), muted: vol <= 0 }),
    [updateSettings],
  );

  const zap = useCallback(
    (dir: 1 | -1) => {
      if (req.kind !== "live" || req.list.length < 2) return;
      const i = req.list.findIndex((c) => c.id === req.channel.id);
      const next = req.list[(i + dir + req.list.length) % req.list.length];
      play({ kind: "live", channel: next, list: req.list });
      poke();
    },
    [req, play, poke],
  );

  const playNext = useCallback(() => {
    if (req.kind === "episode" && nextEpisode) {
      persist();
      play({ ...req, episode: nextEpisode, resume: 0 });
    }
  }, [req, nextEpisode, play, persist]);

  const external = useCallback(async () => {
    const url = engine.current?.currentUrl ?? media.urls[0];
    video.current?.pause();
    try {
      const app = await openExternal(url, media.title);
      notify(`Opened in ${app}`);
    } catch (e) {
      notify(String(e));
    }
  }, [media, notify]);

  // ---- keyboard ---------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const v = video.current!;
      poke();
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "f":
          toggleFs();
          break;
        case "m":
          updateSettings({ muted: !v.muted });
          break;
        case "ArrowLeft":
          seekBy(-10);
          break;
        case "ArrowRight":
          seekBy(10);
          break;
        case "ArrowUp":
          e.preventDefault();
          if (media.live) zap(-1);
          else setVolume(v.volume + 0.05);
          break;
        case "ArrowDown":
          e.preventDefault();
          if (media.live) zap(1);
          else setVolume(v.volume - 0.05);
          break;
        case "PageUp":
          zap(-1);
          break;
        case "PageDown":
          zap(1);
          break;
        case "n":
          playNext();
          break;
        case "Escape":
          if (menu || drawer) {
            setMenu(null);
            setDrawer(false);
          } else isFullscreen().then((f) => (f ? setFullscreen(false).then(() => setFs(false)) : close()));
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, toggleFs, seekBy, zap, setVolume, updateSettings, media.live, playNext, close, menu, drawer, poke]);

  // ---- video events -----------------------------------------------------
  const onTime = () => {
    const v = video.current!;
    setTime(v.currentTime);
    if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
    if (!media.live && nextEpisode && settings.autoplayNext && v.duration > 60) {
      const left = v.duration - v.currentTime;
      setUpNext(left < 25 ? Math.ceil(left) : undefined);
    }
  };

  const onEnded = () => {
    if (nextEpisode && settings.autoplayNext) playNext();
    else if (!media.live) close();
  };

  const pct = (x: number) => (duration ? (x / duration) * 100 : 0);
  const seekFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return clamp((e.clientX - r.left) / r.width, 0, 1) * duration;
  };

  const VolumeIcon = settings.muted || settings.volume === 0 ? VolumeX : settings.volume < 0.5 ? Volume1 : Volume2;
  const liveProgress = now ? clamp((Date.now() - now.start) / (now.end - now.start), 0, 1) : 0;
  const showUi = !idle || !playing || !!menu || drawer || !!error;

  return (
    <div
      ref={root}
      className={cx("player", !showUi && "is-idle")}
      onMouseMove={poke}
      onPointerDown={poke}
    >
      <video
        ref={video}
        className="player__video"
        playsInline
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => {
          setWaiting(false);
          setError(undefined);
        }}
        onCanPlay={() => setWaiting(false)}
        onLoadedMetadata={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onDurationChange={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onTimeUpdate={onTime}
        onEnded={onEnded}
        onClick={togglePlay}
        onDoubleClick={toggleFs}
      />

      {waiting && !error && (
        <div className="player__center">
          <Spinner size={64} />
        </div>
      )}

      {flash && (
        <div key={flash.id} className="player__flash">
          {flash.icon === "play" && <Play size={42} fill="currentColor" />}
          {flash.icon === "pause" && <Pause size={42} fill="currentColor" />}
          {flash.icon === "fwd" && <RotateCw size={42} />}
          {flash.icon === "back" && <RotateCcw size={42} />}
        </div>
      )}

      {error && (
        <div className="player__error">
          <h3>Playback failed</h3>
          <p>{error}</p>
          <p className="muted">The stream may be offline, or use a codec this webview can't decode (HEVC, AC-3…).</p>
          <div className="row-gap">
            <button
              className="btn btn--primary"
              onClick={() => {
                setError(undefined);
                setWaiting(true);
                engine.current?.retry();
              }}
            >
              Retry
            </button>
            <button className="btn btn--glass" onClick={external}>
              <ExternalLink size={16} /> Open in VLC / mpv
            </button>
            <button className="btn btn--ghost" onClick={close}>
              Back
            </button>
          </div>
        </div>
      )}

      {/* top bar */}
      <div className="player__top">
        <button className="icon-btn" onClick={close} title="Back (Esc)">
          <ArrowLeft size={26} />
        </button>
        {channel && (
          <div className="player__chlogo">
            <Img src={channel.logo} alt="" fallback={<span />} />
          </div>
        )}
        <div className="player__titles">
          <div className="player__title">{cleanName(media.title)}</div>
          {media.subtitle && <div className="player__subtitle">{media.subtitle}</div>}
          {now && (
            <div className="player__subtitle">
              <b>{now.title}</b> · {formatClock(now.start)}–{formatClock(now.end)}
              {nextProg && <span className="muted"> · Next: {nextProg.title}</span>}
            </div>
          )}
        </div>
        <div className="spacer" />
        <button className="icon-btn" onClick={external} title="Open in external player">
          <ExternalLink size={20} />
        </button>
      </div>

      {/* bottom controls */}
      <div className="player__bottom" onPointerDown={(e) => e.stopPropagation()}>
        {media.live ? (
          <div className="player__liveline">
            <span className="live-badge" onClick={() => engine.current?.goLive()} title="Jump to live">
              <i /> LIVE
            </span>
            {now && (
              <>
                <span className="muted">{formatClock(now.start)}</span>
                <div className="bar">
                  <div className="bar__fill" style={{ width: `${liveProgress * 100}%` }} />
                </div>
                <span className="muted">{formatClock(now.end)}</span>
              </>
            )}
          </div>
        ) : (
          <div
            className="seek"
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setHover({ x: e.clientX - r.left, t: seekFromEvent(e) });
            }}
            onPointerLeave={() => setHover(undefined)}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              video.current!.currentTime = seekFromEvent(e);
            }}
            onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
            onPointerMoveCapture={(e) => {
              if (e.buttons === 1) video.current!.currentTime = seekFromEvent(e);
            }}
          >
            <div className="seek__track">
              <div className="seek__buffer" style={{ width: `${pct(buffered)}%` }} />
              <div className="seek__fill" style={{ width: `${pct(time)}%` }} />
              <div className="seek__thumb" style={{ left: `${pct(time)}%` }} />
            </div>
            {hover && (
              <div className="seek__tip" style={{ left: hover.x }}>
                {formatTime(hover.t)}
              </div>
            )}
          </div>
        )}

        <div className="player__controls">
          <button className="icon-btn" onClick={togglePlay} title={playing ? "Pause (space)" : "Play (space)"}>
            {playing ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
          </button>
          {!media.live && (
            <>
              <button className="icon-btn" onClick={() => seekBy(-10)} title="Back 10s (←)">
                <RotateCcw size={24} />
              </button>
              <button className="icon-btn" onClick={() => seekBy(10)} title="Forward 10s (→)">
                <RotateCw size={24} />
              </button>
            </>
          )}
          {media.live && req.kind === "live" && req.list.length > 1 && (
            <>
              <button className="icon-btn" onClick={() => zap(-1)} title="Previous channel (↑)">
                <ChevronUp size={26} />
              </button>
              <button className="icon-btn" onClick={() => zap(1)} title="Next channel (↓)">
                <ChevronDown size={26} />
              </button>
            </>
          )}
          <div className="volume">
            <button className="icon-btn" onClick={() => updateSettings({ muted: !settings.muted })} title="Mute (m)">
              <VolumeIcon size={24} />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={settings.muted ? 0 : settings.volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              style={{ ["--v" as string]: `${(settings.muted ? 0 : settings.volume) * 100}%` }}
            />
          </div>
          {!media.live && (
            <span className="player__time">
              {formatTime(time)} <span className="muted">/ {formatTime(duration)}</span>
            </span>
          )}

          <div className="spacer" />

          {nextEpisode && (
            <button className="btn btn--ghost sm" onClick={playNext} title="Next episode (n)">
              <SkipForward size={18} /> Next episode
            </button>
          )}
          {req.kind === "live" && req.list.length > 1 && (
            <button className={cx("icon-btn", drawer && "is-active")} onClick={() => setDrawer((d) => !d)} title="Channels">
              <List size={24} />
            </button>
          )}
          <div className="menu-anchor">
            <button className={cx("icon-btn", menu === "settings" && "is-active")} onClick={() => setMenu((m) => (m ? null : "settings"))} title="Settings">
              <Settings2 size={22} />
            </button>
            {menu === "settings" && (
              <SettingsMenu
                tracks={tracks}
                live={media.live}
                speed={speed}
                setSpeed={setSpeed}
                onQuality={(id) => engine.current?.setQuality(id)}
                onAudio={(id) => engine.current?.setAudio(id)}
                onSub={(id) => engine.current?.setSub(id)}
              />
            )}
          </div>
          {document.pictureInPictureEnabled && (
            <button
              className="icon-btn"
              title="Picture in picture"
              onClick={() =>
                document.pictureInPictureElement ? document.exitPictureInPicture() : video.current?.requestPictureInPicture().catch(() => {})
              }
            >
              <PictureInPicture2 size={22} />
            </button>
          )}
          <button className="icon-btn" onClick={toggleFs} title="Fullscreen (f)">
            {fs ? <Minimize size={22} /> : <Maximize size={22} />}
          </button>
        </div>
      </div>

      {upNext !== undefined && nextEpisode && (
        <div className="upnext">
          <div className="muted">Next episode in {upNext}s</div>
          <div className="upnext__title">
            S{nextEpisode.season} E{nextEpisode.episode} · {nextEpisode.title}
          </div>
          <div className="row-gap">
            <button className="btn btn--primary sm" onClick={playNext}>
              <Play size={16} fill="currentColor" /> Play now
            </button>
            <button className="btn btn--ghost sm" onClick={() => updateSettings({ autoplayNext: false })}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {req.kind === "live" && (
        <ChannelDrawer open={drawer} list={req.list} current={req.channel} onPick={(c) => play({ kind: "live", channel: c, list: req.list })} />
      )}
    </div>
  );
}

function SettingsMenu(props: {
  tracks?: EngineTracks;
  live: boolean;
  speed: number;
  setSpeed(n: number): void;
  onQuality(id: number): void;
  onAudio(id: number): void;
  onSub(id: number): void;
}) {
  const t = props.tracks;
  return (
    <div className="pmenu" onPointerDown={(e) => e.stopPropagation()}>
      {t && t.qualities.length > 1 && (
        <Group title="Quality">
          <Opt active={t.quality === -1} onClick={() => props.onQuality(-1)}>
            Auto
          </Opt>
          {t.qualities.map((q) => (
            <Opt key={q.id} active={t.quality === q.id} onClick={() => props.onQuality(q.id)}>
              {q.label}
            </Opt>
          ))}
        </Group>
      )}
      {t && t.audios.length > 1 && (
        <Group title="Audio">
          {t.audios.map((a) => (
            <Opt key={a.id} active={t.audio === a.id} onClick={() => props.onAudio(a.id)}>
              {a.label}
            </Opt>
          ))}
        </Group>
      )}
      {t && t.subs.length > 0 && (
        <Group title="Subtitles">
          <Opt active={t.sub === -1} onClick={() => props.onSub(-1)}>
            Off
          </Opt>
          {t.subs.map((s) => (
            <Opt key={s.id} active={t.sub === s.id} onClick={() => props.onSub(s.id)}>
              {s.label}
            </Opt>
          ))}
        </Group>
      )}
      {!props.live && (
        <Group title="Speed">
          {SPEEDS.map((s) => (
            <Opt key={s} active={props.speed === s} onClick={() => props.setSpeed(s)}>
              {s === 1 ? "Normal" : `${s}×`}
            </Opt>
          ))}
        </Group>
      )}
      {(!t || (t.qualities.length <= 1 && t.audios.length <= 1 && !t.subs.length)) && props.live && (
        <div className="pmenu__empty">No alternative tracks for this stream</div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pmenu__group">
      <div className="pmenu__title">{title}</div>
      <div className="pmenu__opts">{children}</div>
    </div>
  );
}

function Opt({ active, onClick, children }: { active: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button className={cx("pmenu__opt", active && "is-active")} onClick={onClick}>
      {children}
    </button>
  );
}

function ChannelDrawer({ open, list, current, onPick }: { open: boolean; list: LiveChannel[]; current: LiveChannel; onPick(c: LiveChannel): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) ref.current?.querySelector(".is-current")?.scrollIntoView({ block: "center" });
  }, [open, current]);
  return (
    <div className={cx("drawer", open && "is-open")} ref={ref} onPointerDown={(e) => e.stopPropagation()}>
      <div className="drawer__head">Channels</div>
      {list.slice(0, 2000).map((c) => (
        <button key={c.id} className={cx("drawer__item", c.id === current.id && "is-current")} onClick={() => onPick(c)}>
          <span className="drawer__num">{c.num ?? ""}</span>
          <Img src={c.logo} className="drawer__logo" fallback={<span className="drawer__logo" />} />
          <span className="drawer__name">{cleanName(c.name)}</span>
        </button>
      ))}
    </div>
  );
}
