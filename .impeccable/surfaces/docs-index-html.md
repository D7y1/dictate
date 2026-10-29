---
version: 1
slug: "docs-index-html"
primary_target: "docs/index.html"
related_targets: ["docs/ar/index.html"]
---

# Landing page (docs/, GitHub Pages)

Mode: Persuade. Two pages share one stylesheet and one demo script: `docs/index.html` (English) and `docs/ar/index.html` (Arabic, RTL).

## Audience, job, action
- Audience: web builders and video creators, weighted equally. Many write Arabic and English in the same sentence.
- Job: show that a spoken note lands on the exact element or frame, then get the visitor to install it.
- Primary action: Get it on GitHub (https://github.com/D7y1/dictate). Secondary: How to start, which goes to the four install steps and `/dictate`.
- Proof: the page itself is the site under review. Two example notes are pinned to the headline and the GitHub button. Pressing T (or the mouse back button once a session runs) adds a note. "Finish & send" writes a real-format report.md and Claude's numbered plan into the terminal.

## Direction
- Form: Terminal handoff (#5 of 7, seed 80a7c99a). Approved comp: `.impeccable/mocks/decision/landing-terminal.png`. The user added the mouse back-button tile next to T.
- Memorable moment: `/dictate` types itself, then the P1/P2 marks draw onto the headline and the button.
- Deliberate deviations from the comp: the idle TALK key is dark (Tally Rule: red only while live); note text uses the UI face (Reader Rule); the PAGE strip stays in the left column because the dock is sticky; the comp's dock minimize glyph is omitted on desktop because nothing there would collapse.

## Constraints specific to this surface
- Public web page, so DESIGN.md's system faces are swapped for web fonts with the same jobs: Archivo stands in for Segoe UI Variable (display and UI), Cascadia Mono is loaded Latin-only (via `text=`) so Arabic in code and the terminal falls through to Noto Sans Arabic, and Noto Kufi Arabic is the Arabic display face.
- Display sizes (the 52 to 112px headline, 19 to 31px tagline) sit above the studio's app ramp on purpose; this is a marketing surface.
- The web illustration's paper colors (#dfe2e7, #d9dde3, #2d6cdf) depict someone else's site, not the Dictate world.
- Arabic copy is فصحى مبسطة with masculine imperatives. Code, paths, the terminal and the monitors stay LTR.

## Related pages
- `docs/privacy/` and `docs/ar/privacy/`: plain reading pages in the same world (`.legal` in site.css, one centered column, the PAGE strip, the shared top bar and footer). Linked from both footers; the Chrome Web Store listing links to the English one, so keep it accurate to what the extension and studio actually do.
- Install steps follow the npm flow (`npx skills add D7y1/dictate -g`, then `npx @d7y/dictate setup`), not a git clone.

## Open
- Publishing: GitHub Pages from `/docs` on main.
