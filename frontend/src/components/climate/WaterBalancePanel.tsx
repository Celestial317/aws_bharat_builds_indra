import { Droplets, Home, Thermometer, Truck, Waves } from 'lucide-react';
import type { WaterBalance } from '../../types/climate';

export interface HouseholdInput {
  roof: number;
  members: number;
  material: string;
}

const MATERIALS = ['RCC', 'Tiles', 'Metal', 'Asbestos'];
const TANKER_L = 10_000;
const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400';

function Stat({ icon: Icon, label, value, note, color }: { icon: typeof Droplets; label: string; value: string; note?: string; color: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <Icon className="mb-2 h-5 w-5" style={{ color }} />
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
      {note && <p className="mt-1 text-xs text-gray-500">{note}</p>}
    </div>
  );
}

const litres = (n: number) => `${Math.round(n).toLocaleString('en-IN')} L`;

export function WaterBalancePanel({ household, onChange, balance }: { household: HouseholdInput; onChange: (h: HouseholdInput) => void; balance?: WaterBalance }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
      <h3 className="flex items-center gap-2 font-bold text-gray-900">
        <Home className="h-5 w-5 text-blue-600" /> What your roof can do about it
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-gray-600">
          Roof area (sq m)
          <input
            className={inputClass}
            type="number"
            min={1}
            max={100000}
            value={household.roof}
            onChange={(e) => onChange({ ...household, roof: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
        <label className="text-xs text-gray-600">
          People at home
          <input
            className={inputClass}
            type="number"
            min={1}
            max={200}
            value={household.members}
            onChange={(e) => onChange({ ...household, members: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
        <label className="text-xs text-gray-600">
          Roof material
          <select className={inputClass} value={household.material} onChange={(e) => onChange({ ...household, material: e.target.value })}>
            {MATERIALS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      </div>

      {balance && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              icon={Truck}
              label="Kept off the street each monsoon"
              value={litres(balance.kept_off_the_street_l)}
              note={`about ${(balance.kept_off_the_street_l / TANKER_L).toFixed(1)} tanker loads`}
              color="#0676c8"
            />
            <Stat
              icon={Waves}
              label="Roof runoff in a 50 mm hour"
              value={litres(balance.first_hour_storm_runoff_l)}
              note={balance.recharge_pit_recommended ? 'route overflow to a recharge pit' : 'a small overflow channel is enough'}
              color="#0891b2"
            />
            <Stat
              icon={Droplets}
              label="Tank to survive the dry spell"
              value={litres(balance.recommended_tank_l)}
              note={`${balance.self_sufficiency_days} days of water in a year; dry spell ~${balance.assumptions.dry_spell_days_estimated} days`}
              color="#b45309"
            />
            <Stat
              icon={Thermometer}
              label="Daily need on a hot day"
              value={litres(balance.hot_day_demand_l)}
              note={`normal day ${litres(balance.household_daily_demand_l)}`}
              color="#dc2626"
            />
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Harvest = roof area x rainfall x {balance.assumptions.runoff_coefficient} runoff. Demand uses {balance.assumptions.litres_per_person_per_day} L per person per day. The
            dry-spell length is a sizing estimate from annual rainfall, not a measurement.
          </p>
        </>
      )}
    </div>
  );
}
