// General ASC API helper — ES256 JWT signed with the p8 key.
// Usage: node asc-api.mjs GET '/apps?filter[bundleId]=com.settleinpeace.mobile'
//        node asc-api.mjs POST /reviewSubmissions '<json body>'
//        node asc-api.mjs PATCH /appStoreVersions/<id> '<json body>'
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const KEY_PATH = new URL('../credentials/ios/asc-api-key.p8', import.meta.url).pathname;
const KID = 'PPQQ3TLU4A';
const ISS = '69a6de7c-e268-47e3-e053-5b8c7c11a4d1';

function makeJwt() {
  const key = readFileSync(KEY_PATH, 'utf8');
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const hdr = b64({ alg: 'ES256', kid: KID, typ: 'JWT' });
  const pay = b64({ iss: ISS, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' });
  const t = hdr + '.' + pay;
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

const [method, path, body] = process.argv.slice(2);
const jwt = makeJwt();
const res = await fetch('https://api.appstoreconnect.apple.com/v1' + path, {
  method: method || 'GET',
  headers: {
    Authorization: 'Bearer ' + jwt,
    ...(body ? { 'Content-Type': 'application/json' } : {}),
  },
  ...(body ? { body } : {}),
});
const text = await res.text();
let json;
try { json = JSON.parse(text); } catch { json = text; }
console.log('HTTP', res.status);
console.log(JSON.stringify(json, null, 2));
