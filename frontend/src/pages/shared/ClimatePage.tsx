import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ExternalLink, Gauge as GaugeIcon, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { api, errorMessage } from '../../lib/api';
import type { ClimateAlert, ClimateReport, FeedResponse, Hazard } from '../../types/climate';
import { AlertList, HazardCard, SeasonBanner } from '../../components/climate/Hazards';
import { ForecastChart, RainfallChart } from '../../components/climate/Charts';
import { HotspotTable } from '../../components/climate/HotspotTable';
import { LocationPicker, Place } from '../../components/climate/LocationPicker';
import { SubscribeCard } from '../../components/climate/SubscribeCard';
import { HouseholdInput, WaterBalancePanel } from '../../components/climate/WaterBalancePanel';

const PLACE_KEY = 'indra.climate.place';
const DEFAULT_PLACE: Place = { state: 'Maharashtra', district: 'Pune' };

function hasStoredPlace(): boolean {
  try {
    return window.localStorage.getItem(PLACE_KEY) !== null;
  } catch {
    return false;
  }
}

function loadPlace(): Place {
  try {
    const raw = window.localStorage.getItem(PLACE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Place;
      if (parsed.pincode || parsed.district) return parsed;
    }
  } catch {
    // storage blocked or corrupt: fall back to the default
  }
  return DEFAULT_PLACE;
}

const HAZARD_ORDER: Hazard[] = ['flood', 'drought', 'heat'];

export function ClimatePage() {
  const { colors } = useTheme();
  const { userProfile } = useAuth();

  const [place, setPlace] = useState<Place>(loadPlace);
  const [report, setReport] = useState<ClimateReport | null>(null);
  const [stored, setStored] = useState<ClimateAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [household, setHousehold] = useState<HouseholdInput>({ roof: 100, members: 4, material: 'RCC' });
  const [reloadTick, setReloadTick] = useState(0);

  // Start from the signed-in user's own profile, once.
  useEffect(() => {
    if (!userProfile) return;
    setHousehold((h) => ({
      roof: userProfile.catchment_area > 0 ? Math.round(userProfile.catchment_area) : h.roof,
      members: userProfile.n_members || h.members,
      material: ['RCC', 'Tiles', 'Metal', 'Asbestos'].includes(userProfile.roof_material) ? userProfile.roof_material : h.material,
    }));
    if (!hasStoredPlace()) {
      if (/^\d{6}$/.test(userProfile.pincode ?? '')) setPlace({ pincode: userProfile.pincode });
      else if (userProfile.district) setPlace({ state: userProfile.state, district: userProfile.district });
    }
  }, [userProfile]);

  const choosePlace = useCallback((next: Place) => {
    setPlace(next);
    try {
      window.localStorage.setItem(PLACE_KEY, JSON.stringify(next));
    } catch {
      // not persisted; still works for this visit
    }
  }, []);

  // One request per place/household change; stale responses are cancelled.
  useEffect(() => {
    if (!place.pincode && !place.district) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api<ClimateReport>('/api/climate/risk', {
          signal: controller.signal,
          query: {
            pincode: place.pincode,
            district: place.pincode ? undefined : place.district,
            state: place.pincode ? undefined : place.state,
            roof_area_sqm: household.roof,
            members: household.members,
            roof_material: household.material,
          },
        });
        setReport(data);
        api<FeedResponse>('/api/alerts/feed', {
          signal: controller.signal,
          query: { district: data.location.district, state: data.location.state },
        })
          .then((feed) => setStored(feed.stored))
          .catch(() => setStored([]));
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setError(errorMessage(err));
          setReport(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350); // debounce roof/people typing
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [place, household, reloadTick]);

  const alerts = useMemo(() => (report ? [...stored, ...report.alerts] : []), [report, stored]);
  const title = report ? `${report.location.district}, ${report.location.state}` : 'Pick a place';

  return (
    <div className="min-h-screen pb-16" style={{ backgroundColor: colors.background }}>
      <section className="px-4 py-10 text-white" style={{ background: 'linear-gradient(135deg, #0b3d6b 0%, #0676c8 55%, #b45309 120%)' }}>
        <div className="mx-auto max-w-6xl">
          <p className="flex items-center gap-2 text-sm uppercase tracking-widest text-white/70">
            <GaugeIcon className="h-4 w-4" /> Climate risk
          </p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Too much water. Too little. And the heat in between.</h1>
          <p className="mt-3 max-w-2xl text-white/80">
            The monsoon floods the street and the summer dries the tap - often in the same place. See both, and what your roof can do about it.
          </p>
        </div>
      </section>

      <div className="mx-auto -mt-6 max-w-6xl space-y-6 px-4">
        <LocationPicker value={place} onChange={choosePlace} />

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-semibold">Could not load the climate report</p>
              <p>{error}</p>
              <button type="button" onClick={() => setReloadTick((n) => n + 1)} className="mt-2 inline-flex items-center gap-1 font-medium underline">
                <RefreshCw className="h-3 w-3" /> Try again
              </button>
            </div>
          </div>
        )}

        {loading && !report && (
          <div className="flex items-center justify-center gap-2 py-20 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Reading the sky over {place.district ?? place.pincode}...
          </div>
        )}

        {report && (
          <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
              <p className="text-xs text-gray-500">
                {report.basis.forecast !== 'none' ? 'Live 7-day forecast included' : 'Climatology only (live forecast unavailable)'}
                {report.match.note ? ` - ${report.match.note}` : ''}
                {report.basis.rainfall === 'neighbor_imputed' ? ' - rainfall inferred from neighbouring districts' : ''}
              </p>
            </div>

            <SeasonBanner focus={report.season.focus} label={report.season.label} />

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {HAZARD_ORDER.map((h) => (
                <HazardCard key={h} hazard={h} data={report.scores[h]} highlighted={report.season.focus === h} />
              ))}
            </div>

            <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-gray-900">Flood-and-famine swing: {Math.round(report.overall.swing_index)} / 100</h3>
                <span className="text-xs text-gray-500">Groundwater: {report.groundwater.stage_pct != null ? `${Math.round(report.groundwater.stage_pct)}% of recharge extracted (${report.groundwater.scope}-level survey)` : 'not surveyed'}</span>
              </div>
              <p className="mt-1 text-sm text-gray-600">{report.overall.swing_note}</p>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="space-y-6">
                <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                  <h3 className="mb-3 font-bold text-gray-900">Alerts</h3>
                  <AlertList alerts={alerts} empty="No active alerts. Conditions are within normal range for this place." />
                </section>
                <SubscribeCard district={report.location.district} state={report.location.state} />
              </div>

              <div className="space-y-6">
                <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                  <h3 className="mb-3 font-bold text-gray-900">Next 7 days</h3>
                  {report.forecast ? <ForecastChart forecast={report.forecast} /> : <p className="text-sm text-gray-500">The live forecast service did not respond. The scores above use long-term climate data.</p>}
                </section>
                <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                  <h3 className="mb-1 font-bold text-gray-900">Where the year's rain falls</h3>
                  <p className="mb-2 text-xs text-gray-500">{Math.round(report.rainfall_mm.annual)} mm a year. The taller the peak, the harder the dry months bite.</p>
                  <RainfallChart rainfall={report.rainfall_mm} />
                </section>
              </div>
            </div>

            <div className="mt-6">
              <WaterBalancePanel household={household} onChange={setHousehold} balance={report.water_balance} />
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <HotspotTable onSelect={(district, state) => choosePlace({ district, state })} />
          <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <h3 className="font-bold text-gray-900">Watch a tank, not just the sky</h3>
            <p className="text-sm text-gray-600">
              Fit a level sensor to your tank and INDRA will tell you how many hours until it overflows in a cloudburst - or runs dry in a heatwave.
            </p>
            <Link to="/tanks" className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Open tank monitor
            </Link>
            <hr className="border-gray-100" />
            <h3 className="font-bold text-gray-900">Prototype ideas on PartyRock</h3>
            <p className="text-sm text-gray-600">
              We sketched two no-code assistants - a monsoon-ready household planner and a heatwave water budget - as AWS PartyRock apps. The blueprints are in <code className="rounded bg-gray-100 px-1">deploy/partyrock/</code>.
            </p>
            <a href="https://partyrock.aws" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 underline">
              Open PartyRock <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
