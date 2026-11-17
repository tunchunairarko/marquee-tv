import { fetchJson } from "../lib/native";
import { decodeBase64, num, str, yearOf } from "../lib/util";
import type {
  AccountInfo,
  Catalog,
  Category,
  ContentType,
  EpgEntry,
  Episode,
  LiveChannel,
  LiveFormat,
  Movie,
  MovieInfo,
  Provider,
  Series,
  SeriesInfo,
  XtreamSource,
} from "./types";

type Raw = Record<string, unknown>;

export function normalizeServer(server: string): string {
  let s = server.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(s)) s = "http://" + s;
  // Users often paste the full player_api / get.php URL.
  s = s.replace(/\/(player_api|get|panel_api)\.php.*$/i, "");
  return s;
}

function firstOf(v: unknown): string | undefined {
  if (Array.isArray(v)) return str(v[0]);
  return str(v);
}

export class XtreamProvider implements Provider {
  private base: string;
  private u: string;
  private p: string;

  constructor(private src: XtreamSource) {
    this.base = normalizeServer(src.server);
    this.u = encodeURIComponent(src.username);
    this.p = encodeURIComponent(src.password);
  }

  private api<T = unknown>(params: Record<string, string> = {}): Promise<T> {
    const q = new URLSearchParams({ username: this.src.username, password: this.src.password, ...params });
    return fetchJson<T>(`${this.base}/player_api.php?${q}`);
  }

  async authenticate(): Promise<AccountInfo> {
    const res = await this.api<{ user_info?: Raw }>();
    const ui = res?.user_info;
    if (!ui || Number(ui.auth) === 0) throw new Error("Login failed – check your server, username and password");
    return {
      status: str(ui.status),
      expires: num(ui.exp_date) ? num(ui.exp_date)! * 1000 : undefined,
      maxConnections: num(ui.max_connections),
      activeConnections: num(ui.active_cons),
    };
  }

  async loadCatalog(onProgress?: (msg: string) => void): Promise<Catalog> {
    onProgress?.("Signing in…");
    const account = await this.authenticate();
    onProgress?.("Loading categories…");

    const cats = (type: ContentType, action: string) =>
      this.api<Raw[]>({ action })
        .catch(() => [] as Raw[])
        .then((rows) =>
          (Array.isArray(rows) ? rows : []).map(
            (c): Category => ({ id: `${type}:${c.category_id}`, name: str(c.category_name) ?? "Other", type }),
          ),
        );

    const list = (action: string) =>
      this.api<Raw[]>({ action })
        .then((r) => (Array.isArray(r) ? r : []))
        .catch(() => [] as Raw[]);

    const [lc, vc, sc] = await Promise.all([
      cats("live", "get_live_categories"),
      cats("movie", "get_vod_categories"),
      cats("series", "get_series_categories"),
    ]);

    onProgress?.("Loading channels, movies & series…");
    const [lr, vr, sr] = await Promise.all([list("get_live_streams"), list("get_vod_streams"), list("get_series")]);

    const live: LiveChannel[] = lr.map((r) => ({
      kind: "live",
      id: String(r.stream_id),
      name: str(r.name) ?? "Channel",
      logo: str(r.stream_icon),
      categoryId: `live:${r.category_id}`,
      epgId: str(r.epg_channel_id),
      num: num(r.num),
      archiveDays: Number(r.tv_archive) ? num(r.tv_archive_duration) : undefined,
    }));

    const movies: Movie[] = vr.map((r) => ({
      kind: "movie",
      id: String(r.stream_id),
      name: str(r.name) ?? "Movie",
      poster: str(r.stream_icon),
      categoryId: `movie:${r.category_id}`,
      rating: num(r.rating_5based) !== undefined ? num(r.rating_5based)! * 2 : num(r.rating),
      added: num(r.added),
      ext: str(r.container_extension) ?? "mp4",
      year: str(r.year) ?? yearOf(str(r.name)),
    }));

    const series: Series[] = sr.map((r) => ({
      kind: "series",
      id: String(r.series_id),
      name: str(r.name) ?? "Series",
      poster: str(r.cover),
      backdrop: firstOf(r.backdrop_path),
      categoryId: `series:${r.category_id}`,
      rating: num(r.rating_5based) !== undefined ? num(r.rating_5based)! * 2 : num(r.rating),
      added: num(r.last_modified),
      year: str(r.year) ?? yearOf(str(r.releaseDate), str(r.release_date), str(r.name)),
      plot: str(r.plot),
      genre: str(r.genre),
    }));

    return {
      sourceId: this.src.id,
      fetchedAt: Date.now(),
      categories: [...lc, ...vc, ...sc],
      live,
      movies,
      series,
      account,
    };
  }

  liveUrl(ch: LiveChannel, format: LiveFormat): string {
    return `${this.base}/live/${this.u}/${this.p}/${ch.id}.${format}`;
  }

  movieUrl(m: Movie): string {
    return `${this.base}/movie/${this.u}/${this.p}/${m.id}.${m.ext ?? "mp4"}`;
  }

  episodeUrl(_s: Series, ep: Episode): string {
    return `${this.base}/series/${this.u}/${this.p}/${ep.id}.${ep.ext ?? "mp4"}`;
  }

  async movieInfo(m: Movie): Promise<MovieInfo> {
    const res = await this.api<{ info?: Raw; movie_data?: Raw }>({ action: "get_vod_info", vod_id: m.id });
    const i = (res?.info ?? {}) as Raw;
    return {
      plot: str(i.plot) ?? str(i.description),
      cast: str(i.cast) ?? str(i.actors),
      director: str(i.director),
      genre: str(i.genre),
      released: str(i.releasedate) ?? str(i.release_date),
      duration: str(i.duration),
      backdrop: firstOf(i.backdrop_path),
      poster: str(i.movie_image) ?? str(i.cover_big),
      rating: num(i.rating),
      year: yearOf(str(i.releasedate), str(i.release_date), m.name),
      trailer: str(i.youtube_trailer),
    };
  }

  async seriesInfo(s: Series): Promise<SeriesInfo> {
    const res = await this.api<{ info?: Raw; episodes?: Record<string, Raw[]> | Raw[][]; seasons?: Raw[] }>({
      action: "get_series_info",
      series_id: s.id,
    });
    const i = (res?.info ?? {}) as Raw;
    const episodes: Record<number, Episode[]> = {};
    const rawEps = res?.episodes ?? {};
    const groups: [string, Raw[]][] = Array.isArray(rawEps)
      ? rawEps.map((g, idx) => [String(num((g[0] as Raw)?.season) ?? idx + 1), g])
      : Object.entries(rawEps);

    for (const [seasonKey, eps] of groups) {
      if (!Array.isArray(eps)) continue;
      const season = num(seasonKey) ?? 1;
      episodes[season] = eps
        .map((e, idx): Episode => {
          const ei = (e.info ?? {}) as Raw;
          return {
            id: String(e.id),
            title: str(e.title) ?? `Episode ${idx + 1}`,
            season: num(e.season) ?? season,
            episode: num(e.episode_num) ?? idx + 1,
            still: str(ei.movie_image) ?? str(ei.cover_big),
            plot: str(ei.plot),
            duration: str(ei.duration),
            rating: num(ei.rating),
            ext: str(e.container_extension) ?? "mp4",
          };
        })
        .sort((a, b) => a.episode - b.episode);
    }

    return {
      plot: str(i.plot) ?? s.plot,
      cast: str(i.cast),
      director: str(i.director),
      genre: str(i.genre) ?? s.genre,
      released: str(i.releaseDate) ?? str(i.release_date),
      backdrop: firstOf(i.backdrop_path) ?? s.backdrop,
      poster: str(i.cover) ?? s.poster,
      rating: num(i.rating) ?? s.rating,
      year: yearOf(str(i.releaseDate), str(i.release_date)) ?? s.year,
      trailer: str(i.youtube_trailer),
      seasons: Object.keys(episodes)
        .map(Number)
        .sort((a, b) => a - b),
      episodes,
    };
  }

  async shortEpg(ch: LiveChannel, limit = 4): Promise<EpgEntry[]> {
    const res = await this.api<{ epg_listings?: Raw[] }>({
      action: "get_short_epg",
      stream_id: ch.id,
      limit: String(limit),
    });
    return (res?.epg_listings ?? [])
      .map((e) => ({
        title: decodeBase64(str(e.title)),
        description: decodeBase64(str(e.description)),
        start: (num(e.start_timestamp) ?? Date.parse(String(e.start)) / 1000) * 1000,
        end: (num(e.stop_timestamp) ?? Date.parse(String(e.end)) / 1000) * 1000,
      }))
      .filter((e) => Number.isFinite(e.start) && Number.isFinite(e.end) && e.end > Date.now() - 60_000)
      .sort((a, b) => a.start - b.start);
  }
}
