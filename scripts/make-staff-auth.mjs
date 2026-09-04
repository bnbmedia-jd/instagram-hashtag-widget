// Encrypts a GitHub credential with a shared password so the staff page can
// carry it publicly. Anyone can download the blob; only the password decrypts
// it, so the password is the whole of the protection — make it long.
//
//   node scripts/make-staff-auth.mjs
//
// Writes public/staff-auth.json. Commit and push it.

import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import path from "node:path";

const ITERATIONS = 600_000; // OWASP guidance for PBKDF2-SHA256
const OUT = path.join(import.meta.dirname, "..", "public", "staff-auth.json");

const b64 = (buf) => Buffer.from(buf).toString("base64");

const rl = createInterface({ input: stdin, output: stdout });
const secret = (await rl.question("GitHub fine-grained credential: ")).trim();
const password = (await rl.question("Shared password for staff: ")).trim();
rl.close();

if (!/^(github_pat_|ghp_)/.test(secret)) {
  console.error("That does not look like a GitHub credential.");
  process.exit(1);
}
if (password.length < 10) {
  console.error(
    "Use at least 10 characters — this blob is public, so the password is the only barrier."
  );
  process.exit(1);
}

const enc = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));

const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
  "deriveKey",
]);
const key = await crypto.subtle.deriveKey(
  { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
  base,
  { name: "AES-GCM", length: 256 },
  false,
  ["encrypt"]
);
const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(secret));

await writeFile(
  OUT,
  JSON.stringify(
    { v: 1, iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), ct: b64(ciphertext) },
    null,
    2
  ) + "\n"
);

console.log(`\nWrote ${OUT}`);
console.log("Commit and push it, then share the password with staff.");
console.log("The credential itself never appears in the repo in readable form.");
