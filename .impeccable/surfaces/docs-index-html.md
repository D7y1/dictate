---
version: 1
slug: "docs-index-html"
primary_target: "docs/index.html"
related_targets: []
---

# Skill landing page (docs/, https://skills.d7y.dev/dictate/)

Mode: Persuade. One page, `docs/index.html`, a plain reading page, `docs/privacy/index.html`, and a missing-page screen, `docs/404.html`, share `docs/assets/site.css` and `docs/assets/site.js`. English only. The Arabic pages were removed with the old site at the owner's call ("nothing" of the old page needed to survive).

## Audience, job, action
- Audience: web builders and video creators using Claude Code. Many mix Arabic and English in one sentence.
- Job: show that a spoken sentence lands on the exact element or frame, then get the visitor to install.
- Primary action: copy `npx skills add D7y1/dictate`. Secondary: Try it on this page, See how it works, GitHub.
- Proof: T works on this page and builds a real report from this page's real elements. The examples in "What you say / What Claude gets" follow the real format from `server/compile.js` (bold markers and backticks dropped, link titles flattened), and the studio shot is a real capture.

## Direction
- The bar: https://www.tasteskill.dev/ and https://impeccable.style/, pinned by the owner. Their feedback on the first comp round was "premium and clean, this looks so crowded": at least half the first viewport stays empty, medium-to-regular weights, one dark element. Their feedback on the quiet build was "very good, but it's a landing page, it should be more than this", which led to the delight system below.
- Form: Quiet split, chosen on the decision page. Approved comp: `.impeccable/mocks/decision/skill-clean-a.png`. User-pinned references replace the concept roll, so there is no seed key.
- Deliberate deviations from the comp: the logo is the real Dictate icon, not the comp's plain square; headline tracking is -0.025em, a little tighter than the comp, so the first line always fits its column; the mug is regenerated from the comp's mug, so its details differ.

## Delight system
Thesis: whatever you point at, Dictate knows exactly what you mean. One dashed amber box carries it through the whole page, so the visitor feels understood. Anything new must extend this system. No other delight idioms: no scroll reveals, parallax, hover lift, sound or whimsy.
- Hero: the box walks the card, then leaves it for the page's own install bar and Try button, side by side only. Stacked, it stays on the card so it can't leave the screen.
- Try it on this page (the signature): T or the Try button makes the page pointable. Keyed on `e.code`, so it works on an Arabic keyboard. Hover or Tab moves the box, T or a click pins, and the panel builds a real report live, with the Pointing line lighting up as the word appears. `extension/content.js` (element picking, selectors, descriptions) and `server/compile.js` (report lines, pointing words in both languages) are ported as they are; if those change, change this too. Esc cancels the note, then leaves. The panel is a floating panel, never a modal.
- What you say: an amber wire runs from the spoken word above the text and down the gutter to the report line it resolves to, and never crosses text. Word, wire, then line. Side by side only; stacked, the line just lights up.
- How it works: the box walks the real studio screenshot with the steps. Positions are percentages of the image in `data-spot`. If the screenshot changes, re-measure them.
- Transcript: the words play at their real timestamps once, on first view, then both pointing words resolve to their lines. "Play it again" replays it.
- Copy: the next step appears under the bar. The Try button steps aside for it, and the box leaves if it was there.
- 404: an empty box, P1, and "Make this page exist."
- Voice of these touches: dry and plain, never cute.

## The site's own system
DESIGN.md describes the studio, a dark tool. It does not bind this surface, and detector findings measured against it here are expected.
- Color: ground #f4f4f3, surface #fff, ink #141416, body gray #646569, second headline line #7c7d81 (large text only), hairline rgb(20 20 22 / .09), amber #ffb31a and soft amber #ffe2a3 (only on pins, the pointed-at word, the report's matching line and the wire between them), record red #e5432f. Halden's blue #2563eb belongs to the example site, not to Dictate.
- Type: Geist (self-hosted variable) at 400 for headlines and 500 for labels, never heavier. Two-tone headlines: ink line, gray line. Geist Mono only for commands, keys, timecodes and the report. Noto Sans Arabic 500 for the Arabic run. Geist was kept against the overused-font warning because the approved comp and both references are this kind of neutral grotesk.
- Materials: `sand.webp` (generated raked sand, runs under the nav and fades out; keep the encode high enough to hold its grain), `mug.webp` (generated on pure white, multiplied onto the card, with a long shadow that fades before the image edge), white cards with wide soft shadows, the near-black install bar, and a light sand mat that holds the dark studio shot. No gradients on text, no glass, no icon cards, no kickers.
- Motion: `--ease` throughout, no bounce. Every loop stops out of view and while trying it on the page. Reduced motion keeps every state change and drops the travel: the tour, step cycle and transcript hold still, and hovering and T still work. Every touch adds to a page that is complete without scripts. Animating the width and height of a box is intentional: each is a single absolutely positioned element, and a dashed border can't be scaled.

## Constraints specific to this surface
- No third-party requests from the page: fonts and images are self-hosted, and the privacy page says so. The Try panel's mic is off until pressed, then the browser's own speech service hears it. The panel discloses that before you press it, and the privacy page covers it.
- The privacy page is linked from the Chrome Web Store listing, so keep it accurate to what the extension, studio, first-run setup and Try panel do.
- No invented claims: no stars, testimonials, logos or numbers. Halden, the Dashboard concept reference and the transcript timings are labeled-by-context examples. The Try panel says a real report also has a screenshot of each pin.
- Domain: `D7y1/D7y1.github.io` owns `skills.d7y.dev`, so this repo's Pages site is served at `/dictate`, and `404.html` uses `<base href="/dictate/">`. Later skills live at `/their-name`.

## Open
- `docs/assets/og.png` is captured from the built hero; recapture it if the hero changes.
