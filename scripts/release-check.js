// Release gate for a v* tag: the tag must match package.json, and if extension/ changed since
// the previous release, its manifest version must have gone up too (the Chrome Web Store only
// accepts a higher version, and the npm package ships the same extension for unpacked installs).
//
//   node scripts/release-check.js v1.2.0
//
// In GitHub Actions it writes extension_changed=true|false to $GITHUB_OUTPUT.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PACKAGE } from '../server/install.js';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const fail = (msg) => {
  console.error(`::error::${msg}`);
  process.exit(1);
};

const tag = process.argv[2] || process.env.GITHUB_REF_NAME;
if (tag !== `v${PACKAGE.version}`) fail(`Tag ${tag} doesn't match package.json version ${PACKAGE.version}. Bump package.json, commit, then tag v<version>.`);

const manifestAt = (ref) => JSON.parse(git('show', `${ref}:extension/manifest.json`)).version;
const current = JSON.parse(fs.readFileSync('extension/manifest.json', 'utf8')).version;

let previous = null;
try {
  previous = git('describe', '--tags', '--abbrev=0', '--match', 'v*', `${tag}^`);
} catch {
  // first release
}

let changed = true;
if (previous) {
  changed = git('diff', '--name-only', previous, tag, '--', 'extension').length > 0;
  const before = manifestAt(previous);
  if (changed && before === current) fail(`extension/ changed since ${previous} but its version is still ${current}. Bump "version" in extension/manifest.json.`);
  if (!changed && before !== current) changed = true;
}

console.log(`Releasing ${tag}. Extension ${current}: ${changed ? 'new version, goes to the Chrome Web Store' : 'unchanged'}${previous ? ` (since ${previous})` : ' (first release)'}.`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `extension_changed=${changed}\nextension_version=${current}\n`);
