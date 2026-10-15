#!/usr/bin/env node
// One-command setup: checks what Dictate needs, installs what it can, and walks you
// through the one step a browser only lets a person do (loading the extension).
// Safe to run again at any time; finished steps are skipped.
//
//   npm run setup                       everything
//   npm run setup -- --no-model         skip the speech model download
//   flags: --no-whisper --no-model --no-link --no-open
import path from 'node:path';
import readline from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Transcriber } from '../server/transcriber.js';
import { BROWSERS, browserName, findBrowser, loadedExtensionProfiles } from '../server/browser.js';
import { installSkill } from './install-skill.js';

const home = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workerScript = path.join(home, 'server', 'whisper_worker.py');
const extensionDir = path.join(home, 'extension');
const args = new Set(process.argv.slice(2));
const want = (name) => !args.has(`--no-${name}`);
const win = process.platform === 'win32';

const todo = [];
const step = (n, title) => console.log(`\n${n}. ${title}`);
const ok = (msg) => console.log(`   ✓ ${msg}`);
const say = (msg) => console.log(`     ${msg}`);
const warn = (msg, later) => {
  console.log(`   ! ${msg}`);
  if (later) todo.push(later);
};

if (args.has('--help') || args.has('-h')) {
  console.log(`Sets up Dictate on this machine. Safe to run again; finished steps are skipped.

  npm run setup [-- flags]

  --no-whisper   don't install speech to text (Dictate uses the browser's live captions)
  --no-model     don't download the speech model now (it downloads on your first review)
  --no-link      don't add the \`dictate\` command
  --no-open      don't open the extensions page or copy the extension path`);
  process.exit(0);
}

// --- Python helpers ---------------------------------------------------------

function findPython() {
  const candidates = win ? [['python'], ['py', '-3'], ['python3']] : [['python3'], ['python']];
  for (const cmd of candidates) {
    const r = spawnSync(cmd[0], [...cmd.slice(1), '-c', 'import sys; print("%d.%d" % sys.version_info[:2])'], { encoding: 'utf8', timeout: 20000, windowsHide: true });
    const [major, minor] = (r.stdout || '').trim().split('.').map(Number);
    if (r.status === 0 && (major > 3 || (major === 3 && minor >= 9))) return { cmd, version: `${major}.${minor}` };
  }
  return null;
}

const py = (python, code) => spawnSync(python[0], [...python.slice(1), '-c', code], { encoding: 'utf8', timeout: 30000, windowsHide: true });

function pipInstall(python, packages) {
  say(`$ ${python.join(' ')} -m pip install ${packages.join(' ')}`);
  const r = spawnSync(python[0], [...python.slice(1), '-m', 'pip', 'install', ...packages], { stdio: 'inherit', windowsHide: true });
  return r.status === 0;
}

function nvidiaGpu() {
  const r = spawnSync('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  return r.status === 0 ? r.stdout.trim().split(/\r?\n/)[0] : null;
}

// Starts the worker once so the model is downloaded and loaded; download progress shows in this terminal.
function loadModel(python) {
  return new Promise((resolve, reject) => {
    const proc = spawn(python[0], [...python.slice(1), '-u', workerScript], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', HF_HUB_DISABLE_TELEMETRY: '1', PYTHONWARNINGS: 'ignore' },
      stdio: ['pipe', 'pipe', 'inherit'],
      windowsHide: true,
    });
    readline.createInterface({ input: proc.stdout }).on('line', (line) => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg.event === 'ready') resolve(msg);
      else if (msg.event === 'error') reject(new Error(msg.error));
      proc.stdin.end(); // the worker exits once its input closes
    });
    proc.on('error', reject);
    proc.on('exit', (code) => reject(new Error(`The speech worker stopped (exit code ${code}).`)));
  });
}

// --- Steps ------------------------------------------------------------------

async function main() {
  console.log(`Setting up Dictate from ${home}`);

  step(1, 'Node.js and a browser');
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) {
    warn(`Node ${process.versions.node} is too old; Dictate needs 20 or newer.`);
    say(win ? 'Update it with:  winget install OpenJS.NodeJS.LTS   (or from https://nodejs.org)' : 'Update it from https://nodejs.org');
    process.exit(1);
  }
  ok(`Node ${process.versions.node}`);
  const browser = findBrowser();
  if (browser) ok(`${BROWSERS[browserName(browser)].label} found`);
  else warn('Neither Chrome nor Edge was found. Install Chrome; web review needs it for the extension.', 'Install Google Chrome, then run setup again.');

  step(2, 'Speech to text (faster-whisper)');
  let python = null;
  if (!want('whisper')) say('Skipped (--no-whisper). Dictate will use the browser\'s live captions.');
  else {
    const probe = new Transcriber({ script: workerScript });
    if (probe.probe()) {
      python = probe.python;
      ok(`faster-whisper is installed (${python.join(' ')})`);
    } else {
      const found = findPython();
      if (!found) {
        warn(
          'Python 3.9 or newer was not found, so transcription can\'t be installed yet.',
          win ? 'Install Python (winget install Python.Python.3.12), open a new terminal, and run setup again.' : 'Install Python 3.9+ and run setup again.',
        );
        say('Until then Dictate falls back to the browser\'s live captions.');
      } else {
        say(`Installing faster-whisper with Python ${found.version}...`);
        if (pipInstall(found.cmd, ['faster-whisper'])) {
          python = found.cmd;
          ok('faster-whisper installed');
        } else warn('pip could not install faster-whisper (see the output above).', 'Fix the pip error above, then run setup again.');
      }
    }

    // CTranslate2 needs cuBLAS and cuDNN to use an NVIDIA card. PyTorch ships them; otherwise add the pip wheels.
    const gpu = python && win ? nvidiaGpu() : null;
    if (gpu) {
      const has = py(python, "import importlib.util as u\ntry:\n  import nvidia.cublas, nvidia.cudnn; print(1)\nexcept Exception:\n  print(1 if u.find_spec('torch') else 0)");
      if (has.stdout?.trim() === '1') ok(`${gpu}: CUDA libraries present`);
      else {
        say(`${gpu} found. Installing the CUDA libraries Whisper needs to use it (about 1 GB)...`);
        if (pipInstall(python, ['nvidia-cublas-cu12', 'nvidia-cudnn-cu12==9.*'])) ok('CUDA libraries installed');
        else warn('Could not install the CUDA libraries; Whisper will run on the CPU (slower).');
      }
    }
  }

  step(3, 'Speech model');
  if (!python) say('Skipped (no faster-whisper).');
  else if (!want('model')) say('Skipped (--no-model). It downloads on your first review instead.');
  else {
    say('Loading it now so your first review doesn\'t wait. The first time this downloads');
    say('about 1.6 GB (or 0.5 GB without an NVIDIA card); after that it loads in seconds.');
    try {
      const ready = await loadModel(python);
      ok(`${ready.model} ready on the ${ready.device === 'cuda' ? 'GPU' : 'CPU'}`);
      if (ready.device !== 'cuda' && win && nvidiaGpu()) warn('Your NVIDIA card isn\'t being used, so transcription will be slower. Updating the NVIDIA driver usually fixes this.');
    } catch (err) {
      warn(`The model didn't load: ${err.message}`, 'Run setup again to retry the speech model download.');
      say('Dictate falls back to the browser\'s live captions until it does.');
    }
  }

  step(4, 'Claude skill (/dictate)');
  try {
    installSkill({ log: ok });
  } catch (err) {
    warn(`Could not install the skill: ${err.message}`, 'Fix the skill install error above, then run setup again.');
  }

  step(5, 'The dictate command');
  if (!want('link')) say('Skipped (--no-link). Use  node bin/dictate.js  from this folder.');
  else {
    const r = spawnSync('npm link', { cwd: home, encoding: 'utf8', shell: true, windowsHide: true });
    if (r.status === 0) ok('Added `dictate`. Open a new terminal and run  dictate --help');
    else warn(`npm link failed, so there's no \`dictate\` command (use  node bin/dictate.js  instead). ${(r.stderr || '').trim().split(/\r?\n/).at(-1) || ''}`);
  }

  step(6, 'Browser extension (web review only)');
  const loaded = loadedExtensionProfiles(extensionDir);
  if (loaded.length) {
    ok(`Loaded in ${loaded.join(', ')}`);
    say('After updating Dictate, press the reload arrow on its card in the extensions page.');
  } else {
    const name = browser ? browserName(browser) : 'chrome';
    const page = BROWSERS[name].extensionsPage;
    warn(`Not loaded yet. ${BROWSERS[name].label} only lets you add it by hand, once:`, `Load the extension: ${page} → Developer mode → Load unpacked → ${extensionDir}`);
    say(`a) Open ${page} and turn on Developer mode (top right).`);
    say('b) Click "Load unpacked" and choose this folder:');
    say(`   ${extensionDir}`);
    say('c) Run setup again to confirm. Video review works without it.');
    if (want('open') && browser) {
      copyToClipboard(extensionDir) && say('The folder path is on your clipboard; paste it into the folder picker.');
      spawn(browser, [page], { detached: true, stdio: 'ignore' }).unref();
      say(`Opened ${page} for you.`);
    }
  }

  console.log(todo.length ? '\nAlmost there. Still to do:' : '\nDictate is ready.');
  todo.forEach((t, i) => console.log(`   ${i + 1}) ${t}`));
  console.log('\nUse it: in Claude Code, from any project, type  /dictate');
  console.log('        or open the studio yourself with  dictate  (or  npm start  in this folder).');
}

function copyToClipboard(text) {
  const cmd = win ? ['clip'] : process.platform === 'darwin' ? ['pbcopy'] : ['xclip', '-selection', 'clipboard'];
  const r = spawnSync(cmd[0], cmd.slice(1), { input: text, windowsHide: true });
  return r.status === 0;
}

main().catch((err) => {
  console.error(`\nSetup stopped: ${err.stack || err.message}`);
  process.exit(1);
});
