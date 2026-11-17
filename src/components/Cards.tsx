import { Check, Play, Plus, Star, X } from "lucide-react";
import { memo, type MouseEvent } from "react";
import type { LiveChannel, MediaItem, Movie, Series } from "../providers";
import { itemKey, useApp, type HistoryEntry } from "../store/app";
import { cleanName, cx } from "../lib/util";
import { Img } from "./Img";

function initials(name: string) {
  return cleanName(name)
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function FavButton({ item, className }: { item: MediaItem; className?: string }) {
  const fav = useApp((s) => !!s.favorites[itemKey(item)]);
  const toggle = useApp((s) => s.toggleFavorite);
  return (
    <button
      className={cx("icon-btn round", fav && "is-active", className)}
      title={fav ? "Remove from My List" : "Add to My List"}
      onClick={(e) => {
        e.stopPropagation();
        toggle(item);
      }}
    >
      {fav ? <Check size={18} /> : <Plus size={18} />}
    </button>
  );
}

export const PosterCard = memo(function PosterCard({ item }: { item: Movie | Series }) {
  const openDetails = useApp((s) => s.openDetails);
  const progress = useApp((s) => {
    const h = s.history[itemKey(item)];
    return h && h.duration ? h.position / h.duration : 0;
  });
  const play = (e: MouseEvent) => {
    e.stopPropagation();
    if (item.kind === "movie") {
      const h = useApp.getState().history[itemKey(item)];
      useApp.getState().play({ kind: "movie", movie: item, resume: h?.position });
    } else openDetails(item);
  };
  return (
    <div className="poster-card" role="button" tabIndex={0} onClick={() => openDetails(item)} onKeyDown={(e) => e.key === "Enter" && openDetails(item)}>
      <div className="poster-card__art">
        <Img
          src={item.poster}
          alt={item.name}
          fallback={
            <div className="poster-fallback">
              <span>{cleanName(item.name)}</span>
            </div>
          }
        />
        {progress > 0.01 && (
          <div className="progress-line">
            <i style={{ width: `${Math.min(100, progress * 100)}%` }} />
          </div>
        )}
      </div>
      <div className="poster-card__info">
        <div className="poster-card__actions">
          <button className="icon-btn round solid" title="Play" onClick={play}>
            <Play size={16} fill="currentColor" />
          </button>
          <FavButton item={item} />
        </div>
        <div className="poster-card__title">{cleanName(item.name)}</div>
        <div className="meta">
          {item.rating ? (
            <span className="rating">
              <Star size={11} fill="currentColor" /> {item.rating.toFixed(1)}
            </span>
          ) : null}
          {item.year && <span>{item.year}</span>}
          <span className="badge">{item.kind === "movie" ? "Film" : "Series"}</span>
        </div>
      </div>
    </div>
  );
});

export const ChannelCard = memo(function ChannelCard({ channel, list }: { channel: LiveChannel; list?: LiveChannel[] }) {
  const play = useApp((s) => s.play);
  return (
    <div
      className="channel-card"
      role="button"
      tabIndex={0}
      onClick={() => play({ kind: "live", channel, list: list ?? [channel] })}
      onKeyDown={(e) => e.key === "Enter" && play({ kind: "live", channel, list: list ?? [channel] })}
    >
      <div className="channel-card__art">
        <Img src={channel.logo} alt={channel.name} fallback={<div className="logo-fallback">{initials(channel.name)}</div>} />
        <span className="live-dot">LIVE</span>
        <div className="channel-card__play">
          <Play size={28} fill="currentColor" />
        </div>
      </div>
      <div className="channel-card__name">{cleanName(channel.name)}</div>
      <FavButton item={channel} className="channel-card__fav" />
    </div>
  );
});

export const ContinueCard = memo(function ContinueCard({ entry }: { entry: HistoryEntry }) {
  const { item, episode } = entry;
  const remove = useApp((s) => s.removeHistory);
  const resume = () => {
    const s = useApp.getState();
    if (item.kind === "movie") s.play({ kind: "movie", movie: item, resume: entry.position });
    else if (item.kind === "series" && episode) s.play({ kind: "episode", series: item, episode, queue: [episode], resume: entry.position });
  };
  const img = item.kind === "series" ? episode?.still || item.backdrop || item.poster : item.kind === "movie" ? item.poster : item.logo;
  return (
    <div className="continue-card" role="button" tabIndex={0} onClick={resume} onKeyDown={(e) => e.key === "Enter" && resume()}>
      <div className="continue-card__art">
        <Img src={img} alt={item.name} fallback={<div className="poster-fallback wide"><span>{cleanName(item.name)}</span></div>} />
        <div className="continue-card__play">
          <Play size={26} fill="currentColor" />
        </div>
        <button
          className="icon-btn round continue-card__remove"
          title="Remove from Continue Watching"
          onClick={(e) => {
            e.stopPropagation();
            remove(entry.key);
          }}
        >
          <X size={14} />
        </button>
        <div className="progress-line">
          <i style={{ width: `${Math.min(100, (entry.position / (entry.duration || 1)) * 100)}%` }} />
        </div>
      </div>
      <div className="continue-card__title">{cleanName(item.name)}</div>
      {episode && (
        <div className="continue-card__sub">
          S{episode.season} E{episode.episode} · {episode.title}
        </div>
      )}
    </div>
  );
});
