// Installs the /dictate skill user-wide, so it works in every project.
// The skill lives in the shared agent folder (~/.agents/skills/dictate) and
// Claude Code's ~/.claude/skills/dictate links to it, like the other shared skills.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const home = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function installSkill({ log = console.log } = {}) {
  const template = fs.readFileSync(path.join(home, 'skill', 'SKILL.md'), 'utf8');
  const shared = path.join(os.homedir(), '.agents', 'skills', 'dictate');
  const claude = path.join(os.homedir(), '.claude', 'skills', 'dictate');

  fs.mkdirSync(shared, { recursive: true });
  fs.writeFileSync(path.join(shared, 'SKILL.md'), template.replaceAll('{{DICTATE_HOME}}', home.replaceAll('\\', '/')));
  log(`Installed the dictate skill at ${shared}`);

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
