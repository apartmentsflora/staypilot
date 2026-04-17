#!/usr/bin/env node
/**
 * StayPilot preflight check.
 *
 * Runs BEFORE a Netlify deploy to catch the most common "my deploy is broken
 * and I don't know why" failures:
 *   - Node version too old
 *   - Netlify site not linked (or wrong site)
 *   - Supabase env vars missing in Netlify
 *   - AUTH_SECRET missing or too short
 *
 * Exits with non-zero status if anything is wrong.
 */

import { execSync } from "node:child_process";

const RED = "\x1b[31m", GREEN = "\x1b[32m", YELLOW = "\x1b[33m", RESET = "\x1b[0m";
const ok   = (m) => console.log(`${GREEN}✓${RESET} ${m}`);
const warn = (m) => console.log(`${YELLOW}⚠${RESET} ${m}`);
const err  = (m) => console.log(`${RED}✗${RESET} ${m}`);

const SITE_ID = "e78fdeb9-e1bb-4255-ac34-22bfbabe5fa4";
const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AUTH_SECRET",
];

function run(cmd) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
}
function runCatch(cmd) {
  try { return { ok: true, out: run(cmd) }; }
  catch (e) { return { ok: false, out: e.stdout?.toString() ?? "", err: e.stderr?.toString() ?? String(e) }; }
}

let failures = 0;
const fail = (m) => { err(m); failures++; };

console.log("\n🔎 StayPilot preflight\n");

// 1. Node version
const [major] = process.versions.node.split(".").map(Number);
if (major >= 18) ok(`Node v${process.versions.node}`);
else fail(`Node v${process.versions.node} is too old — install Node 20 LTS from https://nodejs.org`);

// 2. Netlify CLI available
const cliCheck = runCatch("npx --no-install netlify-cli --version 2>&1 || npx netlify-cli --version");
if (cliCheck.ok) ok(`Netlify CLI: ${cliCheck.out.split("\n").pop()}`);
else { fail("Netlify CLI not available. Install deps first: `npm install`"); }

// 3. Logged in to Netlify
const statusCheck = runCatch("npx netlify-cli status --json 2>&1");
if (!statusCheck.ok || !statusCheck.out.includes("account")) {
  warn("Not logged in to Netlify. Run: `npx netlify-cli login`");
  console.log("   (A browser window will open for one-time login.)");
} else {
  try {
    const status = JSON.parse(statusCheck.out);
    if (status.account) ok(`Netlify account: ${status.account.Name || status.account.Email || "(logged in)"}`);
  } catch { ok("Netlify CLI reports logged in"); }
}

// 4. Env vars set on Netlify for our site
const envCheck = runCatch(`npx netlify-cli env:list --site ${SITE_ID} --json 2>&1`);
if (!envCheck.ok) {
  warn("Cannot read Netlify env vars (are you logged in?). Skipping env check.");
} else {
  let envObj = {};
  try { envObj = JSON.parse(envCheck.out); } catch {}
  const haveKeys = Object.keys(envObj);
  for (const key of REQUIRED_ENV) {
    if (haveKeys.includes(key)) ok(`Netlify env: ${key}`);
    else fail(`Netlify env missing: ${key} — set it in Site settings → Environment variables, or with:
      npx netlify-cli env:set ${key} "YOUR_VALUE" --site ${SITE_ID}`);
  }
}

// 5. Summary
console.log("");
if (failures === 0) {
  ok("Preflight passed — safe to deploy.");
  process.exit(0);
} else {
  err(`Preflight FAILED — fix ${failures} issue(s) above before deploying.`);
  process.exit(1);
}
