import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAudioClock, compileSession, applyEdits, renderReport, restingSpots, videoTimeAt, fmtTimecode } from '../server/compile.js';

const T0 = 1_700_000_000_000;

test('audio clock skips paused time', () => {
  const clock = buildAudioClock([
    { type: 'audio.start', t: T0 },
    { type: 'audio.pause', t: T0 + 10_000 },
    { type: 'audio.resume', t: T0 + 25_000 },
  ]);
  assert.equal(clock(5), T0 + 5_000);
  assert.equal(clock(12), T0 + 27_000); // 10s before the pause + 2s after resuming
});

test('video time extrapolates while playing and holds while paused', () => {
  const states = [
    { t: T0, time: 10, playing: true, rate: 1 },
    { t: T0 + 4_000, time: 14, playing: false, rate: 1 },
  ];
  assert.equal(videoTimeAt(states, T0 + 2_000, 60), 12);
  assert.equal(videoTimeAt(states, T0 + 9_000, 60), 14);
  assert.equal(videoTimeAt(states, T0 - 1, 60), null);
});

test('resting spots find where the cursor stayed', () => {
  const samples = [
    { t: T0, x: 0.1, y: 0.1 },
    { t: T0 + 100, x: 0.5, y: 0.5 },
    { t: T0 + 150, x: 0.505, y: 0.5 },
    { t: T0 + 2_000, x: 0.9, y: 0.9 },
  ];
  const spots = restingSpots(samples, T0, T0 + 2_500, { radius: 0.03, minMs: 400 });
  assert.equal(spots[0].x, 0.5);
  assert.ok(spots[0].ms >= 1_800);
});

function videoSession() {
  const meta = { id: 'test-video', mode: 'video', startedAt: T0, endedAt: T0 + 30_000, video: { name: 'vlog.mp4', width: 1920, height: 1080, duration: 120 } };
  const events = [
    { type: 'audio.start', t: T0 },
    { type: 'video.state', t: T0, time: 80, playing: true, rate: 1 },
    { type: 'video.mouse', t: T0 + 1_000, x: 0.62, y: 0.4, vt: 81, inside: true },
    { type: 'video.state', t: T0 + 3_000, time: 83, playing: false, rate: 1 },
    { type: 'video.pin', t: T0 + 3_500, id: 'p1', n: 1, kind: 'pin', x: 0.62, y: 0.4, vt: 83 },
    { type: 'frame', t: T0 + 3_520, file: 'frames/0001-mark.jpg', reason: 'mark', ref: 'p1' },
    { type: 'video.range', t: T0 + 20_000, id: 'r1', n: 1, kind: 'range', in: 83, out: 101.2 },
    { type: 'video.box', t: T0 + 28_000, id: 'b1', n: 1, kind: 'box', x: 0.1, y: 0.1, w: 0.2, h: 0.1, vt: 101.2 },
    { type: 'audio.stop', t: T0 + 30_000 },
  ];
  const transcript = {
    language: 'en',
    segments: [
      {
        start: 4,
        end: 7,
        text: 'Blur this logo here.',
        words: [
          { start: 4, end: 4.3, word: ' Blur' },
          { start: 4.3, end: 4.6, word: ' this' },
          { start: 4.6, end: 5, word: ' logo' },
          { start: 5, end: 5.3, word: ' here.' },
        ],
      },
      { start: 19, end: 21, text: 'Cut this whole part.', words: [{ start: 19, end: 19.3, word: ' Cut' }] },
    ],
  };
  return { meta, events, transcript };
}

test('video notes anchor speech to pins, ranges, frames and pointing words', () => {
  const compiled = compileSession(videoSession());
  assert.equal(compiled.transcriptSource, 'whisper');
  assert.equal(compiled.notes.length, 3); // two spoken notes + a box with no speech

  const [blur, cut, box] = compiled.notes;
  assert.equal(blur.text, 'Blur this logo here.');
  assert.deepEqual(blur.marks.map((m) => m.id), ['p1']);
  assert.equal(blur.marks[0].px.x, 1190);
  assert.equal(blur.video.from, 83); // paused at 83 when speech began
  assert.deepEqual(blur.frames.map((f) => f.file), ['frames/0001-mark.jpg']);
  assert.deepEqual(blur.pointing.map((p) => p.word), ['this', 'here.']);
  assert.equal(blur.pointing[0].x, 0.62);

  assert.deepEqual(cut.marks.map((m) => m.kind), ['range']);
  assert.equal(box.source, 'mark');
  assert.equal(box.text, '');

  const report = renderReport({ meta: videoSession().meta, compiled });
  assert.match(report, /### 1\. 00:01:23\.00/);
  assert.match(report, /\*\*Pin P1\*\* at x 0\.62, y 0\.40 \[1190, 432 px\]/);
  assert.match(report, /\*\*Range R1:\*\* 00:01:23\.00 → 00:01:41\.20 \(18\.20s\)/);
  assert.match(report, /\| R1 \| 00:01:23\.00 \| 00:01:41\.20 \|/);
});

test('web notes carry page, pinned element, hovered elements and screenshots', () => {
  const el = { tag: 'button', cls: ['btn', 'btn-primary'], text: 'Add listing', selector: 'main > div.toolbar > button.btn-primary', html: '<button class="btn btn-primary">Add listing</button>', rect: { x: 1180, y: 96, w: 140, h: 40 } };
  const h1 = { tag: 'h1', text: 'Listngs', selector: 'main > h1', html: '<h1>Listngs</h1>' };
  const meta = { id: 'test-web', mode: 'web', startedAt: T0, endedAt: T0 + 60_000, startUrl: 'http://localhost:3000/' };
  const events = [
    { type: 'speech.final', t: T0 + 9_000, id: 1, text: 'This button should be green', tStart: T0 + 6_000, tEnd: T0 + 9_000 },
    { type: 'page.visit', t: T0 + 1_000, url: 'http://localhost:3000/dashboard/listings', title: 'Listings' },
    { type: 'frame', t: T0 + 1_700, file: 'frames/0001-page.jpg', reason: 'page', url: 'http://localhost:3000/dashboard/listings' },
    { type: 'page.hover', t: T0 + 2_000, el: h1 },
    { type: 'page.hover', t: T0 + 4_500, el },
    { type: 'page.mark', t: T0 + 5_000, id: 'w1', n: 1, kind: 'pin', el, url: 'http://localhost:3000/dashboard/listings', viewport: { w: 1440, h: 900 } },
    { type: 'frame', t: T0 + 5_200, file: 'frames/0002-mark.jpg', reason: 'mark', ref: 'w1' },
    { type: 'page.visit', t: T0 + 30_000, url: 'http://localhost:3000/settings', title: 'Settings' },
    { type: 'note.text', t: T0 + 40_000, id: 9, text: 'Settings page needs a save button' },
  ];
  const compiled = compileSession({ meta, events });
  assert.equal(compiled.transcriptSource, 'live');
  assert.equal(compiled.notes.length, 2);

  const [green, typed] = compiled.notes;
  assert.equal(green.page.url, 'http://localhost:3000/dashboard/listings');
  assert.equal(green.marks[0].el.text, 'Add listing');
  assert.deepEqual(green.frames.map((f) => f.file), ['frames/0002-mark.jpg']);
  assert.equal(green.hovered[0].el.text, 'Add listing');
  assert.equal(typed.source, 'typed');
  assert.equal(typed.page.url, 'http://localhost:3000/settings');
  assert.equal(compiled.pages.length, 2);
  assert.deepEqual(compiled.pages[0].notes, [1]);

  const edited = applyEdits(compiled, { notes: { [typed.id]: { deleted: true }, [green.id]: { text: 'Make this button green' } }, general: 'Keep the brand colors.' });
  assert.equal(edited.notes.length, 1);
  assert.equal(edited.notes[0].text, 'Make this button green');

  const report = renderReport({ meta, compiled: edited });
  assert.match(report, /## Overall direction\n\nKeep the brand colors\./);
  assert.match(report, /\*\*Pin P1\*\* → `button\.btn\.btn-primary` "Add listing"/);
  assert.match(report, /selector: `main > div\.toolbar > button\.btn-primary`/);
  assert.match(report, /## Pages visited/);
});

function referenceSession() {
  const look = { font: '500 14px/20px Inter', color: '#e6e6e6', background: '#0f1115', padding: '8px 12px', radius: '8px' };
  const navItem = {
    tag: 'a', cls: ['nav-item'], text: 'Dashboard', selector: 'aside > a:nth-of-type(1)', html: '<a class="nav-item">Dashboard</a>', rect: { x: 16, y: 120, w: 232, h: 40 },
    look, within: { tag: 'aside', cls: ['sidebar'], rect: { x: 0, y: 0, w: 264, h: 900 }, look: { font: '400 14px/20px Inter', background: '#0f1115', padding: '16px' } },
  };
  const meta = { id: 'test-ref', mode: 'web', startedAt: T0, endedAt: T0 + 30_000, startUrl: 'http://localhost:3000/' };
  const masakin = 'http://localhost:3000/dashboard';
  const dribbble = 'https://dribbble.com/shots/123-sidebar';
  const events = [
    { type: 'page.visit', t: T0 + 1_000, url: masakin, title: 'Masakin', reference: false },
    { type: 'note.start', t: T0 + 2_000, id: 'k1', page: { url: masakin, title: 'Masakin' } },
    { type: 'speech.final', t: T0 + 4_000, id: 'c1', note: 'k1', text: 'I want a sidebar here', tStart: T0 + 2_100, tEnd: T0 + 4_000 },
    { type: 'note.end', t: T0 + 5_000, id: 'k1' },
    { type: 'page.visit', t: T0 + 10_000, url: dribbble, title: 'Sidebar by Someone', reference: true },
    { type: 'note.start', t: T0 + 12_000, id: 'k2', page: { url: dribbble, title: 'Sidebar by Someone' } },
    { type: 'page.mark', t: T0 + 12_050, id: 'w2', n: 2, kind: 'pin', auto: true, note: 'k2', url: dribbble, title: 'Sidebar by Someone', reference: true, x: 40, y: 140, viewport: { w: 1440, h: 900 }, el: navItem },
    { type: 'frame', t: T0 + 12_600, file: 'frames/0002-mark.jpg', reason: 'mark', ref: 'w2', url: dribbble, reference: true },
    { type: 'speech.final', t: T0 + 15_000, id: 'c2', note: 'k2', text: 'Like this sidebar, the icons grouped', tStart: T0 + 12_100, tEnd: T0 + 15_000 },
    { type: 'note.end', t: T0 + 16_000, id: 'k2' },
    { type: 'page.shot', t: T0 + 20_000, id: 's3', n: 3, kind: 'shot', crop: true, x: 0, y: 0, w: 420, h: 860, url: dribbble, title: 'Sidebar by Someone', reference: true, viewport: { w: 1440, h: 900 }, el: navItem },
    { type: 'frame', t: T0 + 20_700, file: 'frames/0003-shot.jpg', reason: 'shot', ref: 's3', url: dribbble, reference: true },
  ];
  return { meta, events };
}

test('a reference note says where it applies on your site and carries the measured look', () => {
  const { meta, events } = referenceSession();
  const compiled = compileSession({ meta, events });
  assert.equal(compiled.notes.length, 3);
  const [mine, ref, shot] = compiled.notes;
  assert.equal(mine.page.reference, false);
  assert.equal(ref.page.reference, true);
  assert.equal(ref.appliesTo.url, 'http://localhost:3000/dashboard');
  assert.equal(ref.appliesTo.noteId, mine.id);
  assert.deepEqual(ref.frames.map((f) => f.file), ['frames/0002-mark.jpg']);
  assert.equal(shot.marks[0].kind, 'shot');
  assert.equal(shot.marks[0].crop, true);
  assert.deepEqual(shot.frames.map((f) => f.file), ['frames/0003-shot.jpg']);
  assert.equal(compiled.stats.pages, 1);
  assert.equal(compiled.stats.references, 1);
  assert.equal(compiled.stats.shots, 1);

  const report = renderReport({ meta, compiled });
  assert.match(report, /\*\*References:\*\* notes marked \*\*Reference\*\*/);
  assert.match(report, /### 2\. Reference · dribbble\.com\/shots\/123-sidebar/);
  assert.match(report, /For: \[Masakin\]\(http:\/\/localhost:3000\/dashboard\) `\/dashboard`, the page of the user's site they were on just before \(note 1 is about it\)\./);
  assert.match(report, /look: 500 14px\/20px Inter · text #e6e6e6 · on #0f1115 · padding 8px 12px · radius 8px/);
  assert.match(report, /inside: `aside\.sidebar` 264×900 px · 400 14px\/20px Inter · on #0f1115 · padding 16px/);
  assert.match(report, /\*\*Screenshot S3\*\*: the area the user dragged around, 420×860 px at 0,0 of a 1440×900 viewport/);
  assert.match(report, /## References\n\nSites the user showed as inspiration\. Open their images before planning\.\n\n- \[Sidebar by Someone\]\(https:\/\/dribbble\.com\/shots\/123-sidebar\): notes 2, 3 · `frames\/0002-mark\.jpg`, `frames\/0003-shot\.jpg`/);
  assert.match(report, /\| reference \|/);
  assert.doesNotMatch(report, /selector: `aside > a/); // a reference's selectors are not in this codebase
});

test('the toolbar switch moves a whole site back to "your site"', () => {
  const { meta, events } = referenceSession();
  const compiled = compileSession({ meta, events: [...events, { type: 'site.role', t: T0 + 25_000, host: 'dribbble.com', reference: false }] });
  assert.equal(compiled.notes.some((n) => n.page?.reference), false);
  assert.equal(compiled.stats.references, 0);
  assert.equal(compiled.stats.pages, 2);
});

test('a note made on a website during a video review is a reference tied to the timecode', () => {
  const meta = { id: 'video-ref', mode: 'video', startedAt: T0, endedAt: T0 + 20_000, video: { name: 'vlog.mp4', width: 1920, height: 1080, duration: 120 } };
  const url = 'https://www.youtube.com/watch?v=abc';
  const events = [
    { type: 'video.state', t: T0, time: 83, playing: false, rate: 1 },
    { type: 'note.start', t: T0 + 2_000, id: 'k1', page: { url, title: 'Caption style' } },
    { type: 'page.visit', t: T0 + 2_010, url, title: 'Caption style', reference: true, via: 'action' },
    { type: 'page.mark', t: T0 + 2_020, id: 'w1', n: 1, kind: 'pin', auto: true, note: 'k1', url, title: 'Caption style', reference: true, x: 600, y: 700, el: { tag: 'div', cls: ['caption'], text: 'Big bold captions' } },
    { type: 'speech.final', t: T0 + 5_000, id: 'c1', note: 'k1', text: 'Captions like these', tStart: T0 + 2_100, tEnd: T0 + 5_000 },
    { type: 'note.end', t: T0 + 6_000, id: 'k1' },
  ];
  const compiled = compileSession({ meta, events });
  const [note] = compiled.notes;
  assert.equal(note.page.reference, true);
  assert.equal(note.appliesTo.video, 83);
  assert.equal(note.marks[0].el.text, 'Big bold captions');
  const report = renderReport({ meta, compiled });
  assert.match(report, /### 1\. 00:01:23\.00 · Reference · youtube\.com\/watch\?v=abc/);
  assert.match(report, /For: the video at 00:01:23\.00, where it was paused\./);
  assert.match(report, /\*\*Pin P1\*\* on the site → `div\.caption` "Big bold captions"/);
});

test('talk-key notes collect exactly the words spoken between the two presses', () => {
  const meta = { id: 'talk', mode: 'video', startedAt: T0, endedAt: T0 + 20_000, video: { name: 'a.mp4', width: 1920, height: 1080, duration: 60 } };
  const events = [
    { type: 'audio.start', t: T0 },
    { type: 'video.state', t: T0, time: 10, playing: false, rate: 1 },
    { type: 'video.mouse', t: T0 + 800, x: 0.5, y: 0.5, vt: 10, inside: true },
    { type: 'video.pin', t: T0 + 900, id: 'p1', n: 1, kind: 'pin', x: 0.5, y: 0.5, vt: 10, note: 'k1' },
    { type: 'note.start', t: T0 + 1_000, id: 'k1' },
    { type: 'note.end', t: T0 + 4_000, id: 'k1' },
    { type: 'note.start', t: T0 + 12_000, id: 'k2' },
    { type: 'note.cancel', t: T0 + 12_500, id: 'k2' },
  ];
  const w = (start, word) => ({ start, end: start + 0.3, word });
  const transcript = {
    segments: [
      { start: 1.1, end: 3.5, text: 'Blur this logo.', words: [w(1.1, ' Blur'), w(1.5, ' this'), w(1.9, ' logo.')] },
      { start: 8, end: 9, text: 'Hmm, okay.', words: [w(8, ' Hmm,'), w(8.4, ' okay.')] },
    ],
  };
  const { notes } = compileSession({ meta, events, transcript });
  assert.equal(notes.length, 2);
  assert.equal(notes[0].text, 'Blur this logo.');
  assert.equal(notes[0].talk, true);
  assert.deepEqual(notes[0].marks.map((m) => m.id), ['p1']);
  assert.equal(notes[0].pointing[0].word, 'this');
  assert.equal(notes[1].text, 'Hmm, okay.'); // free speech outside a note is kept separately
  assert.equal(notes[1].talk, false);
});

test('words spoken into a discarded note are dropped', () => {
  const meta = { id: 'cancel', mode: 'video', startedAt: T0, endedAt: T0 + 10_000, video: { name: 'a.mp4', duration: 60 } };
  const events = [
    { type: 'audio.start', t: T0 },
    { type: 'note.start', t: T0 + 1_000, id: 'k1' },
    { type: 'note.cancel', t: T0 + 3_000, id: 'k1' },
  ];
  const transcript = { segments: [{ start: 1.2, end: 2.5, text: 'Never mind.', words: [{ start: 1.2, end: 1.6, word: ' Never' }, { start: 1.6, end: 2.5, word: ' mind.' }] }] };
  const { notes } = compileSession({ meta, events, transcript });
  assert.equal(notes.length, 0);
});

test('a talk note Whisper left empty keeps its live caption', () => {
  const meta = { id: 'fallback', mode: 'web', startedAt: T0, endedAt: T0 + 10_000 };
  const events = [
    { type: 'audio.start', t: T0 },
    { type: 'note.start', t: T0 + 1_000, id: 'k1' },
    { type: 'speech.final', t: T0 + 2_500, id: 'c1', note: 'k1', text: 'This button should be green', tStart: T0 + 1_100, tEnd: T0 + 2_400 },
    { type: 'note.end', t: T0 + 3_000, id: 'k1' },
  ];
  const transcript = { segments: [{ start: 8, end: 8.5, text: 'Okay.', words: [{ start: 8, end: 8.5, word: ' Okay.' }] }] };
  const { notes } = compileSession({ meta, events, transcript });
  assert.equal(notes[0].text, 'This button should be green');
  assert.equal(notes[0].source, 'live');
});

test('live captions land in the note that was open, even when notes are close together', () => {
  const meta = { id: 'close', mode: 'video', startedAt: T0, endedAt: T0 + 10_000, video: { name: 'a.mp4', duration: 60 } };
  const events = [
    { type: 'note.start', t: T0 + 1_000, id: 'k1' },
    { type: 'speech.final', t: T0 + 1_700, id: 'c1', note: 'k1', text: 'Blur this logo here.', tStart: T0 + 1_100, tEnd: T0 + 1_700 },
    { type: 'note.end', t: T0 + 1_800, id: 'k1' },
    { type: 'note.start', t: T0 + 3_300, id: 'k2' },
    { type: 'speech.final', t: T0 + 3_600, id: 'c2', note: 'k2', text: 'هذا الجزء طويل، قصّه', tStart: T0 + 2_400, tEnd: T0 + 3_600 },
    { type: 'note.end', t: T0 + 3_700, id: 'k2' },
  ];
  const { notes } = compileSession({ meta, events });
  assert.deepEqual(notes.map((n) => n.text), ['Blur this logo here.', 'هذا الجزء طويل، قصّه']);
});

test('marks made after a talk note is closed do not join it', () => {
  const meta = { id: 'edges', mode: 'video', startedAt: T0, endedAt: T0 + 10_000, video: { name: 'a.mp4', duration: 60 } };
  const events = [
    { type: 'note.start', t: T0 + 1_000, id: 'k1' },
    { type: 'note.end', t: T0 + 3_000, id: 'k1' },
    { type: 'video.box', t: T0 + 3_500, id: 'b1', n: 1, kind: 'box', x: 0.1, y: 0.1, w: 0.2, h: 0.2, vt: 5 },
  ];
  const { notes } = compileSession({ meta, events });
  assert.equal(notes.length, 2);
  assert.deepEqual(notes[0].marks, []);
  assert.equal(notes[1].source, 'mark');
});

test('timecode formatting', () => {
  assert.equal(fmtTimecode(83.4), '00:01:23.40');
  assert.equal(fmtTimecode(3725.05), '01:02:05.05');
});
