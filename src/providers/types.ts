export type ContentType = "live" | "movie" | "series";

export interface XtreamSource {
  id: string;
  kind: "xtream";
  name: string;
  server: string;
  username: string;
  password: string;
}

export interface M3uSource {
  id: string;
  kind: "m3u";
  name: string;
  url: string;
}

export interface DemoSource {
  id: string;
  kind: "demo";
  name: string;
}

export type Source = XtreamSource | M3uSource | DemoSource;

export interface Category {
  id: string;
  name: string;
  type: ContentType;
}

export interface LiveChannel {
  kind: "live";
  id: string;
  name: string;
  logo?: string;
  categoryId: string;
  epgId?: string;
  num?: number;
  url?: string;
  archiveDays?: number;
}

export interface Movie {
  kind: "movie";
  id: string;
  name: string;
  poster?: string;
  categoryId: string;
  rating?: number;
  added?: number;
  ext?: string;
  year?: string;
  url?: string;
}

export interface Episode {
  id: string;
  title: string;
  season: number;
  episode: number;
  still?: string;
  plot?: string;
  duration?: string;
  rating?: number;
  ext?: string;
  url?: string;
}

export interface Series {
  kind: "series";
  id: string;
  name: string;
  poster?: string;
  backdrop?: string;
  categoryId: string;
  rating?: number;
  added?: number;
  year?: string;
  plot?: string;
  genre?: string;
  /** Only for M3U sources where episodes are known up-front. */
  episodes?: Episode[];
}

export type MediaItem = LiveChannel | Movie | Series;

export interface MovieInfo {
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  released?: string;
  duration?: string;
  backdrop?: string;
  poster?: string;
  rating?: number;
  year?: string;
  trailer?: string;
}

export interface SeriesInfo extends MovieInfo {
  seasons: number[];
  episodes: Record<number, Episode[]>;
}

export interface EpgEntry {
  title: string;
  description: string;
  start: number;
  end: number;
}

export interface Catalog {
  sourceId: string;
  fetchedAt: number;
  categories: Category[];
  live: LiveChannel[];
  movies: Movie[];
  series: Series[];
  epgUrl?: string;
  account?: AccountInfo;
}

export interface AccountInfo {
  status?: string;
  expires?: number;
  maxConnections?: number;
  activeConnections?: number;
}

export type LiveFormat = "ts" | "m3u8";

export interface Provider {
  loadCatalog(onProgress?: (msg: string) => void): Promise<Catalog>;
  liveUrl(ch: LiveChannel, format: LiveFormat): string;
  movieUrl(m: Movie): string;
  episodeUrl(series: Series, ep: Episode): string;
  movieInfo(m: Movie): Promise<MovieInfo>;
  seriesInfo(s: Series): Promise<SeriesInfo>;
  shortEpg(ch: LiveChannel, limit?: number): Promise<EpgEntry[]>;
}
