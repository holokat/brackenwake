// Minimal, dependency-free nostr identity: secp256k1 keys + BIP-340 Schnorr
// signing with BigInt math and WebCrypto SHA-256. Enough to give every guest
// a real npub/nsec and sign kind-1 / kind-30078 events locally.

// ---------- secp256k1 field/curve ----------

const P = 2n ** 256n - 2n ** 32n - 977n; // field prime
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n; // order
const Gx = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const Gy = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

const mod = (a, m = P) => ((a % m) + m) % m;

function modPow(b, e, m) {
  b = mod(b, m);
  let r = 1n;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return r;
}

const inv = (a, m = P) => modPow(mod(a, m), m - 2n, m);

// affine point ops (null = infinity); fine for our volume of signatures
function pointAdd(a, b) {
  if (!a) return b;
  if (!b) return a;
  const [ax, ay] = a, [bx, by] = b;
  if (ax === bx) {
    if (mod(ay + by) === 0n) return null;
    // doubling
    const l = mod(3n * ax * ax * inv(2n * ay));
    const x = mod(l * l - 2n * ax);
    return [x, mod(l * (ax - x) - ay)];
  }
  const l = mod((by - ay) * inv(bx - ax));
  const x = mod(l * l - ax - bx);
  return [x, mod(l * (ax - x) - ay)];
}

function pointMul(k, pt = [Gx, Gy]) {
  let r = null;
  let a = pt;
  while (k > 0n) {
    if (k & 1n) r = pointAdd(r, a);
    a = pointAdd(a, a);
    k >>= 1n;
  }
  return r;
}

function liftX(x) {
  // even-Y point with the given x
  const c = mod(modPow(x, 3n, P) + 7n);
  const y = modPow(c, (P + 1n) / 4n, P);
  if ((y * y) % P !== c) return null;
  return [x, (y & 1n) === 0n ? y : P - y];
}

// ---------- bytes/hex ----------

const bytesToHex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const hexToBytes = (h) => new Uint8Array(h.match(/.{2}/g).map((x) => parseInt(x, 16)));
const bytesToBig = (b) => BigInt('0x' + (bytesToHex(b) || '0'));
const bigToBytes = (n) => hexToBytes(n.toString(16).padStart(64, '0'));

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

const utf8 = (s) => new TextEncoder().encode(s);

function concat(...arrs) {
  const out = new Uint8Array(arrs.reduce((a, b) => a + b.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

const tagCache = {};
async function taggedHash(tag, msg) {
  if (!tagCache[tag]) {
    const th = await sha256(utf8(tag));
    tagCache[tag] = concat(th, th);
  }
  return sha256(concat(tagCache[tag], msg));
}

// ---------- keys ----------

export function generatePrivateKey() {
  for (;;) {
    const b = crypto.getRandomValues(new Uint8Array(32));
    const d = bytesToBig(b);
    if (d > 0n && d < N) return bytesToHex(b);
  }
}

export function getPublicKey(skHex) {
  const d = BigInt('0x' + skHex);
  const Ppt = pointMul(d);
  return Ppt[0].toString(16).padStart(64, '0');
}

// ---------- BIP-340 Schnorr signing ----------

export async function schnorrSign(msgHex, skHex) {
  const m = hexToBytes(msgHex);
  let d = BigInt('0x' + skHex);
  const Ppt = pointMul(d);
  if ((Ppt[1] & 1n) === 1n) d = N - d;
  const pxB = bigToBytes(Ppt[0]);
  const aux = crypto.getRandomValues(new Uint8Array(32));
  const t = bigToBytes(d ^ bytesToBig(await taggedHash('BIP0340/aux', aux)));
  const k0 = mod(bytesToBig(await taggedHash('BIP0340/nonce', concat(t, pxB, m))), N);
  if (k0 === 0n) throw new Error('bad nonce');
  const R = pointMul(k0);
  const k = (R[1] & 1n) === 1n ? N - k0 : k0;
  const rxB = bigToBytes(R[0]);
  const e = mod(bytesToBig(await taggedHash('BIP0340/challenge', concat(rxB, pxB, m))), N);
  const s = mod(k + e * d, N);
  return bytesToHex(rxB) + s.toString(16).padStart(64, '0');
}

export async function schnorrVerify(sigHex, msgHex, pubHex) {
  try {
    const Ppt = liftX(BigInt('0x' + pubHex));
    if (!Ppt) return false;
    const r = BigInt('0x' + sigHex.slice(0, 64));
    const s = BigInt('0x' + sigHex.slice(64, 128));
    if (r >= P || s >= N) return false;
    const e = mod(bytesToBig(await taggedHash('BIP0340/challenge',
      concat(hexToBytes(sigHex.slice(0, 64)), bigToBytes(Ppt[0]), hexToBytes(msgHex)))), N);
    // R = s*G - e*P
    const sG = pointMul(s);
    const eP = pointMul(e, Ppt);
    const R = pointAdd(sG, eP ? [eP[0], P - eP[1]] : null);
    return !!R && (R[1] & 1n) === 0n && R[0] === r;
  } catch {
    return false;
  }
}

// ---------- NIP-01 event finishing ----------

export async function finishEvent(unsigned, skHex) {
  const ev = { ...unsigned, pubkey: getPublicKey(skHex) };
  const ser = JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]);
  ev.id = bytesToHex(await sha256(utf8(ser)));
  ev.sig = await schnorrSign(ev.id, skHex);
  return ev;
}

// ---------- npub/nsec (bech32) for display ----------

const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Polymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= GEN[i];
  }
  return chk;
}

export function bech32Encode(hrp, dataHex) {
  const bytes = hexToBytes(dataHex);
  // 8-bit → 5-bit
  const five = [];
  let acc = 0, bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) { bits -= 5; five.push((acc >> bits) & 31); }
  }
  if (bits) five.push((acc << (5 - bits)) & 31);
  const hrpExp = [...hrp].map((c) => c.charCodeAt(0) >> 5).concat([0], [...hrp].map((c) => c.charCodeAt(0) & 31));
  const pm = bech32Polymod(hrpExp.concat(five, [0, 0, 0, 0, 0, 0])) ^ 1;
  const checksum = [];
  for (let i = 0; i < 6; i++) checksum.push((pm >> (5 * (5 - i))) & 31);
  return hrp + '1' + five.concat(checksum).map((v) => B32[v]).join('');
}
