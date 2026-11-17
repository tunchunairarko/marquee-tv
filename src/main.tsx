import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initNative } from "./lib/native";
import { bootstrap } from "./store/app";
import "./styles/global.css";

// Disable the default webview context menu & browser-ish shortcuts in production.
if (import.meta.env.PROD) {
  window.addEventListener("contextmenu", (e) => {
    if (!(e.target as HTMLElement).closest("input, textarea")) e.preventDefault();
  });
}

initNative()
  .catch((e) => console.error("native init failed", e))
  .then(() => {
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    return bootstrap();
  });
