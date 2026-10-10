#!/usr/bin/env node
// Dictate: point, talk, submit.
//
//   node bin/dictate.js [--video <file>] [--url <url>] [--mode video|web] [--out <dir>]
//                       [--once] [--port 4747] [--lang en-US|ar-SA|auto] [--browser chrome|edge|default|none]
//                       [--title <text>] [--project <name>] [--latest]
//
// --once: exit as soon as a session is submitted (this is how Claude waits for you).
// On submit it prints:   DICTATE_SUBMITTED <session folder>

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { startServer } from '../server/server.js';

function parseArgs(argv) {
  const args = { once: false };
  const flags = new Set(['once', 'latest', 'help', 'no-open']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [key, inline] = a.slice(2).split(/=(.*)/s);
    if (flags.has(key)) args[key] = true;
    else args[key] = inline ?? argv[++i];
  }
  return args;
}

const HELP = `Dictate: point, talk, submit.

  dictate                      open the studio
  dictate --video clip.mp4     open straight into video review
  dictate --url http://...     open straight into web review
  dictate --once               exit after the first submit (used by Claude)
  dictate --latest             print the newest session folder and exit

Options: --out <dir> (default ./.dictate/sessions)  --port <n>  --lang en-US|ar-SA|auto
         --browser chrome|edge|default|none  --title <text>  --project <name>`;

function findBrowser(pref) {
  if (pref === 'none' || pref === 'default') return null;
  const local = process.env.LOCALAPPDATA || '';
  const candidates = {
    chrome: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(local, 'Google\\Chrome\\Application\\chrome.exe'),
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
    ],
    edge: [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ],
  };
  const order = pref === 'edge' ? ['edge'] : pref === 'chrome' ? ['chrome'] : ['chrome', 'edge'];
  for (const name of order) for (const file of candidates[name]) if (fs.existsSync(file)) return file;
  return null;
}

function openStudio(url, pref) {
  const browser = findBrowser(pref);
  if (browser) {
    // App window: no tabs or address bar, so it feels like a tool rather than a web page.
    spawn(browser, [`--app=${url}`, '--window-size=1440,900'], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  if (pref === 'none') return;
  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const cmdArgs = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url];
  spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

function latestSession(outDir) {
  if (!fs.existsSync(outDir)) return null;
  const dirs = fs
    .readdirSync(outDir)
    .filter((d) => fs.existsSync(path.join(outDir, d, 'report.md')))
    .sort();
  return dirs.length ? path.join(outDir, dirs.at(-1)) : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }
  const outDir = path.resolve(args.out || path.join(process.cwd(), '.dictate', 'sessions'));

  if (args.latest) {
    const dir = latestSession(outDir);
    if (!dir) {
      console.log(`No submitted sessions in ${outDir}`);
      process.exitCode = 1;
    } else console.log(dir);
    return;
  }

  const once = !!args.once;
  const project = args.project || path.basename(process.cwd());
  let finished = false;
  const done = (code) => {
    if (finished) return;
    finished = true;
    handle.close();
    setTimeout(() => process.exit(code), 100);
  };

  const handle = await startServer({
    port: Number(args.port) || 4747,
    outDir,
    once,
    project,
    video: args.video,
    url: args.url,
    mode: args.mode,
    lang: args.lang,
    title: args.title,
    onSubmit: (result) => {
      console.log('');
      console.log(`DICTATE_SUBMITTED ${result.dir}`);
      console.log(`Report: ${result.reportPath} (${result.noteCount} notes)`);
      if (once) done(0);
    },
    onAbandon: (result, info = {}) => {
      if (!once) return;
      if (result) {
        console.log(`DICTATE_DRAFT ${result.dir}`);
        console.log('The studio closed before Submit. Everything recorded was saved as a draft report.');
        console.log(`Report: ${result.reportPath}`);
      } else {
        console.log(info.cancelled ? 'DICTATE_CANCELLED' : 'DICTATE_CLOSED The studio was closed without recording anything.');
      }
      done(result ? 0 : 1);
    },
  });

  console.log(`Dictate studio: ${handle.url}`);
  console.log(`Sessions folder: ${outDir}`);
  if (once) console.log('Waiting for you to submit a session…');
  if (!args['no-open'] && args.browser !== 'none') openStudio(handle.url, args.browser);

  const shutdown = () => done(0);
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(`[dictate] ${err.stack || err.message}`);
  process.exit(1);
});
