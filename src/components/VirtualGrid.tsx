import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

interface Props<T> {
  items: T[];
  minColWidth: number;
  /** height = colWidth * aspect + extra */
  aspect: number;
  extra?: number;
  gap?: number;
  render(item: T): ReactNode;
  getKey(item: T): string;
}

/** Window-scrolling virtualised grid – smooth with 50k+ items. */
export function VirtualGrid<T>({ items, minColWidth, aspect, extra = 0, gap = 14, render, getKey }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);
  const [offset, setOffset] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => {
      setWidth(el.clientWidth);
      setOffset(el.getBoundingClientRect().top + window.scrollY);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cols = Math.max(1, Math.floor((width + gap) / (minColWidth + gap)));
  const colWidth = (width - gap * (cols - 1)) / cols;
  const rowHeight = colWidth * aspect + extra + gap;
  const rows = Math.ceil(items.length / cols);

  const v = useWindowVirtualizer({
    count: rows,
    estimateSize: () => rowHeight,
    overscan: 3,
    scrollMargin: offset,
  });

  useLayoutEffect(() => {
    v.measure();
  }, [rowHeight, v]);

  return (
    <div ref={ref} className="vgrid" style={{ height: v.getTotalSize() }}>
      {v.getVirtualItems().map((row) => (
        <div
          key={row.key}
          className="vgrid__row"
          style={{
            transform: `translateY(${row.start - v.options.scrollMargin}px)`,
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gap,
            height: rowHeight - gap,
          }}
        >
          {items.slice(row.index * cols, row.index * cols + cols).map((it) => (
            <div key={getKey(it)} className="vgrid__cell">
              {render(it)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
