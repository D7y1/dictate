import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const local = process.env.LOCALAPPDATA || '';

export const BROWSERS = {
  chrome: {
    label: 'Chrome',
    files: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(local, 'Google\\Chrome\\Application\\chrome.exe'),
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
    ],
    extensionsPage: 'chrome://extensions/',
  },
  edge: {
    label: 'Edge',
    files: [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ],
    extensionsPage: 'edge://extensions/',
  },
};

// Path of the preferred installed browser, or null. pref: chrome | edge | default | none | undefined.
export function findBrowser(pref) {
  if (pref === 'none' || pref === 'default') return null;
  const order = pref === 'edge' ? ['edge'] : pref === 'chrome' ? ['chrome'] : ['chrome', 'edge'];
  for (const name of order) for (const file of BROWSERS[name].files) if (fs.existsSync(file)) return file;
  return null;
}

// Which browser a findBrowser() path belongs to.
export function browserName(file) {
  return Object.keys(BROWSERS).find((name) => BROWSERS[name].files.includes(file)) || null;
}

// Where Chrome and Edge keep their profiles on this machine.
export function profileRoots() {
  const h = os.homedir();
  return [
    ['Chrome', path.join(local, 'Google', 'Chrome', 'User Data')],
    ['Edge', path.join(local, 'Microsoft', 'Edge', 'User Data')],
    ['Chrome', path.join(h, 'Library', 'Application Support', 'Google', 'Chrome')],
    ['Edge', path.join(h, 'Library', 'Application Support', 'Microsoft Edge')],
    ['Chrome', path.join(h, '.config', 'google-chrome')],
  ];
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

// Browser profiles that have the unpacked extension at `dir` loaded, e.g. ["Chrome (Work)"].
// Reads the profiles' preference files only; nothing is changed.
export function loadedExtensionProfiles(dir, roots = profileRoots()) {
  const want = path.resolve(dir).toLowerCase();
  const found = [];
  for (const [browser, root] of roots) {
    let profiles;
    try {
      profiles = fs.readdirSync(root);
    } catch {
      continue;
    }
    const names = readJson(path.join(root, 'Local State'))?.profile?.info_cache || {};
    for (const profile of profiles) {
      const hit = ['Secure Preferences', 'Preferences'].some((file) => {
        const settings = readJson(path.join(root, profile, file))?.extensions?.settings || {};
        return Object.values(settings).some((ext) => typeof ext?.path === 'string' && path.isAbsolute(ext.path) && path.resolve(ext.path).toLowerCase() === want);
      });
      if (hit) found.push(`${browser} (${names[profile]?.name || profile})`);
    }
  }
  return found;
}
