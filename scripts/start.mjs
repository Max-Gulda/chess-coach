import { spawn } from 'node:child_process';
import { access, closeSync, openSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const vite = fileURLToPath(
  new URL('../node_modules/vite/bin/vite.js', import.meta.url),
);
const url = 'http://127.0.0.1:4173';

async function ready() {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return (
      response.ok && (await response.text()).includes('<title>Chess Coach')
    );
  } catch {
    return false;
  }
}

async function launch() {
  if (!(await ready())) {
    try {
      await promisify(access)(vite);
    } catch {
      throw new Error(
        'Dependencies are missing. Run npm ci in the project folder first.',
      );
    }
    const log = openSync(new URL('../server.log', import.meta.url), 'a');
    const child = spawn(
      process.execPath,
      [vite, '--host', '127.0.0.1', '--port', '4173', '--strictPort'],
      {
        cwd: root,
        detached: true,
        stdio: ['ignore', log, log],
      },
    );
    closeSync(log);
    let startError;
    child.on('error', (error) => {
      startError = error;
    });
    child.unref();
    for (let i = 0; i < 50 && !(await ready()); i++) {
      if (startError) throw startError;
      if (child.exitCode !== null)
        throw new Error(
          'The server could not start. Port 4173 may be busy. Check server.log.',
        );
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!(await ready()))
      throw new Error(
        'The server did not become ready. Check server.log in the project folder.',
      );
  }

  const command =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'rundll32'
        : 'xdg-open';
  const args =
    process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const browser = spawn(command, args, { stdio: 'ignore' });
  browser.on('error', () => console.log(`Open ${url} in your browser.`));
  browser.unref();
  console.log(`Chess Coach is ready at ${url}`);
}

launch().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
