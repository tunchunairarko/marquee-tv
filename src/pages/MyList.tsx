import { Plus } from "lucide-react";
import { useMemo } from "react";
import { ChannelCard, PosterCard } from "../components/Cards";
import type { LiveChannel, Movie, Series } from "../providers";
import { itemKey, useApp } from "../store/app";

export function MyList() {
  const favorites = useApp((s) => s.favorites);
  const items = useMemo(() => Object.values(favorites).sort((a, b) => b.addedAt - a.addedAt).map((f) => f.item), [favorites]);
  const channels = items.filter((i): i is LiveChannel => i.kind === "live");
  const vod = items.filter((i): i is Movie | Series => i.kind !== "live");

  return (
    <div className="page page--padded">
      <h1 className="page__title">My List</h1>
      {!items.length && (
        <div className="empty big">
          <Plus size={40} />
          <p>Your list is empty. Use the + button on any film, series or channel to save it here.</p>
        </div>
      )}
      {channels.length > 0 && (
        <section className="section">
          <h2>Channels</h2>
          <div className="grid grid--channels">
            {channels.map((c) => (
              <ChannelCard key={c.id} channel={c} list={channels} />
            ))}
          </div>
        </section>
      )}
      {vod.length > 0 && (
        <section className="section">
          <h2>Films & series</h2>
          <div className="grid">
            {vod.map((m) => (
              <PosterCard key={itemKey(m)} item={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
