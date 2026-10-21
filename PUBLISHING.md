# Publishing Dictate

Dictate ships in three pieces, all from one version tag:

| Piece | Where | Reaches people |
|---|---|---|
| Studio, server, transcription, setup | npm, `@d7y/dictate` | On their next `/dictate`: the skill runs `npx @d7y/dictate@latest` |
| The `/dictate` skill | this repo, through [skills.sh](https://skills.sh) | `npx skills update` (or `npx @d7y/dictate setup`) |
| Chrome extension | Chrome Web Store | After Google's review (usually a few days), then Chrome updates every copy by itself |

Almost every change lands in the first row and reaches people immediately. Keep the extension small and stable: it only tracks pages and takes screenshots, so it rarely needs a new version, and each new version waits for review.

## Every release

1. If you changed anything in `extension/`, bump `"version"` in `extension/manifest.json`.
2. `npm version patch` for fixes, `npm version minor` for features. This bumps `package.json`, commits, and tags `v<version>`.
3. `git push --follow-tags`

The [Release workflow](.github/workflows/release.yml) then runs the tests, publishes to npm, creates a GitHub release with the extension zip, and, if `extension/` changed, uploads the new extension to the Chrome Web Store and submits it for review. It stops if the tag doesn't match `package.json`, or if `extension/` changed without a version bump.

## One-time setup

### 1. npm

1. Sign in at [npmjs.com](https://www.npmjs.com) (or sign up), with two-factor authentication on.
2. The `@d7y` scope has to be yours: either your npm username is `d7y`, or create a free organization named `d7y` (your avatar → **Add Organization** → name `d7y` → **Unlimited public packages**, free).
3. Publish the first version by hand, from a clean checkout of `main`. Trusted publishing can only be set up on a package that already exists.

   ```
   npm login
   npm publish
   ```

4. On npmjs.com, open **@d7y/dictate → Settings → Trusted Publisher → GitHub Actions** and enter: user `D7y1`, repository `dictate`, workflow `release.yml`, environment left empty. Save. From now on the Release workflow publishes without any npm token.
5. Recommended, on the same page: **Publishing access → Require two-factor authentication and disallow tokens**. Trusted publishing keeps working.

### 2. Chrome Web Store

1. Register at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole). It's a one-time $5 fee, and the Google account needs 2-Step Verification.
2. Build the zip: `npm run pack-extension` writes `dist/dictate-extension-<version>.zip`.
3. In the dashboard: **New item** → upload the zip.
4. Fill in **Store listing**, **Privacy** and **Distribution** from [store/listing.md](store/listing.md), and upload the images in [store/](store/).
5. **Submit for review.**
6. Copy the item's ID (32 letters, shown on the item page and in its URL) into `package.json`:

   ```json
   "dictate": { "chromeWebStoreId": "<the id>" }
   ```

   Commit and release. Setup and the studio then send people to the store listing, and new extension versions upload automatically.

### 3. Let the Release workflow upload to the Chrome Web Store

1. In the [Google Cloud console](https://console.cloud.google.com), create a project (any name, for example `dictate-release`), search for **Chrome Web Store API** and enable it.
2. **IAM & Admin → Service accounts → Create service account** (for example `dictate-release`). It needs no roles. Open it → **Keys → Add key → Create new key → JSON**. A `.json` file downloads.
3. In the Chrome Web Store Developer Dashboard, open **Account** and add the service account's email (the `client_email` in that file). A publisher can have one service account.
4. Note your publisher ID, shown under **Publisher → Settings** in the dashboard.
5. Save both in this repository (**Settings → Secrets and variables → Actions**), or with the GitHub CLI:

   ```
   gh secret set CWS_SERVICE_ACCOUNT < path/to/key.json
   gh variable set CWS_PUBLISHER_ID --body "<publisher id>"
   ```

   Then delete the `.json` file from your computer. Anyone with it can publish as you.

Until all of this is in place, the Release workflow skips the Chrome Web Store step and says what's missing; npm and the GitHub release still go out.

### 4. The landing page

GitHub Pages serves `docs/` from `main` at <https://d7y1.github.io/dictate/> (**Settings → Pages → Deploy from a branch → main, /docs**). The store's privacy policy link is <https://d7y1.github.io/dictate/privacy/>.

### Later: Microsoft Edge Add-ons

Edge users can already install from the Chrome Web Store. A separate, free Edge listing in Microsoft Partner Center is optional.
