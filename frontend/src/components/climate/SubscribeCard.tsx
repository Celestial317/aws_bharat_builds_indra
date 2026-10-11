import { useCallback, useEffect, useState } from 'react';
import { BellRing, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api, errorMessage } from '../../lib/api';

interface Subscription {
  subId: string;
  district: string;
  state: string;
  channel: 'email' | 'sms' | 'push';
  contact: string;
}

export function SubscribeCard({ district, state }: { district?: string; state?: string }) {
  const { user } = useAuth();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [channel, setChannel] = useState<Subscription['channel']>('email');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setSubs((await api<{ subscriptions: Subscription[] }>('/api/alerts/subscriptions', { auth: true })).subscriptions);
    } catch {
      setSubs([]);
    }
  }, [user]);

  useEffect(() => {
    void load();
    if (user?.email) setContact((c) => c || user.email || '');
  }, [load, user]);

  if (!user) {
    return (
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
        <h3 className="flex items-center gap-2 font-bold text-gray-900"><BellRing className="h-5 w-5 text-blue-600" /> Get alerts for your district</h3>
        <p className="mt-2 text-sm text-gray-600">Log in to be told before a cloudburst or heatwave reaches you.</p>
      </div>
    );
  }

  const subscribe = async () => {
    if (!district || !contact.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      await api('/api/alerts/subscriptions', { method: 'POST', auth: true, body: { district, state, channel, contact: contact.trim() } });
      setMessage({ ok: true, text: `Subscribed to ${district}.` });
      await load();
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api(`/api/alerts/subscriptions/${id}`, { method: 'DELETE', auth: true });
      await load();
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) });
    }
  };

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
      <h3 className="flex items-center gap-2 font-bold text-gray-900"><BellRing className="h-5 w-5 text-blue-600" /> Get alerts for {district ?? 'your district'}</h3>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as Subscription['channel'])}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          aria-label="Channel"
        >
          <option value="email">Email</option>
          <option value="sms">SMS</option>
        </select>
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={channel === 'email' ? 'you@example.org' : '+91 98xxxxxxxx'}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          aria-label="Contact"
        />
        <button
          type="button"
          onClick={() => void subscribe()}
          disabled={busy || !district || !contact.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Subscribe
        </button>
      </div>
      {message && <p className={`mt-2 text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>}
      {subs.length > 0 && (
        <ul className="mt-3 divide-y divide-gray-100 text-sm">
          {subs.map((s) => (
            <li key={s.subId} className="flex items-center justify-between py-2">
              <span>{s.district}, {s.state} <span className="text-gray-400">via {s.channel} ({s.contact})</span></span>
              <button type="button" onClick={() => void remove(s.subId)} aria-label={`Unsubscribe ${s.district}`} className="text-gray-400 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-gray-500">
        A scheduled serverless function checks every subscribed district, so alerts keep flowing even when nobody has the app open.
      </p>
    </div>
  );
}
