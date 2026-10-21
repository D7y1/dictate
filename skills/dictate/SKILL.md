---
name: dictate
description: Open Dictate Studio so the user can show you what they want instead of typing it, by talking while pointing at a video (pins, boxes, in/out ranges) or while browsing their website or platform (pinned elements, screenshots), then act on the submitted session. Use when the user says "/dictate", "let me show you", "I'll record my notes", "review this video/page with Dictate", or mentions a Dictate session or a .dictate/sessions folder.
---

# Dictate

Dictate opens a studio window where the user talks while pointing. On Submit it writes a session folder (report.md, session.json, frames/, audio.webm) and the launcher exits, which wakes you up.

## 1. Launch it

From the current project root, run this **in the background** (`run_in_background: true`):

```
npx -y @d7y/dictate@latest --once --out "<project root>/.dictate/sessions" [--video "<file>"] [--url "<url>"] [--title "<what this review is about>"]
```

- Add `--video "<absolute path>"` when the user is reviewing a specific video. The report then carries the exact source path.
- Add `--url "<url>"` when they are reviewing a page (local dev server or live site).
- With neither, the studio opens on its home screen and the user picks a mode.

Tell the user in two or three short lines that the studio is open:
- **Video:** click (or hover) the spot on the frame, press **T** (or the mouse's back side button), talk, press it again. Drag to box an area, `I`/`O` for a range. Then Finish → Send.
- **Web:** paste the site URL and press Open. On the site: point or click, press **T** (or the mouse's back side button), talk, press it again. Then Finish → Send. This needs the Dictate Chrome extension, added once. The studio walks them through it.

Then stop and wait for the background task notification. Do not poll.

`npx` fetches the newest version, so the first launch after a release takes a few seconds longer. If it fails because there is no network, run the same command without `@latest` to use the cached copy.

## 2. When the launcher exits

Its output contains one of:
- `DICTATE_SUBMITTED <dir>`: the normal case.
- `DICTATE_DRAFT <dir>`: the studio closed before Submit and a draft was saved. Use it, and mention that it was a draft.
- `DICTATE_CANCELLED` or `DICTATE_CLOSED`: nothing to act on. Say so in one line.

Read `<dir>/report.md` in full. Then open every image it references (`<dir>/frames/...`) with the Read tool. Numbered pins and boxes, plus a red ring for the cursor, are drawn on them, and they are how you know what "this" and "here" mean. `session.json` has the same notes as structured data when you need exact numbers.

## 3. Act on it (the user's standing preference)

1. First reply with a numbered plan: one line per note covering what you understood and what you will change (file or component for web, timecode for video). Merge notes that touch the same thing.
2. Then start doing the work right away, without waiting for approval.
3. Stop to ask only when a note is genuinely ambiguous, for example two plausible targets. Ask about those specific notes and carry on with the rest.

Turning notes into work:
- **Web:** each element comes with a CSS selector, visible text, classes, and an HTML snippet. Grep the codebase for distinctive text, class names, or `data-testid` to find the component. The page URL gives you the route. "Pointing" lines tell you which element was under the cursor when the user said "this" or "here".
- **Video:** timecodes are positions in the source video. Positions are fractions of the frame (x 0→1 left→right, y 0→1 top→bottom), with source pixels in brackets. Ranges R1, R2… are in/out pairs. Use them directly with HyperFrames or ffmpeg.
- Transcripts can mix Arabic and English in the same sentence. Read both.
- When two notes conflict, the later one wins unless it says otherwise.
- The overall direction section, when present, applies to everything.

## Other commands

- Latest submitted session for this project: `npx -y @d7y/dictate@latest --latest --out "<project root>/.dictate/sessions"`
- The user may run the studio on their own and later say "read my latest dictate session". Use `--latest` to find it.
- First time, or the studio says "Live captions only": ask the user to run `npx -y @d7y/dictate@latest setup` in a terminal. It installs local speech to text (faster-whisper), downloads the model, and checks the extension. It takes a few minutes the first time and is safe to run again.
