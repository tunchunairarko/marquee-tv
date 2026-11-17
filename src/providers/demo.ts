// A self-contained demo catalogue so the UI can be explored without an
// IPTV subscription. Artwork is generated SVG; streams are public test feeds.
import type {
  Catalog,
  Category,
  EpgEntry,
  Episode,
  LiveChannel,
  Movie,
  MovieInfo,
  Provider,
  Series,
  SeriesInfo,
} from "./types";

const STREAMS = [
  "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8",
  "https://test-streams.mux.dev/tos_ismc/main.m3u8",
];

const PALETTES = [
  ["#ff512f", "#dd2476"],
  ["#1fa2ff", "#12d8fa"],
  ["#f7971e", "#ffd200"],
  ["#8e2de2", "#4a00e0"],
  ["#11998e", "#38ef7d"],
  ["#fc466b", "#3f5efb"],
  ["#c94b4b", "#4b134f"],
  ["#00b09b", "#96c93d"],
  ["#ee0979", "#ff6a00"],
  ["#614385", "#516395"],
  ["#283c86", "#45a247"],
  ["#e65c00", "#f9d423"],
];

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function svgUri(svg: string) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function poster(title: string, i: number, w = 400, h = 600, withText = true) {
  const [a, b] = PALETTES[i % PALETTES.length];
  const words = title.toUpperCase().split(" ");
  const lines: string[] = [];
  for (const wd of words) {
    if (lines.length && (lines[lines.length - 1] + " " + wd).length <= 12) lines[lines.length - 1] += " " + wd;
    else lines.push(wd);
  }
  const fs = w / 9;
  const text = !withText ? "" : lines
    .map((l, k) => `<text x="${w / 2}" y="${h * 0.62 + k * fs * 1.05}" text-anchor="middle">${esc(l)}</text>`)
    .join("");
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>` +
      `<radialGradient id="r" cx=".3" cy=".25" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient></defs>` +
      `<rect width="100%" height="100%" fill="url(#g)"/><rect width="100%" height="100%" fill="url(#r)"/>` +
      `<circle cx="${w * 0.72}" cy="${h * 0.28}" r="${w * 0.32}" fill="#fff" fill-opacity=".08"/>` +
      `<circle cx="${w * 0.2}" cy="${h * 0.4}" r="${w * 0.18}" fill="#000" fill-opacity=".12"/>` +
      `<g font-family="Inter,Segoe UI,Helvetica,Arial,sans-serif" font-weight="900" font-size="${fs}" fill="#fff" letter-spacing="2">${text}</g>` +
      `</svg>`,
  );
}

function logo(name: string, i: number) {
  const [a, b] = PALETTES[(i * 5) % PALETTES.length];
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>` +
      `<rect x="20" y="20" width="200" height="200" rx="48" fill="url(#g)"/>` +
      `<text x="120" y="142" text-anchor="middle" font-family="Inter,Segoe UI,Helvetica,Arial,sans-serif" font-weight="900" font-size="64" fill="#fff">${esc(initials)}</text></svg>`,
  );
}

const LIVE_CATS = ["News", "Entertainment", "Sports", "Kids", "Documentaries", "Music"];
const CHANNELS: Record<string, string[]> = {
  News: ["World News 24", "Metro Headlines", "Global Business", "Daily Report", "Capital News"],
  Entertainment: ["Prime One", "Showcase", "Comedy Central Hub", "Drama Plus", "Galaxy TV", "Retro Classics"],
  Sports: ["Sport Arena 1", "Sport Arena 2", "Goal TV", "Motor Racing HD", "Tennis Live", "Fight Night"],
  Kids: ["Toon Town", "Little Explorers", "Junior Jam"],
  Documentaries: ["Planet Wild", "History Vault", "Science Now", "Ocean Deep"],
  Music: ["Beats FM TV", "Classic Hits", "Jazz Lounge"],
};

const MOVIE_CATS = ["New Releases", "Action & Adventure", "Comedy", "Sci-Fi", "Drama", "Thriller"];
const MOVIES: Record<string, string[]> = {
  "New Releases": ["Midnight Harbor", "The Last Signal", "Paper Lanterns", "Northern Drift", "Echo Valley", "Glass Cities", "Burning Tides", "Silver Line"],
  "Action & Adventure": ["Iron Meridian", "Storm Runner", "Code Black", "Desert Wolves", "Skyfall Protocol", "Red Horizon", "Velocity", "Kingsguard"],
  Comedy: ["Wedding Crashers Club", "Office Party", "Uncle Bob's Van", "Lost in Leeds", "Tea for Two", "The Big Swap", "Neighbours From Mars"],
  "Sci-Fi": ["Orbit Zero", "Quantum Garden", "The Ninth Moon", "Starlight Express", "Neon Genesis", "Parallax", "Cryo", "Event Horizon II"],
  Drama: ["Quiet Rooms", "The Winter Orchard", "Letters Home", "Harbour Lights", "A Long Way North", "Saltwater"],
  Thriller: ["Blind Spot", "The Ninth Floor", "Cold Trace", "Undertow", "Night Shift", "The Insider", "Vanishing Point"],
};

const SERIES_CATS = ["Popular Series", "Crime", "Fantasy", "Documentary Series"];
const SERIES: Record<string, string[]> = {
  "Popular Series": ["The Crown Estate", "Breaking Point", "City of Spies", "The Bakers", "Coastline", "Station Eleven Seven"],
  Crime: ["Line of Inquiry", "Shetland Mist", "Dark Water", "The Detective's Wife", "Night Patrol"],
  Fantasy: ["Dragon Throne", "The Witch Road", "Kingdom of Ash", "Moonborne", "The Sixth Gate"],
  "Documentary Series": ["Blue Planet Earth", "Ancient Engineers", "Cosmos Rising", "Wild Isles"],
};

const PLOTS = [
  "When a routine assignment unravels, an unlikely team must race against time to uncover a conspiracy that reaches far beyond anything they imagined.",
  "A sweeping story of family, ambition and betrayal set across three generations and two continents.",
  "In a near future where memories can be traded, one woman discovers a secret buried in her own past.",
  "A small coastal town is turned upside down when a stranger arrives with a story nobody wants to believe.",
  "Heart-warming, hilarious and surprisingly honest – a comedy about the families we choose.",
];

export class DemoProvider implements Provider {
  constructor(private sourceId: string) {}

  async loadCatalog(): Promise<Catalog> {
    const categories: Category[] = [];
    const live: LiveChannel[] = [];
    const movies: Movie[] = [];
    const series: Series[] = [];
    let i = 0;

    for (const c of LIVE_CATS) {
      categories.push({ id: `live:${c}`, name: c, type: "live" });
      for (const name of CHANNELS[c]) {
        i++;
        live.push({
          kind: "live",
          id: `l${i}`,
          name,
          logo: logo(name, i),
          categoryId: `live:${c}`,
          num: i,
          url: STREAMS[i % STREAMS.length],
          epgId: `demo${i}`,
        });
      }
    }
    const now = Math.floor(Date.now() / 1000);
    for (const c of MOVIE_CATS) {
      categories.push({ id: `movie:${c}`, name: c, type: "movie" });
      for (const name of MOVIES[c]) {
        i++;
        movies.push({
          kind: "movie",
          id: `m${i}`,
          name,
          poster: poster(name, i),
          categoryId: `movie:${c}`,
          rating: 5 + ((i * 7) % 50) / 10,
          added: now - i * 3600 * 7,
          year: String(2015 + (i % 11)),
          url: STREAMS[i % STREAMS.length],
          ext: "m3u8",
        });
      }
    }
    for (const c of SERIES_CATS) {
      categories.push({ id: `series:${c}`, name: c, type: "series" });
      for (const name of SERIES[c]) {
        i++;
        const episodes: Episode[] = [];
        for (let s = 1; s <= 1 + (i % 3); s++)
          for (let e = 1; e <= 6 + (i % 4); e++)
            episodes.push({
              id: `e${i}-${s}-${e}`,
              title: `Episode ${e}`,
              season: s,
              episode: e,
              still: poster(`${name} ${s}x${e}`, i + e, 640, 360),
              plot: PLOTS[(i + e) % PLOTS.length],
              duration: `${40 + ((e * 7) % 20)} min`,
              url: STREAMS[(i + e) % STREAMS.length],
              ext: "m3u8",
            });
        series.push({
          kind: "series",
          id: `s${i}`,
          name,
          poster: poster(name, i),
          backdrop: poster(name, i, 1600, 900, false),
          categoryId: `series:${c}`,
          rating: 6 + ((i * 3) % 40) / 10,
          added: now - i * 5400,
          year: String(2012 + (i % 13)),
          plot: PLOTS[i % PLOTS.length],
          genre: c,
          episodes,
        });
      }
    }
    return {
      sourceId: this.sourceId,
      fetchedAt: Date.now(),
      categories,
      live,
      movies,
      series,
      account: { status: "Demo", maxConnections: 1 },
    };
  }

  liveUrl(ch: LiveChannel) {
    return ch.url!;
  }
  movieUrl(m: Movie) {
    return m.url!;
  }
  episodeUrl(_s: Series, ep: Episode) {
    return ep.url!;
  }
  async movieInfo(m: Movie): Promise<MovieInfo> {
    const n = parseInt(m.id.slice(1), 10);
    return {
      plot: PLOTS[n % PLOTS.length],
      cast: "Alex Morgan, Priya Shah, Tom Ellis, Maya Chen",
      director: "Jordan Blake",
      genre: m.categoryId.split(":")[1],
      duration: `${1 + (n % 2)}h ${10 + (n % 50)}m`,
      backdrop: poster(m.name, n, 1600, 900, false),
      poster: m.poster,
      rating: m.rating,
      year: m.year,
    };
  }
  async seriesInfo(s: Series): Promise<SeriesInfo> {
    const episodes: Record<number, Episode[]> = {};
    for (const ep of s.episodes ?? []) (episodes[ep.season] ??= []).push(ep);
    return {
      plot: s.plot,
      cast: "Sam Rivers, Olivia Hart, Ben Kowalski",
      genre: s.genre,
      backdrop: s.backdrop,
      poster: s.poster,
      rating: s.rating,
      year: s.year,
      seasons: Object.keys(episodes).map(Number),
      episodes,
    };
  }
  async shortEpg(ch: LiveChannel, limit = 4): Promise<EpgEntry[]> {
    const shows = ["Morning Live", "The Big Interview", "Headlines", "Matchday", "Late Edition", "Under the Sea", "Top 40", "Cartoon Hour", "Weekend Review", "Night Owls"];
    const slot = 30 * 60 * 1000;
    const base = Math.floor(Date.now() / slot) * slot;
    const n = parseInt(ch.id.slice(1), 10);
    return Array.from({ length: limit }, (_, k) => ({
      title: shows[(n + k) % shows.length],
      description: PLOTS[(n + k) % PLOTS.length],
      start: base + k * slot,
      end: base + (k + 1) * slot,
    }));
  }
}
