import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CodexBridge, isOfficialLoginUrl, selectEffort } from '../electron/codex-bridge.mjs';
import { isDocumentationUrl, smokeDataDirectory } from '../electron/security.mjs';

function fixture(t, overrides = {}) {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'super-codex-bridge-test-'));
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
  const calls = []; const notifications = []; const opened = []; let spawnOptions;
  const handlers = {
    initialize: () => ({ userAgent: 'Mock Codex' }),
    'account/read': () => ({ account: { type: 'chatgpt', email: 'demo@example.test', planType: 'plus' }, requiresOpenaiAuth: true }),
    'model/list': () => ({ data: [{ id: 'real-model', model: 'real-model', displayName: 'Actual catalog model', isDefault: true, defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{ reasoningEffort: 'medium' }, { reasoningEffort: 'high' }] }], nextCursor: null }),
    'thread/start': () => ({ thread: { id: 'thread-1' } }),
    'thread/resume': p => ({ thread: { id: p.threadId } }),
    'turn/start': () => ({ turn: { id: 'turn-1', status: 'inProgress' } }),
    'turn/interrupt': () => ({}),
    'account/login/start': () => ({ type: 'chatgpt', loginId: 'login-1', authUrl: 'https://auth.openai.com/authorize?state=test' }),
    'account/login/cancel': () => ({}),
    ...overrides,
  };
  child.stdin = new Writable({ write(chunk, _encoding, done) {
    const message = JSON.parse(chunk.toString()); calls.push(message); done();
    if (message.id == null || !message.method) return;
    queueMicrotask(() => { const handler = handlers[message.method]; if (!handler) return; const result = handler(message.params); if (result !== undefined) child.stdout.write(`${JSON.stringify({ id: message.id, result })}\n`); });
  } });
  const bridge = new CodexBridge({ home: path.join(folder, 'home'), cwd: path.join(folder, 'workspace'), resolveCli: () => ({ command: 'codex', args: [] }), spawnProcess: (_command, args, options) => { spawnOptions = { args, ...options }; return child; }, openExternal: async url => { opened.push(url); }, requestTimeout: 100 });
  bridge.on('event', e => notifications.push(e));
  t.after(() => { bridge.close(); rmSync(folder, { recursive: true, force: true }); });
  return { bridge, calls, notifications, opened, child, options: () => spawnOptions, notify: (method, params, id) => child.stdout.write(`${JSON.stringify({ method, params, ...(id == null ? {} : { id }) })}\n`) };
}

test('only exact official HTTPS login hosts are accepted', () => {
  assert.equal(isOfficialLoginUrl('https://auth.openai.com/authorize'), true);
  for (const url of ['http://auth.openai.com/a', 'https://auth.openai.com.evil.test/', 'file:///etc/passwd', 'https://evil.test/', 'https://user@auth.openai.com/']) assert.equal(isOfficialLoginUrl(url), false);
});

test('external documentation links are restricted to exact official HTTPS hosts', () => {
  assert.equal(isDocumentationUrl('https://learn.chatgpt.com/docs/app-server'), true);
  assert.equal(isDocumentationUrl('https://developers.openai.com/codex/'), true);
  for (const url of ['file:///C:/Windows', 'javascript:alert(1)', 'https://learn.chatgpt.com.evil.test/', 'https://user@learn.chatgpt.com/docs', 'http://developers.openai.com/']) assert.equal(isDocumentationUrl(url), false);
});

test('smoke profile override is confined to a dedicated temporary subdirectory', () => {
  assert.equal(smokeDataDirectory(['app']), null);
  const profile = path.join(os.tmpdir(), 'super-codex-smoke-Abc123');
  assert.equal(smokeDataDirectory([`--super-codex-smoke-data=${profile}`]), profile);
  assert.throws(() => smokeDataDirectory([`--super-codex-smoke-data=${os.tmpdir()}`]), /dedicated/);
  assert.throws(() => smokeDataDirectory([`--super-codex-smoke-data=${path.join(os.tmpdir(), 'other-user-data')}`]), /dedicated/);
});

test('effort is clamped to the actual catalog instead of claiming Ultra support', () => {
  const model = { efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' };
  assert.equal(selectEffort('High', model), 'high');
  assert.equal(selectEffort('Ultra', model), 'medium');
  assert.equal(selectEffort('Ultimate', model), 'medium');
  assert.equal(selectEffort('Ultimate', { efforts: ['high','xhigh'], defaultEffort:'high' }), 'xhigh');
});

test('handshake precedes account reads; child is isolated and uses no shell', async t => {
  const f = fixture(t); const status = await f.bridge.getStatus();
  assert.equal(status.connected, true);
  assert.deepEqual(f.calls.slice(0,3).map(x => x.method), ['initialize', 'initialized', 'account/read']);
  assert.equal(f.options().shell, false);
  assert.equal(f.options().windowsHide, true);
  assert.equal(f.options().env.OPENAI_API_KEY, undefined);
  assert.match(f.options().env.CODEX_HOME, /super-codex-bridge-test-/);
  assert.ok(f.options().args.includes('features.shell_tool=false'));
});

test('connection failure truthfully returns Demo availability and no account', async t => {
  const f = fixture(t); f.bridge.resolveCli = () => { throw new Error('CLI missing'); };
  const status = await f.bridge.getStatus();
  assert.equal(status.mode, 'demo'); assert.equal(status.connected, false); assert.equal(status.available, false); assert.equal(status.reason, 'CLI missing');
});

test('API-key accounts are not accepted for subscription chat', async t => {
  const f = fixture(t, { 'account/read': () => ({ account: { type: 'apiKey' } }) });
  await assert.rejects(f.bridge.sendTurn({ text: 'Hello' }), /Sign in with ChatGPT/);
  assert.equal(f.calls.some(x => x.method === 'turn/start'), false);
});

test('sign in opens official OAuth URL without returning tokens or URL to renderer', async t => {
  const f = fixture(t, { 'account/read': () => ({ account: null }) });
  const result = await f.bridge.connect();
  assert.equal(result.pending, true); assert.equal(result.connected, false); assert.equal(f.opened.length, 1);
  assert.equal('authUrl' in result, false); assert.equal('accessToken' in result, false);
  await f.bridge.connect(); assert.equal(f.opened.length, 2);
});

test('unexpected login destinations are cancelled and never opened', async t => {
  const f = fixture(t, { 'account/read': () => ({ account: null }), 'account/login/start': () => ({ loginId: 'bad', authUrl: 'https://evil.test' }) });
  await assert.rejects(f.bridge.connect(), /unexpected sign-in address/);
  assert.equal(f.opened.length, 0); assert.equal(f.calls.at(-1).method, 'account/login/cancel');
});

test('real turns use discovered model, text-only input, read-only sandbox, and fictional style disclosure', async t => {
  const f = fixture(t); const result = await f.bridge.sendTurn({ text: 'Hello 世界', style: 'Apex: concise systems reasoning', effort: 'Ultra' });
  assert.equal(result.model, 'real-model'); assert.equal(result.effort, 'medium');
  const start = f.calls.find(x => x.method === 'thread/start').params;
  assert.equal(start.sandbox, 'read-only'); assert.equal(start.approvalPolicy, 'never');
  const turn = f.calls.find(x => x.method === 'turn/start').params;
  assert.equal(turn.sandboxPolicy.type, 'readOnly'); assert.equal(turn.sandboxPolicy.networkAccess, false);
  assert.match(turn.input[0].text, /Fictional presentation preset only/); assert.match(turn.input[0].text, /Hello 世界/);
  await assert.rejects(f.bridge.sendTurn({ text: 'Hi', model: 'gpt-10-apex' }), /actual model/);
});

test('existing conversations resume, streamed chunks and cancellation retain IDs', async t => {
  const f = fixture(t); await f.bridge.sendTurn({ text: 'Continue', threadId: 'existing-thread' });
  assert.equal(f.calls.find(x => x.method === 'thread/resume').params.threadId, 'existing-thread');
  f.notify('item/agentMessage/delta', { threadId: 'existing-thread', turnId: 'turn-1', delta: '你好' });
  assert.deepEqual(f.notifications.at(-1), { type: 'delta', threadId: 'existing-thread', turnId: 'turn-1', text: '你好' });
  assert.deepEqual(await f.bridge.cancelTurn({ threadId: 'existing-thread' }), { cancelled: true });
  f.notify('turn/completed', { threadId: 'existing-thread', turn: { id: 'turn-1', status: 'interrupted' } });
  assert.equal(f.notifications.at(-1).type, 'done'); assert.equal(f.notifications.at(-1).status, 'interrupted');
});

test('server permission requests are denied and unknown operations never dispatched', async t => {
  const f = fixture(t); await f.bridge.start();
  f.notify('item/commandExecution/requestApproval', { command: 'rm -rf /' }, 99);
  assert.deepEqual(f.calls.at(-1), { id: 99, result: { decision: 'decline' } });
  await assert.rejects(f.bridge.request('account/rateLimitResetCredit/consume'), /not supported/);
  assert.equal(f.calls.some(x => x.method === 'account/rateLimitResetCredit/consume'), false);
});

test('UTF-8 split across transport chunks is reconstructed', async t => {
  const f = fixture(t); await f.bridge.start();
  const bytes = Buffer.from(JSON.stringify({ method: 'item/agentMessage/delta', params: { threadId: 't', turnId: 'u', delta: '世界' } }) + '\n');
  const split = bytes.indexOf(Buffer.from('世界')) + 1;
  f.child.stdout.write(bytes.subarray(0, split)); f.child.stdout.write(bytes.subarray(split));
  assert.equal(f.notifications.at(-1).text, '世界');
});

test('duplicate concurrent start requests are rejected before any duplicate inference', async t => {
  const f = fixture(t);
  const first = f.bridge.sendTurn({ text: 'First' });
  await assert.rejects(f.bridge.sendTurn({ text: 'Duplicate' }), /already starting/);
  await first;
  assert.equal(f.calls.filter(x => x.method === 'turn/start').length, 1);
});

test('completion arriving before the turn response does not leave a stale active turn', async t => {
  let fixtureRef;
  const f = fixture(t, { 'turn/start': () => {
    fixtureRef.notify('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } });
    return { turn: { id: 'turn-1', status: 'inProgress' } };
  } });
  fixtureRef = f;
  await f.bridge.sendTurn({ text: 'Fast answer' });
  assert.equal(f.bridge.active.size, 0);
  assert.equal(f.notifications.at(-1).type, 'done');
});

test('unanswered requests timeout and do not leak pending callbacks', async t => {
  const f = fixture(t, { 'model/list': () => undefined }); await f.bridge.start();
  await assert.rejects(f.bridge.getModels(), /timed out/); assert.equal(f.bridge.pending.size, 0);
});
