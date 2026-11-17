import { ArrowDownAZ, Clock, LayoutGrid, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { PosterCard } from "../components/Cards";
import { CategoryRail } from "../components/CategoryRail";
import { Hero } from "../components/Hero";
import { Row } from "../components/Row";
import { VirtualGrid } from "../components/VirtualGrid";
import type { Movie, Series } from "../providers";
import { itemKey, useApp } from "../store/app";
import { useCatalog } from "../store/catalog";
import { cx } from "../lib/util";

type Sort = "default" | "recent" | "az" | "rating";

const SORTS: { id: Sort; label: string; icon: React.ReactNode }[] = [
  { id: "default", label: "Default", icon: <LayoutGrid size={14} /> },
  { id: "recent", label: "Recently added", icon: <Clock size={14} /> },
  { id: "az", label: "A–Z", icon: <ArrowDownAZ size={14} /> },
  { id: "rating", label: "Top rated", icon: <Star size={14} /> },
];

export function Browse({ type, categoryId }: { type: "movie" | "series"; categoryId?: string }) {
  const idx = useCatalog()!;
  const navigate = useApp((s) => s.navigate);
  const [sort, setSort] = useState<Sort>("default");
  const viewName = type === "movie" ? "movies" : "series";
  const categories = idx.categories[type];
  const all = (type === "movie" ? idx.catalog.movies : idx.catalog.series) as (Movie | Series)[];

  const items = useMemo(() => {
    const base = categoryId && categoryId !== "all" ? ((idx.byCategory.get(categoryId) ?? []) as (Movie | Series)[]) : all;
    const arr = [...base];
    if (sort === "recent") arr.sort((a, b) => (b.added ?? 0) - (a.added ?? 0));
    if (sort === "az") arr.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "rating") arr.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    return arr;
  }, [idx, categoryId, all, sort]);

  const title = categoryId ? (categories.find((c) => c.id === categoryId)?.name ?? "All") : type === "movie" ? "Films" : "Series";

  if (!categoryId) {
    // Landing: billboard + a carousel per category (Netflix "genre" page).
    const featured = type === "movie" ? idx.recentMovies : idx.recentSeries;
    return (
      <div className="page page--home">
        <Hero items={featured.slice(0, 12)} />
        <div className="rows">
          <div className="chips">
            <button className="chip is-active" onClick={() => navigate({ name: viewName, categoryId: "all" })}>
              Browse all {all.length.toLocaleString()}
            </button>
            {categories.slice(0, 40).map((c) => (
              <button key={c.id} className="chip" onClick={() => navigate({ name: viewName, categoryId: c.id })}>
                {c.name}
              </button>
            ))}
          </div>
          {categories.map((c) => (
            <Row key={c.id} title={c.name} count={c.count} onTitleClick={() => navigate({ name: viewName, categoryId: c.id })}>
              {((idx.byCategory.get(c.id) ?? []) as (Movie | Series)[]).slice(0, 30).map((m) => (
                <PosterCard key={itemKey(m)} item={m} />
              ))}
            </Row>
          ))}
          {!categories.length && <p className="empty">Nothing here yet.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="page page--browse">
      <CategoryRail
        categories={categories}
        specials={[{ id: "all", name: type === "movie" ? "All films" : "All series", count: all.length }]}
        active={categoryId}
        onSelect={(id) => {
          navigate({ name: viewName, categoryId: id });
          window.scrollTo({ top: 0 });
        }}
      />
      <div className="browse__main">
        <header className="browse__head">
          <h1>{categoryId === "all" ? (type === "movie" ? "All films" : "All series") : title}</h1>
          <span className="muted">{items.length.toLocaleString()} titles</span>
          <div className="spacer" />
          <div className="segmented">
            {SORTS.map((s) => (
              <button key={s.id} className={cx(sort === s.id && "is-active")} onClick={() => setSort(s.id)}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        </header>
        <VirtualGrid
          key={categoryId + sort}
          items={items}
          minColWidth={168}
          aspect={1.5}
          extra={0}
          gap={16}
          getKey={(m) => itemKey(m)}
          render={(m) => <PosterCard item={m} />}
        />
        {!items.length && <p className="empty">No titles in this category.</p>}
      </div>
    </div>
  );
}
