import { loadM3u } from "../lib/native";
import { hash, yearOf } from "../lib/util";
import type {
  Catalog,
  Category,
  ContentType,
  EpgEntry,
  Episode,
  LiveChannel,
  M3uSource,
  Movie,
  MovieInfo,
  Provider,
  Series,
  SeriesInfo,
} from "./types";

const EP_RE = /^(.*?)[\s._-]*S(\d{1,2})[\s._-]*E(\d{1,3})\b/i;

function extOf(url: string): string | undefined {
  return url.split(/[?#]/)[0].match(/\.([a-z0-9]{2,4})$/i)?.[1]?.toLowerCase();
}

export class M3uProvider implements Provider {
  constructor(private src: M3uSource) {}

  async loadCatalog(onProgress?: (msg: string) => void): Promise<Catalog> {
    onProgress?.("Downloading playlist…");
    const pl = await loadM3u(this.src.url);
    onProgress?.(`Organising ${pl.entries.length.toLocaleString()} entries…`);

    const categories = new Map<string, Category>();
    const cat = (type: ContentType, group: string) => {
      const id = `${type}:${group}`;
      if (!categories.has(id)) categories.set(id, { id, name: group, type });
      return id;
    };

    const live: LiveChannel[] = [];
    const movies: Movie[] = [];
    const seriesMap = new Map<string, Series>();

    let n = 0;
    for (const e of pl.entries) {
      if (e.kind === "live") {
        live.push({
          kind: "live",
          id: hash(e.url),
          name: e.name,
          logo: e.logo,
          categoryId: cat("live", e.group),
          epgId: e.tvgId,
          num: ++n,
          url: e.url,
          archiveDays: e.catchupDays,
        });
        continue;
      }
      const m = e.name.match(EP_RE);
      if (e.kind === "series" || m) {
        const seriesName = (m?.[1] ?? e.name).trim() || e.name;
        const key = `${e.group}|${seriesName.toLowerCase()}`;
        let s = seriesMap.get(key);
        if (!s) {
          s = {
            kind: "series",
            id: hash(key),
            name: seriesName,
            poster: e.logo,
            categoryId: cat("series", e.group),
            year: yearOf(seriesName),
            episodes: [],
          };
          seriesMap.set(key, s);
        }
        s.episodes!.push({
          id: hash(e.url),
          title: e.name,
          season: m ? parseInt(m[2], 10) : 1,
          episode: m ? parseInt(m[3], 10) : s.episodes!.length + 1,
          still: e.logo,
          url: e.url,
          ext: extOf(e.url),
        });
        continue;
      }
      movies.push({
        kind: "movie",
        id: hash(e.url),
        name: e.name,
        poster: e.logo,
        categoryId: cat("movie", e.group),
        url: e.url,
        ext: extOf(e.url),
        year: yearOf(e.name),
      });
    }

    return {
      sourceId: this.src.id,
      fetchedAt: Date.now(),
      categories: [...categories.values()],
      live,
      movies,
      series: [...seriesMap.values()],
      epgUrl: pl.epgUrl ?? undefined,
    };
  }

  liveUrl(ch: LiveChannel): string {
    return ch.url!;
  }
  movieUrl(m: Movie): string {
    return m.url!;
  }
  episodeUrl(_s: Series, ep: Episode): string {
    return ep.url!;
  }
  async movieInfo(m: Movie): Promise<MovieInfo> {
    return { poster: m.poster, year: m.year };
  }
  async seriesInfo(s: Series): Promise<SeriesInfo> {
    const episodes: Record<number, Episode[]> = {};
    for (const ep of s.episodes ?? []) (episodes[ep.season] ??= []).push(ep);
    for (const list of Object.values(episodes)) list.sort((a, b) => a.episode - b.episode);
    return {
      poster: s.poster,
      year: s.year,
      seasons: Object.keys(episodes)
        .map(Number)
        .sort((a, b) => a - b),
      episodes,
    };
  }
  async shortEpg(): Promise<EpgEntry[]> {
    return [];
  }
}
