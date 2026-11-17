import { Info, Play, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Movie, MovieInfo, Series } from "../providers";
import { activeProvider, itemKey, useApp } from "../store/app";
import { cleanName, cx } from "../lib/util";
import { Img } from "./Img";
import { FavButton } from "./Cards";

const infoCache = new Map<string, MovieInfo>();

async function infoFor(item: Movie | Series): Promise<MovieInfo> {
  const key = itemKey(item);
  const hit = infoCache.get(key);
  if (hit) return hit;
  const p = activeProvider();
  if (!p) return {};
  const info = item.kind === "movie" ? await p.movieInfo(item) : await p.seriesInfo(item);
  infoCache.set(key, info);
  return info;
}

export function Hero({ items }: { items: (Movie | Series)[] }) {
  const featured = useMemo(() => {
    const withArt = items.filter((i) => i.poster);
    return (withArt.length ? withArt : items).slice(0, 6);
  }, [items]);
  const [idx, setIdx] = useState(0);
  const [infos, setInfos] = useState<Record<string, MovieInfo>>({});
  const openDetails = useApp((s) => s.openDetails);
  const play = useApp((s) => s.play);
  const paused = useApp((s) => !!s.details || !!s.player);

  useEffect(() => {
    let alive = true;
    featured.forEach((f) =>
      infoFor(f)
        .then((info) => alive && setInfos((m) => ({ ...m, [itemKey(f)]: info })))
        .catch(() => {}),
    );
    return () => {
      alive = false;
    };
  }, [featured]);

  useEffect(() => {
    if (featured.length < 2 || paused) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % featured.length), 9000);
    return () => clearInterval(t);
  }, [featured.length, paused]);

  if (!featured.length) return <div className="hero hero--empty" />;
  const item = featured[idx % featured.length];

  const onPlay = () => {
    if (item.kind === "movie") {
      const h = useApp.getState().history[itemKey(item)];
      play({ kind: "movie", movie: item, resume: h?.position });
    } else openDetails(item);
  };

  return (
    <section className="hero">
      {featured.map((f, i) => {
        const info = infos[itemKey(f)];
        const backdrop = info?.backdrop || (f.kind === "series" ? f.backdrop : undefined);
        return (
          <div key={itemKey(f)} className={cx("hero__slide", i === idx % featured.length && "is-active")}>
            {backdrop ? (
              <Img src={backdrop} className="hero__backdrop" eager={i === 0} />
            ) : (
              <>
                <Img src={f.poster} className="hero__backdrop is-blurred" eager={i === 0} fallback={<div className="hero__backdrop hero__fallback" />} />
                <Img src={f.poster} className="hero__poster" eager={i === 0} fallback={<span />} />
              </>
            )}
          </div>
        );
      })}
      <div className="hero__shade" />
      <div className="hero__content" key={itemKey(item)}>
        <div className="hero__kicker">{item.kind === "movie" ? "Featured Film" : "Featured Series"}</div>
        <h1 className="hero__title">{cleanName(item.name)}</h1>
        <div className="meta hero__meta">
          {(infos[itemKey(item)]?.rating ?? item.rating) ? (
            <span className="rating">
              <Star size={13} fill="currentColor" /> {(infos[itemKey(item)]?.rating ?? item.rating)!.toFixed(1)}
            </span>
          ) : null}
          {(infos[itemKey(item)]?.year ?? item.year) && <span>{infos[itemKey(item)]?.year ?? item.year}</span>}
          {infos[itemKey(item)]?.duration && <span>{infos[itemKey(item)]?.duration}</span>}
          {infos[itemKey(item)]?.genre && <span>{infos[itemKey(item)]?.genre}</span>}
        </div>
        <p className="hero__plot">{infos[itemKey(item)]?.plot ?? (item.kind === "series" ? item.plot : "")}</p>
        <div className="hero__actions">
          <button className="btn btn--primary btn--lg" onClick={onPlay}>
            <Play size={20} fill="currentColor" /> Play
          </button>
          <button className="btn btn--glass btn--lg" onClick={() => openDetails(item)}>
            <Info size={20} /> More info
          </button>
          <FavButton item={item} className="lg" />
        </div>
      </div>
      {featured.length > 1 && (
        <div className="hero__dots">
          {featured.map((f, i) => (
            <button key={itemKey(f)} className={cx(i === idx % featured.length && "is-active")} onClick={() => setIdx(i)} aria-label={`Show ${f.name}`}>
              <i />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export { infoFor };
