import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../lib/util";

interface Props {
  title: string;
  onTitleClick?: () => void;
  variant?: "poster" | "wide" | "channel";
  children: ReactNode;
  count?: number;
}

/** Netflix-style horizontal carousel. Mounts its content lazily when near the viewport. */
export function Row({ title, onTitleClick, variant = "poster", children, count }: Props) {
  const host = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [edges, setEdges] = useState({ start: true, end: false });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const update = () => {
    const t = track.current;
    if (!t) return;
    setEdges({ start: t.scrollLeft < 8, end: t.scrollLeft + t.clientWidth >= t.scrollWidth - 8 });
  };

  useEffect(update, [visible]);

  const scroll = (dir: 1 | -1) => {
    const t = track.current;
    if (t) t.scrollBy({ left: dir * t.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <section ref={host} className={cx("row", `row--${variant}`)}>
      <header className="row__head">
        <h2 className={cx(onTitleClick && "is-link")} onClick={onTitleClick}>
          {title}
          {onTitleClick && (
            <span className="row__explore">
              Explore all{count ? ` ${count.toLocaleString()}` : ""} <ChevronRight size={14} />
            </span>
          )}
        </h2>
      </header>
      <div className="row__viewport">
        {!edges.start && (
          <button className="row__arrow left" onClick={() => scroll(-1)} aria-label="Scroll left">
            <ChevronLeft size={34} />
          </button>
        )}
        <div className="row__track" ref={track} onScroll={update}>
          {visible ? children : <div className="row__placeholder" />}
        </div>
        {!edges.end && visible && (
          <button className="row__arrow right" onClick={() => scroll(1)} aria-label="Scroll right">
            <ChevronRight size={34} />
          </button>
        )}
      </div>
    </section>
  );
}
