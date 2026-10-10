# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated: plain HTML/CSS/ES modules served by a zero-dependency Node server, plus a Manifest V3 Chrome extension and a Python faster-whisper worker. No build step, so the tool starts instantly and has nothing to break between projects.

## Users

One creator-operator (the owner) who makes vlogs and production video and also builds web platforms. They review their own work alone at their desk, speaking out loud, often in Arabic and English mixed in the same sentence. The reviewer is not the editor: an AI (Claude) receives the session and performs the edits.

## Product Purpose

Dictate turns "let me just show you" into something an AI can act on. The user points, draws, and talks over a video or while browsing their platform; Dictate records voice, cursor, marks, pages, and frames, lines every sentence up with what was being pointed at, and on Submit hands a complete, structured session to Claude. Success: Claude makes the right edit on the first try without asking where "this" or "here" is.

## Positioning

Review tools (Frame.io, Marker.io, Loom) produce comments for humans. Dictate produces anchored instructions for an AI: each sentence is tied to a video timecode and frame coordinates, or to a page URL and a DOM element with its selector and HTML, and pointing words ("this", "here", "هذا", "هنا") are resolved to the cursor position at the moment they were spoken.

## Operating Context

- Launched from Claude Code in whatever project is open (`/dictate`), or by hand with `npm start`.
- Runs as a Chrome app window on Windows 11 next to the platform being reviewed, or full-screen over a video.
- Video review: footage from vlogs and production work, usually H.264 exports; voice notes while scrubbing, pausing, pinning, boxing, and marking in/out ranges.
- Web review: the user's own platforms (local dev or live, logged in), browsed page to page with the Dictate extension recording.
- Sessions are saved inside the active project under `.dictate/sessions/` (self-git-ignored).
- On submit, Claude shows a numbered plan of what it understood, then proceeds; it stops only for genuinely ambiguous notes.

## Capabilities and Constraints

- Voice: live browser captions for feedback, then Whisper (large-v3-turbo on the local GPU) for word-timed final transcripts; Arabic and English mixed.
- Video: pins, boxes, in/out ranges, markers, cursor trail, frame grabs with marks drawn on them.
- Web: page visits, cursor, hovered and clicked elements, text selection, annotate mode for pinning elements or boxing areas, screenshots.
- Typed values in form fields are never recorded.
- Review screen before submit: fix transcripts, delete notes, add overall direction.
- Chrome or Edge required (Web Speech API, MV3 extension).

## Brand Commitments

Name: Dictate. Voice: plain, direct, calm; speaks to the user as "you". Must feel professional enough for production work.

## Evidence on Hand

No testimonials, metrics, or customer claims exist; none may be invented.

## Product Principles

1. Never lose a take: everything is written to disk as it happens, and an abandoned session still produces a draft.
2. Talking is the interface: the user should be able to give a full review without touching the keyboard.
3. Anchor everything: every sentence carries where and when it was said.
4. Zero setup per project: one command, any project.
5. The AI is the reader: the report is written so a model can act on it without follow-up questions.
