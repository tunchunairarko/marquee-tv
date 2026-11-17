import { DemoProvider } from "./demo";
import { M3uProvider } from "./m3u";
import type { Provider, Source } from "./types";
import { XtreamProvider } from "./xtream";

export * from "./types";

const cache = new Map<string, Provider>();

export function providerFor(src: Source): Provider {
  const key = JSON.stringify(src);
  let p = cache.get(key);
  if (!p) {
    if (src.kind === "xtream") p = new XtreamProvider(src);
    else if (src.kind === "m3u") p = new M3uProvider(src);
    else p = new DemoProvider(src.id);
    cache.set(key, p);
  }
  return p;
}
