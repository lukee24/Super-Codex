import path from 'node:path';
import os from 'node:os';

export function isDocumentationUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      ['learn.chatgpt.com', 'developers.openai.com'].includes(url.hostname);
  } catch { return false; }
}

// An explicit smoke-test launch gets a fresh profile; normal launches never use it.
export function smokeDataDirectory(argv, tempRoot = os.tmpdir()) {
  const value = argv.find(arg => arg.startsWith('--super-codex-smoke-data='))?.slice('--super-codex-smoke-data='.length);
  if (!value) return null;
  const directory = path.resolve(value);
  if (path.dirname(directory) !== path.resolve(tempRoot) || !/^super-codex-smoke-[a-zA-Z0-9_-]+$/.test(path.basename(directory))) {
    throw new Error('Smoke data must be a dedicated super-codex-smoke-* directory directly inside the OS temporary directory.');
  }
  return directory;
}
