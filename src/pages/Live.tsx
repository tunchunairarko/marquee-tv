import { useVirtualizer } from "@tanstack/react-virtual";
import { Heart, History, Maximize2, Search, Tv } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FavButton } from "../components/Cards";
import { CategoryRail } from "../components/CategoryRail";
import { Img } from "../components/Img";
import { Spinner } from "../components/Spinner";
import { Playback } from "../lib/engine";
import { nowAndNext, useEpg } from "../lib/epg";
import { resolve } from "../lib/media";
import { clamp, cleanName, cx, formatClock, normalize } from "../lib/util";
import type { LiveChannel } from "../providers";
import { useApp } from "../store/app";
import { useCatalog } from "../store/catalog";

const FAV = "__fav";
const ALL = "__all";
const RECENT = "__recent";

export function Live({ categoryId }: { categoryId?: string }) {
  const idx = useCatalog()!;
  const navigate = useApp((s) => s.navigate);
  const favorites = useApp((s) => s.favorites);
  const history = useApp((s) => s.history);
  const lastChannelId = useApp((s) => s.lastChannel[s.activeSourceId ?? ""]);
  const playerOpen = useApp((s) => !!s.player);
  const play = useApp((s) => s.play);
  const [filter, setFilter] = useState("");

  const favChannels = useMemo(
    () => Object.values(favorites).map((f) => f.item).filter((i): i is LiveChannel => i.kind === "live"),
    [favorites],
  );
  const recent = useMemo(
    () =>
      Object.values(history)
        .filter((h) => h.item.kind === "live")
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((h) => h.item as LiveChannel),
    [history],
  );

  const active = categoryId ?? (favChannels.length ? FAV : idx.categories.live[0]?.id ?? ALL);
  const base = useMemo(() => {
    if (active === FAV) return favChannels;
    if (active === RECENT) return recent;
    if (active === ALL) return idx.catalog.live;
    return (idx.byCategory.get(active) ?? []) as LiveChannel[];
  }, [active, favChannels, recent, idx]);

  const channels = useMemo(() => {
    const f = normalize(filter);
    return f ? base.filter((c) => normalize(c.name).includes(f)) : base;
  }, [base, filter]);

  const [selected, setSelected] = useState<LiveChannel | undefined>();
  useEffect(() => {
    setSelected((s) => {
      if (s && channels.some((c) => c.id === s.id)) return s;
      return channels.find((c) => c.id === lastChannelId) ?? channels[0];
    });
  }, [channels, lastChannelId]);

  const watch = (c: LiveChannel) => play({ kind: "live", channel: c, list: channels });

  // keyboard navigation through the list
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (playerOpen || (e.target as HTMLElement).tagName === "INPUT" || !selected) return;
      const i = channels.findIndex((c) => c.id === selected.id);
      if (e.key === "ArrowDown") setSelected(channels[clamp(i + 1, 0, channels.length - 1)]);
      else if (e.key === "ArrowUp") setSelected(channels[clamp(i - 1, 0, channels.length - 1)]);
      else if (e.key === "Enter") watch(selected);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="page page--live">
      <CategoryRail
        categories={idx.categories.live}
        specials={[
          { id: FAV, name: "Favourites", count: favChannels.length, icon: <Heart size={15} /> },
          { id: RECENT, name: "Recently watched", count: recent.length, icon: <History size={15} /> },
          { id: ALL, name: "All channels", count: idx.catalog.live.length, icon: <Tv size={15} /> },
        ]}
        active={active}
        onSelect={(id) => navigate({ name: "live", categoryId: id })}
      />
      <section className="live__list">
        <label className="live__search">
          <Search size={15} />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Search ${base.length.toLocaleString()} channels`} />
        </label>
        <ChannelList channels={channels} selected={selected} onSelect={setSelected} onWatch={watch} />
        {!channels.length && (
          <div className="empty">{active === FAV ? "Add channels to your favourites with the ♥ button." : "No channels found."}</div>
        )}
      </section>
      <section className="live__preview">{selected && !playerOpen && <Preview channel={selected} onWatch={() => watch(selected)} />}</section>
    </div>
  );
}

function ChannelList({
  channels,
  selected,
  onSelect,
  onWatch,
}: {
  channels: LiveChannel[];
  selected?: LiveChannel;
  onSelect(c: LiveChannel): void;
  onWatch(c: LiveChannel): void;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: channels.length, getScrollElement: () => parent.current, estimateSize: () => 72, overscan: 8 });
  const selIdx = selected ? channels.findIndex((c) => c.id === selected.id) : -1;
  useEffect(() => {
    if (selIdx >= 0) v.scrollToIndex(selIdx, { align: "auto" });
  }, [selIdx, v]);

  return (
    <div className="live__scroll" ref={parent}>
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {v.getVirtualItems().map((r) => {
          const c = channels[r.index];
          return (
            <ChannelRow
              key={c.id}
              channel={c}
              top={r.start}
              active={selected?.id === c.id}
              onClick={() => onSelect(c)}
              onDoubleClick={() => onWatch(c)}
            />
          );
        })}
      </div>
    </div>
  );
}

function ChannelRow({
  channel,
  top,
  active,
  onClick,
  onDoubleClick,
}: {
  channel: LiveChannel;
  top: number;
  active: boolean;
  onClick(): void;
  onDoubleClick(): void;
}) {
  const epg = useEpg(channel, 250);
  const [now] = nowAndNext(epg ?? []);
  const pct = now ? clamp((Date.now() - now.start) / (now.end - now.start), 0, 1) : 0;
  return (
    <div className={cx("ch-row", active && "is-active")} style={{ transform: `translateY(${top}px)` }} onClick={onClick} onDoubleClick={onDoubleClick}>
      <span className="ch-row__num">{channel.num ?? ""}</span>
      <div className="ch-row__logo">
        <Img src={channel.logo} alt="" fallback={<span>{cleanName(channel.name).slice(0, 2)}</span>} />
      </div>
      <div className="ch-row__text">
        <div className="ch-row__name">{cleanName(channel.name)}</div>
        <div className="ch-row__now">{now ? now.title : <span className="muted">{epg ? "No programme info" : " "}</span>}</div>
        {now && (
          <div className="ch-row__bar">
            <i style={{ width: `${pct * 100}%` }} />
          </div>
        )}
      </div>
      <FavButton item={channel} className="ch-row__fav" />
    </div>
  );
}

function Preview({ channel, onWatch }: { channel: LiveChannel; onWatch(): void }) {
  const video = useRef<HTMLVideoElement>(null);
  const livePreview = useApp((s) => s.settings.livePreview);
  const volume = useApp((s) => s.settings.volume);
  const muted = useApp((s) => s.settings.muted);
  const [state, setState] = useState<"loading" | "playing" | "error">("loading");
  const epg = useEpg(channel);
  const [now, next] = nowAndNext(epg ?? []);
  const later = epg?.filter((e) => e.start > (next?.start ?? Infinity)).slice(0, 3) ?? [];

  useEffect(() => {
    if (!livePreview) return;
    const v = video.current!;
    setState("loading");
    // small delay so arrowing through the list doesn't open a connection per channel
    let pb: Playback | undefined;
    const t = setTimeout(() => {
      const media = resolve({ kind: "live", channel, list: [channel] });
      pb = new Playback(v, media.urls, true, { onFatal: () => setState("error") });
    }, 350);
    return () => {
      clearTimeout(t);
      pb?.destroy();
    };
  }, [channel, livePreview]);

  useEffect(() => {
    if (video.current) {
      video.current.volume = volume;
      video.current.muted = muted;
    }
  }, [volume, muted]);

  return (
    <div className="preview" key={channel.id}>
      <div className="preview__screen" onDoubleClick={onWatch}>
        <video ref={video} playsInline onPlaying={() => setState("playing")} onWaiting={() => setState("loading")} />
        {!livePreview && (
          <div className="preview__overlay">
            <Img src={channel.logo} className="preview__biglogo" />
          </div>
        )}
        {livePreview && state === "loading" && (
          <div className="preview__overlay">
            <Spinner />
          </div>
        )}
        {state === "error" && (
          <div className="preview__overlay">
            <span className="muted">Preview unavailable</span>
          </div>
        )}
        <button className="preview__fs btn btn--glass sm" onClick={onWatch}>
          <Maximize2 size={15} /> Watch
        </button>
      </div>
      <div className="preview__info">
        <div className="preview__head">
          <div className="preview__logo">
            <Img src={channel.logo} alt="" fallback={<span />} />
          </div>
          <div>
            <h2>{cleanName(channel.name)}</h2>
            {channel.num !== undefined && <div className="muted">Channel {channel.num}</div>}
          </div>
          <div className="spacer" />
          <FavButton item={channel} />
        </div>
        {now ? (
          <div className="epg-now">
            <div className="epg-now__label">
              <span className="live-badge">
                <i /> NOW
              </span>
              {formatClock(now.start)} – {formatClock(now.end)}
            </div>
            <h3>{now.title}</h3>
            {now.description && <p>{now.description}</p>}
            <div className="bar">
              <div className="bar__fill" style={{ width: `${clamp((Date.now() - now.start) / (now.end - now.start), 0, 1) * 100}%` }} />
            </div>
          </div>
        ) : (
          <p className="muted">{epg ? "No programme information for this channel." : "Loading guide…"}</p>
        )}
        {(next || later.length > 0) && (
          <ul className="epg-list">
            {[next, ...later].filter(Boolean).map((e) => (
              <li key={e!.start}>
                <span className="epg-list__time">{formatClock(e!.start)}</span>
                <span className="epg-list__title">{e!.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
