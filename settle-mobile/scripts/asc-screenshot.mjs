// Upload screenshots to ASC for the en-US appStoreVersionLocalization.
// Usage: node asc-screenshot.mjs <displayType> <file.png> [file2.png ...]
//   e.g. node asc-screenshot.mjs IPHONE_FACE_ID_LARGE_PROFILE shots/iphone-1.png
//        node asc-screenshot.mjs IPAD_13_PROFILE shots/ipad-1.png
// Flow: find/create appScreenshotSet -> reserve appScreenshot -> PUT bytes -> commit -> poll COMPLETE.
import { createSign, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const KEY_PATH = new URL('../credentials/ios/asc-api-key.p8', import.meta.url).pathname;
const KID = 'PPQQ3TLU4A';
const ISS = '69a6de7c-e268-47e3-e053-5b8c7c11a4d1';
const LOC_ID = '0e33734a-6c09-44ed-90ca-d889994bb2be'; // en-US localization on version cf5eb3b1

function makeJwt() {
  const key = readFileSync(KEY_PATH, 'utf8');
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const t = b64({ alg: 'ES256', kid: KID, typ: 'JWT' }) + '.' + b64({ iss: ISS, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' });
  const der = createSign('SHA256').update(t).sign(key);
  const jose = d => {
    let i = 2;
    const rl = d[i + 1]; let rb = d.slice(i + 2, i + 2 + rl); i = i + 2 + rl;
    const sl = d[i + 1]; let sb = d.slice(i + 2, i + 2 + sl);
    if (rb.length > 32) rb = rb.slice(rb.length - 32);
    if (sb.length > 32) sb = sb.slice(sb.length - 32);
    return Buffer.concat([rb, sb]).toString('base64url');
  };
  return t + '.' + jose(der);
}
const jwt = makeJwt();
const api = async (p, m, b) => {
  const r = await fetch('https://api.appstoreconnect.apple.com/v1' + p, {
    method: m || 'GET',
    headers: { Authorization: 'Bearer ' + jwt, ...(b ? { 'Content-Type': 'application/json' } : {}) },
    ...(b ? { body: JSON.stringify(b) } : {}),
  });
  const txt = await r.text();
  try { return { status: r.status, json: JSON.parse(txt) }; }
  catch { return { status: r.status, json: txt }; }
};

const [displayType, ...files] = process.argv.slice(2);
if (!displayType || !files.length) { console.error('usage: asc-screenshot.mjs <displayType> <file>...'); process.exit(1); }

// 1) find or create the screenshot set
let setId;
const sets = await api(`/appStoreVersionLocalizations/${LOC_ID}/appScreenshotSets`);
const existing = (sets.json.data || []).find(s => s.attributes.screenshotDisplayType === displayType);
if (existing) {
  setId = existing.id;
  console.log('set exists:', setId);
} else {
  const made = await api('/appScreenshotSets', 'POST', {
    data: {
      type: 'appScreenshotSets',
      attributes: { screenshotDisplayType: displayType },
      relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: LOC_ID } } },
    },
  });
  if (made.json.errors) { console.log(JSON.stringify(made.json.errors)); process.exit(1); }
  setId = made.json.data.id;
  console.log('set created:', setId);
}

for (const file of files) {
  const bytes = readFileSync(file);
  const md5 = createHash('md5').update(bytes).digest('hex');
  // 2) reserve
  const res = await api('/appScreenshots', 'POST', {
    data: {
      type: 'appScreenshots',
      attributes: { fileName: basename(file), fileSize: bytes.length },
      relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } } },
    },
  });
  if (res.json.errors) { console.log(basename(file), 'RESERVE ERR:', JSON.stringify(res.json.errors)); continue; }
  const shot = res.json.data;
  console.log(basename(file), 'reserved', shot.id);
  // 3) upload parts
  for (const op of shot.attributes.uploadOperations || []) {
    const chunk = bytes.subarray(op.offset, op.offset + op.length);
    const headers = {};
    for (const h of op.requestHeaders || []) headers[h.name] = h.value;
    const up = await fetch(op.url, { method: op.method, headers, body: chunk });
    if (!up.ok) { console.log('  part upload failed', up.status, await up.text()); }
  }
  // 4) commit
  const commit = await api('/appScreenshots/' + shot.id, 'PATCH', {
    data: { type: 'appScreenshots', id: shot.id, attributes: { uploaded: true, sourceFileChecksums: { md5 } } },
  });
  if (commit.json.errors) { console.log('  COMMIT ERR:', JSON.stringify(commit.json.errors)); continue; }
  // 5) poll until COMPLETE
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 4000));
    const st = await api('/appScreenshots/' + shot.id);
    const state = st.json.data?.attributes?.assetDeliveryState?.state;
    const errs = st.json.data?.attributes?.assetDeliveryState?.errors;
    if (state === 'COMPLETE') { console.log('  COMPLETE'); break; }
    if (errs?.length) { console.log('  DELIVERY ERR:', JSON.stringify(errs)); break; }
    if (i === 29) console.log('  still', state || 'pending', JSON.stringify(st.json.data?.attributes?.assetDeliveryState || {}));
  }
}
console.log('done');
