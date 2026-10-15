# Dictate

Point, talk, submit. Dictate records you giving notes on a video or a website (your voice, your cursor, what you click, what you pin) and hands Claude a session it can act on without asking "which one?".

**Adding a note is one key:** click (or just hover) the thing, press **T**, talk, press **T** again. The mic is already open, so it starts the instant you press. Hold **T** instead if you prefer push-to-talk. `Esc` throws an open note away.

**Or use the mouse only:** the mouse's back side button does the same as **T** (tap to open and close a note, or hold it), and the forward side button plays and pauses the video. Every control can be rebound on the home screen under **Controls**: click **Add**, then press any key, the middle button, or a side button. While a session runs, Dictate stops those buttons from navigating back or forward, in the studio and on your site.

- **Video review:** every note lands on the timecode with a pin where you clicked. Drag to box an area, `I`/`O` to mark a range to cut. The video pauses while you talk.
- **Web review:** browse your platform page to page. **T** works inside your site's pages. The Dictate extension pins the element under your cursor, records the page, what you click and select, and takes screenshots. While a note is open, clicks pin elements instead of following links.
- **Submit:** Whisper turns your voice into word-timed text on your GPU (Arabic and English, even mixed). You fix anything it misheard, void notes you don't want, then Send. Claude gets a report with every note anchored to a timecode or a DOM element, plus the images.

## Install

You need **Node 20+** and **Chrome** (or Edge). Python 3.9+ is optional but recommended: it runs Whisper, which transcribes far better than the browser's live captions.

**1. Get the code** (the repo is private, so sign in to GitHub when asked):

```
git clone https://github.com/D7y1/dictate.git
cd dictate
```

No git? On GitHub press **Code → Download ZIP** and unzip it somewhere permanent.

**2. Run setup:**

```
npm run setup
```

Or double-click **`setup.cmd`** in the folder. Setup takes a few minutes the first time because it downloads the speech model:

1. Checks Node and finds Chrome or Edge.
2. Installs faster-whisper with your Python. With an NVIDIA card it also adds the CUDA libraries Whisper needs to use the GPU.
3. Downloads and loads the speech model (about 1.6 GB, or 0.5 GB on CPU), so your first review doesn't wait for it.
4. Installs the `/dictate` skill in the shared agent folder (`~/.agents/skills/dictate`) and links Claude Code's `~/.claude/skills/dictate` to it.
5. Adds a `dictate` command you can run from any folder.
6. Checks whether the browser extension is loaded. If not, it opens `chrome://extensions` and puts the extension's folder path on your clipboard.

**3. Load the extension** (web review only, once). Chrome only lets a person do this step:

1. On `chrome://extensions`, turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose the `extension` folder (paste the path setup copied).
3. Run `npm run setup` again; it should say *Loaded in Chrome*.

Then you're done: type `/dictate` in Claude Code, in any project.

**Or let Claude do it.** In Claude Code, say: *"Clone github.com/D7y1/dictate into ~/Local/tools/dictate and run npm run setup."* You'll still do step 3 yourself.

Setup is safe to re-run; it skips anything already done and tells you what's left. Flags: `--no-whisper`, `--no-model`, `--no-link`, `--no-open` (for example `npm run setup -- --no-model`).

### Update

```
git pull
npm run setup
```

Setup rewrites the skill to match the new version. If the update changed the extension, press the reload arrow on Dictate's card in `chrome://extensions`.

### Move or remove

The skill points at this folder. If you move the folder, run `npm run setup` again from the new place.

To remove Dictate: run `npm rm -g dictate`, delete `~/.agents/skills/dictate` and `~/.claude/skills/dictate`, remove the extension in `chrome://extensions`, then delete the folder.

## Use it

**From Claude Code (any project):** type `/dictate`, optionally with what you're reviewing ("/dictate the onboarding pages", "/dictate C:\footage\ep12.mp4"). Claude opens the studio, waits, and starts working when you hit Submit: first a numbered plan of what it understood, then the edits.

**By hand:**

```
dictate                                    # studio home; sessions go to ./.dictate/sessions
dictate --video D:\cuts\ep12.mp4
dictate --url http://localhost:3000 --out C:\projects\site\.dictate\sessions
dictate --latest                           # print the newest session folder
```

(Without the `dictate` command, run `node bin/dictate.js` from this folder instead.)

Then tell Claude "read my latest dictate session".

### Video review keys

These are the defaults; everything except frame stepping (arrows, `J`, `L`, `Backspace`) can be changed under **Controls**.

| Key | Does |
|---|---|
| `T` or mouse back button | Open a voice note, press again to close it (hold for push-to-talk) |
| `Esc` | Discard the open note |
| `R` | Start the session without talking, or pause and resume it |
| `Space` / `K` / mouse forward button | Play / pause |
| `←` `→` | One frame back / forward (`Shift` for one second) |
| `J` `L` | Five seconds back / forward |
| Click the frame | Pin a point |
| Drag on the frame | Box an area |
| `I` then `O` | Mark a range (cut this, speed this up, …) |
| `M` | Marker at the playhead (and the cursor, if it's over the frame) |
| `Backspace` | Undo the last mark |
| `N` | Type a note instead of saying it |

By default the video pauses when you start a note, so it lands on the exact frame you're looking at. Turn that off under the timeline if you prefer. **Open mic** (same place) keeps everything you say, not just what's between two T presses.

### Web review

Paste your site's URL and press **Open**. The studio docks to the right edge of the screen, your site opens beside it, and the session starts.

- On your site: point or click, press **T**, talk, press **T**. The element under your cursor gets a numbered pin and a screenshot.
- `Alt+A` switches the page into annotate mode without talking: hover highlights elements, click pins one, drag boxes an area. `Esc` goes back to browsing.
- **T** is ignored while you're typing in a field, and typed values are never recorded.

## What Claude receives

Each session is a folder in `<project>/.dictate/sessions/` (that folder ignores itself in git):

| File | Contents |
|---|---|
| `report.md` | The notes, each anchored: timecode and frame position, or page URL and element (selector, text, HTML) |
| `frames/` | Frame grabs and screenshots with your pins, boxes, and cursor drawn on them |
| `session.json` | The same notes as structured data |
| `transcript.json` | Word-level transcript |
| `events.jsonl` | Every raw event (cursor samples, clicks, scrolls, page changes) |
| `audio.webm` | Your voice |

If the studio window closes before Submit, nothing is lost: everything recorded so far is saved, and a launch from Claude produces a draft report.

## How it fits together

```
bin/dictate.js        CLI: starts the server, opens the studio, exits on submit (--once)
scripts/setup.js      one-command setup (npm run setup, or double-click setup.cmd)
server/server.js      local HTTP server on 127.0.0.1 (studio + extension only)
server/compile.js     lines speech up with marks, cursor, elements and frames; writes report.md
server/whisper_worker.py  faster-whisper worker, warmed while you record
studio/               the Studio UI (plain ES modules, no build step)
extension/            Chrome MV3 extension: page tracking, annotate mode, screenshots
skill/SKILL.md        the /dictate skill template (setup fills in this folder's path)
scripts/capture.js    scripted UI walkthrough + screenshots (headless Chrome, fake mic)
```

`npm test` runs the compile tests. `npm run capture -- http://localhost:4799/ out/` drives a full session against a running studio (start it with `--video` on any clip) and saves screenshots of every screen.
