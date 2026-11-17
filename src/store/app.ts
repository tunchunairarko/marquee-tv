import { create } from "zustand";
import { persist } from "zustand/middleware";
import { idb } from "../lib/idb";
import { setUserAgent } from "../lib/native";
import {
  providerFor,
  type Catalog,
  type Episode,
  type LiveChannel,
  type LiveFormat,
  type MediaItem,
  type Movie,
  type Series,
  type Source,
} from "../providers";

export type View =
  | { name: "home" }
  | { name: "live"; categoryId?: string }
  | { name: "movies"; categoryId?: string }
  | { name: "series"; categoryId?: string }
  | { name: "mylist" }
  | { name: "search" }
  | { name: "settings" };

export type PlayRequest =
  | { kind: "live"; channel: LiveChannel; list: LiveChannel[] }
  | { kind: "movie"; movie: Movie; resume?: number }
  | { kind: "episode"; series: Series; episode: Episode; queue: Episode[]; resume?: number };

export interface HistoryEntry {
  key: string;
  item: MediaItem;
  episode?: Episode;
  position: number;
  duration: number;
  updatedAt: number;
}

export interface Settings {
  liveFormat: LiveFormat;
  userAgent: string;
  autoplayNext: boolean;
  livePreview: boolean;
  volume: number;
  muted: boolean;
}

type Status = "idle" | "loading" | "refreshing" | "ready" | "error";

interface State {
  sources: Source[];
  activeSourceId?: string;
  settings: Settings;
  favorites: Record<string, { item: MediaItem; addedAt: number }>;
  history: Record<string, HistoryEntry>;
  lastChannel: Record<string, string>;

  catalog?: Catalog;
  status: Status;
  progress?: string;
  error?: string;

  view: View;
  details?: Movie | Series;
  player?: PlayRequest;
  searchQuery: string;
  toast?: { id: number; text: string };

  addSource(src: Source): void;
  removeSource(id: string): void;
  activateSource(id?: string): void;
  loadCatalog(force?: boolean): Promise<void>;
  navigate(view: View): void;
  openDetails(item?: Movie | Series): void;
  play(req?: PlayRequest): void;
  toggleFavorite(item: MediaItem): void;
  saveProgress(entry: Omit<HistoryEntry, "updatedAt">): void;
  removeHistory(key: string): void;
  updateSettings(patch: Partial<Settings>): void;
  setSearch(q: string): void;
  notify(text: string): void;
}

const CATALOG_TTL = 12 * 60 * 60 * 1000;

export const itemKey = (item: MediaItem) => `${item.kind}:${item.id}`;

export const useApp = create<State>()(
  persist(
    (set, get) => ({
      sources: [],
      settings: {
        liveFormat: "ts",
        userAgent: "",
        autoplayNext: true,
        livePreview: true,
        volume: 1,
        muted: false,
      },
      favorites: {},
      history: {},
      lastChannel: {},
      status: "idle",
      view: { name: "home" },
      searchQuery: "",

      addSource(src) {
        set((s) => ({ sources: [...s.sources.filter((x) => x.id !== src.id), src] }));
        get().activateSource(src.id);
      },

      removeSource(id) {
        idb.del(`catalog:${id}`);
        const sources = get().sources.filter((s) => s.id !== id);
        set({ sources });
        if (get().activeSourceId === id) get().activateSource(sources[0]?.id);
      },

      activateSource(id) {
        set({
          activeSourceId: id,
          catalog: undefined,
          status: "idle",
          error: undefined,
          view: { name: "home" },
          details: undefined,
          player: undefined,
          // favourites/history are per source
          ...(id !== get().activeSourceId ? { favorites: {}, history: {} } : {}),
        });
        if (id) {
          restoreUserData(id).then(() => get().loadCatalog());
        }
      },

      async loadCatalog(force = false) {
        const src = get().sources.find((s) => s.id === get().activeSourceId);
        if (!src) return;
        const cacheKey = `catalog:${src.id}`;

        let current = get().catalog;
        if (!current) {
          const cached = await idb.get<Catalog>(cacheKey);
          if (cached && get().activeSourceId === src.id) {
            current = cached;
            set({ catalog: cached, status: "ready" });
          }
        }
        if (current && !force && Date.now() - current.fetchedAt < CATALOG_TTL) return;

        set({ status: current ? "refreshing" : "loading", error: undefined, progress: undefined });
        try {
          const catalog = await providerFor(src).loadCatalog((progress) => set({ progress }));
          if (get().activeSourceId !== src.id) return;
          set({ catalog, status: "ready", progress: undefined });
          idb.set(cacheKey, catalog);
        } catch (e) {
          if (get().activeSourceId !== src.id) return;
          const error = e instanceof Error ? e.message : String(e);
          if (current) {
            set({ status: "ready", progress: undefined });
            get().notify(`Couldn't refresh: ${error}`);
          } else set({ status: "error", error, progress: undefined });
        }
      },

      navigate(view) {
        set({ view, details: undefined });
      },

      openDetails(details) {
        set({ details });
      },

      play(player) {
        set({ player });
        if (player?.kind === "live" && get().activeSourceId) {
          set((s) => ({ lastChannel: { ...s.lastChannel, [s.activeSourceId!]: player.channel.id } }));
          get().saveProgress({ key: `live:${player.channel.id}`, item: player.channel, position: 0, duration: 0 });
        }
      },

      toggleFavorite(item) {
        const key = itemKey(item);
        set((s) => {
          const favorites = { ...s.favorites };
          if (favorites[key]) delete favorites[key];
          else favorites[key] = { item, addedAt: Date.now() };
          return { favorites };
        });
        persistUserData(true);
      },

      saveProgress(entry) {
        set((s) => ({ history: { ...s.history, [entry.key]: { ...entry, updatedAt: Date.now() } } }));
        persistUserData();
      },

      removeHistory(key) {
        set((s) => {
          const history = { ...s.history };
          delete history[key];
          return { history };
        });
        persistUserData(true);
      },

      updateSettings(patch) {
        set((s) => ({ settings: { ...s.settings, ...patch } }));
        if (patch.userAgent !== undefined) setUserAgent(patch.userAgent);
      },

      setSearch(searchQuery) {
        set({ searchQuery });
        if (searchQuery && get().view.name !== "search") set({ view: { name: "search" }, details: undefined });
      },

      notify(text) {
        const id = Date.now();
        set({ toast: { id, text } });
        setTimeout(() => {
          if (get().toast?.id === id) set({ toast: undefined });
        }, 3500);
      },
    }),
    {
      name: "marquee",
      version: 1,
      partialize: (s) => ({
        sources: s.sources,
        activeSourceId: s.activeSourceId,
        settings: s.settings,
        lastChannel: s.lastChannel,
      }),
    },
  ),
);

// Favourites & watch history live in IndexedDB keyed per source, since
// they can grow large and differ per playlist.
let persistTimer: ReturnType<typeof setTimeout> | undefined;
function writeUserData() {
  clearTimeout(persistTimer);
  persistTimer = undefined;
  const { activeSourceId, favorites, history } = useApp.getState();
  if (!activeSourceId) return;
  // keep history bounded
  const entries = Object.values(history)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 300);
  idb.set(`user:${activeSourceId}`, {
    favorites,
    history: Object.fromEntries(entries.map((e) => [e.key, e])),
  });
}

/** Write favourites/history to disk now (e.g. when the player closes). */
export const flushUserData = () => writeUserData();

/** Debounced for frequent progress updates; `now` for user actions. */
function persistUserData(now = false) {
  if (now) return writeUserData();
  clearTimeout(persistTimer);
  persistTimer = setTimeout(writeUserData, 400);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => persistTimer && writeUserData());
}

async function restoreUserData(sourceId: string) {
  const data = await idb.get<{ favorites: State["favorites"]; history: State["history"] }>(`user:${sourceId}`);
  if (data && useApp.getState().activeSourceId === sourceId) {
    useApp.setState({ favorites: data.favorites ?? {}, history: data.history ?? {} });
  }
}

export function activeSource(): Source | undefined {
  const s = useApp.getState();
  return s.sources.find((x) => x.id === s.activeSourceId);
}

export function activeProvider() {
  const src = activeSource();
  return src ? providerFor(src) : undefined;
}

/** Bootstraps persisted state once the native layer is ready. */
export async function bootstrap() {
  const s = useApp.getState();
  if (s.settings.userAgent) await setUserAgent(s.settings.userAgent);
  if (s.activeSourceId) {
    await restoreUserData(s.activeSourceId);
    await s.loadCatalog();
  }
}
