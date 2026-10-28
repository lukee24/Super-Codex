import { describe, expect, it } from 'vitest';
import { MODELS, PLANS, EFFORTS, SPEEDS, getEfforts } from '../src/lib/catalog';
import { createDemoResponse, simulationDelay, streamChunkSize } from '../src/lib/demo';
import { initialState, loadState, saveState, normalizeState, resetQuotas, consumeQuota, purchasePlan, STORAGE_KEY } from '../src/lib/storage';

describe('explicit concept catalog', () => {
  it('contains exactly the requested 16 version/name pairs with no 6.12', () => {
    expect(MODELS.map(model => [model.name, model.version])).toEqual([
      ['Astra', '6.0'], ['Sol', '6.1'], ['Terra', '6.1'], ['Cinder', '6.2'], ['Glyph', '6.3'], ['Helio', '6.5'], ['Vector', '6.8'],
      ['Sable', '7.0'], ['Axiom', '7.2'], ['Helix', '7.5'], ['Crest', '7.9'], ['Lattice', '8.0'], ['Strata', '8.5'], ['Meridian', '9.0'], ['Vanta', '9.5'], ['Apex', '10.0'],
    ]);
    expect(new Set(MODELS.map(model => model.id)).size).toBe(16);
    expect(new Set(MODELS.map(model => model.style.en)).size).toBe(16);
  });
  it('keeps the six reference plans separate from the four fictional plans', () => {
    expect(PLANS.filter(plan => !plan.fictional).map(plan => [plan.name, plan.price])).toEqual([
      ['Free', 0], ['Go', 8], ['Plus', 20], ['Pro 100', 100], ['Pro 200', 200], ['Pro 500', 500],
    ]);
    expect(PLANS.filter(plan => plan.fictional).map(plan => [plan.name, plan.price])).toEqual([
      ['Pro Max', 799], ['Ultra', 999], ['Infinity', 1999], ['Ultimate', 3999],
    ]);
    expect(EFFORTS).toHaveLength(6);
    expect(SPEEDS).toEqual([1, 2, 5, 10, 20, 50]);
  });
});

describe('offline simulation fidelity', () => {
  const base = { prompt: 'Build a React counter', modelId: 'sol', effort: 'High' as const, language: 'en' as const };
  it('labels preset responses and every execution step as simulated', () => {
    const result = createDemoResponse(base);
    expect(result.text).toContain('Offline Demo');
    expect(result.text).toContain('not live AI');
    expect(result.steps.every(step => step.label.startsWith('Simulated'))).toBe(true);
    expect(result.files[0].after).toContain('setCount(value => value + 1)');
  });
  it('all 16 styles have distinct response behavior', () => {
    const responses = MODELS.map(model => createDemoResponse({ ...base, modelId: model.id }).text);
    expect(new Set(responses).size).toBe(16);
  });
  it('effort changes preset depth and timing; speed changes animation timing', () => {
    const instant = createDemoResponse({ ...base, effort: 'Instant' });
    const ultra = createDemoResponse({ ...base, effort: 'Ultra' });
    expect(ultra.text.length).toBeGreaterThan(instant.text.length);
    expect(ultra.steps.length).toBeGreaterThan(instant.steps.length);
    expect(ultra.steps[0].duration).toBeGreaterThan(instant.steps[0].duration);
    expect(simulationDelay(1000, 50)).toBe(20);
    expect(streamChunkSize(50)).toBeGreaterThan(streamChunkSize(1));
  });
  it('retains previous user context in follow-up previews', () => {
    const result = createDemoResponse({ ...base, prompt: 'Continue that component', history: [{ role: 'user', content: 'Build a shopping cart' }] });
    expect(result.text).toContain('Build a shopping cart');
  });
  it('offers Ultimate only on GPT-10 and increases its honest local demo depth', () => {
    expect(getEfforts(9)).not.toContain('Ultimate');
    expect(getEfforts(10).at(-1)).toBe('Ultimate');
    const ultra = createDemoResponse({ ...base, modelId:'apex', effort:'Ultra' });
    const ultimate = createDemoResponse({ ...base, modelId:'apex', effort:'Ultimate' });
    expect(ultimate.steps[0].duration).toBeGreaterThan(ultra.steps[0].duration);
    expect(ultimate.steps.length).toBeGreaterThan(ultra.steps.length);
    expect(ultimate.text).toContain('not an official higher reasoning level');
  });
  it('does not falsely claim arbitrary offline questions were answered by AI', () => {
    expect(createDemoResponse({ ...base, prompt: 'What is the weather tomorrow?' }).text).toContain('cannot provide a live model answer');
  });
});

describe('persistence and local entitlements', () => {
  it('recovers from malformed storage and unavailable persistence', () => {
    expect(loadState({ getItem: () => '{broken' })).toEqual(initialState);
    expect(saveState(initialState, { setItem: () => { throw new Error('QuotaExceededError'); } })).toBe(false);
  });
  it('validates imported state and migrates obsolete selections', () => {
    const state = normalizeState({ modelId: 'gpt-6.12', speed: 999, effort: 'invalid', planId: 'enterprise', quotas: { session: -12, weekly: 150 }, activeChatId: 'missing' });
    expect(state.modelId).toBe('sol');
    expect(state.speed).toBe(1);
    expect(state.planId).toBe('free');
    expect(state.quotas).toEqual({ session: 0, weekly: 100 });
    expect(state.activeChatId).toBeNull();
  });
  it('keeps Ultimate on GPT-10 and downgrades it safely after switching generations', () => {
    expect(normalizeState({...initialState,modelId:'apex',effort:'Ultimate'}).effort).toBe('Ultimate');
    expect(normalizeState({...initialState,modelId:'meridian',effort:'Ultimate'}).effort).toBe('Ultra');
  });
  it('purchases unlock locally and scale simulated consumption without billing', () => {
    const free = consumeQuota(initialState, 10);
    const ultimate = consumeQuota(purchasePlan(initialState, 'ultimate'), 10);
    expect(ultimate.planId).toBe('ultimate');
    expect(ultimate.quotas.session).toBeGreaterThan(free.quotas.session);
    expect(purchasePlan(initialState, 'invalid')).toBe(initialState);
  });
  it('resets both allowances atomically, logs previous quota, and supports unlimited resets', () => {
    let state = { ...initialState, quotas: { session: 0, weekly: 12 } };
    state = resetQuotas(state, 1234);
    expect(state.quotas).toEqual({ session: 100, weekly: 100 });
    expect(state.resetHistory[0]).toEqual({ id: 'reset-1234-1', at: 1234, before: { session: 0, weekly: 12 } });
    for (let i = 0; i < 110; i++) state = resetQuotas(state, 1235 + i);
    expect(state.resetCount).toBe(111);
    expect(state.resetHistory).toHaveLength(100);
    expect(initialState.resetCount).toBe(0);
  });
  it('persists all selections, language, history, purchase and reset', () => {
    let serialized = '';
    const storage = { getItem: (key: string) => key === STORAGE_KEY ? serialized : null, setItem: (_key: string, value: string) => { serialized = value; } };
    const state = resetQuotas({ ...initialState, language: 'en', modelId: 'apex', effort: 'Ultra', speed: 50, planId: 'infinity' });
    expect(saveState(state, storage)).toBe(true);
    expect(loadState(storage)).toEqual(state);
  });
  it('does not resume an interrupted streaming message after reload', () => {
    const state = normalizeState({ ...initialState, chats: [{ id: 'chat', title: 'Test', createdAt: 1, updatedAt: 2, messages: [{ id: 'm', role: 'assistant', content: 'Partial', createdAt: 2, status: 'streaming' }] }], activeChatId: 'chat' });
    expect(state.chats[0].messages[0].status).toBe('error');
    expect(state.chats[0].messages[0].content).toBe('Partial');
  });
});
