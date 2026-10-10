// Scripted UI captures for design review: drives a headless Chrome over the DevTools
// protocol through a realistic session and saves screenshots at exact sizes.
//
//   node scripts/capture.js <studio url> <out dir>
//
// The studio must be running with a test video (node bin/dictate.js --video clip.mp4).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const [url = 'http://localhost:4799/', outDir = '.impeccable/review'] = process.argv.slice(2);
const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dictate-capture-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1586,992',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required',
  '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

let ws;
let seq = 0;
const pending = new Map();
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function js(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function size(width, height, mobile = false) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await sleep(300);
}
async function shot(file) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, file), Buffer.from(r.data, 'base64'));
  console.log(`saved ${file}`);
}
async function mouse(type, x, y) {
  await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
}
async function click(x, y) {
  await mouse('mouseMoved', x, y);
  await mouse('mousePressed', x, y);
  await mouse('mouseReleased', x, y);
}
async function drag(x1, y1, x2, y2) {
  await mouse('mouseMoved', x1, y1);
  await mouse('mousePressed', x1, y1);
  for (let i = 1; i <= 8; i++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1 + ((x2 - x1) * i) / 8, y: y1 + ((y2 - y1) * i) / 8, button: 'left', buttons: 1 });
  await mouse('mouseReleased', x2, y2);
}
async function key(code, keyName) {
  const text = keyName === 'Enter' ? String.fromCharCode(13) : keyName.length === 1 ? keyName : undefined;
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: keyName, text, windowsVirtualKeyCode: keyName === 'Enter' ? 13 : undefined });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: keyName });
}
async function seek(t) {
  await js(`(async () => { const v = document.querySelector('#video'); v.currentTime = ${t}; await new Promise(r => v.addEventListener('seeked', r, { once: true })); })()`);
  await sleep(150);
}
// Point on the picture, as a fraction of the frame.
async function at(fx, fy) {
  return js(`(() => { const s = document.querySelector('#stage').getBoundingClientRect(); const v = document.querySelector('#video');
    const sc = Math.min(s.width / v.videoWidth, s.height / v.videoHeight); const w = v.videoWidth * sc, h = v.videoHeight * sc;
    return [s.left + (s.width - w) / 2 + ${fx} * w, s.top + (s.height - h) / 2 + ${fy} * h]; })()`);
}
const say = (text, interim = false) => js(`window.__dictate.recorder.voice.dispatchEvent(new CustomEvent('${interim ? 'interim' : 'final'}', { detail: { id: 'c' + Math.random(), text: ${JSON.stringify(text)}, tStart: Date.now() - 1200, tEnd: Date.now() } }))`);

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  let targets;
  for (let i = 0; i < 40; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      break;
    } catch {
      await sleep(250);
    }
  }
  const page = targets.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await size(1586, 992);
  await send('Page.navigate', { url: `${url}?debug` });
  await sleep(2500);
  await js(`(async () => { const v = document.querySelector('#video'); if (v.readyState < 1) await new Promise(r => v.addEventListener('loadedmetadata', r, { once: true })); })()`);

  // 1. Pin the mug, talk, close.
  await seek(3.2);
  let [x, y] = await at(0.62, 0.42);
  await click(x, y);
  await sleep(1500);
  await key('KeyT', 't');
  await sleep(300);
  await say('Blur this logo here.');
  await key('KeyT', 't');
  // 2. A range to cut.
  await seek(8);
  await key('KeyI', 'i');
  await seek(12.4);
  await key('KeyO', 'o');
  // 3. Box the window, then talk in Arabic.
  await seek(15);
  const [bx1, by1] = await at(0.7, 0.12);
  const [bx2, by2] = await at(0.92, 0.5);
  await drag(bx1, by1, bx2, by2);
  await sleep(200);
  await key('KeyT', 't');
  await sleep(300);
  await say('هذا الجزء طويل، قصّه');
  await key('KeyT', 't');
  await sleep(400);
  await shot('box.png'); // playhead still on B1, so the box and its tab are visible
  // 4. A typed note.
  await seek(20);
  await key('KeyN', 'n');
  await send('Input.insertText', { text: 'Make the title bigger.' });
  await key('Enter', 'Enter');
  // 5. Pin and leave a note open mid-sentence.
  await seek(24.5);
  [x, y] = await at(0.3, 0.62);
  await click(x, y);
  await sleep(200);
  await key('KeyT', 't');
  await sleep(300);
  await say('Add a slight zoom in here', true);
  await mouse('mouseMoved', x + 6, y + 4);
  await sleep(700);
  await shot('hero-repro.png');

  await size(1440, 900);
  await sleep(400);
  await shot('desktop.png');

  await size(390, 844, true);
  await sleep(400);
  await shot('mobile.png');

  // Finish: Whisper runs, then the review screen.
  await size(1440, 900);
  await key('KeyT', 't'); // close the open note
  await js(`document.querySelector('#screen-video [data-action=finish]').click()`);
  for (let i = 0; i < 120; i++) {
    if (await js(`!document.querySelector('#screen-review').hidden`)) break;
    await sleep(500);
  }
  await sleep(600);
  await shot('review.png');

  // Web review panel at its docked width, in a fresh window state.
  await js(`window.onbeforeunload = null`);
  await send('Page.navigate', { url: `${url}?debug` });
  await sleep(2000);
  await js(`document.querySelector('#screen-video [data-home]').click(); document.querySelector('[data-enter=web]').click();`);
  await size(460, 900);
  await sleep(400);
  await shot('web-panel.png');

  // Home screen with the Controls panel.
  await size(1440, 1100);
  await js(`document.querySelector('#screen-web [data-home]').click(); document.querySelector('.controls').scrollIntoView()`);
  await sleep(400);
  await shot('home-controls.png');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    ws?.close();
    chrome.kill();
    setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 500);
  });
