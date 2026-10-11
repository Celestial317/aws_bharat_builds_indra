import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Droplets, Loader2, Plus, Trash2, WifiOff } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { api, errorMessage } from '../../lib/api';
import type { Tank, TankState } from '../../types/climate';

const POLL_MS = 10_000;

const STATE_STYLE: Record<TankState, { label: string; bg: string; fg: string; Icon: typeof Droplets }> = {
  ok: { label: 'Healthy', bg: '#dcfce7', fg: '#166534', Icon: CheckCircle2 },
  low: { label: 'Running low', bg: '#fef3c7', fg: '#92400e', Icon: AlertTriangle },
  overflow_risk: { label: 'Overflow risk', bg: '#dbeafe', fg: '#1e40af', Icon: AlertTriangle },
  offline: { label: 'Sensor offline', bg: '#f1f5f9', fg: '#475569', Icon: WifiOff },
  no_data: { label: 'Waiting for data', bg: '#f1f5f9', fg: '#475569', Icon: Droplets },
};

function StateChip({ state }: { state: TankState }) {
  const s = STATE_STYLE[state];
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: s.bg, color: s.fg }}>
      <s.Icon className="h-3 w-3" /> {s.label}
    </span>
  );
}

/** A tank drawn with its current fill. */
function TankGraphic({ pct, state }: { pct: number; state: TankState }) {
  const fill = state === 'overflow_risk' ? '#2563eb' : state === 'low' ? '#d97706' : '#0891b2';
  const h = 120 * Math.max(0, Math.min(100, pct)) / 100;
  return (
    <svg viewBox="0 0 100 150" className="h-44" role="img" aria-label={`Tank ${Math.round(pct)} percent full`}>
      <rect x="15" y="15" width="70" height="120" rx="10" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="3" />
      <rect x="18" y={135 - h} width="64" height={h} rx="7" fill={fill} opacity="0.85" style={{ transition: 'all 0.8s ease' }} />
      <text x="50" y="82" textAnchor="middle" fontSize="20" fontWeight="700" fill={pct > 55 ? '#fff' : '#0f172a'}>
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

const hours = (h?: number | null) => (h == null ? '-' : h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`);

function TankDetail({ tank, onDelete, canDelete }: { tank: Tank; onDelete: () => void; canDelete: boolean }) {
  const history = (tank.history ?? []).map((p) => ({
    time: new Date(p.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    litres: p.levelLiters,
  }));
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{tank.name}</h3>
          <p className="text-xs text-gray-500">{tank.capacityLiters.toLocaleString('en-IN')} L capacity{tank.shared ? ' - shared with the community' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <StateChip state={tank.state} />
          {canDelete && (
            <button type="button" onClick={onDelete} aria-label={`Delete ${tank.name}`} className="text-gray-400 hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 grid items-center gap-4 sm:grid-cols-[auto_1fr]">
        <div className="mx-auto"><TankGraphic pct={tank.fillPct ?? 0} state={tank.state} /></div>
        <div>
          <p className="text-sm text-gray-700">{tank.message}</p>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-gray-50 p-2">
              <dt className="text-[11px] text-gray-500">Now</dt>
              <dd className="font-bold text-gray-900">{tank.latest ? `${Math.round(tank.latest.levelLiters).toLocaleString('en-IN')} L` : '-'}</dd>
            </div>
            <div className="rounded-lg bg-gray-50 p-2">
              <dt className="text-[11px] text-gray-500">Empty in</dt>
              <dd className="font-bold text-amber-700">{hours(tank.hoursToEmpty)}</dd>
            </div>
            <div className="rounded-lg bg-gray-50 p-2">
              <dt className="text-[11px] text-gray-500">Full in</dt>
              <dd className="font-bold text-blue-700">{hours(tank.hoursToFull)}</dd>
            </div>
          </dl>
          {tank.trendLitersPerHour != null && (
            <p className="mt-2 text-xs text-gray-500">Trend: {tank.trendLitersPerHour > 0 ? '+' : ''}{tank.trendLitersPerHour} L/h over the last 3 hours</p>
          )}
        </div>
      </div>

      {history.length > 1 && (
        <div className="mt-4 h-56 w-full">
          <ResponsiveContainer>
            <AreaChart data={history} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={32} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, tank.capacityLiters]} unit=" L" />
              <Tooltip formatter={(v) => [`${Math.round(Number(v))} L`, 'Level']} />
              <ReferenceLine y={tank.capacityLiters * 0.9} stroke="#2563eb" strokeDasharray="4 4" label={{ value: 'overflow zone', fontSize: 10, fill: '#2563eb', position: 'insideTopRight' }} />
              <ReferenceLine y={tank.capacityLiters * 0.15} stroke="#d97706" strokeDasharray="4 4" label={{ value: 'low', fontSize: 10, fill: '#d97706', position: 'insideBottomRight' }} />
              <Area type="monotone" dataKey="litres" stroke="#0891b2" fill="#06b6d4" fillOpacity={0.3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function TankMonitorPage() {
  const { colors } = useTheme();
  const { user, loading: authLoading } = useAuth();
  const [view, setView] = useState<'mine' | 'shared'>('mine');
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Tank | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('Terrace tank');
  const [capacity, setCapacity] = useState(1000);
  const [shared, setShared] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<Tank | null>(null);

  const loadList = useCallback(async () => {
    if (!user) return;
    try {
      const r = await api<{ tanks: Tank[] }>(view === 'mine' ? '/api/tanks' : '/api/tanks/shared', { auth: true });
      setTanks(r.tanks);
      setError(null);
      setSelectedId((cur) => (cur && r.tanks.some((t) => t.id === cur) ? cur : r.tanks[0]?.id ?? null));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [user, view]);

  useEffect(() => {
    setLoading(true);
    void loadList();
    const id = window.setInterval(() => void loadList(), POLL_MS);
    return () => window.clearInterval(id);
  }, [loadList]);

  useEffect(() => {
    if (!selectedId || !user) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    const fetchDetail = () =>
      api<Tank>(`/api/tanks/${selectedId}`, { auth: true })
        .then((t) => !cancelled && setDetail(t))
        .catch((err: unknown) => !cancelled && setError(errorMessage(err)));
    void fetchDetail();
    const id = window.setInterval(fetchDetail, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [selectedId, user]);

  const createTank = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const t = await api<Tank>('/api/tanks', { method: 'POST', auth: true, body: { name: name.trim(), capacity_liters: capacity, shared } });
      setCreated(t);
      setView('mine');
      await loadList();
      setSelectedId(t.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const deleteTank = async (id: string) => {
    if (!window.confirm('Delete this tank and its history?')) return;
    try {
      await api(`/api/tanks/${id}`, { method: 'DELETE', auth: true });
      setCreated(null);
      setSelectedId(null);
      await loadList();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (authLoading) return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Tank monitor</h1>
        <p className="mt-2 text-gray-600">Log in to register a tank and watch its level through the monsoon and the summer.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16" style={{ backgroundColor: colors.background }}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900">Tank monitor</h1>
        <p className="mt-1 text-gray-600">Hours until your tank overflows in a cloudburst - or runs dry in a heatwave.</p>

        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}

        <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-4">
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <div className="mb-3 flex rounded-lg bg-gray-100 p-0.5 text-sm">
                {(['mine', 'shared'] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setView(v)} className={`flex-1 rounded-md px-3 py-1.5 font-medium ${view === v ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600'}`}>
                    {v === 'mine' ? 'My tanks' : 'Shared nearby'}
                  </button>
                ))}
              </div>
              {loading ? (
                <div className="py-6 text-center text-sm text-gray-500"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>
              ) : tanks.length === 0 ? (
                <p className="py-4 text-sm text-gray-500">{view === 'mine' ? 'No tanks yet. Register one below.' : 'Nobody has shared a tank yet.'}</p>
              ) : (
                <ul className="space-y-2">
                  {tanks.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(t.id)}
                        className={`w-full rounded-xl p-3 text-left ring-1 ${selectedId === t.id ? 'bg-blue-50 ring-blue-300' : 'bg-white ring-gray-200 hover:bg-gray-50'}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900">{t.name}</span>
                          <StateChip state={t.state} />
                        </div>
                        <p className="mt-1 text-xs text-gray-500">{t.fillPct != null ? `${Math.round(t.fillPct)}% of ${t.capacityLiters.toLocaleString('en-IN')} L` : `${t.capacityLiters.toLocaleString('en-IN')} L`}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <form onSubmit={createTank} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <h2 className="flex items-center gap-2 font-bold text-gray-900"><Plus className="h-4 w-4" /> Register a tank</h2>
              <label className="block text-xs text-gray-600">Name
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="block text-xs text-gray-600">Capacity (litres)
                <input type="number" min={1} max={10000000} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Share the level with neighbours
              </label>
              <button type="submit" disabled={creating || !name.trim() || capacity <= 0} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-40">
                {creating ? 'Registering...' : 'Register tank'}
              </button>
            </form>
          </aside>

          <main className="space-y-4">
            {created?.deviceKey && (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm">
                <p className="font-semibold text-amber-900">Save this device key now - it is shown only once.</p>
                <p className="mt-1 break-all rounded bg-white p-2 font-mono text-xs">{created.deviceKey}</p>
                <p className="mt-2 text-amber-900">Your sensor posts readings like this (or run the simulator):</p>
                <pre className="mt-1 overflow-x-auto rounded bg-gray-900 p-3 text-xs text-gray-100">{`curl -X POST http://localhost:8090/v1/tanks/${created.id}/readings \\
  -H "X-Device-Key: ${created.deviceKey}" -H "Content-Type: application/json" \\
  -d '{"levelLiters": 640}'

python scripts/simulate_tank.py --tank-id ${created.id} --device-key ${created.deviceKey} --scenario both`}</pre>
                <button type="button" onClick={() => setCreated(null)} className="mt-2 text-xs underline">I have saved it</button>
              </div>
            )}
            {detail ? (
              <TankDetail tank={detail} canDelete={detail.ownerId === user.uid} onDelete={() => void deleteTank(detail.id)} />
            ) : (
              !loading && <p className="rounded-2xl bg-white p-8 text-center text-gray-500 shadow-sm">Select or register a tank to see its level.</p>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
