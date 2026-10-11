// On-device fallback for profiles and assessments, used when Firestore refuses access
// (e.g. security rules not published yet). Keeps sign-up, login and the planners working.
import type { AssessmentData, UserProfile } from '../types/database';

const PROFILE = (uid: string) => `indra.profile.${uid}`;
const ASSESSMENTS = (uid: string) => `indra.assessments.${uid}`;

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked: the session still works from memory-less state
  }
}

export function loadLocalProfile(uid: string): UserProfile | null {
  const p = read<UserProfile>(PROFILE(uid));
  return p ? { ...p, createdAt: new Date(p.createdAt), updatedAt: new Date(p.updatedAt) } : null;
}

export function saveLocalProfile(uid: string, patch: Partial<UserProfile>): UserProfile {
  const now = new Date();
  const current = loadLocalProfile(uid);
  const next = { ...(current ?? ({ uid, createdAt: now } as UserProfile)), ...patch, uid, updatedAt: now } as UserProfile;
  write(PROFILE(uid), next);
  return next;
}

export function loadLocalAssessments(uid: string): AssessmentData[] {
  return (read<AssessmentData[]>(ASSESSMENTS(uid)) ?? []).map((a) => ({
    ...a,
    createdAt: new Date(a.createdAt),
    updatedAt: new Date(a.updatedAt),
  }));
}

export function saveLocalAssessments(uid: string, items: AssessmentData[]): void {
  write(ASSESSMENTS(uid), items);
}

export function addLocalAssessment(data: Omit<AssessmentData, 'id' | 'createdAt' | 'updatedAt'>): string {
  const id = `local-${Date.now().toString(36)}`;
  const now = new Date();
  saveLocalAssessments(data.userId, [{ ...data, id, createdAt: now, updatedAt: now }, ...loadLocalAssessments(data.userId)]);
  return id;
}

/** Apply a change to a locally stored assessment; returns false if it is not stored locally. */
export function patchLocalAssessment(id: string, patch: Partial<AssessmentData> | null): boolean {
  if (!id.startsWith('local-')) return false;
  // assessments are stored per user; scan keys written by this app
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith('indra.assessments.')) continue;
    const uid = key.slice('indra.assessments.'.length);
    const items = loadLocalAssessments(uid);
    if (!items.some((a) => a.id === id)) continue;
    saveLocalAssessments(uid, patch ? items.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: new Date() } : a)) : items.filter((a) => a.id !== id));
    return true;
  }
  return false;
}
