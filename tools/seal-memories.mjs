// Encrypts memories.private.json with a passcode and writes the sealed copy into index.html.
// The plain text and the passcode never go into the page or the repo.
//
//   node tools/seal-memories.mjs <passcode>
//
// Run it again whenever you change a memory. The salt already in index.html is reused, so the key
// stays the same and stars added from the sky (encrypted with that key) keep opening.
// Pass --new-salt only together with a new passcode; stars added under the old one become unreadable.

import { readFile, writeFile } from 'node:fs/promises';
import { webcrypto as crypto } from 'node:crypto';

const ITERATIONS = 1_000_000; // must match what index.html reads from the sealed data; slows every guess down
const root = new URL('..', import.meta.url);
const args = process.argv.slice(2);
const newSalt = args.includes('--new-salt');
const code = args.find(a => !a.startsWith('--'));
if (!code) { console.error('Usage: node tools/seal-memories.mjs <passcode> [--new-salt]'); process.exit(1); }

const memories = JSON.parse(await readFile(new URL('memories.private.json', root), 'utf8'));
const b64 = buf => Buffer.from(buf).toString('base64');
const pagePath = new URL('index.html', root);
const page = await readFile(pagePath, 'utf8');
const re = /(\/\*sealed\*\/)([\s\S]*?)(\/\*end sealed\*\/)/;
const found = page.match(re);
if (!found) { console.error('Could not find the /*sealed*/ ... /*end sealed*/ markers in index.html'); process.exit(1); }

let previous = null;
try { previous = JSON.parse(found[2]); } catch {}
const salt = previous?.salt && !newSalt ? Buffer.from(previous.salt, 'base64') : crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));   // always fresh
const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
  base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(memories)));

// a wrong passcode with a reused salt would silently lock everyone out, so check it against the old seal first
if (previous?.salt && !newSalt) {
  const check = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: previous.it, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  try { await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(previous.iv, 'base64') }, check, Buffer.from(previous.ct, 'base64')); }
  catch { console.error('That passcode does not open the current seal. To change the passcode, add --new-salt.'); process.exit(1); }
}

const sealed = JSON.stringify({ v: 1, it: ITERATIONS, salt: b64(salt), iv: b64(iv), ct: b64(ct) });
await writeFile(pagePath, page.replace(re, `$1${sealed}$3`));
const count = Array.isArray(memories) ? memories.length : `${memories.memories?.length ?? 0} memories in ${memories.themes?.length ?? 0} themes,`;
console.log(`Sealed ${count} into index.html${previous?.salt && !newSalt ? ' (same key as before)' : ' (new key)'}`);
