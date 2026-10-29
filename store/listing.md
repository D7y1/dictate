# Chrome Web Store listing

Copy these into the Developer Dashboard. Images are in this folder.

## Package

`npm run pack-extension` → `dist/dictate-extension-<version>.zip`

## Store listing

**Description**

```
Talk through your website and let Claude Code make the changes. Dictate pins exactly what you pointed at, so your notes arrive anchored to the right element, with screenshots.

Start a review in Dictate Studio and browse your site as usual. Point at anything and press T (or your mouse's back side button), say what you want, and press it again. Dictate pins the element under your cursor, takes a screenshot with the pin drawn on it, and lines your words up with what you were pointing at. When you press Send, Claude Code gets a report where every note is tied to a page and an element, and starts on the edits.

Show it what you like, too. In the middle of a review, open any other site (a design you admire, a competitor) and talk there, or press Screenshot and drag around the part you mean. Dictate tags that site as a reference, so Claude treats it as inspiration rather than your code, applies it to the page you came from, and gets the exact font, colors, spacing and radius of what you showed it.

What the extension does
• Pins the element under your cursor while you talk, with its selector, text and HTML
• Screenshot (Alt+S): drag around the part you mean, or click for the whole screen
• Tags other sites you show as references, linked to the page of yours they are for
• Takes screenshots with your pins and boxes drawn on them
• Follows you from page to page, and records clicks, scrolling and text you select
• Annotate mode (Alt+A): pin elements or box an area without talking
• Never reads what you type into fields

Private by design
The extension records only while a review session you started is running. It sends everything only to the Dictate app running on your own computer, which saves the session in your project folder. There is no account, no analytics, and no server in between.

Works with Dictate Studio, which is free and open source. In a terminal:
  npx skills add D7y1/dictate -g
  npx @d7y/dictate setup
Then type /dictate in Claude Code.

Source code: https://github.com/D7y1/dictate

Dictate is an independent open-source project. Claude and Claude Code are made by Anthropic.
```

| Field | Value |
|---|---|
| Category | Developer Tools |
| Language | English |
| Store icon | `extension/icons/icon128.png` |
| Screenshots (1280×800) | `screenshot-1.png`, `screenshot-2.png`, `screenshot-3.png` |
| Small promo tile (440×280) | `promo-small.png` |
| Official URL | none (needs a verified domain; leave empty) |
| Homepage URL | https://d7y1.github.io/dictate/ |
| Support URL | https://github.com/D7y1/dictate/issues |

## Privacy

**Single purpose**

```
Dictate records what you point at, click and see on web pages while you talk through a review in Dictate Studio, so the Dictate app on your computer can turn your spoken notes into a report anchored to those pages and elements.
```

**Permission justifications**

| Permission | Justification |
|---|---|
| storage | Keeps the running review session's state (on or off, the local Dictate server's address, the user's key bindings) in session storage, so it survives the service worker restarting. |
| tabs | Identifies the tab being reviewed and its URL and title, opens the user's site in a window next to the studio, and relays the talk key from the reviewed tab to the studio tab. |
| scripting | Starts the tracker in tabs that were already open before the review started, including tabs opened before the extension was installed. |
| Host permission | Users review their own websites, which can be on any domain: local development servers, staging and production. They can also open any other site during a review to show it as a design reference. During a session the content script follows the pointer, clicks and pinned elements on those pages, and chrome.tabs.captureVisibleTab requires the <all_urls> permission to screenshot them. It does nothing until the user starts a session in Dictate Studio, and it sends data only to the Dictate server on the user's own computer (localhost). |

**Remote code:** No, I am not using remote code.

**Data usage.** Tick these, because the extension handles them during a session (it hands them only to the local Dictate app):

- Web history (the pages visited during a review)
- User activity (pointer position, clicks, scrolling)
- Website content (element text and HTML, screenshots)

Tick all three certifications: not sold to third parties, not used for purposes unrelated to the single purpose, not used for creditworthiness or lending.

**Privacy policy URL:** https://d7y1.github.io/dictate/privacy/

## Test instructions (for the reviewer)

```
Dictate's extension works together with Dictate Studio, a free local app.
1. Install Node.js 20 or newer, then run:  npx @d7y/dictate --url https://example.com
   Dictate Studio opens in a window. Press Open: example.com opens beside it and the session starts.
2. On example.com, point at the heading and press T, say a few words, and press T again. A numbered pin appears on the heading, and the studio lists the note with a screenshot.
3. Press Alt+S (or Screenshot on the toolbar at the bottom of the page) and drag around part of the page. The area flashes and the toolbar shows "S2 saved".
4. Open any other site in the same tab, for example https://www.wikipedia.org. The toolbar's chip reads REFERENCE. Press T, talk, press T again.
5. In the studio, press Finish, then Send. The session is saved in ./.dictate/sessions/ on your computer.
The extension records nothing before step 1 or after step 5, and sends data only to http://localhost.
```

## Distribution

Public, all regions.
