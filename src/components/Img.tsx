import { memo, useState, type ReactNode } from "react";
import { inTauri, proxied } from "../lib/native";
import { cx } from "../lib/util";

interface Props {
  src?: string;
  alt?: string;
  className?: string;
  fallback?: ReactNode;
  eager?: boolean;
}

/** Lazy image with fade-in; retries through the proxy, then shows a fallback. */
export const Img = memo(function Img({ src, alt = "", className, fallback, eager }: Props) {
  const [state, setState] = useState({ src, stage: 0, loaded: false });
  // Reset synchronously when the source changes (avoids racing the load event).
  if (state.src !== src) setState({ src, stage: 0, loaded: false });

  if (!src || state.stage > 1) {
    return <>{fallback ?? <div className={cx("img-fallback", className)} aria-hidden />}</>;
  }
  const markLoaded = () => setState((s) => (s.src === src && !s.loaded ? { ...s, loaded: true } : s));
  return (
    <img
      ref={(el) => {
        if (el?.complete && el.naturalWidth > 0) markLoaded();
      }}
      src={state.stage === 0 ? src : proxied(src)}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      className={cx("img", state.loaded && "is-loaded", className)}
      onLoad={markLoaded}
      onError={() =>
        setState((s) => (s.src !== src ? s : { ...s, stage: s.stage === 0 && inTauri && /^https?:/.test(src) ? 1 : 2 }))
      }
    />
  );
});
