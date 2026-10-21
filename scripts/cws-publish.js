// Uploads the extension zip to the Chrome Web Store and submits it for review, signed in as a
// Google Cloud service account (Chrome Web Store API V2). No dependencies. Used by the release
// workflow; the very first version of the listing is uploaded by hand in the Developer Dashboard.
//
//   CWS_SERVICE_ACCOUNT='<the service account JSON key>' CWS_PUBLISHER_ID=<id> \
//     node scripts/cws-publish.js dist/dictate-extension-1.2.0.zip
//
// The item ID is package.json "dictate.chromeWebStoreId". A version the store already has is skipped.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { PACKAGE } from '../server/install.js';

const API = 'https://chromewebstore.googleapis.com';
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64url = (data) => Buffer.from(data).toString('base64url');

async function accessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: key.client_email, scope: SCOPE, aud: key.token_uri, iat: now, exp: now + 3600 };
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url');
  const res = await fetch(key.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Google sign-in failed: ${body.error_description || body.error || res.status}`);
  return body.access_token;
}

async function call(token, method, url, body) {
  const res = await fetch(url, { method, headers: { authorization: `Bearer ${token}`, ...(body && !Buffer.isBuffer(body) ? { 'content-type': 'application/json' } : {}) }, body: Buffer.isBuffer(body) ? body : body && JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  if (!res.ok) throw new Error(`${method} ${url.replace(API, '')} said ${res.status}: ${json?.error?.message || text.slice(0, 300)}`);
  return json || {};
}

const versionsIn = (revision) => (revision?.distributionChannels || []).map((c) => c.crxVersion).filter(Boolean);
const inProgress = (state) => /IN_PROGRESS/.test(state || '');

async function main() {
  const [zip] = process.argv.slice(2);
  const { CWS_SERVICE_ACCOUNT: keyJson, CWS_PUBLISHER_ID: publisher } = process.env;
  const item = PACKAGE.dictate?.chromeWebStoreId;
  const missing = [!zip && 'the zip path', !keyJson && 'CWS_SERVICE_ACCOUNT', !publisher && 'CWS_PUBLISHER_ID', !item && 'package.json dictate.chromeWebStoreId'].filter(Boolean);
  if (missing.length) {
    console.log(`Skipping the Chrome Web Store: missing ${missing.join(', ')}.`);
    return;
  }
  const version = zip.match(/(\d+\.\d+\.\d+(?:\.\d+)?)\.zip$/)?.[1];
  const base = `${API}/v2/publishers/${publisher}/items/${item}`;
  const token = await accessToken(JSON.parse(keyJson));

  const status = await call(token, 'GET', `${base}:fetchStatus`);
  const known = [...versionsIn(status.publishedItemRevisionStatus), ...versionsIn(status.submittedItemRevisionStatus)];
  if (version && known.includes(version)) {
    console.log(`The Chrome Web Store already has ${version}; nothing to upload.`);
    return;
  }

  console.log(`Uploading ${zip}...`);
  const upload = await call(token, 'POST', `${API}/upload/v2/publishers/${publisher}/items/${item}:upload`, fs.readFileSync(zip));
  let state = upload.uploadState;
  for (let i = 0; inProgress(state) && i < 40; i++) {
    await sleep(3000);
    state = (await call(token, 'GET', `${base}:fetchStatus`)).lastAsyncUploadState;
  }
  if (state !== 'SUCCEEDED') throw new Error(`Upload ended as ${state || 'unknown'}: ${JSON.stringify(upload)}`);
  console.log(`Uploaded ${upload.crxVersion || version}.`);

  const published = await call(token, 'POST', `${base}:publish`, {});
  console.log(`Submitted for review: ${published.state || 'submitted'}. It goes live by itself once approved.`);
  for (const w of published.warningInfo?.warnings || []) console.log(`::warning::Chrome Web Store: ${w.reason}: ${w.description}`);
}

main().catch((err) => {
  console.error(`::error::${err.message}`);
  process.exit(1);
});
