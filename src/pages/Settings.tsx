import { getVersion } from "@tauri-apps/api/app";
import { Check, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { SourceForm } from "../components/SourceForm";
import { inTauri } from "../lib/native";
import { cx } from "../lib/util";
import { useApp } from "../store/app";

const SHORTCUTS: [string, string][] = [
  ["Space / K", "Play / pause"],
  ["F / double-click", "Toggle fullscreen"],
  ["M", "Mute"],
  ["← / →", "Seek 10 seconds"],
  ["↑ / ↓", "Volume (films) · channel up/down (live)"],
  ["N", "Next episode"],
  ["Esc", "Exit fullscreen / close player"],
  ["Ctrl/⌘ + F", "Search"],
];

export function Settings() {
  const s = useApp();
  const [adding, setAdding] = useState(false);
  const [version, setVersion] = useState("dev");
  const catalog = s.catalog;

  useEffect(() => {
    if (inTauri) getVersion().then(setVersion);
  }, []);

  return (
    <div className="page page--padded page--settings">
      <h1 className="page__title">Settings</h1>

      <section className="card">
        <header className="card__head">
          <h2>Playlists</h2>
          <button className="btn btn--ghost sm" onClick={() => setAdding((a) => !a)}>
            <Plus size={16} /> Add playlist
          </button>
        </header>
        <ul className="source-list">
          {s.sources.map((src) => (
            <li key={src.id} className={cx(src.id === s.activeSourceId && "is-active")}>
              <span className="avatar">{src.name.slice(0, 1).toUpperCase()}</span>
              <div className="source-list__text">
                <b>{src.name}</b>
                <span className="muted">
                  {src.kind === "xtream" ? `Xtream · ${src.server} · ${src.username}` : src.kind === "m3u" ? `M3U · ${src.url}` : "Demo content"}
                </span>
              </div>
              {src.id === s.activeSourceId ? (
                <span className="pill">
                  <Check size={14} /> Active
                </span>
              ) : (
                <button className="btn btn--ghost sm" onClick={() => s.activateSource(src.id)}>
                  Switch
                </button>
              )}
              <button
                className="icon-btn"
                title="Remove"
                onClick={() => confirm(`Remove “${src.name}”?`) && s.removeSource(src.id)}
              >
                <Trash2 size={18} />
              </button>
            </li>
          ))}
        </ul>
        {adding && (
          <div className="pad-top">
            <SourceForm
              compact
              onAdd={(src) => {
                setAdding(false);
                s.addSource(src);
              }}
            />
          </div>
        )}
      </section>

      {catalog && (
        <section className="card">
          <header className="card__head">
            <h2>Catalogue</h2>
            <button className="btn btn--ghost sm" disabled={s.status === "refreshing"} onClick={() => s.loadCatalog(true)}>
              <RefreshCw size={16} className={cx(s.status === "refreshing" && "spin")} /> Refresh now
            </button>
          </header>
          <div className="stats">
            <Stat label="Channels" value={catalog.live.length} />
            <Stat label="Films" value={catalog.movies.length} />
            <Stat label="Series" value={catalog.series.length} />
            <Stat label="Categories" value={catalog.categories.length} />
          </div>
          <p className="muted">
            Updated {new Date(catalog.fetchedAt).toLocaleString()} · refreshes automatically every 12 hours.
            {catalog.account?.expires && <> Subscription expires {new Date(catalog.account.expires).toLocaleDateString()}.</>}
            {catalog.account?.maxConnections && <> Max connections: {catalog.account.maxConnections}.</>}
          </p>
        </section>
      )}

      <section className="card">
        <header className="card__head">
          <h2>Playback</h2>
        </header>
        <div className="setting">
          <div>
            <b>Live stream format</b>
            <p className="muted">MPEG-TS starts fastest on most providers; HLS is more compatible. The other is tried automatically on failure.</p>
          </div>
          <div className="segmented">
            {(["ts", "m3u8"] as const).map((f) => (
              <button key={f} className={cx(s.settings.liveFormat === f && "is-active")} onClick={() => s.updateSettings({ liveFormat: f })}>
                {f === "ts" ? "MPEG-TS" : "HLS"}
              </button>
            ))}
          </div>
        </div>
        <Toggle
          label="Autoplay next episode"
          hint="Start the next episode automatically when one finishes."
          value={s.settings.autoplayNext}
          onChange={(v) => s.updateSettings({ autoplayNext: v })}
        />
        <Toggle
          label="Live preview"
          hint="Play the selected channel in the Live TV preview window."
          value={s.settings.livePreview}
          onChange={(v) => s.updateSettings({ livePreview: v })}
        />
        <div className="setting">
          <div>
            <b>User-Agent</b>
            <p className="muted">Some providers only accept specific players. Leave empty for the default (VLC).</p>
          </div>
          <input
            className="input"
            defaultValue={s.settings.userAgent}
            placeholder="VLC/3.0.21 LibVLC/3.0.21"
            onBlur={(e) => s.updateSettings({ userAgent: e.target.value })}
          />
        </div>
      </section>

      <section className="card">
        <header className="card__head">
          <h2>Keyboard shortcuts</h2>
        </header>
        <dl className="shortcuts">
          {SHORTCUTS.map(([k, d]) => (
            <div key={k}>
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{d}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="muted center">Marquee v{version}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <b>{value.toLocaleString()}</b>
      <span>{label}</span>
    </div>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange(v: boolean): void }) {
  return (
    <div className="setting">
      <div>
        <b>{label}</b>
        <p className="muted">{hint}</p>
      </div>
      <button role="switch" aria-checked={value} className={cx("switch", value && "is-on")} onClick={() => onChange(!value)}>
        <i />
      </button>
    </div>
  );
}
