// Installs the /dictate skill user-wide, so it works in every project.
// The skill lives in the shared agent folder (~/.agents/skills/dictate) and Claude Code's
// ~/.claude/skills/dictate links to it, the same layout `npx skills add` uses.
// The published skill starts Dictate with npx; a git clone points it at itself instead,
// so changes you make here are what /dictate runs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, FROM_SOURCE, NPX_COMMAND } from '../server/install.js';

export function skillText() {
  const text = fs.readFileSync(path.join(ROOT, 'skills', 'dictate', 'SKILL.md'), 'utf8');
  if (!FROM_SOURCE) return text;
  const launcher = `node "${path.join(ROOT, 'bin', 'dictate.js').replaceAll('\\', '/')}"`;
  return text.replaceAll(NPX_COMMAND, launcher);
}

export function installSkill({ log = console.log } = {}) {
  const shared = path.join(os.homedir(), '.agents', 'skills', 'dictate');
  const claude = path.join(os.homedir(), '.claude', 'skills', 'dictate');

  fs.mkdirSync(shared, { recursive: true });
  fs.writeFileSync(path.join(shared, 'SKILL.md'), skillText());
  log(`Installed the dictate skill at ${shared}${FROM_SOURCE ? ` (runs this folder: ${ROOT})` : ''}`);

  // Point ~/.claude/skills/dictate at the shared copy. An older install left a plain
  // folder holding only SKILL.md there; replace that, but never a folder with anything else in it.
  let existing = null;
  try {
    existing = fs.lstatSync(claude);
  } catch {}
  if (existing?.isSymbolicLink()) {
    fs.rmSync(claude, { force: true });
    existing = null;
  }
  if (existing?.isDirectory() && fs.readdirSync(claude).every((f) => f === 'SKILL.md')) {
    fs.rmSync(claude, { recursive: true, force: true });
    existing = null;
  }
  if (existing) {
    log(`Left ${claude} alone (it has other files in it). Link it to ${shared} by hand.`);
    return { shared, claude, linked: false };
  }
  fs.mkdirSync(path.dirname(claude), { recursive: true });
  fs.symlinkSync(shared, claude, process.platform === 'win32' ? 'junction' : 'dir');
  log(`Linked ${claude} -> ${shared}`);
  return { shared, claude, linked: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) installSkill();
