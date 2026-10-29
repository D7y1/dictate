# Changelog

Notable changes to Dictate. The npm package (`@d7y/dictate`) and the Chrome extension have separate version numbers; extension versions are named where they change.

## 1.0.0

First public release.

- **Video review:** click or box the frame, press **T** and talk. Every note lands on its timecode with a numbered pin, `I`/`O` mark ranges to cut, and the video pauses while you talk.
- **Web review:** browse your own site with the Dictate extension. **T** pins the element under the cursor with its selector, text and HTML, takes a screenshot, and follows you from page to page. `Alt+A` pins or boxes without talking.
- **References and screenshots (extension 1.1.0):** open any other site during either review to show Claude what you like. It's tagged Reference, linked to the page of yours (or the timecode) it's for, and carries the measured font, colors, spacing and radius of what you point at. **Screenshot** (`Alt+S`) saves exactly the part you drag around.
- **Review and send:** Whisper transcribes on your GPU, in Arabic, English or both mixed, with the browser's live captions as a fallback. Fix words, void notes, then Send. Claude gets `report.md`, `session.json` and the images.
- **Controls:** every action can be bound to a key, the middle button or a mouse side button.
- **Setup:** `npx @d7y/dictate setup` installs Whisper and the `/dictate` skill, downloads the speech model, and walks you through adding the extension.
