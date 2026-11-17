import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { DetailsModal } from "./components/DetailsModal";
import { PlayerHost } from "./components/player/Player";
import { Spinner } from "./components/Spinner";
import { Toast } from "./components/Toast";
import { TopNav } from "./components/TopNav";
import { Browse } from "./pages/Browse";
import { Home } from "./pages/Home";
import { Live } from "./pages/Live";
import { MyList } from "./pages/MyList";
import { Onboarding } from "./pages/Onboarding";
import { SearchPage } from "./pages/Search";
import { Settings } from "./pages/Settings";
import { useApp } from "./store/app";

export default function App() {
  const hasSource = useApp((s) => !!s.activeSourceId && s.sources.some((x) => x.id === s.activeSourceId));
  const status = useApp((s) => s.status);
  const catalog = useApp((s) => s.catalog);
  const view = useApp((s) => s.view);
  const playerOpen = useApp((s) => !!s.player);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);

  if (!hasSource) {
    return (
      <>
        <Onboarding />
        <Toast />
      </>
    );
  }

  let body: React.ReactNode;
  if (!catalog) body = status === "error" ? <LoadError /> : <Loading />;
  else if (view.name === "settings") body = <Settings />;
  else if (view.name === "home") body = <Home />;
  else if (view.name === "live") body = <Live categoryId={view.categoryId} />;
  else if (view.name === "movies") body = <Browse key="movie" type="movie" categoryId={view.categoryId} />;
  else if (view.name === "series") body = <Browse key="series" type="series" categoryId={view.categoryId} />;
  else if (view.name === "search") body = <SearchPage />;
  else body = <MyList />;

  return (
    <div className={playerOpen ? "app is-playing" : "app"}>
      <TopNav />
      <main className="page-host" key={view.name === "settings" || !catalog ? view.name : JSON.stringify(view)}>
        {view.name === "settings" ? <Settings /> : body}
      </main>
      <DetailsModal />
      <PlayerHost />
      <Toast />
    </div>
  );
}

function Loading() {
  const progress = useApp((s) => s.progress);
  return (
    <div className="fullscreen-center">
      <Spinner size={56} />
      <p className="muted">{progress ?? "Loading…"}</p>
    </div>
  );
}

function LoadError() {
  const error = useApp((s) => s.error);
  const retry = useApp((s) => s.loadCatalog);
  const navigate = useApp((s) => s.navigate);
  return (
    <div className="fullscreen-center">
      <AlertTriangle size={48} className="accent" />
      <h2>Couldn't load your playlist</h2>
      <p className="muted">{error}</p>
      <div className="row-gap">
        <button className="btn btn--primary" onClick={() => retry(true)}>
          Try again
        </button>
        <button className="btn btn--ghost" onClick={() => navigate({ name: "settings" })}>
          Playlists
        </button>
      </div>
    </div>
  );
}
