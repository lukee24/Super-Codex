import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';

// Only this small, fixed protocol surface is available to the renderer.
const METHODS = new Set(['initialize', 'account/read', 'account/login/start', 'account/login/cancel', 'model/list', 'thread/start', 'thread/resume', 'turn/start', 'turn/interrupt']);
const INSTRUCTIONS = 'You are the real AI assistant inside Super Codex, an unofficial entertainment concept client. Future model names, memberships, quotas, speed multipliers and execution animations are fictional local presets. Never claim to be a future model or claim that a simulated command/test/file modification actually occurred. Answer the user freely and honestly in their language. This integration is conversation-only: do not use tools, execute commands, read local files, modify files, access connected apps, or perform external actions. Provide code as text when requested.';

export function isOfficialLoginUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && ['auth.openai.com', 'auth0.openai.com', 'chatgpt.com', 'auth.chatgpt.com'].includes(url.hostname) && !url.username && !url.password; }
  catch { return false; }
}

export function selectEffort(requested, model) {
  const desired = ({ Instant: 'none', Low: 'low', Medium: 'medium', High: 'high', 'Extra High': 'xhigh', Ultra: 'xhigh', Ultimate: 'xhigh', instant: 'none', ultra: 'xhigh', ultimate: 'xhigh', 'extra-high': 'xhigh' })[requested] ?? requested;
  const supported = model.efforts ?? [];
  return supported.includes(desired) ? desired : model.defaultEffort || supported[0] || undefined;
}

export function findCodex(env = process.env) {
  if (env.SUPER_CODEX_CLI_PATH) {
    const explicit = path.resolve(env.SUPER_CODEX_CLI_PATH);
    if (!existsSync(explicit)) throw new Error('SUPER_CODEX_CLI_PATH does not point to an installed Codex executable.');
    return { command: explicit, args: [] };
  }
  const dirs = (env.PATH ?? env.Path ?? '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const direct = path.join(dir, process.platform === 'win32' ? 'codex.exe' : 'codex');
    if (existsSync(direct)) return { command: direct, args: [] };
  }
  if (process.platform === 'win32' && env.LOCALAPPDATA) {
    const roots = [path.join(env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin'), path.join(env.LOCALAPPDATA, 'Programs', 'OpenAI', 'Codex', 'bin')];
    for (const root of roots) {
      const direct = path.join(root, 'codex.exe');
      if (existsSync(direct)) return { command: direct, args: [] };
      if (existsSync(root)) for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (entry.isDirectory()) { const candidate = path.join(root, entry.name, 'codex.exe'); if (existsSync(candidate)) return { command: candidate, args: [] }; }
      }
    }
  }
  // npm's Windows .cmd shim needs a shell; launch its official JS entrypoint instead.
  for (const dir of dirs) {
    const script = path.join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (existsSync(script)) return { command: process.execPath, args: [script], node: true };
  }
  throw new Error('Codex CLI was not found. Install the official @openai/codex CLI, then reopen Super Codex.');
}

export class CodexBridge extends EventEmitter {
  constructor({ home, cwd, spawnProcess = spawn, resolveCli = findCodex, openExternal = async () => {}, requestTimeout = 30000 }) {
    super(); this.home = home; this.cwd = cwd; this.spawnProcess = spawnProcess; this.resolveCli = resolveCli; this.openExternal = openExternal; this.timeout = requestTimeout;
    this.pending = new Map(); this.models = []; this.threads = new Set(); this.active = new Map(); this.startingTurns = new Set(); this.completedTurns = new Set(); this.nextId = 1; this.child = null; this.starting = null; this.loginId = null;
  }

  async start() {
    if (this.starting) return this.starting;
    if (this.child) return;
    this.starting = this.#start();
    try { await this.starting; } catch (error) { this.close(); throw error; } finally { this.starting = null; }
  }

  async #start() {
    const cli = this.resolveCli();
    mkdirSync(this.home, { recursive: true }); mkdirSync(this.cwd, { recursive: true });
    const args = [...cli.args, 'app-server', '--listen', 'stdio://', '-c', 'features.shell_tool=false', '-c', 'web_search="disabled"', '-c', 'apps._default.enabled=false', '-c', 'sandbox_mode="read-only"', '-c', 'approval_policy="never"', '-c', 'forced_login_method="chatgpt"'];
    const env = { ...process.env, CODEX_HOME: this.home };
    // Never inherit a billing key or provider override from the host process.
    delete env.OPENAI_API_KEY; delete env.OPENAI_BASE_URL; delete env.CODEX_API_KEY;
    if (cli.node) env.ELECTRON_RUN_AS_NODE = '1'; else delete env.ELECTRON_RUN_AS_NODE;
    const child = this.spawnProcess(cli.command, args, { cwd: this.cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: false });
    this.child = child;
    let buffer = ''; const decoder = new StringDecoder('utf8');
    child.stdout.on('data', chunk => {
      buffer += decoder.write(chunk);
      if (buffer.length > 8 * 1024 * 1024) { this.#fail(new Error('Codex sent an oversized protocol message.')); this.close(); return; }
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        try { this.#message(JSON.parse(line)); } catch { /* Ignore non-protocol diagnostics; never forward raw output. */ }
      }
    });
    child.stderr.on('data', () => {}); // stderr can contain private paths; deliberately not exposed.
    child.on('error', error => { this.#fail(new Error(error.code === 'ENOENT' ? 'Codex CLI was not found. Install the official CLI to connect.' : 'Codex could not start. Check the installed CLI.')); if (this.child === child) this.child = null; });
    child.on('exit', () => { if (this.child === child) { this.child = null; this.threads.clear(); this.#fail(new Error('Codex disconnected. Reconnect to continue.')); } });
    await this.request('initialize', { clientInfo: { name: 'super_codex_unofficial', title: 'Super Codex (Unofficial)', version: '0.1.0' } });
    this.#write({ method: 'initialized', params: {} });
  }

  #write(message) {
    if (!this.child?.stdin?.writable) throw new Error('Codex is not connected.');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method, params = {}) {
    if (!METHODS.has(method)) return Promise.reject(new Error('This operation is not supported by Super Codex.'));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex ${method} timed out. Please reconnect.`)); }, this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.#write({ id, method, params }); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }

  #fail(error) {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    for (const [threadId, turnId] of this.active) this.emit('event', { type: 'error', text: error.message, threadId, turnId });
    this.active.clear(); this.models = [];
    this.emit('event', { type: 'status', available: false, connected: false, mode: 'demo', reason: error.message });
  }

  #message(message) {
    if (message.id != null && !message.method) {
      const pending = this.pending.get(message.id); if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(String(message.error.message ?? 'Codex request failed.').slice(0,1000)));
      else pending.resolve(message.result);
      return;
    }
    const p = message.params ?? {};
    if (message.id != null) {
      // Do not approve tools or expose arbitrary server requests to an untrusted renderer.
      const denied = message.method === 'item/permissions/requestApproval' ? { permissions: {}, scope: 'turn' }
        : message.method === 'mcpServer/elicitation/request' ? { action: 'decline', content: null }
        : /requestApproval$/.test(message.method) ? { decision: 'decline' } : null;
      this.#write(denied ? { id: message.id, result: denied } : { id: message.id, error: { code: -32601, message: 'Super Codex supports conversation only.' } });
      return;
    }
    if (message.method === 'item/agentMessage/delta') this.emit('event', { type: 'delta', threadId: p.threadId, turnId: p.turnId, text: String(p.delta ?? '') });
    if (message.method === 'turn/started') { this.active.set(p.threadId, p.turn?.id); this.emit('event', { type: 'status', threadId: p.threadId, turnId: p.turn?.id, status: 'working' }); }
    if (message.method === 'turn/completed') {
      this.active.delete(p.threadId);
      if (p.turn?.id) {
        this.completedTurns.add(p.turn.id);
        if (this.completedTurns.size > 256) this.completedTurns.delete(this.completedTurns.values().next().value);
      }
      const failed = p.turn?.status === 'failed';
      this.emit('event', { type: failed ? 'error' : 'done', threadId: p.threadId, turnId: p.turn?.id, status: p.turn?.status, text: failed ? String(p.turn?.error?.message ?? 'Codex could not complete this turn.') : undefined });
    }
    if (message.method === 'error' && !p.willRetry) this.emit('event', { type: 'error', threadId: p.threadId, turnId: p.turnId, text: String(p.error?.message ?? p.message ?? 'Codex reported an error.').slice(0,1000) });
    if (message.method === 'account/login/completed') {
      this.loginId = null;
      if (p.success) this.getStatus().then(status => this.emit('event', { type: 'status', ...status })).catch(() => {});
      else this.emit('event', { type: 'status', available: true, connected: false, mode: 'demo', reason: String(p.error || 'Sign-in was cancelled.') });
    }
    if (message.method === 'account/updated') this.getStatus().then(status => this.emit('event', { type: 'status', ...status })).catch(() => {});
  }

  async getStatus() {
    try {
      await this.start();
      const result = await this.request('account/read', { refreshToken: false });
      const account = result?.account;
      const connected = account?.type === 'chatgpt';
      return { available: true, connected, mode: connected ? 'live' : 'demo', account: account ? { type: account.type, email: account.email, planType: account.planType } : undefined, reason: connected ? undefined : 'Sign in with ChatGPT to connect. Access depends on your real account.' };
    } catch (error) { return { available: false, connected: false, mode: 'demo', reason: error.message }; }
  }

  async connect() {
    const status = await this.getStatus();
    if (status.connected || !status.available) return status;
    if (this.loginId && this.loginUrl) {
      await this.openExternal(this.loginUrl);
      return { ...status, pending: true, reason: 'Complete sign-in in your browser.' };
    }
    const result = await this.request('account/login/start', { type: 'chatgpt' });
    if (!isOfficialLoginUrl(result?.authUrl)) {
      if (result?.loginId) await this.request('account/login/cancel', { loginId: result.loginId }).catch(() => {});
      throw new Error('Codex returned an unexpected sign-in address. Update the official CLI and retry.');
    }
    this.loginId = result.loginId; this.loginUrl = result.authUrl;
    try { await this.openExternal(result.authUrl); } catch {
      await this.request('account/login/cancel', { loginId: this.loginId }).catch(() => {});
      this.loginId = null; this.loginUrl = null;
      throw new Error('Could not open the browser. Check your default browser and try again.');
    }
    return { available: true, connected: false, mode: 'demo', pending: true, reason: 'Complete the official ChatGPT sign-in in your browser.' };
  }

  async getModels() {
    await this.start();
    const models = []; let cursor;
    for (let page = 0; page < 10; page++) {
      const result = await this.request('model/list', { limit: 100, includeHidden: false, ...(cursor ? { cursor } : {}) });
      for (const m of result.data ?? []) models.push({ id: m.model || m.id, name: m.displayName || m.model || m.id, isDefault: !!m.isDefault, defaultEffort: m.defaultReasoningEffort, efforts: (m.supportedReasoningEfforts ?? []).map(x => x.reasoningEffort) });
      cursor = result.nextCursor; if (!cursor) break;
    }
    this.models = models; return models;
  }

  async sendTurn(payload) {
    if (!payload || typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 120000) throw new Error('Enter a message between 1 and 120,000 characters.');
    if (payload.style != null && (typeof payload.style !== 'string' || payload.style.length > 8000)) throw new Error('Invalid concept style.');
    if (payload.threadId != null && (typeof payload.threadId !== 'string' || payload.threadId.length > 200)) throw new Error('Invalid thread.');
    const pendingKey = payload.threadId || '__new__';
    if (this.startingTurns.has(pendingKey)) throw new Error('This conversation is already starting a reply.');
    this.startingTurns.add(pendingKey);
    try {
    const status = await this.getStatus(); if (!status.connected) throw new Error(status.reason || 'Connect to ChatGPT first.');
    const models = this.models.length ? this.models : await this.getModels();
    const model = payload.model ? models.find(m => m.id === payload.model) : models.find(m => m.isDefault) ?? models[0];
    if (!model) throw new Error('Select an actual model from the connected Codex catalog. Concept names cannot be used as API model IDs.');
    let threadId = payload.threadId;
    const params = { model: model.id, cwd: this.cwd, approvalPolicy: 'never', sandbox: 'read-only', developerInstructions: INSTRUCTIONS, config: { 'features.shell_tool': false, 'apps._default.enabled': false, web_search: 'disabled' } };
    if (!threadId) {
      const result = await this.request('thread/start', params); threadId = result.thread?.id;
      if (!threadId) throw new Error('Codex did not return a conversation ID.');
      this.threads.add(threadId);
    } else if (!this.threads.has(threadId)) {
      await this.request('thread/resume', { ...params, threadId, excludeTurns: true }); this.threads.add(threadId);
    }
    if (this.active.has(threadId)) throw new Error('A reply is already running in this conversation.');
    const effort = selectEffort(payload.effort, model);
    const text = payload.style ? `[Fictional presentation preset only; this is not a model identity or capability claim: ${payload.style}]\n\n${payload.text}` : payload.text;
    const result = await this.request('turn/start', { threadId, model: model.id, ...(effort ? { effort } : {}), input: [{ type: 'text', text }], approvalPolicy: 'never', sandboxPolicy: { type: 'readOnly', networkAccess: false } });
    const turnId = result.turn?.id;
    if (!turnId) throw new Error('Codex did not return a turn ID.');
    if (result.turn.status === 'inProgress' && !this.completedTurns.has(turnId)) this.active.set(threadId, turnId);
    return { threadId, turnId, model: model.id, effort };
    } finally { this.startingTurns.delete(pendingKey); }
  }

  async cancelTurn(payload = {}) {
    const threadId = payload.threadId; const turnId = payload.turnId ?? this.active.get(threadId);
    if (typeof threadId !== 'string' || typeof turnId !== 'string' || this.active.get(threadId) !== turnId) return { cancelled: false };
    await this.request('turn/interrupt', { threadId, turnId }); return { cancelled: true };
  }

  close() {
    const child = this.child; this.child = null;
    if (child) { child.stdin?.end(); child.kill(); }
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Codex connection closed.')); }
    this.pending.clear(); this.active.clear(); this.threads.clear(); this.startingTurns.clear(); this.completedTurns.clear(); this.models = []; this.loginId = null;
  }
}
