---
name: Dictate Studio
description: A TV production gallery for reviewing your own cut or platform out loud, so every note reaches Claude anchored to a timecode or an element.
colors:
  bg: "#0b0c0e"
  umd: "#050506"
  panel: "#131518"
  panel-2: "#1a1d21"
  panel-3: "#22262b"
  line: "#262a2f"
  line-2: "#363b42"
  line-3: "#4a5058"
  tl-track: "#1d2024"
  fg: "#f2f2ee"
  fg-2: "#a7abb2"
  fg-3: "#878c95"
  white: "#ffffff"
  rec: "#e23b2e"
  rec-text: "#ff6b5e"
  rec-ink: "#c42f24"
  rec-deep: "#4a1712"
  rec-tint: "#2a1311"
  rec-edge: "#6b1a13"
  rec-low: "#b42318"
  mark: "#f3b33d"
  mark-ink: "#121315"
  ok: "#39c26d"
  page: "#8fa6d1"
  page-bg: "#1e2737"
  page-edge: "#2c3a52"
  sketch-1: "#9aa3b0"
  sketch-2: "#c9ced6"
typography:
  display:
    fontFamily: "Segoe UI Variable Display, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "34px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  display-compact:
    fontFamily: "Segoe UI Variable Display, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Segoe UI Variable Display, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "Segoe UI Variable Display, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.2
  wordmark:
    fontFamily: "Segoe UI Variable Display, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.34em"
  body-lg:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
  body-note:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.4
  body:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  caption:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  label-panel:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.22em"
  label-field:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.06em"
  label-key:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.06em"
  mono-umd:
    fontFamily: "Cascadia Mono, Cascadia Code, Consolas, ui-monospace, SF Mono, monospace"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.04em"
    fontFeature: "\"tnum\""
  mono-index:
    fontFamily: "Cascadia Mono, Cascadia Code, Consolas, ui-monospace, SF Mono, monospace"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1
    fontFeature: "\"tnum\""
  mono-clock:
    fontFamily: "Cascadia Mono, Cascadia Code, Consolas, ui-monospace, SF Mono, monospace"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1
    fontFeature: "\"tnum\""
  mono-tag:
    fontFamily: "Cascadia Mono, Cascadia Code, Consolas, ui-monospace, SF Mono, monospace"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.02em"
  mono-timecode:
    fontFamily: "Cascadia Mono, Cascadia Code, Consolas, ui-monospace, SF Mono, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.2
    fontFeature: "\"tnum\""
  micro:
    fontFamily: "Cascadia Mono, Cascadia Code, Consolas, ui-monospace, SF Mono, monospace"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1
  micro-nested:
    fontFamily: "Cascadia Mono, Cascadia Code, Consolas, ui-monospace, SF Mono, monospace"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1
rounded:
  lamp: "2px"
  tag: "3px"
  r-1: "4px"
  r-2: "6px"
  r-3: "10px"
  round: "50%"
spacing:
  hair: "4px"
  tight: "8px"
  gutter: "12px"
  panel: "16px"
  loose: "20px"
  section: "24px"
components:
  button:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.fg}"
    typography: "{typography.body}"
    rounded: "{rounded.r-2}"
    height: "36px"
    padding: "0 14px"
  button-hover:
    backgroundColor: "{colors.panel-3}"
  button-primary:
    backgroundColor: "{colors.fg}"
    textColor: "#101113"
    rounded: "{rounded.r-2}"
    height: "36px"
    padding: "0 14px"
  button-primary-hover:
    backgroundColor: "{colors.white}"
  link-button:
    textColor: "{colors.fg}"
  icon-button:
    textColor: "{colors.fg-2}"
    rounded: "{rounded.r-2}"
    size: "34px"
  icon-button-hover:
    backgroundColor: "{colors.panel-3}"
    textColor: "{colors.fg}"
  hardware-key:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.fg}"
    typography: "{typography.label-key}"
    rounded: "{rounded.r-1}"
    height: "44px"
    padding: "0 12px"
  hardware-key-hover:
    backgroundColor: "{colors.panel-3}"
  talk-key:
    textColor: "{colors.fg-2}"
    rounded: "{rounded.round}"
    size: "84px"
  talk-key-on:
    backgroundColor: "{colors.rec}"
    textColor: "{colors.white}"
  talk-key-large:
    size: "108px"
  keycap:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.fg}"
    typography: "{typography.micro}"
    rounded: "{rounded.r-1}"
    height: "22px"
    padding: "0 6px"
  keycap-nested:
    typography: "{typography.micro-nested}"
    height: "18px"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.fg}"
    typography: "{typography.body}"
    rounded: "{rounded.r-2}"
    height: "36px"
    padding: "0 12px"
  tag:
    textColor: "{colors.fg-2}"
    typography: "{typography.mono-tag}"
    rounded: "{rounded.tag}"
    height: "22px"
    padding: "0 7px"
  tag-mark:
    backgroundColor: "{colors.mark}"
    textColor: "{colors.mark-ink}"
  tag-page:
    backgroundColor: "{colors.page-bg}"
    textColor: "{colors.page}"
  tag-ref:
    backgroundColor: "{colors.page}"
    textColor: "{colors.mark-ink}"
  chip:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.fg-2}"
    rounded: "{rounded.tag}"
    height: "26px"
    padding: "0 9px"
  chip-mark:
    backgroundColor: "{colors.mark}"
    textColor: "{colors.mark-ink}"
  umd-strip:
    backgroundColor: "{colors.umd}"
    textColor: "{colors.fg}"
    typography: "{typography.mono-umd}"
    height: "34px"
    padding: "6px 12px"
  umd-lamp-live:
    backgroundColor: "{colors.rec}"
    textColor: "{colors.white}"
    rounded: "{rounded.lamp}"
    padding: "2px 7px"
  rec-pill:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.fg-3}"
    typography: "{typography.mono-clock}"
    rounded: "{rounded.r-2}"
    height: "36px"
    padding: "0 14px"
  rec-pill-live:
    backgroundColor: "{colors.rec-tint}"
    textColor: "{colors.rec-text}"
  rundown-row:
    textColor: "{colors.fg}"
    typography: "{typography.body-note}"
    padding: "12px 10px 12px 14px"
  rundown-row-open:
    backgroundColor: "{colors.rec-tint}"
  setup-callout:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.fg-2}"
    rounded: "{rounded.r-2}"
    padding: "16px"
  panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.r-2}"
  topbar:
    backgroundColor: "{colors.bg}"
    height: "56px"
    padding: "0 16px"
  toast:
    backgroundColor: "#24272c"
    textColor: "{colors.fg}"
    rounded: "{rounded.r-2}"
    padding: "10px 16px"
---

# Design System: Dictate Studio

## Overview

**Creative North Star: "The Broadcast Gallery"**

Dictate Studio is built as the production gallery of a TV control room. A review session is a broadcast you direct: the cut plays on a program monitor, you press TALK and speak, and every note lands on the rundown with its timecode, its frame and whatever you pointed at. The screen is a near-black desk of flat panels with off-white legends, black monospace UMD strips under every picture, square hardware keys and one round, illuminated TALK key. Nothing on the desk is decorative. Color appears only as a lamp that means something.

The palette is signal discipline. Tally red lights when you are live. Amber is a mark you placed. Green is signal present. A muted page blue tells you where you are in web review. Everything else is a neutral ramp from the black UMD strip up to the off-white legends, so a lit lamp is always the loudest thing on screen. Density is production-tool density (14px body, 36px controls, 12px gutters): one operator at a desk working fast, not a page to browse. Product context lives in PRODUCT.md; this file covers only the visual system.

The confirmed rejection is the comment-sidebar review app with purple buttons and rounded cards. The approved comp (`.impeccable/mocks/comps/rundown.png`, companion `web.png`) is the reference picture. Where the build differs from it (no waveform in the timeline track, no purple VO tag, no colored left rails on web log rows), the build is the system.

**Key Characteristics:**
- Near-black tonal panels separated by 1px lines; nothing at rest casts a shadow.
- Three signal hues with fixed meanings (red live, amber placed, green signal), plus page blue for location: quiet on your own site, lit on a reference.
- Warnings and missing pieces stay dark: no alarm color outside the three signals.
- Cascadia Mono for every machine reading: timecodes, clocks, row numbers, mark labels, paths.
- A black UMD label strip under every monitor and preview.
- Square hardware keys (4px corners) and one round TALK key with a recessed bezel.
- A newsroom rundown: numbered rows of timecode, tag, frame thumbnail and the words you said.

## Colors

A control-room neutral ramp carrying three lamps, each with exactly one job.

### Primary
- **Tally Red** (#e23b2e, `rec`): the live lamp. The REC tally dot while recording, the TALK key face when ON, the program monitor rim while a note is open, the open rundown row's 3px rail, the timeline playhead while recording, and the pointer ring and fading trail drawn over the program picture.
- **Tally Text** (#ff6b5e, `rec-text`): tally red when red is the text on a dark ground: the REC pill word and clock while recording, the open row's index number (6.3:1 on the wash, 6.6:1 on panel).
- **Tally Ink** (#c42f24, `rec-ink`): tally red behind small white lettering: the R range tag in the rundown (white on it is 5.6:1).
- **Tally Deep** (#4a1712, `rec-deep`): the banked lamp. The monitor rim while recording but not talking, the REC pill border, the 1px inner outline of the open row.
- **Tally Wash** (#2a1311, `rec-tint`): the lit ground behind live content: the REC pill fill and the open rundown row.
- **Tally Edge** (#6b1a13, `rec-edge`): the rim of the lit TALK key and the border of the error toast.
- **Tally Low** (#b42318, `rec-low`): the lower stop of the lit TALK key's gradient.

### Secondary
- **Mark Amber** (#f3b33d, `mark`): a mark you placed. Solid tabs with ink lettering for P/B/R/M labels on the picture and on timeline ranges, mark tags in the rundown, mark chips on the review screen, timeline stems with flag heads, range bands (28% fill with solid 2px in/out handles), box outlines, pin dots and leaders, and the pins and boxes the extension draws on your site.
- **Mark Ink** (#121315, `mark-ink`): the only text color set on amber, and the 2px keyline around pin dots.

### Tertiary
- **Signal Green** (#39c26d, `ok`): signal present. Mic meter segments once the mic is live (the meter sits in fg-3 before that), "ok" status dots, the transcript-source line on review when Whisper ran, and the Done tally disc.
- **Page Blue** (#8fa6d1 on #1e2737, `page` on `page-bg`, edged with `page-edge` #2c3a52): location. Quiet (blue lettering on `page-bg`) is your own site: the PAGE tag in the web log, the PAGE label on the page UMD strip, the POINTING label on the preview strip and the YOUR SITE chip on the in-page toolbar. Lit (a `page` fill with `mark-ink` lettering, 7.4:1) is a reference, another site the user is showing as inspiration: the REF tag in both rundowns and on review notes, the REF lamp on the page UMD strip and the REFERENCE chip on the in-page toolbar. In video review page blue appears only lit, for references.

### Neutral
- **Gallery Black** (#0b0c0e, `bg`): the room. App background and top bar.
- **UMD Black** (#050506, `umd`): label strips under monitors and the path chip; darker than the room so the strip reads as hardware.
- **Panel** (#131518, `panel`): every resting panel (rundown, desk row, timeline, settings desk, review list) and text inputs.
- **Panel Raised** (#1a1d21, `panel-2`): buttons, hardware keys, keycaps, chips, the extension-setup callout.
- **Panel Lit** (#22262b, `panel-3`): hover and pressed states, segmented selection, toggle track, floating menu items, the finishing scan track.
- **Timeline Track** (#1d2024, `tl-track`): the track band on the timeline canvas.
- **Line** (#262a2f, `line`): 1px panel borders, row dividers, desk-row separators.
- **Line Strong** (#363b42, `line-2`): control borders, ruler ticks, scrollbar thumb, dashed empty states, the home tile's hover rim.
- **Line Hover** (#4a5058, `line-3`): the hover edge on buttons, inputs and hardware keys.
- **Legend White** (#f2f2ee, `fg`): primary text, the primary button fill, the text caret, warning text.
- **Legend Grey** (#a7abb2, `fg-2`): secondary text, panel legends, idle icon buttons, the finishing scan bar (7.9:1 on panel).
- **Legend Dim** (#878c95, `fg-3`): metadata, placeholders, timeline labels, voice-note ticks, the idle tally dot (5.4:1 on panel).
- **White** (#ffffff, `white`): lettering on lit red (TALK ON, PGM lamp on `rec-ink`, R tag, Remove hover) and the primary button's hover. Never text at rest.
- **Sketch Greys** (#9aa3b0 and #c9ced6, `sketch-1` and `sketch-2`): only the page sketch inside the home Web Review tile (its paper is a literal #e9ebef).

### Named Rules
**The Tally Rule.** Solid tally red means you are live: recording, talking, or the note that is open right now. When nothing is live, no red fill is on screen. Red takes three forms: `rec` for lamps, rims, rails and dots; `rec-text` when red is itself the text on a dark ground; `rec-ink` when small white lettering sits on red. Its only other job is void and remove (the VOID stamp, the strike line through a voided note, the Remove item's hover border, the error toast), and there it is always an outline, a stroke or a dark wash, never a lit fill.

**The Placed-Mark Rule.** A solid amber tab with ink lettering always means a mark the user placed. Outside marks, amber appears only as the focus outline, the listening keycap and the 35% text-selection highlight; never as a filled tab, a lamp or a warning.

**The Dark Lamp Rule.** Warnings and missing pieces light nothing. A degraded or missing state is a dark lamp (an fg-3 dot ringed by an fg-2 outline) beside plain fg or fg-2 text; the extension-setup callout is a neutral panel-2 box with an fg title and an fg link.

**The Location Rule.** Page blue says where you are, never what you did. Quiet blue is your site and lit blue is a reference. A screenshot is something you placed, so it is an amber S tab even when it was taken on a reference; the REF tag beside it is what says "somewhere else".

**The On-Air Rule.** The program monitor rim has three states: line-2 at rest, rec-deep while recording, full tally while a note is open. The rim, the PGM lamp, the TALK key and the open rundown row light together, with one 0.55s brightness flash when the note opens.

Known inconsistencies, recorded as built:
- The rundown tags range marks (R1) in solid red (rec-ink, white lettering), while the same range is amber everywhere else (the timeline band and its R tab, the review chip). The approved comp also draws R1 red in the rundown, but by the Placed-Mark Rule ranges are amber, so the rundown tag is drift.
- Markers (M1) take a neutral outline tag in the rundown but amber stems on the timeline.

Measured contrast still under 4.5:1 on live lamps: white on `rec` is 4.29:1 (the extension's talking segment), and white on the bright top of the lit TALK key face (#ff5a4a) is 3.08:1, rising to 4.29:1 at its `rec` middle stop.

## Typography

**Display Font:** Segoe UI Variable Display (with Segoe UI, system-ui, -apple-system, sans-serif)
**Body Font:** Segoe UI Variable Text (with Segoe UI, system-ui, -apple-system, sans-serif)
**Label/Mono Font:** Cascadia Mono (with Cascadia Code, Consolas, ui-monospace, SF Mono, monospace)

**Character:** The Windows system faces are a deliberate choice for a local tool that runs as a Chrome app window on Windows 11 and has nothing to download or build (see PRODUCT.md, Stack and Operating Context). The UI face carries human words; Cascadia Mono carries every machine reading, the way a gallery's UMDs and timecode readers do. Display moments are made by weight and tracking rather than by a separate face: the wordmark is 600 weight tracked 0.34em.

The ramp is dense at the small end, as a tool's should be (10, 11, 12, 13, 14, 15, 16px), then jumps to the few display sizes (22, 26, 28, 34px).

### Hierarchy
- **Display** (600, 34px, 1.15, -0.01em): the one question or verdict per screen ("What are you reviewing?", "Sent to Claude").
- **Display Compact** (600, 26px, 1.15, -0.01em): the home question under 640px.
- **Headline** (600, 28px, 1.2): the review screen heading.
- **Title** (600, 22px, 1.2 to 1.3): the empty-monitor prompt and the finishing message.
- **Wordmark** (600, 17px, 1, 0.34em, uppercase): DICTATE in every top bar; 15px in the web panel, 14px at 0.2em under 640px.
- **Body Large** (400, 16px, 1.45): the home lede, the Done subline, the live caption in the web TALK block, and review note text (at 1.5). The extension-setup callout title uses this size at 600 in the display face.
- **Body Note** (400, 15px, 1.4): rundown note text, the desk live caption, the file name in the top bar.
- **Body** (400, 14px, 1.45): base UI text.
- **Caption** (400, 13px, 1.45): secondary text: the hint under TALK, field notes, status lines, toggle labels, recent-session meta, the note's page URL, the no-frame placeholder. The top-bar mode label uses it at 500, 0.28em, uppercase; the listening keycap at 500.
- **Panel Legend** (600, 12px, 1, 0.22em, uppercase, fg-2): names the panel it sits on: RUNDOWN, TIMELINE, YOUR SITE, RECENT SESSIONS.
- **Field Label** (600, 12px, 0.06em, uppercase, fg-3): settings-desk and review field labels.
- **Key Legend** (600, 12px, 1, 0.06em): hardware key text (MARK IN, MARK OUT, MARKER).
- **UMD** (Cascadia Mono 500, 14px, 1.2, 0.04em, tabular): the page strip in web review. The program strip and the home tile strips step up to 15px (tiles at 0.12em); the POINTING and SESSION strips step down to 13px.
- **Mono Index and Clock** (Cascadia Mono 500 and 600, 15px, tabular): rundown and review row numbers (001, 002) and the REC clock.
- **Mono Tag** (Cascadia Mono 700, 12px, 1, 0.02em): tags and mark tabs (P1, B1, VO, TXT, PAGE).
- **Mono Timecode** (Cascadia Mono 400, 12px, 1.2, tabular): row timecodes, file meta, the timeline foot, the path chip.
- **Micro** (Cascadia Mono 600, 11px, 1): keycap legends, the recent-session mode label (at 0.08em), the extension's element-highlight tag.
- **Micro Nested** (Cascadia Mono 600, 10px, 1): a keycap nested inside another control: the keycap on the TALK key and the keycaps in the extension toolbar. The large TALK key's keycap steps back up to 12px.

One-off sizes, recorded but not ramp steps: 20px for the TALK word on the large web-panel TALK key (the 14px word scaled with its key), 18px for "Drop to load" on the drop veil (600, display face), and 10.5px for the timeline canvas ruler labels. Canvas marks and frame stamps size in frame-relative units (see Program Monitor).

### Named Rules
**The Reader Rule.** Anything a machine would print (timecode, clock, row number, mark label, frame size, file path) is Cascadia Mono with tabular numerals. Anything a person said or should read is the UI face.

**The Legend Rule.** An uppercase tracked legend names the panel or field it sits on (the panel's heading is "Rundown"). It never sits above a separate heading as an eyebrow.

## Layout

**Rundown layout (video review).** A 56px top bar over a full-viewport work area. The work area is a grid with 12px padding and 12px gaps: the rundown column at `clamp(360px, 30vw, 500px)` on the left, the program column fluid on the right, and the timeline panel spanning both columns underneath. The program column stacks the monitor (takes all remaining height) over one desk row. The page never scrolls on desktop; the rundown log scrolls inside its panel.

**Desk row.** A single flex row (min 100px, 12px by 16px padding) whose groups are divided by 1px line rules with 18px on each side: TALK key, voice block (live caption over hint, mic meter at right; grows, min 220px), the three mark keys, the three transport keys.

**Rundown row.** A five-column grid: 36px number, 112px meta (timecode over tag, 8px apart), 120px 16:9 thumbnail, fluid text, 28px menu; 12px gaps and 12px vertical padding. Container queries on the rundown narrow it to 32/100/92px at 470px and, at 380px, wrap the text onto its own line under the meta and thumbnail.

**Other screens.** Home is a centered 1120px column (48px top padding) with a two-up monitor wall (20px gap) and a settings desk that auto-fits 230px fields. Web review is a docked single column, max 620px, 14px gaps, with the top bar and action bar padded to align with the 588px content edge. Review is a centered 1080px column with each note as a 280px frame column beside fluid text (18px gap). Finishing and Done are single centered stacks.

**Responsive.** At 1100px the desk row wraps and the settings desk goes to one column. At 900px video review stacks program, then timeline, then rundown (capped at 60vh), the monitor locks to 16:10, file meta hides, and review notes and the monitor wall go to one column. At 640px the top bar condenses (10px padding; file name, meter and the REC word hide, leaving the dot and clock), desk-row dividers drop and its groups center, the home question drops to Display Compact, and the zoom slider hides. At 440px the video top bar drops the wordmark.

**Spacing rhythm.** 4, 8, 12, 16, 20 and 24px carry layout; 6, 10, 14 and 18px appear inside controls and between control groups. Panels pad 16px; panel heads pad 16px with a 1px rule under them.

## Elevation & Depth

The desk is flat. Depth comes from the tonal ramp (bg, then panel, panel-2, panel-3) and 1px lines, with the UMD strip set darker than the room so it reads as a hardware label. Shadows exist only for things that float over the desk (row menu, toasts, the in-page toolbar) and for physical controls (hardware keys and the TALK key). State is drawn with inset rails and rims, not lift.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 8px 20px rgba(0, 0, 0, .45)`): the rundown row's Remove menu; toasts use `0 8px 24px rgba(0, 0, 0, .45)` and the in-page toolbar `0 12px 32px rgba(0,0,0,.4)`.
- **Key throw** (`box-shadow: 0 1px 3px rgba(0, 0, 0, .4)`): hardware keys at rest; collapses to `0 0 1px` with a 1px drop when pressed.
- **TALK bezel** (`box-shadow: 0 0 0 6px #0c0d0f, 0 0 0 7px #2c3036, 0 4px 12px rgba(0, 0, 0, .5), inset 0 1px 0 rgba(255, 255, 255, .06)`): the recessed collar around the idle TALK key.
- **TALK lit** (`box-shadow: 0 0 0 6px #0c0d0f, 0 0 0 7px #5a1c17, 0 8px 22px rgba(226, 59, 46, .38), inset 0 1px 0 rgba(255, 255, 255, .25)`): the collar warms and the key throws red light when ON.
- **Tally rail** (`box-shadow: inset 3px 0 0 var(--rec), inset 0 0 0 1px var(--rec-deep)`): the open rundown row.
- **Monitor hover rim** (`box-shadow: inset 0 0 0 2px var(--line-2)`): the screen of a home monitor tile on hover.
- **Field focus** (`box-shadow: 0 0 0 3px rgba(242, 242, 238, .08)`): text inputs on focus, with the border stepping to fg-2.

### Named Rules
**The Flat Desk Rule.** Panels sit flat on the desk behind a 1px line. Only what floats above the desk (menus, toasts, the in-page toolbar) or what is a physical control (keys, TALK) casts a shadow.

## Shapes

Hardware corners, small and consistent. The PGM lamp, the home tile's dashed box area and the extension's element highlight use 2px (`lamp`). Tags, chips, thumbnails, frame grabs, the VOID stamp and the canvas mark tabs use 3px. Hardware keys, keycaps, the program monitor, the page UMD strip and the path chip use 4px (`r-1`). Panels, buttons, inputs, segmented controls, the REC pill, toasts, menu items and the setup callout use 6px (`r-2`). Only the floating in-page toolbar uses 10px (`r-3`). Circles are reserved for things that are round in a gallery: the TALK key, tally and status dots, the pin dot, the playhead head, the toggle knob and the Done disc.

One-off: the toggle track is the only pill shape, rounded 18px at its own 18px height; the finishing scan bar rounds its 6px height fully.

Borders are 1px everywhere except the program monitor's 2px rim and the keycap's 2px bottom edge (3px on the talk-key setter) that makes it read as a physical key. A dashed line means provisional or empty: the empty thumbnail, the TXT tag on typed notes, the box being dragged, extension box marks, the drop veil (a 6% light wash with a dashed `line-3` border; dropping a file is not live, so no red).

## Components

### Buttons
Quiet hardware panels; the only bright button hands work off.
- **Shape:** 6px corners (`r-2`), 36px tall, 14px side padding, 500 weight, 8px gap to an 18px icon.
- **Default:** panel-2 fill, 1px line-2 border, fg text.
- **Hover / Active / Focus:** hover lifts to panel-3 with a line-3 border; press drops 1px; focus is a 2px amber outline at 2px offset. Disabled is 45% opacity; busy is 70% with no pointer.
- **Primary:** off-white fg fill with #101113 text at 600; hover goes to `white`. One per screen, for the hand-off: Open (web review), Send N to Claude (review).
- **Strong:** the default fill with an fg-2 border at 600 weight, for Finish & review; hover border goes to fg.
- **Icon button:** 34px square (28px small), transparent, fg-2; hover fills panel-3 and text goes to fg.
- **Link button:** fg underlined text with a 3px offset ("check again" in the extension-setup callout).

### Hardware Keys
The mark and transport keys under the monitor.
- **Shape:** 44px tall, at least 44px wide, 12px side padding, 4px corners; transport icon keys are 52px wide.
- **Color:** panel-2 fill, line-2 border, fg Key Legend text, key-throw shadow.
- **States:** hover panel-3 with a line-3 border; press drops 1px and flattens the shadow. With no video loaded the mark and transport groups sit at 35% opacity and ignore input.

### TALK Key
The one round control, and the most important.
- **Idle:** 84px circle (108px in the web panel), 2px #3a3e44 border, a dark radial fill (#2b2f35 to #17191c), the TALK bezel shadow. "TALK" in the display face at 700, 14px, 0.08em (20px on the large key), with a Micro Nested keycap beneath it (12px on the large key).
- **ON:** the word becomes "ON", the fill becomes a red radial (#ff5a4a through `rec` to `rec-low`), the border is `rec-edge`, the lettering `white`, and the TALK lit shadow. The nested keycap's outline becomes rgba(255, 255, 255, .55), a one-off value (the extension's talking keycap uses .5).
- **Hover / Press:** hover brightens the border to #565c64; press scales to 0.97.

### Keycaps
Inline key legends in hints and on the TALK key: 22px tall, 6px padding, 4px corners, panel-2 fill, line-2 border with a 2px bottom edge, Micro type. Nested in another control they shrink to 18px with Micro Nested type. The talk-key setter on home is a larger keycap (700 15px mono, 3px bottom edge) that turns amber in border and text while it listens for a key.

### Tags (rundown)
Mono Tag type, 22px tall, at least 34px wide, 7px side padding, 3px corners.
- **Mark:** amber fill, amber border, mark-ink text, for pins, boxes and screenshots (P1, B1, S1).
- **Page:** page-bg fill, page-edge border, page blue text (PAGE, web log only).
- **Reference:** page fill and border, mark-ink text (REF), in both rundowns and on review notes. In the video rundown a reference row's thumbnail is the site's screenshot, letterboxed on UMD black.
- **Neutral:** transparent with a line-2 border and fg-2 text, for voice notes (VO) and markers (M1).
- **Typed:** the neutral tag with a dashed border (TXT).
- **Range (as built):** rec-ink fill with white lettering (R1). See the known inconsistencies under Colors.

### Chips (review)
- **Style:** 26px tall, 9px side padding, 3px corners, panel-2 fill, line-2 border, fg-2 12px text, ellipsis on overflow.
- **Mark chip:** amber fill, mark-ink text, 600 Cascadia Mono, carrying the mark and its anchor ("P1 0.62, 0.42", "R1 00:08.00 → 00:12.40"). Ranges are amber here.
- **Quiet chip:** transparent fill, for secondary context (hovered element, "typed").

### Inputs / Fields
- **Style:** 36px tall, 12px side padding, 6px corners, panel fill, 1px line-2 border, fg-3 placeholder, fg caret. Textareas pad 9px by 12px; review note text sits on the bg fill at 16px/1.5.
- **Hover / Focus:** hover border line-3; focus drops the outline, steps the border to fg-2 and adds the 3px field-focus ring.
- **Toggle:** 30 by 18px pill track in panel-3 with a 12px fg-2 knob; on is a #3d3f43 track with an fg knob. Settings toggles stay monochrome. Labels use Caption type.
- **Segmented:** 34px buttons inside one line-2 frame, divided by 1px lines; pressed is panel-3 with fg text.

### Controls Panel (home)
The list of customizable bindings, below the settings desk. One row per action: the action name in body text with an optional 12px `fg-3` hint, its scope ("Everywhere", "Video", "On your site") in 12px `fg-3`, then its bindings as **bind chips**: a keycap-like chip (`panel-2`, 1px `line-2` border with a 2px bottom edge, 4px corners, 30px tall) holding the binding in 600 12px mono, or, for mouse bindings, a 15px mouse glyph plus the name in the UI face ("Side button (back)"). Each chip ends in a 22px remove button with a drawn close icon. **Add** is a dashed `line-2` chip in `fg-2`; while it listens for the next key or mouse button its border turns `mark` amber, the same listening-keycap exception the Placed-Mark Rule allows. Rows collapse to one column under 700px.

### Status Lines
Caption-sized fg-2 text led by an 8px dot. Ok is a green dot. Warn and missing are a dark lamp: an fg-3 dot ringed by a 1px fg-2 outline. Idle is a plain fg-3 dot. On the review screen the transcript-source line is green when Whisper ran and plain fg when it fell back to live captions.

### Extension-setup Callout
Shown in web review until the extension answers: panel-2 fill, 1px line-2 border, 6px corners, 16px padding. Title in fg at 600 16px (display face); body and numbered steps in fg-2 with fg bold terms; the folder path sits in a UMD-black path chip with icon buttons; "check again" is an fg link button.

### Navigation (top bar)
- **Style:** 56px tall, bg fill, 1px line underneath, 16px side padding.
- **Left:** back icon button, the wordmark, and a mode label (Caption at 500, 0.28em, uppercase, fg-3: WEB REVIEW, REVIEW).
- **Center:** file name in Body Note with mono meta (dimensions, fps) at 12px fg-3.
- **Right:** REC pill, mic meter, Record, Finish & review (strong).
- **REC pill:** 36px, 6px corners, panel fill, line-2 border, Mono Clock type, 12px tally dot. READY is fg-3 text and dot; REC is the wash fill, rec-deep border, rec-text lettering and a `rec` dot; PAUSED is fg-2 text.

### UMD Strip (signature)
The black label under every monitor.
- **Style:** umd fill, fg text, UMD type, at least 34px tall, 6px by 12px padding, centered, items separated by an fg-3 middle dot, ellipsis on overflow.
- **Program:** "PGM · file · timecode" under the monitor at 15px. The PGM lamp (2px corners, 2px by 7px padding) lights `rec-ink` with white lettering (5.56:1) while a note is open.
- **Elsewhere:** the page strip above the web preview (left-aligned, 1px line border, 4px corners, PAGE label in page blue), the POINTING strip under the preview (13px, label in page blue), the home monitor tiles (left-aligned, 15px, 0.12em), and the SESSION path on Done (13px, wraps).

### Rundown Row (signature)
- **Content:** mono row number, timecode button over tag, frame thumbnail (3px corners; a dashed line-2 box when there is no frame), note text in Body Note type, and a three-dot menu that appears on row hover.
- **Open:** the row lights while you talk: tally wash fill, tally rail, row number in rec-text.
- **Pending and empty:** a pending row shows italic fg-3 text; an empty open row shows "Listening…" in fg-3.
- **Menu:** "Remove from rundown" floats below the dots in panel-3 with a line-2 border and the float shadow; on hover its border turns `rec` and its text `white`.
- **Motion:** new rows fade in over 0.25s.
- **Web variant:** a three-column row (64px timecode, tag, text) with no thumbnail; the open web row keeps only the 3px rail.

### Program Monitor and Canvas Marks (signature)
- **Monitor:** black stage, 2px rim with 4px corners following the On-Air Rule, crosshair cursor over a loaded video, UMD strip below.
- **Scale:** marks are drawn on a canvas in a unit of frame width / 1280 (minimum 0.85), so they keep their weight at any monitor size and in exported frames.
- **Tab:** solid amber, 3u corners, 24u tall, 6u side padding, ink Cascadia Mono 700 at 15u.
- **Pin:** a 7u amber dot with a 2u ink keyline, a 2u amber leader running 26u up and left to its tab.
- **Box:** 10% amber fill, 3u amber stroke, tab seated on the top-left corner. While dragging, the outline is dashed (6 on, 4 off) at 2px.
- **Pointer ring:** only while a note is open: a 92% white outer ring with a tally red ring and a smaller red inner ring (radius 14u). While recording, a red trail fades out over 700ms behind the pointer.
- **Frame stamp:** exported frames carry "timecode  filename" in 600 Cascadia Mono at 15u, white on 75% black, bottom-left.

### Timeline (signature)
- **Panel:** panel fill, 10px by 14px padding, a head row (TIMELINE legend, playback rate, mute, zoom − slider +) and a foot row of mono start and end timecodes in fg-3.
- **Canvas:** 84px tall with an ew-resize cursor. The track sits at 36% height and is 58% tall, filled tl-track.
- **Ruler:** 1px line-2 ticks (10px major, 4px minor) with fg-3 Cascadia Mono 500 labels at 10.5px, spaced about 90px apart.
- **Marks:** ranges are a 28% amber band with 2px amber in, out and top edges and an R tab; a pending in-point shows a 16% band and a 2px handle. Pins, boxes and markers are 2px amber stems with a small flag head. Voice notes are 2 by 8px fg-3 ticks along the bottom.
- **Playhead:** 2px line with a 5px round head above the track, fg at rest and tally red while recording. The hover line is fg-3 at 60%.

### Mic Meter
Ten 4px segments with 3px gaps in a 66 by 14px strip, beside an 18px mic icon. Unlit segments are line-2; lit segments are green, clipped to the current level. Before the mic is ready, the icon sits in fg-3.

### Monitor Tiles (home)
Panel fill, line border, 6px corners. The tile screen (16:8, a dark radial gradient) carries illustrative amber P1 and B1 tabs (and, on the Web Review tile, a page sketch in sketch-1 and sketch-2), then a left-aligned UMD title, then 14px fg-2 copy (max 54ch). Hover lifts the tile 2px, brightens its border to line-2 and draws the 2px line-2 monitor hover rim on the screen.

### Finishing
A single centered stack: wordmark, a 6px scan bar (fg-2 sweeping over a panel-3 track every 1.3s), the Title-sized message and an fg-3 subline.

### Toasts
Bottom center, 20px up, at most 560px wide. #24272c fill, line-2 border, 6px corners, 10 by 16px padding, float shadow; they rise in over 0.25s and fade out over 0.3s. Error toasts use a #2a1513 fill and a rec-edge border.

### In-page Toolbar (extension)
The same world drawn inside the user's own site, in a shadow root with literal colors because studio tokens are not available there.
- **Bar:** fixed bottom center 18px up, 44px tall, 10px corners, #121315 fill, #2c2f34 border, the toolbar float shadow, 500 13px UI face.
- **Contents:** grip dots, a 10px red tally dot with a 3px 25% red halo (grey when paused), a 600 13px mono clock, the location chip and its "for" line, 1px separators, a Browse / Annotate segment (32px, 6px corners, pressed #2a2d32 with a #3a3e44 inset ring), the Screenshot segment (a drawn crop-corners glyph), Micro Nested keycaps, the talk segment and the mark count.
- **Location chip:** 24px, 3px corners, 700 11px mono at 0.06em. YOUR SITE is quiet page blue (page-bg fill, page-edge inset ring, ring brightens to page blue on hover); REFERENCE is lit (page fill, mark-ink text) and is followed by "for /path" in 500 12px mono #9a9ea6, naming the page of the user's site it applies to. Clicking flips the whole site; in video review it stays REFERENCE and does not flip. Under 1180px the "for" line and the segment keycaps drop out.
- **Screenshot (crop):** the page dims to 42% UMD black under a crosshair, with a UMD-black hint strip 16px from the top (SCREENSHOT legend in fg-2 mono, the instructions, a Cancel button with an Esc keycap). Dragging cuts a clear window out of the dim with a 2px amber outline and an amber size tab ("420 × 860"). On release the bar hides for the capture, then the saved area flashes white from 50% to 0 over 0.45s and the segment reads "S4 saved" with an amber tab for 1.8s. A click without dragging saves the whole screen.
- **Talking:** the talk segment fills tally red with white 700 text and the whole bar gains a 2px 55% red ring.
- **Marks on the page:** element highlight is a 2px amber outline with a 10% amber wash, 2px corners and an amber Micro tab label above; pins are a 12px amber dot with a 2px ink ring and a tab; boxes are a 2px dashed amber border with an 8% wash. The pointer ring is 30px with a 4px red border and a 2px white halo.
- The extension's greys (#9a9ea6, #2c2f34, #5b5e63) sit close to fg-2, line and fg-3 but are not the same values.

### Motion
One easing curve, `cubic-bezier(.16, 1, .3, 1)`. Hovers transition in 0.15s, lamps and the monitor rim in 0.12s, tile lift in 0.2s, row and toast entrances in 0.25s. Going on air fires a single 0.55s brightness flash on the monitor, the TALK key and the open row. The finishing scan bar sweeps every 1.3s; the Done disc scales in over 0.5s. Reduced motion collapses all of it to near zero.

## Do's and Don'ts

### Do:
- **Do** light tally red only for live state, and light the monitor rim, PGM lamp, TALK key and open rundown row together.
- **Do** use `rec` (#e23b2e) for lamps, rims and rails, `rec-text` (#ff6b5e) when red is the text, and `rec-ink` (#c42f24) behind small white lettering.
- **Do** draw every placed mark as a solid amber (#f3b33d) tab with mark-ink lettering in 700 Cascadia Mono with 3px corners: on the picture, on the timeline, in the rundown, on review chips and on the user's site.
- **Do** show a warning or a missing piece as a dark lamp (fg-3 dot, fg-2 ring) with plain fg or fg-2 text.
- **Do** put a black UMD strip (Cascadia Mono, 0.04em, tabular numerals) under every monitor or preview, with items separated by an fg-3 middle dot.
- **Do** set timecodes, clocks, row numbers and mark labels in Cascadia Mono with tabular numerals, and set spoken words in the UI face.
- **Do** build depth with the panel ramp (bg, panel, panel-2, panel-3) and 1px lines, and keep shadows for floating menus, toasts, the in-page toolbar and physical keys.
- **Do** keep hardware keys square (4px corners, 44px tall) and keep TALK round.
- **Do** use the 2px amber focus outline at 2px offset on every focusable control, in the studio and in the extension.
- **Do** give a screen at most one off-white primary button, for the hand-off action.

### Don't:
- **Don't** fill anything solid tally red unless the user is live; void and remove use red only as an outline, stroke or dark wash.
- **Don't** use amber for anything that is not a mark the user placed, apart from the focus outline, the listening keycap and the selection highlight; never as a warning.
- **Don't** tag range marks in red; ranges are placed marks and take amber, and the rundown's red R1 tag is drift, not system.
- **Don't** build the comment-sidebar review app: no purple buttons and no rounded cards.
- **Don't** introduce a new hue without a new signal meaning; a color that means nothing is decoration.
- **Don't** put resting shadows on panels or round them past 6px; only the floating in-page toolbar takes 10px.
- **Don't** set an uppercase tracked legend above a heading as an eyebrow; legends name the panel they sit on.
