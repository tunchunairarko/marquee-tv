import { ChevronDown, RefreshCw, Search, Settings, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp, type View } from "../store/app";
import { cx } from "../lib/util";

const LINKS: { label: string; view: View }[] = [
  { label: "Home", view: { name: "home" } },
  { label: "Live TV", view: { name: "live" } },
  { label: "Movies", view: { name: "movies" } },
  { label: "Series", view: { name: "series" } },
  { label: "My List", view: { name: "mylist" } },
];

export function TopNav() {
  const view = useApp((s) => s.view);
  const navigate = useApp((s) => s.navigate);
  const status = useApp((s) => s.status);
  const query = useApp((s) => s.searchQuery);
  const setSearch = useApp((s) => s.setSearch);
  const sources = useApp((s) => s.sources);
  const activeId = useApp((s) => s.activeSourceId);
  const activate = useApp((s) => s.activateSource);
  const [solid, setSolid] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const active = sources.find((s) => s.id === activeId);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 30);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen(true);
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const expanded = searchOpen || !!query;

  return (
    <nav className={cx("topnav", (solid || view.name === "live" || view.name === "settings") && "is-solid")}>
      <div className="topnav__brand" onClick={() => navigate({ name: "home" })}>
        <img src="/logo.svg" alt="" />
        <span>Simple IPTV</span>
      </div>
      <ul className="topnav__links">
        {LINKS.map((l) => (
          <li key={l.label}>
            <button className={cx(view.name === l.view.name && "is-active")} onClick={() => navigate(l.view)}>
              {l.label}
            </button>
          </li>
        ))}
      </ul>
      <div className="topnav__right">
        {(status === "refreshing" || status === "loading") && (
          <span className="topnav__sync" title="Updating catalogue">
            <RefreshCw size={16} className="spin" />
          </span>
        )}
        <div className={cx("search-box", expanded && "is-open")}>
          <button
            className="icon-btn"
            aria-label="Search"
            onClick={() => {
              setSearchOpen(true);
              requestAnimationFrame(() => input.current?.focus());
            }}
          >
            <Search size={20} />
          </button>
          <input
            ref={input}
            value={query}
            placeholder="Channels, films, series…"
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => !query && setSearchOpen(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearch("");
                setSearchOpen(false);
                input.current?.blur();
                if (view.name === "search") navigate({ name: "home" });
              }
            }}
          />
          {query && (
            <button
              className="icon-btn"
              aria-label="Clear search"
              onClick={() => {
                setSearch("");
                navigate({ name: "home" });
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="profile" onMouseLeave={() => setMenu(false)}>
          <button className="profile__btn" onClick={() => setMenu((m) => !m)}>
            <span className="avatar">{(active?.name ?? "?").slice(0, 1).toUpperCase()}</span>
            <ChevronDown size={14} className={cx("chev", menu && "up")} />
          </button>
          {menu && (
            <div className="profile__menu">
              <div className="profile__label">Playlists</div>
              {sources.map((s) => (
                <button
                  key={s.id}
                  className={cx("profile__item", s.id === activeId && "is-active")}
                  onClick={() => {
                    setMenu(false);
                    if (s.id !== activeId) activate(s.id);
                  }}
                >
                  <span className="avatar sm">{s.name.slice(0, 1).toUpperCase()}</span>
                  {s.name}
                </button>
              ))}
              <hr />
              <button
                className="profile__item"
                onClick={() => {
                  setMenu(false);
                  navigate({ name: "settings" });
                }}
              >
                <Settings size={16} /> Settings & playlists
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
