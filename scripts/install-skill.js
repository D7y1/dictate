// Installs the /dictate skill for Claude Code (user level, so it works in every project).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const home = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const template = fs.readFileSync(path.join(home, 'skill', 'SKILL.md'), 'utf8');
const target = path.join(os.homedir(), '.claude', 'skills', 'dictate', 'SKILL.md');

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, template.replaceAll('{{DICTATE_HOME}}', home.replaceAll('\\', '/')));
console.log(`Installed the /dictate skill at ${target}`);
