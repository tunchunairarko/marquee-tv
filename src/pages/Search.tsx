import { useDeferredValue, useMemo } from "react";
import { ChannelCard, PosterCard } from "../components/Cards";
import { itemKey, useApp } from "../store/app";
import { useCatalog } from "../store/catalog";

export function SearchPage() {
  const idx = useCatalog()!;
  const q = useDeferredValue(useApp((s) => s.searchQuery));
  const res = useMemo(() => idx.search(q, 80), [idx, q]);
  const total = res.live.length + res.movies.length + res.series.length;

  return (
    <div className="page page--padded">
      <h1 className="page__title">
        {q ? (
          <>
            Results for <span className="accent">“{q}”</span>
          </>
        ) : (
          "Search"
        )}
      </h1>
      {q && !total && <p className="empty">No matches. Try a different spelling or fewer words.</p>}
      {res.live.length > 0 && (
        <section className="section">
          <h2>Channels</h2>
          <div className="grid grid--channels">
            {res.live.map((c) => (
              <ChannelCard key={c.id} channel={c} list={res.live} />
            ))}
          </div>
        </section>
      )}
      {res.movies.length > 0 && (
        <section className="section">
          <h2>Films</h2>
          <div className="grid">
            {res.movies.map((m) => (
              <PosterCard key={itemKey(m)} item={m} />
            ))}
          </div>
        </section>
      )}
      {res.series.length > 0 && (
        <section className="section">
          <h2>Series</h2>
          <div className="grid">
            {res.series.map((m) => (
              <PosterCard key={itemKey(m)} item={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
