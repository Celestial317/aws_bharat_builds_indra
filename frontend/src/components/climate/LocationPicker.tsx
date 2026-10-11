import { useEffect, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import { api } from '../../lib/api';

export interface Place {
  state?: string;
  district?: string;
  pincode?: string;
}

interface Props {
  value: Place;
  onChange: (place: Place) => void;
}

const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400';

export function LocationPicker({ value, onChange }: Props) {
  const [tab, setTab] = useState<'district' | 'pincode'>(value.pincode ? 'pincode' : 'district');
  const [states, setStates] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [pin, setPin] = useState(value.pincode ?? '');
  const pinValid = /^\d{6}$/.test(pin);

  useEffect(() => {
    const controller = new AbortController();
    api<{ states: string[] }>('/api/climate/states', { signal: controller.signal })
      .then((r) => setStates(r.states))
      .catch(() => setStates([]));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!value.state) {
      setDistricts([]);
      return;
    }
    const controller = new AbortController();
    api<{ districts: string[] }>('/api/climate/districts', { query: { state: value.state }, signal: controller.signal })
      .then((r) => setDistricts(r.districts))
      .catch(() => setDistricts([]));
    return () => controller.abort();
  }, [value.state]);

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
        <MapPin className="h-4 w-4 text-blue-600" /> Where are you?
        <div className="ml-auto flex rounded-lg bg-gray-100 p-0.5 text-xs">
          {(['district', 'pincode'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1 font-medium capitalize ${tab === t ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'district' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-gray-600">
            State
            <select
              className={inputClass}
              value={value.state ?? ''}
              onChange={(e) => onChange({ state: e.target.value, district: undefined })}
            >
              <option value="">Select state</option>
              {states.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-600">
            District
            <select
              className={inputClass}
              value={value.district ?? ''}
              disabled={!districts.length}
              onChange={(e) => onChange({ state: value.state, district: e.target.value })}
            >
              <option value="">{districts.length ? 'Select district' : 'Choose a state first'}</option>
              {districts.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (pinValid) onChange({ pincode: pin });
          }}
        >
          <input
            className={inputClass}
            inputMode="numeric"
            maxLength={6}
            placeholder="6-digit pincode, e.g. 600001"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            aria-label="Pincode"
          />
          <button
            type="submit"
            disabled={!pinValid}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-40"
          >
            <Search className="h-4 w-4" /> Check
          </button>
        </form>
      )}
    </div>
  );
}
