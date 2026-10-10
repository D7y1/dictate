// Customizable controls: any action can be bound to keys and to mouse buttons
// (middle click and the two side buttons), so a whole review can run from the mouse.
//
// A binding is a string: 'KeyT', 'Space', 'Escape', 'Alt+KeyA', 'MouseBack', 'MouseForward', 'MouseMiddle'.
import { prefs, savePref } from './util.js';

export const ACTIONS = [
  { id: 'talk', label: 'Talk', hint: 'Open a voice note, then close it. Hold to talk while held.', scope: 'all', defaults: ['KeyT', 'MouseBack'] },
  { id: 'discard', label: 'Discard the open note', scope: 'all', defaults: ['Escape'] },
  { id: 'playPause', label: 'Play / pause', scope: 'video', defaults: ['Space', 'KeyK', 'MouseForward'] },
  { id: 'markIn', label: 'Mark in', scope: 'video', defaults: ['KeyI'] },
  { id: 'markOut', label: 'Mark out', scope: 'video', defaults: ['KeyO'] },
  { id: 'marker', label: 'Marker', scope: 'video', defaults: ['KeyM'] },
  { id: 'record', label: 'Start or pause the session', scope: 'all', defaults: ['KeyR'] },
  { id: 'typeNote', label: 'Type a note', scope: 'all', defaults: ['KeyN'] },
  { id: 'annotate', label: 'Pin on your site without talking', scope: 'web', defaults: ['Alt+KeyA'] },
];

// Video navigation keys that stay fixed (they behave like every editor's).
export const FIXED = new Set(['ArrowLeft', 'ArrowRight', 'Shift+ArrowLeft', 'Shift+ArrowRight', 'KeyJ', 'KeyL', 'Backspace', 'Delete']);

const MOUSE = { 1: 'MouseMiddle', 3: 'MouseBack', 4: 'MouseForward' };
const MOUSE_LABEL = { MouseMiddle: 'Middle click', MouseBack: 'Side button (back)', MouseForward: 'Side button (forward)' };
const MODIFIERS = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'CapsLock']);

export function defaults() {
  return Object.fromEntries(ACTIONS.map((a) => [a.id, [...a.defaults]]));
}

export function loadBindings() {
  const saved = prefs('bindings', null);
  const out = defaults();
  if (saved && typeof saved === 'object') {
    for (const a of ACTIONS) if (Array.isArray(saved[a.id])) out[a.id] = saved[a.id].filter((b) => typeof b === 'string');
  } else {
    // Older versions only had a talk key.
    const legacy = prefs('talkKey', null);
    if (legacy && legacy !== 'KeyT') out.talk = [legacy, 'MouseBack'];
  }
  return out;
}

export function saveBindings(bindings) {
  savePref('bindings', bindings);
}

export function fromKeyEvent(e) {
  if (!e.code || MODIFIERS.has(e.code)) return null;
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta'].filter(Boolean);
  return [...mods, e.code].join('+');
}

// Left click is for pointing and pinning, so it is never a binding.
export function fromMouseEvent(e) {
  if (e.button === 0 || e.button === 2) return null;
  return MOUSE[e.button] || `Mouse${e.button + 1}`;
}

export function isMouse(binding) {
  return binding.startsWith('Mouse');
}

export function label(binding) {
  if (isMouse(binding)) return MOUSE_LABEL[binding] || `Mouse button ${binding.slice(5)}`;
  return binding
    .split('+')
    .map((part) =>
      part
        .replace(/^Key/, '')
        .replace(/^Digit/, '')
        .replace(/^Arrow/, '')
        .replace('Escape', 'Esc')
        .replace('Backquote', '`')
        .replace('BrowserBack', 'Browser back')
        .replace('BrowserForward', 'Browser forward')
        .replace('Meta', 'Win'),
    )
    .join(' ');
}

export function actionFor(bindings, binding, mode) {
  if (!binding) return null;
  for (const a of ACTIONS) {
    if (a.scope !== 'all' && a.scope !== mode) continue;
    if (bindings[a.id]?.includes(binding)) return a.id;
  }
  return null;
}

// The first keyboard binding for an action, for inline hints like "press T".
export function keyHint(bindings, id) {
  const key = (bindings[id] || []).find((b) => !isMouse(b));
  return key ? label(key) : null;
}

export function hasMouse(bindings, id) {
  return (bindings[id] || []).some(isMouse);
}

// The subset the extension needs on your site's pages.
export function forExtension(bindings) {
  return { talk: bindings.talk, discard: bindings.discard, annotate: bindings.annotate };
}
