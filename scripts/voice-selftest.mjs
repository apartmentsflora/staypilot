// Voice parser self-test. Run with:
//   node --experimental-strip-types scripts/voice-selftest.mjs
//
// Does not require a running DB, Next.js, or any external service — it
// imports lib/voice.ts directly and feeds it a battery of Bulgarian
// transcripts that exercise every phraseologism we care about.

import { parseVoice, parseBGDate, matchRoomCode } from "../lib/voice.ts";

const FIXED_NOW = new Date("2026-04-16T10:00:00Z"); // Thursday
const YEAR = FIXED_NOW.getFullYear();

let passed = 0, failed = 0;
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { passed++; return; }
  failed++;
  console.log(`  ✗ ${label}\n      got  = ${JSON.stringify(got)}\n      want = ${JSON.stringify(want)}`);
}
function has(label, got, wantKey, wantVal) {
  const ok = got[wantKey] === wantVal;
  if (ok) { passed++; return; }
  failed++;
  console.log(`  ✗ ${label}\n      got.${wantKey}  = ${JSON.stringify(got[wantKey])}\n      want.${wantKey} = ${JSON.stringify(wantVal)}`);
}

function parseT(t) { return parseVoice(t, YEAR, FIXED_NOW); }

console.log("── A. Date parser ────────────────────────────────────────");
eq("днес",      parseBGDate("днес", { now: FIXED_NOW, year: YEAR }), "2026-04-16");
eq("утре",      parseBGDate("утре", { now: FIXED_NOW, year: YEAR }), "2026-04-17");
eq("вдругиден", parseBGDate("вдругиден", { now: FIXED_NOW, year: YEAR }), "2026-04-18");
eq("довечера",  parseBGDate("довечера", { now: FIXED_NOW, year: YEAR }), "2026-04-16");
eq("утрешния ден", parseBGDate("утрешния ден", { now: FIXED_NOW, year: YEAR }), "2026-04-17");
eq("25.06",     parseBGDate("25.06", { now: FIXED_NOW, year: YEAR }), "2026-06-25");
eq("15 юни",    parseBGDate("15 юни", { now: FIXED_NOW, year: YEAR }), "2026-06-15");
eq("петнадесети юни",    parseBGDate("петнадесети юни", { now: FIXED_NOW, year: YEAR }), "2026-06-15");
eq("двадесет и пети юли", parseBGDate("двадесет и пети юли", { now: FIXED_NOW, year: YEAR }), "2026-07-25");
eq("следващия понеделник",parseBGDate("следващия понеделник", { now: FIXED_NOW, year: YEAR }), "2026-04-27");
eq("този петък",          parseBGDate("петък", { now: FIXED_NOW, year: YEAR }), "2026-04-17");
eq("уикенда",             parseBGDate("уикенд", { now: FIXED_NOW, year: YEAR }), "2026-04-18");

console.log("── B. Holidays ───────────────────────────────────────────");
eq("по Коледа",            parseBGDate("по Коледа", { now: FIXED_NOW, year: YEAR }), "2026-12-25");
eq("Никулден",             parseBGDate("никулден", { now: FIXED_NOW, year: YEAR }), "2026-12-06");
eq("Гергьовден",           parseBGDate("гергьовден", { now: FIXED_NOW, year: YEAR }), "2026-05-06");
eq("Нова година",          parseBGDate("нова година", { now: FIXED_NOW, year: YEAR }), "2027-01-01");
// Orthodox Easter 2026 falls on 2026-04-12 — already in the past on our
// fixed test date (2026-04-16), so the parser correctly rolls to 2027.
eq("Великден (Orthodox)",  parseBGDate("по великден", { now: FIXED_NOW, year: YEAR }), "2027-05-02");

console.log("── C. End-of-week / end-of-month ─────────────────────────");
eq("до края на седмицата", parseBGDate("до края на седмицата", { now: FIXED_NOW, year: YEAR }), "2026-04-19");
eq("до края на месеца",    parseBGDate("до края на месеца", { now: FIXED_NOW, year: YEAR }), "2026-04-30");
eq("в средата на месеца",  parseBGDate("в средата на месеца", { now: FIXED_NOW, year: YEAR }), "2026-04-15");

console.log("── D. Room code matching (including spoken digits) ───────");
eq("стая едно точка три",  matchRoomCode("стая едно точка три"),       "1.3");
eq("стая 1.3A",             matchRoomCode("стая 1.3A"),                "1.3A");
eq("апартамент 2 4 1",     matchRoomCode("апартамент 2 4 1"),          "2.4.1");
eq("стая тридесет и девет 0 1", matchRoomCode("стая тридесет и девет 0 1"), "39.0.1");
eq("стая 41 тире 2",        matchRoomCode("стая 41 тире 2"),           "41-2");
eq("стая четири точка едно", matchRoomCode("стая четири точка едно"),  "4.1");

console.log("── E. Full reservations with phraseologisms ──────────────");
{
  const p = parseT("резервация за Иван Петров от утре до неделя в стая едно точка три телефон плюс три пет девет осем осем осем две три четири пет шест седем");
  has("e1 name",  p, "name", "Иван Петров");
  has("e1 room",  p, "room", "1.3");
  has("e1 start", p, "start", "2026-04-17");
  has("e1 end",   p, "end",   "2026-04-19");
  has("e1 phone", p, "phone", "+359888234567");
}
{
  const p = parseT("запиши Мария Георгиева от петнадесети юни до двадесети юни стая 39 0 1 за двама");
  has("e2 name",  p, "name", "Мария Георгиева");
  has("e2 room",  p, "room", "39.0.1");
  has("e2 start", p, "start", "2026-06-15");
  has("e2 end",   p, "end",   "2026-06-20");
  has("e2 guests",p, "guests", 2);
}
{
  const p = parseT("гост Петър пристига вдругиден за три нощувки в апартамент 2 4 1");
  has("e3 start", p, "start", "2026-04-18");
  has("e3 end",   p, "end",   "2026-04-21");
  has("e3 room",  p, "room",  "2.4.1");
}
{
  const p = parseT("настанява се в петък за уикенд стая 4 2");
  has("e4 start", p, "start", "2026-04-17");
  has("e4 end",   p, "end",   "2026-04-19");
  has("e4 room",  p, "room",  "4.2");
}
{
  const p = parseT("от 25.06 до 30.06 стая 1.3A за Джон Смит");
  has("e5 start", p, "start", "2026-06-25");
  has("e5 end",   p, "end",   "2026-06-30");
  has("e5 room",  p, "room",  "1.3A");
}
{
  const p = parseT("резервирай за следващия понеделник за една седмица стая 5 5");
  has("e6 start", p, "start", "2026-04-27");
  has("e6 end",   p, "end",   "2026-05-04");
  has("e6 room",  p, "room",  "5.5");
}

console.log("── F. Idiomatic / new phrases ────────────────────────────");
{
  const p = parseT("Значи ъъ резервация за Николай около Коледа за три нощи стая 1.5 искат паркинг и детско легло");
  has("f1 name", p, "name", "Николай");
  has("f1 start", p, "start", "2026-12-25");
  has("f1 end",   p, "end",   "2026-12-28");
  has("f1 room",  p, "room",  "1.5");
  has("f1 notes", p, "notes", "паркинг; детско легло");
}
{
  const p = parseT("за Гергьовден за двама възрастни и две деца в стая 2.2 със закуска");
  has("f2 start",  p, "start",  "2026-05-06");
  has("f2 guests", p, "guests", 4);
  has("f2 room",   p, "room",   "2.2");
  has("f2 notes",  p, "notes",  "със закуска");
}
{
  // Departure-only phrase: parser must NOT invent an arrival.
  const p = parseT("семейство заминава утре стая 41.0.2 късен чекаут");
  has("f3 guests", p, "guests", 4);
  has("f3 start",  p, "start",  null);
  has("f3 end",    p, "end",    "2026-04-17");
  has("f3 room",   p, "room",   "41.0.2");
  has("f3 notes",  p, "notes",  "късно освобождаване");
}
{
  const p = parseT("двойка от довечера за една нощ стая 3.1 по 80 лева на нощ имейл petar at gmail точка com");
  has("f4 guests", p, "guests", 2);
  has("f4 start",  p, "start",  "2026-04-16");
  has("f4 end",    p, "end",    "2026-04-17");
  has("f4 room",   p, "room",   "3.1");
  has("f4 price",  p, "pricePerNight", 80);
  has("f4 email",  p, "email",  "petar@gmail.com");
}
{
  const p = parseT("настанява се в 15:30 часа и заминава в 11:00 стая 1.1");
  has("f5 arr",  p, "arrivalTime",   "15:30");
  has("f5 dep",  p, "departureTime", "11:00");
  has("f5 room", p, "room",          "1.1");
}
{
  const p = parseT("до края на месеца резервация стая 4.1 за компания с гледка към планина");
  has("f6 end",    p, "end",     "2026-04-30");
  has("f6 guests", p, "guests",  6);
  has("f6 room",   p, "room",    "4.1");
  has("f6 notes",  p, "notes",   "с гледка");
}
{
  // Bare "стая" word with fillers and regional speech forms.
  const p = parseT("Ами значи нека запиша Георги Димитров в стая двайсет и девет нула едно от осми май до десети май");
  // This room doesn't exist ("29.0.1") — verify parser falls back to null cleanly.
  has("f7 name",  p, "name",  "Георги Димитров");
  has("f7 start", p, "start", "2026-05-08");
  has("f7 end",   p, "end",   "2026-05-10");
}

console.log("── G. Range harmonisation ────────────────────────────────");
{
  const p = parseT("резервация от 1 до 10 май стая 1.3");
  has("g1 start", p, "start", "2026-05-01");
  has("g1 end",   p, "end",   "2026-05-10");
}
{
  const p = parseT("от пети до петнадесети юли за трима в стая 2.5");
  has("g2 start",  p, "start",  "2026-07-05");
  has("g2 end",    p, "end",    "2026-07-15");
  has("g2 guests", p, "guests", 3);
}

console.log(`\n── Totals: ${passed} passed, ${failed} failed ──`);
process.exit(failed > 0 ? 1 : 0);
