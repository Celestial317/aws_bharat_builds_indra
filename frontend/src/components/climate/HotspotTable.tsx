import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { Hotspot } from '../../types/climate';

type Key = 'swing_index' | 'flood' | 'drought' | 'heat';

const TABS: Array<{ key: Key; hazard: string; label: string; color: string; hint: string }> = [
  { key: 'swing_index', hazard: 'swing', label: 'Flood-and-famine swing', color: '#7c3aed', hint: 'Districts that get both monsoon flooding and dry-season scarcity' },
  { key: 'flood', hazard: 'flood', label: 'Flood', color: '#0676c8', hint: 'Heaviest rainy seasons' },
  { key: 'drought', hazard: 'drought', label: 'Scarcity', color: '#b45309', hint: 'Low rain and stressed groundwater' },
  { key: 'heat', hazard: 'heat', label: 'Heat', color: '#dc2626', hint: 'Hottest typical pre-monsoon peaks (estimate)' },
];

export function HotspotTable({ onSelect }: { onSelect: (district: string, state: string) => void }) {
  const [tab, setTab] = useState<Key>('swing_index');
  const [rows, setRows] = useState<Hotspot[] | null>(null);
  const [failed, setFailed] = useState(false);
  const active = TABS.find((t) => t.key === tab) ?? TABS[0];

  useEffect(() => {
    const controller = new AbortController();
    setRows(null);
    setFailed(false);
    api<{ districts: Hotspot[] }>('/api/climate/hotspots', { query: { hazard: active.hazard, limit: 8 }, signal: controller.signal })
      .then((r) => setRows(r.districts))
      .catch((err: unknown) => {
        if (!(err instanceof DOMException)) setFailed(true);
      });
    return () => controller.abort();
  }, [active.hazard]);

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
      <h3 className="font-bold text-gray-900">Where India is hit hardest</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${tab === t.key ? 'text-white' : 'bg-gray-100 text-gray-700'}`}
            style={tab === t.key ? { backgroundColor: t.color } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500">{active.hint}. Click a district to open it.</p>
      <div className="mt-3 space-y-1.5">
        {failed && <p className="text-sm text-gray-500">Could not load rankings.</p>}
        {!rows && !failed && [...Array(5)].map((_, i) => <div key={i} className="h-8 animate-pulse rounded bg-gray-100" />)}
        {rows?.map((r) => (
          <button
            key={`${r.state}-${r.district}`}
            type="button"
            onClick={() => onSelect(r.district, r.state)}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-gray-50"
          >
            <span className="w-40 truncate font-medium text-gray-800">{r.district}</span>
            <span className="hidden w-32 truncate text-xs text-gray-500 sm:block">{r.state}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
              <span className="block h-full rounded-full" style={{ width: `${r[tab]}%`, backgroundColor: active.color }} />
            </span>
            <span className="w-8 text-right text-xs font-semibold text-gray-700">{Math.round(r[tab])}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
