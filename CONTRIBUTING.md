# Contributing to Dictate

Thanks for helping. Dictate is small on purpose: a local Node server, a studio made of plain ES modules, a Chrome extension, and a skill that hands the session to Claude. Bug reports, fixes and focused features are all welcome.

## Before you start

- **Bugs:** open an [issue](https://github.com/D7y1/dictate/issues/new/choose) with the steps, what you expected, and your Dictate, extension and Chrome versions. A `report.md` or `events.jsonl` from the session helps a lot (check it for anything private first).
- **Features:** open an issue first so we can agree on the shape before you build it. Dictate's one rule is that adding a note stays a single key: point, press **T**, talk.
- **Security problems:** don't open an issue. See [SECURITY.md](SECURITY.md).

## Set up

You need Node.js 20 or newer, Chrome, and optionally Python 3 with an NVIDIA GPU for Whisper.

```
git clone https://github.com/D7y1/dictate.git
cd dictate
npm run setup
```

Setup points the `/dictate` skill at your clone, adds a `dictate` command with `npm link`, and walks you through loading `extension/` unpacked in `chrome://extensions`.

Run the studio directly while you work:

```
node bin/dictate.js --url http://localhost:3000
node bin/dictate.js --video path/to/clip.mp4
```

Set `DICTATE_NO_WHISPER=1` to skip Whisper and use the browser's live captions. After changing anything in `extension/`, press the reload arrow on Dictate's card in `chrome://extensions` and reload the pages you test on.

## Tests

```
npm test
```

The tests cover `server/compile.js`, which turns a session's events into `report.md`. Add a test when you change what the report says. CI runs them on Linux and Windows, checks that the extension zips, and checks what the npm package contains.

For UI changes, `npm run capture -- http://localhost:4799/ out/` drives a full session in headless Chrome and saves a screenshot of every screen.

## How the code is written

- **No dependencies.** The server uses Node's standard library, the studio runs as plain ES modules with no build step, and the extension is plain JavaScript. Please keep it that way.
- **Match the code around you:** naming, comment style, small functions, early returns.
- **Design:** [DESIGN.md](DESIGN.md) is the visual system (colors, type, the signal hues and what each one means) and [PRODUCT.md](PRODUCT.md) says who Dictate is for. UI changes should follow both.
- **Privacy is a feature.** Everything stays on the user's computer: the extension sends only to the local Dictate server, and the server binds to 127.0.0.1. Changes that send data anywhere else won't be accepted.
- **The extension changes slowly.** Each version waits for Chrome Web Store review, so prefer putting logic in the studio or server. If you change `extension/`, bump `version` in `extension/manifest.json`.

## Pull requests

1. Branch from `main` and keep the change focused on one thing.
2. Run `npm test`.
3. In the description, say what changed, why, and how you tried it. For UI changes, add a before and after screenshot.

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE), and to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
