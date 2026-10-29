# Security policy

## Reporting a vulnerability

Please report security problems privately, through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**, or go straight to <https://github.com/D7y1/dictate/security/advisories/new>.

Don't open a public issue for them. Include what's affected, how to reproduce it, and what an attacker could do with it. The maintainer aims to reply within a week and will credit you in the fix unless you'd rather stay anonymous.

## Supported versions

Fixes go into the latest release: the newest `@d7y/dictate` on npm and the newest Dictate extension on the Chrome Web Store, which Chrome updates by itself.

## What Dictate is designed to guarantee

These are the boundaries worth testing. A way around any of them is a vulnerability:

- **The server is local.** `dictate` listens on 127.0.0.1 only and serves the studio and the extension.
- **The extension talks only to that server.** It accepts commands only from a Dictate Studio served from the same computer, and sends session data only to `localhost`.
- **It records only during a session.** The extension does nothing until the user starts a review in the studio, and stops when it ends. In video review it records a website only when the user talks, pins or takes a screenshot there.
- **Typed values are never recorded.** Text in input fields is skipped.
- **Sessions stay on disk.** They are written to the project's `.dictate/sessions/` folder and go nowhere else. Claude reads them only when the user sends a session.
