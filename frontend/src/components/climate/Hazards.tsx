import { AlertTriangle, CloudRain, Info, Siren, Sun, Waves } from 'lucide-react';
import type { AlertLevel, ClimateAlert, Hazard, HazardScore, RiskLevel } from '../../types/climate';

export const HAZARD_META: Record<Hazard, { label: string; tagline: string; color: string; tint: string; Icon: typeof CloudRain }> = {
  flood: { label: 'Flood', tagline: 'Too much water', color: '#0676c8', tint: '#e6f2fa', Icon: CloudRain },
  drought: { label: 'Scarcity', tagline: 'Too little water', color: '#b45309', tint: '#fef3c7', Icon: Waves },
  heat: { label: 'Heat', tagline: 'The heat in between', color: '#dc2626', tint: '#fee2e2', Icon: Sun },
};

const LEVEL_STYLE: Record<RiskLevel, { bg: string; fg: string }> = {
  low: { bg: '#dcfce7', fg: '#166534' },
  moderate: { bg: '#fef9c3', fg: '#854d0e' },
  high: { bg: '#ffedd5', fg: '#9a3412' },
  severe: { bg: '#fee2e2', fg: '#991b1b' },
};

export function LevelChip({ level }: { level: RiskLevel }) {
  const s = LEVEL_STYLE[level];
  return (
    <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize" style={{ backgroundColor: s.bg, color: s.fg }}>
      {level}
    </span>
  );
}

/** Semi-circular gauge, 0-100. */
export function Gauge({ score, color }: { score: number; color: string }) {
  const radius = 52;
  const length = Math.PI * radius;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * length;
  const arc = `M8 62 A${radius} ${radius} 0 0 1 112 62`;
  return (
    <svg viewBox="0 0 120 72" className="mx-auto w-40" role="img" aria-label={`Risk score ${Math.round(score)} out of 100`}>
      <path d={arc} fill="none" stroke="#e5e7eb" strokeWidth="10" strokeLinecap="round" />
      <path
        d={arc}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${length}`}
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
      <text x="60" y="58" textAnchor="middle" fontSize="24" fontWeight="700" fill="#111827">
        {Math.round(score)}
      </text>
    </svg>
  );
}

export function HazardCard({ hazard, data, highlighted = false }: { hazard: Hazard; data: HazardScore; highlighted?: boolean }) {
  const meta = HAZARD_META[hazard];
  const estimate = data.basis === 'climatological_estimate';
  return (
    <div
      className="rounded-2xl bg-white p-5 shadow-sm ring-1 transition-shadow hover:shadow-md"
      style={{ borderTop: `4px solid ${meta.color}`, ...(highlighted ? { boxShadow: `0 0 0 2px ${meta.color}33` } : {}) }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: meta.tint }}>
            <meta.Icon className="h-5 w-5" style={{ color: meta.color }} />
          </span>
          <div>
            <p className="font-bold text-gray-900">{meta.label}</p>
            <p className="text-xs text-gray-500">{meta.tagline}</p>
          </div>
        </div>
        <LevelChip level={data.level} />
      </div>
      <Gauge score={data.score} color={meta.color} />
      <ul className="mt-1 space-y-1 text-xs text-gray-600">
        {data.drivers.map((d) => (
          <li key={d}>- {d}</li>
        ))}
      </ul>
      {data.live_adjustment ? (
        <p className="mt-2 text-xs font-medium" style={{ color: meta.color }}>
          +{data.live_adjustment.toFixed(0)} from the live forecast
        </p>
      ) : null}
      {estimate && <p className="mt-2 text-[11px] italic text-gray-400">Estimate from climate and latitude; live forecast unavailable</p>}
    </div>
  );
}

const ALERT_STYLE: Record<AlertLevel, { bg: string; border: string; Icon: typeof Info; label: string }> = {
  info: { bg: '#f1f5f9', border: '#94a3b8', Icon: Info, label: 'Info' },
  watch: { bg: '#fef9c3', border: '#eab308', Icon: Info, label: 'Watch' },
  warning: { bg: '#ffedd5', border: '#f97316', Icon: AlertTriangle, label: 'Warning' },
  critical: { bg: '#fee2e2', border: '#dc2626', Icon: Siren, label: 'Critical' },
};

export function AlertList({ alerts, empty }: { alerts: ClimateAlert[]; empty: string }) {
  if (alerts.length === 0) {
    return <p className="rounded-xl bg-green-50 p-4 text-sm text-green-800">{empty}</p>;
  }
  return (
    <ul className="space-y-3">
      {alerts.map((a, i) => {
        const s = ALERT_STYLE[a.level];
        const meta = HAZARD_META[a.type];
        return (
          <li key={`${a.title}-${i}`} className="rounded-xl p-4" style={{ backgroundColor: s.bg, borderLeft: `4px solid ${s.border}` }}>
            <div className="flex flex-wrap items-center gap-2">
              <s.Icon className="h-4 w-4" style={{ color: s.border }} />
              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: s.border }}>
                {s.label}
              </span>
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs text-gray-700">{meta.label}</span>
              {a.source && a.source !== 'live' && <span className="text-xs text-gray-500">{a.source.startsWith('community') ? 'community leader' : a.source}</span>}
            </div>
            <p className="mt-1 font-semibold text-gray-900">{a.title}</p>
            {a.detail && <p className="text-sm text-gray-700">{a.detail}</p>}
            {a.action && <p className="mt-1 text-sm text-gray-800"><span className="font-semibold">What to do: </span>{a.action}</p>}
          </li>
        );
      })}
    </ul>
  );
}

export function SeasonBanner({ focus, label }: { focus: Hazard; label: string }) {
  const meta = HAZARD_META[focus];
  return (
    <div className="flex items-center gap-3 rounded-2xl px-5 py-4 text-white" style={{ background: `linear-gradient(135deg, ${meta.color}, ${meta.color}cc)` }}>
      <meta.Icon className="h-8 w-8 flex-shrink-0 opacity-90" />
      <div>
        <p className="text-xs uppercase tracking-wider opacity-80">Right now</p>
        <p className="text-lg font-bold">{label}</p>
      </div>
    </div>
  );
}
