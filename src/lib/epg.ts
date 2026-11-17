import { useEffect, useState } from "react";
import type { EpgEntry, LiveChannel } from "../providers";
import { activeProvider } from "../store/app";

// Small shared EPG cache + request queue so scrolling a list of thousands of
// channels doesn't flood the provider.
const TTL = 10 * 60 * 1000;
const cache = new Map<string, { at: number; data: EpgEntry[] }>();
const inflight = new Map<string, Promise<EpgEntry[]>>();
const queue: (() => void)[] = [];
let running = 0;
const MAX = 3;

function pump() {
  while (running < MAX && queue.length) {
    running++;
    queue.shift()!();
  }
}

export function fetchEpg(ch: LiveChannel, limit = 4): Promise<EpgEntry[]> {
  const key = ch.id;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.data);
  let p = inflight.get(key);
  if (p) return p;
  p = new Promise<EpgEntry[]>((resolve) => {
    queue.push(() => {
      const provider = activeProvider();
      (provider ? provider.shortEpg(ch, limit) : Promise.resolve([]))
        .catch(() => [] as EpgEntry[])
        .then((data) => {
          cache.set(key, { at: Date.now(), data });
          inflight.delete(key);
          resolve(data);
        })
        .finally(() => {
          running--;
          pump();
        });
    });
    pump();
  });
  inflight.set(key, p);
  return p;
}

export function nowAndNext(epg: EpgEntry[]): [EpgEntry | undefined, EpgEntry | undefined] {
  const t = Date.now();
  const i = epg.findIndex((e) => e.start <= t && e.end > t);
  return i >= 0 ? [epg[i], epg[i + 1]] : [undefined, epg[0]];
}

export function useEpg(ch: LiveChannel | undefined, delay = 0): EpgEntry[] | undefined {
  const [data, setData] = useState<EpgEntry[] | undefined>(() => (ch ? cache.get(ch.id)?.data : undefined));
  useEffect(() => {
    if (!ch) return;
    let alive = true;
    setData(cache.get(ch.id)?.data);
    const t = setTimeout(() => fetchEpg(ch).then((d) => alive && setData(d)), delay);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [ch, delay]);
  return data;
}
