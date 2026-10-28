import { EFFORTS, ALL_EFFORTS, normalizeEffort, MODELS, PLANS, SPEEDS, getPlan, type Effort, type Language, type Speed } from './catalog';
import type { DemoFile } from './demo';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  modelId?: string;
  simulated?: boolean;
  files?: DemoFile[];
  status?: 'streaming' | 'complete' | 'error';
}
export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  threadId?: string;
  archived?: boolean;
  pinned?: boolean;
}
export interface Quotas { session: number; weekly: number }
export interface ResetRecord { id: string; at: number; before: Quotas }
export interface AppState {
  version: 1;
  language: Language;
  theme: 'light' | 'dark' | 'system';
  modelId: string;
  effort: Effort;
  speed: Speed;
  planId: string;
  quotas: Quotas;
  resetCount: number;
  resetHistory: ResetRecord[];
  chats: Chat[];
  activeChatId: string | null;
  onboarded: boolean;
  sound: boolean;
  animations: boolean;
  mode: 'demo' | 'live';
}

export const STORAGE_KEY = 'super-codex-state-v1';
export const initialState: AppState = {
  version: 1, language: 'zh', theme: 'light', modelId: 'sol', effort: 'High', speed: 1,
  planId: 'free', quotas: { session: 100, weekly: 100 }, resetCount: 0, resetHistory: [],
  chats: [], activeChatId: null, onboarded: false, sound: true, animations: true, mode: 'demo',
};

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown, fallback: number): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
export const clampQuota = (value: unknown): number => Math.min(100, Math.max(0, finite(value, 100)));
const text = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback;
const bool = (value: unknown, fallback: boolean): boolean => typeof value === 'boolean' ? value : fallback;
const safeQuotas = (value: unknown): Quotas => record(value) ? { session: clampQuota(value.session), weekly: clampQuota(value.weekly) } : { session: 100, weekly: 100 };

function parseFiles(value: unknown): DemoFile[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(record).filter(item => typeof item.path === 'string' && typeof item.before === 'string' && typeof item.after === 'string')
    .slice(0, 30).map(item => ({ path: text(item.path), before: text(item.before), after: text(item.after) }));
}

export function normalizeState(value: unknown): AppState {
  if (!record(value) || (value.version !== undefined && value.version !== 1)) return structuredClone(initialState);
  const chats: Chat[] = Array.isArray(value.chats) ? value.chats.filter(record).filter(chat => typeof chat.id === 'string' && Array.isArray(chat.messages)).slice(0, 200).map(chat => ({
    id: text(chat.id), title: text(chat.title, 'Untitled'),
    createdAt: finite(chat.createdAt, Date.now()), updatedAt: finite(chat.updatedAt, Date.now()),
    threadId: typeof chat.threadId === 'string' ? chat.threadId : undefined,
    archived: bool(chat.archived, false), pinned: bool(chat.pinned, false),
    messages: (chat.messages as unknown[]).filter(record).filter(message => typeof message.id === 'string' && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string').slice(-500).map(message => ({
      id: text(message.id), role: message.role as 'user' | 'assistant', content: text(message.content),
      createdAt: finite(message.createdAt, Date.now()), modelId: typeof message.modelId === 'string' ? message.modelId : undefined,
      simulated: bool(message.simulated, false), files: parseFiles(message.files),
      // A browser reload cannot keep an old stream alive. Preserve partial text visibly.
      status: message.status === 'streaming' || message.status === 'error' ? 'error' : 'complete',
    })),
  })) : [];
  const resetHistory: ResetRecord[] = Array.isArray(value.resetHistory) ? value.resetHistory.filter(record).slice(0, 100).map(item => ({ id: text(item.id), at: finite(item.at, 0), before: safeQuotas(item.before) })) : [];
  return {
    version: 1,
    language: value.language === 'en' ? 'en' : 'zh',
    theme: value.theme === 'dark' || value.theme === 'system' ? value.theme : 'light',
    modelId: MODELS.some(model => model.id === value.modelId) ? text(value.modelId) : initialState.modelId,
    effort: normalizeEffort(ALL_EFFORTS.includes(value.effort as Effort) ? value.effort as Effort : initialState.effort, MODELS.find(model=>model.id===value.modelId)?.generation??6),
    speed: SPEEDS.includes(value.speed as Speed) ? value.speed as Speed : initialState.speed,
    planId: PLANS.some(plan => plan.id === value.planId) ? text(value.planId) : 'free',
    quotas: safeQuotas(value.quotas),
    resetCount: Math.max(0, Math.floor(finite(value.resetCount, 0))),
    resetHistory, chats,
    activeChatId: typeof value.activeChatId === 'string' && chats.some(chat => chat.id === value.activeChatId) ? value.activeChatId : null,
    onboarded: bool(value.onboarded, false), sound: bool(value.sound, true), animations: bool(value.animations, true),
    mode: value.mode === 'live' ? 'live' : 'demo',
  };
}

export function loadState(storage?: Pick<Storage, 'getItem'>): AppState {
  try {
    const source = storage ?? globalThis.localStorage;
    const raw = source?.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : structuredClone(initialState);
  } catch { return structuredClone(initialState); }
}

/** Returns false when storage is unavailable or full, so the UI can surface it. */
export function saveState(state: AppState, storage?: Pick<Storage, 'setItem'>): boolean {
  try {
    const target = storage ?? globalThis.localStorage;
    if (!target) return false;
    target.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch { return false; }
}

export function resetQuotas(state: AppState, now = Date.now()): AppState {
  return {
    ...state, quotas: { session: 100, weekly: 100 }, resetCount: state.resetCount + 1,
    resetHistory: [{ id: `reset-${now}-${state.resetCount + 1}`, at: now, before: { ...state.quotas } }, ...state.resetHistory].slice(0, 100),
  };
}

export function consumeQuota(state: AppState, amount = 3): AppState {
  const validAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const multiplier = 50 / getPlan(state.planId).quota;
  return { ...state, quotas: {
    session: Math.round(clampQuota(state.quotas.session - validAmount * multiplier) * 1000) / 1000,
    weekly: Math.round(clampQuota(state.quotas.weekly - validAmount * multiplier * 0.35) * 1000) / 1000,
  } };
}

export function purchasePlan(state: AppState, planId: string): AppState {
  if (!PLANS.some(plan => plan.id === planId)) return state;
  return { ...state, planId };
}
