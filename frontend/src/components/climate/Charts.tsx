import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ClimateReport } from '../../types/climate';

function shortDay(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
}

/** Seven-day rain (bars) and peak temperature (line) from the live forecast. */
export function ForecastChart({ forecast }: { forecast: NonNullable<ClimateReport['forecast']> }) {
  const data = forecast.days.map((d) => ({ day: shortDay(d.date), rain: d.precip_mm, temp: d.tmax_c }));
  return (
    <div>
      <div className="h-64 w-full">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="day" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="rain" tick={{ fontSize: 12 }} unit=" mm" />
            <YAxis yAxisId="temp" orientation="right" tick={{ fontSize: 12 }} unit="°" domain={['dataMin - 3', 'dataMax + 3']} />
            <Tooltip />
            <Legend />
            <Bar yAxisId="rain" dataKey="rain" name="Rain (mm)" fill="#0676c8" radius={[4, 4, 0, 0]} />
            <Line yAxisId="temp" type="monotone" dataKey="temp" name="Peak temp (°C)" stroke="#dc2626" strokeWidth={2} dot />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Source: {forecast.source}. {forecast.total_precip_mm} mm expected over {forecast.days.length} days; {forecast.rain_free_days} rain-free.
      </p>
    </div>
  );
}

/** How the year's rain is split - the shape of the flood/scarcity swing. The wettest season is highlighted. */
export function RainfallChart({ rainfall }: { rainfall: ClimateReport['rainfall_mm'] }) {
  const data = [
    { season: 'Winter (Jan-Feb)', mm: rainfall.winter },
    { season: 'Pre-monsoon (Mar-May)', mm: rainfall.summer },
    { season: 'Monsoon (Jun-Sep)', mm: rainfall.monsoon },
    { season: 'Post-monsoon (Oct-Dec)', mm: rainfall.post_monsoon },
  ];
  const peak = Math.max(...data.map((d) => d.mm));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="season" tick={{ fontSize: 11 }} interval={0} tickFormatter={(v: string) => v.split(' (')[0]} />
          <YAxis tick={{ fontSize: 12 }} unit=" mm" />
          <Tooltip formatter={(v) => [`${Math.round(Number(v))} mm`, 'Rain']} />
          <Bar dataKey="mm" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.season} fill={d.mm === peak ? '#0676c8' : '#93c5fd'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
