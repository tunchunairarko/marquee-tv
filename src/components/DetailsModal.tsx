import { Play, RotateCcw, Star, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Episode, Movie, MovieInfo, Series, SeriesInfo } from "../providers";
import { activeProvider, itemKey, useApp } from "../store/app";
import { useCatalog } from "../store/catalog";
import { cleanName, cx, formatTime } from "../lib/util";
import { Img } from "./Img";
import { FavButton, PosterCard } from "./Cards";
import { Spinner } from "./Spinner";

const cache = new Map<string, MovieInfo | SeriesInfo>();

export function DetailsModal() {
  const item = useApp((s) => s.details);
  const close = useApp((s) => s.openDetails);
  const [closing, setClosing] = useState(false);
  const [shown, setShown] = useState<Movie | Series | undefined>(item);

  useEffect(() => {
    if (item) {
      setShown(item);
      setClosing(false);
    } else if (shown) {
      setClosing(true);
      const t = setTimeout(() => {
        setShown(undefined);
        setClosing(false);
      }, 220);
      return () => clearTimeout(t);
    }
  }, [item]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !useApp.getState().player && close(undefined);
    window.addEventListener("keydown", onKey);
    document.body.classList.add("no-scroll");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("no-scroll");
    };
  }, [item, close]);

  if (!shown) return null;
  return (
    <div className={cx("modal", closing && "is-closing")} onMouseDown={(e) => e.target === e.currentTarget && close(undefined)}>
      <div className="modal__panel" key={itemKey(shown)}>
        <button className="icon-btn round modal__close" onClick={() => close(undefined)} aria-label="Close">
          <X size={20} />
        </button>
        <DetailsBody item={shown} />
      </div>
    </div>
  );
}

function DetailsBody({ item }: { item: Movie | Series }) {
  const key = itemKey(item);
  const [info, setInfo] = useState<MovieInfo | SeriesInfo | undefined>(cache.get(key));
  const [error, setError] = useState<string>();
  const [season, setSeason] = useState<number>();
  const history = useApp((s) => s.history[key]);
  const play = useApp((s) => s.play);
  const idx = useCatalog();

  useEffect(() => {
    let alive = true;
    const p = activeProvider();
    if (!p || cache.has(key)) return;
    (item.kind === "movie" ? p.movieInfo(item) : p.seriesInfo(item))
      .then((i) => {
        cache.set(key, i);
        if (alive) setInfo(i);
      })
      .catch((e) => alive && setError(String(e?.message ?? e)));
    return () => {
      alive = false;
    };
  }, [key, item]);

  const series = item.kind === "series" ? (info as SeriesInfo | undefined) : undefined;
  const seasons = series?.seasons ?? [];
  const activeSeason = season ?? history?.episode?.season ?? seasons[0];
  const episodes = (activeSeason !== undefined && series?.episodes[activeSeason]) || [];

  const similar = useMemo(
    () => (idx?.byCategory.get(item.categoryId) ?? []).filter((x) => x.id !== item.id).slice(0, 12) as (Movie | Series)[],
    [idx, item],
  );

  const playEpisode = (ep: Episode, resume?: number) => {
    if (item.kind !== "series" || !series) return;
    const queue = seasons.flatMap((s) => series.episodes[s] ?? []);
    play({ kind: "episode", series: item, episode: ep, queue, resume });
  };

  const resumeAt = history && history.position > 30 && history.position < history.duration - 60 ? history.position : undefined;

  const onPrimary = (fromStart = false) => {
    if (item.kind === "movie") play({ kind: "movie", movie: item, resume: fromStart ? 0 : resumeAt });
    else if (series) {
      const last = history?.episode;
      const target = (last && series.episodes[last.season]?.find((e) => e.id === last.id)) || episodes[0];
      if (target) playEpisode(target, fromStart || target.id !== last?.id ? 0 : resumeAt);
    }
  };

  const backdrop = info?.backdrop || (item.kind === "series" ? item.backdrop : undefined);
  const rating = info?.rating ?? item.rating;
  const year = info?.year ?? item.year;
  const plot = info?.plot ?? (item.kind === "series" ? item.plot : undefined);
  const loading = !info && !error;
  const canPlay = item.kind === "movie" || episodes.length > 0;

  return (
    <>
      <div className="details__hero">
        {backdrop ? (
          <Img src={backdrop} className="details__backdrop" eager />
        ) : (
          <Img src={info?.poster || item.poster} className="details__backdrop is-blurred" eager />
        )}
        <div className="details__shade" />
        <div className="details__headline">
          <h1>{cleanName(item.name)}</h1>
          <div className="hero__actions">
            <button className="btn btn--primary btn--lg" disabled={!canPlay} onClick={() => onPrimary()}>
              <Play size={20} fill="currentColor" />
              {resumeAt ? `Resume ${history?.episode ? `S${history.episode.season}:E${history.episode.episode}` : formatTime(resumeAt)}` : "Play"}
            </button>
            {resumeAt && (
              <button className="btn btn--glass btn--lg" onClick={() => onPrimary(true)}>
                <RotateCcw size={18} /> From start
              </button>
            )}
            <FavButton item={item} className="lg" />
          </div>
        </div>
      </div>

      <div className="details__body">
        <div className="details__main">
          <div className="meta lg">
            {rating ? (
              <span className="rating">
                <Star size={14} fill="currentColor" /> {rating.toFixed(1)}
              </span>
            ) : null}
            {year && <span>{year}</span>}
            {info?.duration && <span>{info.duration}</span>}
            {series && <span>{seasons.length} season{seasons.length === 1 ? "" : "s"}</span>}
            <span className="badge">HD</span>
          </div>
          {loading ? <div className="skeleton-text" /> : <p className="details__plot">{plot || "No description available."}</p>}
          {error && <p className="muted">Couldn't load details: {error}</p>}
        </div>
        <aside className="details__side">
          {info?.cast && (
            <p>
              <span className="muted">Cast: </span>
              {info.cast}
            </p>
          )}
          {info?.director && (
            <p>
              <span className="muted">Director: </span>
              {info.director}
            </p>
          )}
          {info?.genre && (
            <p>
              <span className="muted">Genres: </span>
              {info.genre}
            </p>
          )}
        </aside>
      </div>

      {item.kind === "series" && (
        <div className="episodes">
          <div className="episodes__head">
            <h2>Episodes</h2>
            {seasons.length > 1 && (
              <div className="season-tabs">
                {seasons.map((s) => (
                  <button key={s} className={cx(s === activeSeason && "is-active")} onClick={() => setSeason(s)}>
                    Season {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          {loading && (
            <div className="center pad">
              <Spinner />
            </div>
          )}
          <ol className="episode-list">
            {episodes.map((ep) => (
              <EpisodeRow key={ep.id} ep={ep} series={item} onPlay={playEpisode} />
            ))}
          </ol>
          {!loading && !episodes.length && <p className="muted pad">No episodes available.</p>}
        </div>
      )}

      {similar.length > 0 && (
        <div className="similar">
          <h2>More like this</h2>
          <div className="grid grid--compact">
            {similar.map((s) => (
              <PosterCard key={itemKey(s)} item={s} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function EpisodeRow({ ep, series, onPlay }: { ep: Episode; series: Series; onPlay: (ep: Episode, resume?: number) => void }) {
  const h = useApp((s) => s.history[itemKey(series)]);
  const watched = h?.episode?.id === ep.id ? h : undefined;
  const pct = watched ? watched.position / (watched.duration || 1) : 0;
  return (
    <li className="episode" onClick={() => onPlay(ep, watched && pct < 0.95 ? watched.position : 0)}>
      <div className="episode__num">{ep.episode}</div>
      <div className="episode__art">
        <Img src={ep.still || series.backdrop || series.poster} alt="" fallback={<div className="poster-fallback wide" />} />
        <div className="episode__play">
          <Play size={22} fill="currentColor" />
        </div>
        {pct > 0.01 && (
          <div className="progress-line">
            <i style={{ width: `${pct * 100}%` }} />
          </div>
        )}
      </div>
      <div className="episode__text">
        <div className="episode__title">
          <span>{ep.title}</span>
          {ep.duration && <span className="muted">{ep.duration}</span>}
        </div>
        {ep.plot && <p>{ep.plot}</p>}
      </div>
    </li>
  );
}
