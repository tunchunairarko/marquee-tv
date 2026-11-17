import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { CategoryWithCount } from "../store/catalog";
import { cx, normalize } from "../lib/util";

interface Special {
  id: string;
  name: string;
  count?: number;
  icon?: React.ReactNode;
}

interface Props {
  categories: CategoryWithCount[];
  specials?: Special[];
  active?: string;
  onSelect(id: string | undefined): void;
}

export function CategoryRail({ categories, specials = [], active, onSelect }: Props) {
  const [filter, setFilter] = useState("");
  const shown = useMemo(() => {
    const f = normalize(filter);
    return f ? categories.filter((c) => normalize(c.name).includes(f)) : categories;
  }, [categories, filter]);

  return (
    <aside className="rail">
      {categories.length > 12 && (
        <label className="rail__filter">
          <Search size={14} />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter categories" />
        </label>
      )}
      <div className="rail__list">
        {specials.map((s) => (
          <button key={s.id} className={cx("rail__item special", active === s.id && "is-active")} onClick={() => onSelect(s.id)}>
            {s.icon}
            <span className="rail__name">{s.name}</span>
            {s.count !== undefined && <span className="rail__count">{s.count.toLocaleString()}</span>}
          </button>
        ))}
        {specials.length > 0 && <div className="rail__sep" />}
        {shown.map((c) => (
          <button key={c.id} className={cx("rail__item", active === c.id && "is-active")} onClick={() => onSelect(c.id)} title={c.name}>
            <span className="rail__name">{c.name}</span>
            <span className="rail__count">{c.count.toLocaleString()}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
