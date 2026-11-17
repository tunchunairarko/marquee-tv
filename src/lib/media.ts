import type { PlayRequest } from "../store/app";
import { activeProvider, useApp } from "../store/app";
import type { LiveFormat } from "../providers";

export interface ResolvedMedia {
  urls: string[];
  live: boolean;
  title: string;
  subtitle?: string;
  key: string;
}

export function resolve(req: PlayRequest): ResolvedMedia {
  const p = activeProvider();
  if (!p) throw new Error("No active playlist");
  const fmt = useApp.getState().settings.liveFormat;
  if (req.kind === "live") {
    const other: LiveFormat = fmt === "ts" ? "m3u8" : "ts";
    const a = p.liveUrl(req.channel, fmt);
    const b = p.liveUrl(req.channel, other);
    return {
      urls: a === b ? [a] : [a, b],
      live: true,
      title: req.channel.name,
      key: `live:${req.channel.id}`,
    };
  }
  if (req.kind === "movie") {
    return { urls: [p.movieUrl(req.movie)], live: false, title: req.movie.name, key: `movie:${req.movie.id}` };
  }
  return {
    urls: [p.episodeUrl(req.series, req.episode)],
    live: false,
    title: req.series.name,
    subtitle: `S${req.episode.season} · E${req.episode.episode}  ${req.episode.title}`,
    key: `series:${req.series.id}`,
  };
}
