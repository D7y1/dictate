// Where this copy of Dictate runs from, and where Chrome should load its extension from.
// A git clone is used in place. A copy started through npx lives in a cache folder that
// changes with every version, so its extension is copied to ~/.dictate/extension, which
// stays put for Chrome's "Load unpacked".
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PACKAGE = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
export const FROM_SOURCE = fs.existsSync(path.join(ROOT, '.git'));
export const DATA_DIR = path.join(os.homedir(), '.dictate');

// How the published skill starts Dictate; a source install swaps it for this folder's launcher.
export const NPX_COMMAND = `npx -y ${PACKAGE.name}@latest`;
export const SETUP_COMMAND = FROM_SOURCE ? 'npm run setup' : `npx ${PACKAGE.name} setup`;

// The Chrome Web Store listing, once the extension has one (package.json "dictate.chromeWebStoreId").
export const STORE_ID = PACKAGE.dictate?.chromeWebStoreId || null;
export const STORE_URL = STORE_ID ? `https://chromewebstore.google.com/detail/${STORE_ID}` : null;

const BUNDLED_EXTENSION = path.join(ROOT, 'extension');

export function manifestVersion(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).version;
  } catch {
    return null;
  }
}

// Folder to load unpacked. Refreshes the copy in ~/.dictate when this version bundles a different extension.
export function prepareExtensionDir() {
  if (FROM_SOURCE) return BUNDLED_EXTENSION;
  const dir = path.join(DATA_DIR, 'extension');
  try {
    if (manifestVersion(dir) !== manifestVersion(BUNDLED_EXTENSION)) {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.cpSync(BUNDLED_EXTENSION, dir, { recursive: true });
    }
    return dir;
  } catch {
    return BUNDLED_EXTENSION;
  }
}
