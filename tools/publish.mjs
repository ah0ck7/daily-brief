#!/usr/bin/env node
// Daily Brief publisher for ah0ck7/daily-brief (GitHub Pages).
//
// Encrypts an HTML page with the site's existing StatiCrypt password + salt and
// commits it to the repo through the GitHub API. No npm install needed (Node 18+).
//
// Usage:
//   node publish.mjs recap ./recap.html
//   node publish.mjs morning ./morning.html
//   node publish.mjs recap=./recap.html index=./recap.html     (several at once)
//
// Page names: morning, recap, index (or any existing .html path in the repo).
//
// Environment:
//   GITHUB_TOKEN (or GH_TOKEN)        token with Contents: read & write on the repo
//   BRIEF_PASSWORD (or STATICRYPT_PASSWORD)  the site password
//   BRIEF_REPO   optional, default "ah0ck7/daily-brief"
//   BRIEF_BRANCH optional, default "main"
//
// Safety: before publishing, the script checks the password against the page
// already live in the repo. A wrong password stops the run, so nobody gets locked out.
// Pass --skip-password-check only when you are deliberately changing the password.

import { readFile } from "node:fs/promises";
import { webcrypto as crypto } from "node:crypto";

const subtle = crypto.subtle;
const REPO = process.env.BRIEF_REPO || "ah0ck7/daily-brief";
const BRANCH = process.env.BRIEF_BRANCH || "main";
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const PASSWORD = process.env.BRIEF_PASSWORD || process.env.STATICRYPT_PASSWORD;

// ---------- StatiCrypt v3 crypto (matches the decrypt code in the live pages) ----------
const enc = new TextEncoder();
const hex = (buf) => Buffer.from(buf).toString("hex");
const unhex = (s) => new Uint8Array(Buffer.from(s, "hex"));

async function pbkdf2(password, salt, iterations, hash) {
  const key = await subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle.deriveBits({ name: "PBKDF2", hash, iterations, salt: enc.encode(salt) }, key, 256);
  return hex(bits);
}
async function hashPassword(password, salt) {
  let h = await pbkdf2(password, salt, 1000, "SHA-1");
  h = await pbkdf2(h, salt, 14000, "SHA-256");
  return pbkdf2(h, salt, 585000, "SHA-256");
}
async function sign(hashed, message) {
  const key = await subtle.importKey("raw", unhex(hashed), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await subtle.sign("HMAC", key, enc.encode(message)));
}
async function encrypt(msg, hashed) {
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const key = await subtle.importKey("raw", unhex(hashed), "AES-CBC", false, ["encrypt"]);
  const out = await subtle.encrypt({ name: "AES-CBC", iv }, key, enc.encode(msg));
  return hex(iv) + hex(out);
}
async function encode(msg, hashed) {
  const encrypted = await encrypt(msg, hashed);
  return (await sign(hashed, encrypted)) + encrypted;
}
async function verify(signedMsg, hashed) {
  return (await sign(hashed, signedMsg.substring(64))) === signedMsg.substring(0, 64);
}

// ---------- GitHub API ----------
async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "daily-brief-publisher",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GitHub ${init.method || "GET"} ${path} failed: ${res.status} ${body.message || ""}`);
  return body;
}
async function getFile(path) {
  const f = await gh(`contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${BRANCH}`);
  return { sha: f.sha, text: Buffer.from(f.content, "base64").toString("utf8") };
}
async function putFile(path, text, sha, message) {
  return gh(`contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`, {
    method: "PUT",
    body: JSON.stringify({ message, branch: BRANCH, sha, content: Buffer.from(text, "utf8").toString("base64") }),
  });
}

// ---------- main ----------
const CONFIG_RE = /staticryptConfig = (\{.*?\});/s;

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const rest = argv.filter((a) => !a.startsWith("--"));
  const jobs = [];
  if (rest.length === 2 && !rest[0].includes("=")) jobs.push([rest[0], rest[1]]);
  else for (const a of rest) {
    const i = a.indexOf("=");
    if (i < 1) throw new Error(`Bad argument "${a}". Use page=file.html`);
    jobs.push([a.slice(0, i), a.slice(i + 1)]);
  }
  if (!jobs.length) throw new Error("Nothing to publish. Example: node publish.mjs recap ./recap.html");
  return { flags, jobs: jobs.map(([p, f]) => [p.endsWith(".html") ? p : `${p}.html`, f]) };
}

async function main() {
  const { flags, jobs } = parseArgs(process.argv.slice(2));
  if (!TOKEN) throw new Error("Set GITHUB_TOKEN (or GH_TOKEN).");
  if (!PASSWORD) throw new Error("Set BRIEF_PASSWORD (or STATICRYPT_PASSWORD).");

  let hashed = null, hashedSalt = null;
  for (const [target, file] of jobs) {
    const html = await readFile(file, "utf8");
    const { sha, text: template } = await getFile(target);
    const m = template.match(CONFIG_RE);
    if (!m) throw new Error(`${target} is not a StatiCrypt page; can't find its config.`);
    const config = JSON.parse(m[1]);
    const salt = config.staticryptSaltUniqueVariableName;

    if (hashedSalt !== salt) { hashed = await hashPassword(PASSWORD, salt); hashedSalt = salt; }
    if (!flags.has("--skip-password-check") && !(await verify(config.staticryptEncryptedMsgUniqueVariableName, hashed))) {
      throw new Error(`Password doesn't match the live ${target}. Nothing was published.`);
    }

    config.staticryptEncryptedMsgUniqueVariableName = await encode(html, hashed);
    const out = template.replace(CONFIG_RE, () => `staticryptConfig = ${JSON.stringify(config)};`);
    const stamp = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
    const r = await putFile(target, out, sha, `Publish ${target} (${stamp} CT)`);
    console.log(`Published ${target} from ${file} -> commit ${r.commit.sha.slice(0, 7)}`);
  }
  const [owner, name] = REPO.split("/");
  console.log(`Live in about a minute at https://${owner.toLowerCase()}.github.io/${name}/`);
}

main().catch((e) => { console.error(`publish failed: ${e.message}`); process.exit(1); });
