// A minimal Chrome DevTools Protocol client.
//
// The MSH audit needs three things that the release gate cannot give it:
// an exact viewport width, a real rendered frame, and computed geometry.
// The release gate reads source; this reads the screen.
//
// No browser-automation dependency is used on purpose. The project ships a
// static Worker with a zero-bundle-overhead client, and the audit must be
// runnable by anyone with a local Chrome and Node — without adding a
// 300kB dependency tree to a repository that publishes its own bytes.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

export function chromePath() {
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** A CDP connection to one browser target. */
class Session {
  constructor(socket, sessionId) {
    this.socket = socket;
    this.sessionId = sessionId;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.on('message', raw => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
        else resolve(message.result);
        return;
      }
      if (message.method) {
        const handlers = this.listeners.get(message.method);
        if (handlers) for (const handler of handlers) handler(message.params);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (this.sessionId) payload.sessionId = this.sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(payload));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 60000);
    });
  }

  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(handler);
  }

  /** Resolve the first time an event fires, then stop listening. */
  once(method, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const handler = params => {
        clearTimeout(timer);
        const handlers = this.listeners.get(method) || [];
        this.listeners.set(
          method,
          handlers.filter(h => h !== handler),
        );
        resolve(params);
      };
      const timer = setTimeout(() => {
        const handlers = this.listeners.get(method) || [];
        this.listeners.set(
          method,
          handlers.filter(h => h !== handler),
        );
        reject(new Error(`CDP event timeout: ${method}`));
      }, timeoutMs);
      this.on(method, handler);
    });
  }

  /** Evaluate an expression in the page and return its value. */
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(`Page evaluation failed: ${result.exceptionDetails.text}`);
    }
    return result.result?.value;
  }
}

/**
 * Launch headless Chrome and attach to a fresh page.
 *
 * The profile directory is thrown away afterwards, so the audit never reads
 * a cookie, a token or a cached profile of the operator running it.
 */
export async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'dhaka-msh-'));
  const binary = chromePath();
  const child = spawn(
    binary || 'google-chrome',
    [
      '--headless=new',
      '--remote-debugging-port=0',
      '--remote-allow-origins=*',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      // WebGL must survive: MapLibre renders the map into a WebGL canvas, and
      // a context failure makes the atlas report "Map unavailable" — a fault
      // in the audit harness, not in the product. Software rasterisation is
      // slower but renders the same pixels.
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const endpoint = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error('Chrome did not report a DevTools endpoint')), 30000);
    child.stderr.on('data', chunk => {
      buffer += chunk.toString();
      const match = buffer.match(/ws:\/\/[^\s]+/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
    child.on('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited early (code ${code}): ${buffer.slice(-400)}`));
    });
  });

  const socket = new WebSocket(endpoint, { perMessageDeflate: false, maxPayload: 512 * 1024 * 1024 });
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });

  const { targetId } = await new Promise((resolve, reject) => {
    const id = 1;
    socket.on('message', raw => {
      const message = JSON.parse(raw.toString());
      if (message.id !== id) return;
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
    socket.send(JSON.stringify({ id, method: 'Target.createTarget', params: { url: 'about:blank' } }));
  });

  const { sessionId } = await new Promise((resolve, reject) => {
    const id = 2;
    const handler = raw => {
      const message = JSON.parse(raw.toString());
      if (message.id !== id) return;
      socket.off('message', handler);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    };
    socket.on('message', handler);
    socket.send(
      JSON.stringify({ id, method: 'Target.attachToTarget', params: { targetId, flatten: true } }),
    );
  });

  const session = new Session(socket, sessionId);
  await session.send('Page.enable');
  await session.send('Runtime.enable');

  return {
    session,
    async close() {
      try {
        socket.close();
      } catch {
        /* the socket is already gone */
      }
      child.kill('SIGTERM');
      await new Promise(resolve => {
        child.once('exit', resolve);
        setTimeout(resolve, 3000);
      });
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        /* a leftover temp profile is not a failure of the audit */
      }
    },
  };
}
