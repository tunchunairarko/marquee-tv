import { normalize } from "../lib/util";
import type { Catalog, Category, ContentType, LiveChannel, MediaItem, Movie, Series } from "../providers";
import { useApp } from "./app";

export interface CategoryWithCount extends Category {
  count: number;
}

export interface CatalogIndex {
  catalog: Catalog;
  categories: Record<ContentType, CategoryWithCount[]>;
  byCategory: Map<string, MediaItem[]>;
  recentMovies: Movie[];
  recentSeries: Series[];
  search(q: string, limit?: number): { live: LiveChannel[]; movies: Movie[]; series: Series[] };
}

const memo = new WeakMap<Catalog, CatalogIndex>();

function build(catalog: Catalog): CatalogIndex {
  const byCategory = new Map<string, MediaItem[]>();
  const push = (item: MediaItem) => {
    let arr = byCategory.get(item.categoryId);
    if (!arr) byCategory.set(item.categoryId, (arr = []));
    arr.push(item);
  };
  catalog.live.forEach(push);
  catalog.movies.forEach(push);
  catalog.series.forEach(push);

  const categories: Record<ContentType, CategoryWithCount[]> = { live: [], movie: [], series: [] };
  const seen = new Set<string>();
  for (const c of catalog.categories) {
    const count = byCategory.get(c.id)?.length ?? 0;
    if (!count || seen.has(c.id)) continue;
    seen.add(c.id);
    categories[c.type].push({ ...c, count });
  }
  // Items pointing at categories the server didn't list.
  for (const [id, items] of byCategory) {
    if (seen.has(id)) continue;
    const type = items[0].kind === "live" ? "live" : items[0].kind === "movie" ? "movie" : "series";
    categories[type].push({ id, name: "Other", type, count: items.length });
  }

  const byAdded = <T extends { added?: number }>(a: T, b: T) => (b.added ?? 0) - (a.added ?? 0);
  const recentMovies = catalog.movies.some((m) => m.added) ? [...catalog.movies].sort(byAdded).slice(0, 40) : catalog.movies.slice(0, 40);
  const recentSeries = catalog.series.some((m) => m.added) ? [...catalog.series].sort(byAdded).slice(0, 40) : catalog.series.slice(0, 40);

  let names: { live: string[]; movies: string[]; series: string[] } | null = null;

  return {
    catalog,
    categories,
    byCategory,
    recentMovies,
    recentSeries,
    search(q, limit = 60) {
      const needle = normalize(q);
      if (!needle) return { live: [], movies: [], series: [] };
      names ??= {
        live: catalog.live.map((x) => normalize(x.name)),
        movies: catalog.movies.map((x) => normalize(x.name)),
        series: catalog.series.map((x) => normalize(x.name)),
      };
      const terms = needle.split(" ");
      const run = <T>(items: T[], n: string[]) => {
        const starts: T[] = [];
        const contains: T[] = [];
        for (let i = 0; i < items.length && starts.length < limit; i++) {
          const s = n[i];
          if (!terms.every((t) => s.includes(t))) continue;
          (s.startsWith(terms[0]) ? starts : contains).push(items[i]);
        }
        return [...starts, ...contains].slice(0, limit);
      };
      return {
        live: run(catalog.live, names.live),
        movies: run(catalog.movies, names.movies),
        series: run(catalog.series, names.series),
      };
    },
  };
}

export function indexOf(catalog: Catalog): CatalogIndex {
  let idx = memo.get(catalog);
  if (!idx) memo.set(catalog, (idx = build(catalog)));
  return idx;
}

export function useCatalog(): CatalogIndex | undefined {
  const catalog = useApp((s) => s.catalog);
  return catalog ? indexOf(catalog) : undefined;
}
