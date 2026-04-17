#!/usr/bin/env node
/**
 * StayPilot post-deploy health check.
 *
 * Hits the live /api/health endpoint and fails loud if:
 *   - the site is unreachable
 *   - DB is unreachable
 *   - any required env var is missing on Netlify
 */

const URL_TO_CHECK = process.env.STAYPILOT_URL || "https://staypilot-flora-lazur.netlify.app";
const ENDPOINT = URL_TO_CHECK.replace(/\/+$/, "") + "/api/health";

const RED = "\x1b[31m", GREEN = "\x1b[32m", RESET = "\x1b[0m";

async function main() {
  console.log(`\n🌡  Checking ${ENDPOINT} …`);
  let res;
  try {
    res = await fetch(ENDPOINT, { cache: "no-store" });
  } catch (e) {
    console.log(`${RED}✗${RESET} Network error: ${e?.message || e}`);
    process.exit(1);
  }
  const body = await res.json().catch(() => ({}));
  const { status, db, rooms, missing, env } = body;

  if (res.ok && status === "ok") {
    console.log(`${GREEN}✓${RESET} Site is live. DB=${db}, rooms=${rooms}`);
    process.exit(0);
  }

  console.log(`${RED}✗${RESET} Health check FAILED (HTTP ${res.status}, status=${status})`);
  if (db) console.log(`  db: ${db}`);
  if (Array.isArray(missing) && missing.length > 0) {
    console.log(`  missing env vars on Netlify: ${missing.join(", ")}`);
  }
  if (env) console.log(`  env flags: ${JSON.stringify(env)}`);
  process.exit(1);
}

main();
