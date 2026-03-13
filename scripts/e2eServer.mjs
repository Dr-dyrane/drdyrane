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

const isLocalTarget = (baseUrl) => {
  try {
    const url = new URL(baseUrl);
    return ['127.0.0.1', 'localhost', '::1'].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
};

const parseBaseUrl = (baseUrl) => {
  const url = new URL(baseUrl);
  return {
    host: ['::1', 'localhost'].includes(url.hostname) ? '127.0.0.1' : url.hostname,
    port: url.port || (url.protocol === 'https:' ? '443' : '80'),
  };
};

const withPort = (baseUrl, port) => {
  const url = new URL(baseUrl);
  url.port = String(port);
  url.hostname = '127.0.0.1';
  return url.toString().replace(/\/$/, '');
};

const pingApiSurface = async (baseUrl, timeoutMs = 1500) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/consult`, {
      method: 'GET',
      signal: controller.signal,
    });
    const allow = String(response.headers.get('allow') || '').toUpperCase();
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    return allow.includes('POST') || contentType.includes('application/json');
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const spawnPreview = () => {
  const args = ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'];
  if (process.platform === 'win32') {
    const comspec = process.env.ComSpec || 'cmd.exe';
    const command = `npm ${args.join(' ')}`;
    try {
      return spawn(comspec, ['/d', '/s', '/c', command], {
        stdio: 'ignore',
        shell: false,
        windowsHide: true,
      });
    } catch {
      return spawn(command, {
        stdio: 'ignore',
        shell: true,
        windowsHide: true,
      });
    }
  }

  return spawn('npm', args, {
    stdio: 'ignore',
    shell: false,
  });
};

const spawnVercelDev = (baseUrl) => {
  const { host, port } = parseBaseUrl(baseUrl);
  const listenArg = `${host}:${port}`;
  if (process.platform === 'win32') {
    const comspec = process.env.ComSpec || 'cmd.exe';
    const command = `vercel dev --yes --listen ${listenArg}`;
    return spawn(comspec, ['/d', '/s', '/c', command], {
      stdio: 'ignore',
      shell: false,
      windowsHide: true,
    });
  }
  return spawn('vercel', ['dev', '--yes', '--listen', listenArg], {
    stdio: 'ignore',
    shell: false,
  });
};

const findFreeLocalBaseUrl = async (baseUrl, maxOffset = 20) => {
  const parsed = parseBaseUrl(baseUrl);
  const basePort = Number(parsed.port);
  if (!Number.isFinite(basePort) || basePort <= 0) return null;

  for (let offset = 1; offset <= maxOffset; offset += 1) {
    const candidatePort = basePort + offset;
    const candidateBaseUrl = withPort(baseUrl, candidatePort);
    if (!(await pingServer(candidateBaseUrl))) {
      return candidateBaseUrl;
    }
  }
  return null;
};

export const ensureE2EServer = async (baseUrl, options = {}) => {
  const target = options.target === 'api' ? 'api' : 'preview';

  if (target === 'api') {
    if (await pingApiSurface(baseUrl)) {
      return { stop: async () => {}, baseUrl };
    }

    if (!isLocalTarget(baseUrl)) {
      throw new Error(`API E2E server is unavailable at ${baseUrl}.`);
    }

    let resolvedBaseUrl = baseUrl;
    if (await pingServer(baseUrl)) {
      const fallbackBaseUrl = await findFreeLocalBaseUrl(baseUrl);
      if (!fallbackBaseUrl) {
        throw new Error(
          `A non-API server is already running at ${baseUrl}, and no free fallback port was found.`
        );
      }
      resolvedBaseUrl = fallbackBaseUrl;
    }

    const devProcess = spawnVercelDev(resolvedBaseUrl);
    const reachable = await waitUntilReachable(resolvedBaseUrl, 45_000);
    const apiReady = reachable ? await pingApiSurface(resolvedBaseUrl, 2_000) : false;

    if (!reachable || !apiReady) {
      if (!devProcess.killed) devProcess.kill();
      throw new Error(`API server did not start in time at ${resolvedBaseUrl}.`);
    }

    return {
      stop: async () => {
        if (!devProcess.killed) {
          devProcess.kill();
        }
      },
      baseUrl: resolvedBaseUrl,
    };
  }

  if (await pingServer(baseUrl)) {
    return { stop: async () => {}, baseUrl };
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
    baseUrl,
  };
};
