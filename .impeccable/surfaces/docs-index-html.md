---
version: 1
slug: "docs-index-html"
primary_target: "docs/index.html"
related_targets: []
---

# Skill landing page (docs/, https://skills.d7y.dev/dictate/)

Mode: Persuade. One page, `docs/index.html`, and a plain reading page, `docs/privacy/index.html`, share `docs/assets/site.css` and `docs/assets/site.js`. English only. The Arabic pages were removed with the old site at the owner's call ("nothing" of the old page needed to survive).

## Audience, job, action
- Audience: web builders and video creators using Claude Code. Many mix Arabic and English in one sentence.
- Job: show that a spoken sentence lands on the exact element or frame, then get the visitor to install.
- Primary action: copy `npx skills add D7y1/dictate`. Secondary: See how it works, GitHub.
- Proof: the hero card is pointable, the report in "What you say / What Claude gets" follows the real format from `server/compile.js` (bold markers and backticks dropped, link titles flattened), and the studio shot is a real capture.

## Direction
- The bar: https://www.tasteskill.dev/ and https://impeccable.style/, pinned by the owner. Their feedback on the first comp round was "premium and clean, this looks so crowded": at least half the first viewport stays empty, medium-to-regular weights, one dark element.
- Form: Quiet split, chosen on the decision page. Approved comp: `.impeccable/mocks/decision/skill-clean-a.png`. User-pinned references replace the concept roll, so there is no seed key.
- Memorable moment: the dashed amber box and cursor move around a small shop page while the spoken sentence changes on the card's edge. Point at the card and it follows you.
- Deliberate deviations from the comp: the logo is the real Dictate icon, not the comp's plain square; headline tracking is -0.025em, a little tighter than the comp, so the first line always fits its column; the mug is regenerated from the comp's mug, so its details differ.

## The site's own system
DESIGN.md describes the studio, a dark tool. It does not bind this surface, and detector findings measured against it here are expected.
- Color: ground #f4f4f3, surface #fff, ink #141416, body gray #646569, second headline line #7c7d81 (large text only), hairline rgb(20 20 22 / .09), amber #ffb31a and soft amber #ffe2a3 (only on pins, the pointed-at word and the report's matching line), record red #e5432f. Halden's blue #2563eb belongs to the example site, not to Dictate.
- Type: Geist (self-hosted variable) at 400 for headlines and 500 for labels, never heavier. Two-tone headlines: ink line, gray line. Geist Mono only for commands, keys, timecodes and the report. Noto Sans Arabic 500 for the Arabic run. Geist was kept against the overused-font warning because the approved comp and both references are this kind of neutral grotesk.
- Materials: `sand.webp` (generated raked sand, runs under the nav and fades out; keep the encode high enough to hold its grain), `mug.webp` (generated on pure white, multiplied onto the card, with a long shadow that fades before the image edge), white cards with wide soft shadows, the near-black install bar, and a light sand mat that holds the dark studio shot. No gradients on text, no glass, no icon cards, no kickers.
- Motion: only the hero demo, the tab crossfade, and the nav settling up 18px once scrolled (a transform, so nothing else moves). The page starts on the button with the sentence showing; the box glides only after first placement. It pauses out of view and reduced motion gets a static state. Animating the box's width and height is intentional: it's a single absolutely positioned element and a dashed border can't be scaled.

## Constraints specific to this surface
- No third-party requests: fonts and images are self-hosted, and the privacy page says so.
- The privacy page is linked from the Chrome Web Store listing, so keep it accurate to what the extension, studio and first-run setup do.
- No invented claims: no stars, testimonials, logos or numbers. Halden, the Dashboard concept reference and the transcript timings are labeled-by-context examples.
- Domain: `D7y1/D7y1.github.io` owns `skills.d7y.dev`, so this repo's Pages site is served at `/dictate`. Later skills live at `/their-name`.

## Open
- `docs/assets/og.png` is captured from the built hero; recapture it if the hero changes.
