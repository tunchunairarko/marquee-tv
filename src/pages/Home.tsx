import { useMemo } from "react";
import { ChannelCard, ContinueCard, PosterCard } from "../components/Cards";
import { Hero } from "../components/Hero";
import { Row } from "../components/Row";
import type { LiveChannel, Movie, Series } from "../providers";
import { itemKey, useApp } from "../store/app";
import { useCatalog, type CatalogIndex } from "../store/catalog";

export function Home() {
  const idx = useCatalog()!;
  const history = useApp((s) => s.history);
  const favorites = useApp((s) => s.favorites);
  const navigate = useApp((s) => s.navigate);

  const featured = useMemo(() => interleave<Movie | Series>(idx.recentMovies.slice(0, 10), idx.recentSeries.slice(0, 10)), [idx]);
  const continueWatching = useMemo(
    () =>
      Object.values(history)
        .filter((h) => h.item.kind !== "live" && h.duration > 0 && h.position / h.duration < 0.95)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 20),
    [history],
  );
  const favs = useMemo(() => Object.values(favorites).sort((a, b) => b.addedAt - a.addedAt), [favorites]);
  const favChannels = favs.map((f) => f.item).filter((i): i is LiveChannel => i.kind === "live");
  const favVod = favs.map((f) => f.item).filter((i): i is Movie | Series => i.kind !== "live");
  const channelsRow = favChannels.length ? favChannels : topChannels(idx);
  const categoryRows = useMemo(() => buildCategoryRows(idx), [idx]);

  return (
    <div className="page page--home">
      <Hero items={featured} />
      <div className="rows">
        {continueWatching.length > 0 && (
          <Row title="Continue watching" variant="wide">
            {continueWatching.map((h) => (
              <ContinueCard key={h.key} entry={h} />
            ))}
          </Row>
        )}
        {channelsRow.length > 0 && (
          <Row title={favChannels.length ? "Your channels" : "Live now"} variant="channel" onTitleClick={() => navigate({ name: "live" })}>
            {channelsRow.slice(0, 30).map((c) => (
              <ChannelCard key={c.id} channel={c} list={channelsRow} />
            ))}
          </Row>
        )}
        {favVod.length > 0 && (
          <Row title="My List" onTitleClick={() => navigate({ name: "mylist" })}>
            {favVod.slice(0, 30).map((i) => (
              <PosterCard key={itemKey(i)} item={i} />
            ))}
          </Row>
        )}
        {idx.recentMovies.length > 0 && (
          <Row title="New films" onTitleClick={() => navigate({ name: "movies" })} count={idx.catalog.movies.length}>
            {idx.recentMovies.slice(0, 30).map((m) => (
              <PosterCard key={itemKey(m)} item={m} />
            ))}
          </Row>
        )}
        {idx.recentSeries.length > 0 && (
          <Row title="New series" onTitleClick={() => navigate({ name: "series" })} count={idx.catalog.series.length}>
            {idx.recentSeries.slice(0, 30).map((m) => (
              <PosterCard key={itemKey(m)} item={m} />
            ))}
          </Row>
        )}
        {categoryRows.map((r) => (
          <Row
            key={r.id}
            title={r.name}
            count={r.count}
            onTitleClick={() => navigate({ name: r.type === "movie" ? "movies" : "series", categoryId: r.id })}
          >
            {r.items.map((m) => (
              <PosterCard key={itemKey(m)} item={m} />
            ))}
          </Row>
        ))}
      </div>
    </div>
  );
}

function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

function topChannels(idx: CatalogIndex): LiveChannel[] {
  const first = idx.categories.live[0];
  return first ? (idx.byCategory.get(first.id) as LiveChannel[]) : idx.catalog.live.slice(0, 30);
}

function buildCategoryRows(idx: CatalogIndex) {
  const take = (type: "movie" | "series") =>
    idx.categories[type]
      .filter((c) => c.count >= 4)
      .slice(0, 14)
      .map((c) => ({ ...c, items: (idx.byCategory.get(c.id) ?? []).slice(0, 30) as (Movie | Series)[] }));
  return interleave(take("movie"), take("series"));
}
