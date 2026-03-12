import { spawn } from 'node:child_process';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const pingServer = async (baseUrl, timeoutMs = 1200) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(baseUrl, { method: 'GET', signal: controller.signal });
    return response.ok || response.status === 404;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const waitUntilReachable = async (baseUrl, timeoutMs) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await pingServer(baseUrl)) return true;
    await sleep(450);
  }
  return false;
};

const isDefaultPreviewTarget = (baseUrl) =>
  /^https?:\/\/(127\.0\.0\.1|localhost):4173\/?$/i.test(baseUrl.trim());

const spawnPreview = () => {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return spawn(command, ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'], {
    stdio: 'ignore',
    shell: false,
  });
};

export const ensureE2EServer = async (baseUrl) => {
  if (await pingServer(baseUrl)) {
    return { stop: async () => {} };
  }

  if (!isDefaultPreviewTarget(baseUrl)) {
    throw new Error(`E2E server is unavailable at ${baseUrl}.`);
  }

  const previewProcess = spawnPreview();
  const reachable = await waitUntilReachable(baseUrl, 30_000);

  if (!reachable) {
    if (!previewProcess.killed) {
      previewProcess.kill();
    }
    throw new Error(`Preview server did not start in time at ${baseUrl}.`);
  }

  return {
    stop: async () => {
      if (!previewProcess.killed) {
        previewProcess.kill();
      }
    },
  };
};
