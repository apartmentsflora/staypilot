// Bulgarian-language voice reservation parser.
//
// Input:  raw transcript from webkitSpeechRecognition (bg-BG).
// Output: ParsedReservation with best-guess fields — start/end dates,
//         guest name, phone, room code, guests count, notes.
//
// Pure module: no DOM, no React. Safe to import anywhere; safe to unit
// test.
//
// Implementation note: JavaScript's \b word boundary does NOT treat
// Cyrillic letters as word characters, so /\bутре\b/ matches at every
// character of "утре". Throughout this file we use Unicode-aware
// lookarounds — (?<![\p{L}\d])X(?![\p{L}\d]) — with the /u flag
// instead of \b for any Cyrillic-adjacent match.

// ──────────────────────────────────────────────────────────────────────────
// 1. Bulgarian number lexicon
// ──────────────────────────────────────────────────────────────────────────

// Cardinal numbers 0-100 (covers day-of-month range, guest counts, and
// per-night prices like "по осемдесет лева"). Includes gender variants
// and regional/colloquial spellings that Bulgarian webkitSpeech returns
// ("двайсет" instead of "двадесет", "петдесе" instead of "петдесет", etc).
const CARDINALS: Record<string, number> = {
  "нула": 0, "нулата": 0,
  "един": 1, "една": 1, "едно": 1, "едни": 1, "едното": 1,
  "два": 2, "две": 2, "двама": 2, "двоица": 2, "двете": 2,
  "три": 3, "трима": 3, "троица": 3, "трите": 3,
  "четири": 4, "четирима": 4,
  "пет": 5, "петима": 5,
  "шест": 6, "шестима": 6,
  "седем": 7, "седмина": 7,
  "осем": 8, "осмина": 8,
  "девет": 9,
  "десет": 10,
  "единадесет": 11, "единайсет": 11,
  "дванадесет": 12, "дванайсет": 12,
  "тринадесет": 13, "тринайсет": 13,
  "четиринадесет": 14, "четиринайсет": 14,
  "петнадесет": 15, "петнайсет": 15,
  "шестнадесет": 16, "шестнайсет": 16,
  "седемнадесет": 17, "седемнайсет": 17,
  "осемнадесет": 18, "осемнайсет": 18,
  "деветнадесет": 19, "деветнайсет": 19,
  "двадесет": 20, "двайсет": 20, "двадесе": 20,
  "тридесет": 30, "трийсет": 30, "тридесе": 30,
  "четиридесет": 40, "четирийсет": 40, "четиридесе": 40,
  "петдесет": 50, "петдесе": 50,
  "шестдесет": 60, "шейсет": 60, "шестдесе": 60,
  "седемдесет": 70, "седемдесе": 70,
  "осемдесет": 80, "осемдесе": 80,
  "деветдесет": 90, "деветдесе": 90,
  "сто": 100,
};

// Ordinal numbers 1-31 (day names + spoken room parts).
const ORDINALS: Record<string, number> = {
  "първи": 1, "първа": 1, "първо": 1,
  "втори": 2, "втора": 2, "второ": 2,
  "трети": 3, "трета": 3, "трето": 3,
  "четвърти": 4, "четвърта": 4, "четвърто": 4,
  "пети": 5, "пета": 5, "пето": 5,
  "шести": 6, "шеста": 6, "шесто": 6,
  "седми": 7, "седма": 7, "седмо": 7,
  "осми": 8, "осма": 8, "осмо": 8,
  "девети": 9, "девета": 9, "девето": 9,
  "десети": 10, "десета": 10, "десето": 10,
  "единадесети": 11, "единайсети": 11,
  "дванадесети": 12, "дванайсети": 12,
  "тринадесети": 13, "тринайсети": 13,
  "четиринадесети": 14, "четиринайсети": 14,
  "петнадесети": 15, "петнайсети": 15,
  "шестнадесети": 16, "шестнайсети": 16,
  "седемнадесети": 17, "седемнайсети": 17,
  "осемнадесети": 18, "осемнайсети": 18,
  "деветнадесети": 19, "деветнайсети": 19,
  "двадесети": 20, "двайсети": 20,
  "тридесети": 30, "трийсети": 30,
};

const MONTHS: Record<string, number> = {
  "януари": 1, "февруари": 2, "март": 3, "април": 4, "май": 5, "юни": 6,
  "юли": 7, "август": 8, "септември": 9, "октомври": 10, "ноември": 11, "декември": 12,
  // Common genitive/slurred variants heard in dictation
  "януария": 1, "февруария": 2, "априла": 4, "юния": 6, "юлия": 7,
  "августа": 8, "септемврия": 9, "октомврия": 10, "ноемврия": 11, "декемврия": 12,
};

const WEEKDAYS: Record<string, number> = {
  // 0 = Sunday ... 6 = Saturday, matching JS Date.getDay()
  "неделя": 0, "неделята": 0, "недела": 0,
  "понеделник": 1, "понеделника": 1, "понеделникa": 1,
  "вторник": 2, "вторника": 2,
  "сряда": 3, "срядата": 3, "среда": 3,
  "четвъртък": 4, "четвъртъка": 4, "четвъртак": 4,
  "петък": 5, "петъка": 5,
  "събота": 6, "съботата": 6,
};

// Fixed-date Bulgarian holidays — evaluated against ctx.year. If the
// resolved date is already in the past, we roll to next year so
// "по Коледа" said in January of the same year returns next December.
const FIXED_HOLIDAYS: Array<{ rx: RegExp; month: number; day: number }> = [
  { rx: /(?:по\s+)?нов(?:а|ата)\s+година/u,                month: 1,  day: 1  },
  { rx: /(?:по\s+)?богоявление/u,                          month: 1,  day: 6  },
  { rx: /(?:по\s+)?йордановден/u,                          month: 1,  day: 6  },
  { rx: /(?:на\s+)?трифон\s*зарезан/u,                     month: 2,  day: 14 },
  { rx: /(?:на\s+)?свети\s+валентин/u,                     month: 2,  day: 14 },
  { rx: /(?:на\s+)?валентин(?:ов(?:\s+ден|ден))?/u,        month: 2,  day: 14 },
  { rx: /(?:на\s+)?трети\s+март/u,                         month: 3,  day: 3  },
  { rx: /(?:на\s+)?осми\s+март/u,                          month: 3,  day: 8  },
  { rx: /(?:по\s+)?гергьовден/u,                           month: 5,  day: 6  },
  { rx: /(?:на\s+)?ден(?:я|ят)\s+на\s+труда/u,             month: 5,  day: 1  },
  { rx: /(?:на\s+)?първи\s+май/u,                          month: 5,  day: 1  },
  { rx: /(?:на\s+)?девети\s+май/u,                         month: 5,  day: 9  },
  { rx: /(?:на\s+)?двадесет\s+и\s+четвърти\s+май/u,        month: 5,  day: 24 },
  { rx: /(?:по\s+)?еньовден/u,                             month: 6,  day: 24 },
  { rx: /(?:по\s+)?голяма\s+богородица/u,                  month: 8,  day: 15 },
  { rx: /(?:по\s+)?успение\s+богородично/u,                month: 8,  day: 15 },
  { rx: /(?:на\s+)?съединени(?:е|ето)/u,                    month: 9,  day: 6  },
  { rx: /(?:на\s+)?независимост(?:та)?/u,                  month: 9,  day: 22 },
  { rx: /(?:по\s+)?димитровден/u,                          month: 10, day: 26 },
  { rx: /(?:по\s+)?архангеловден/u,                        month: 11, day: 8  },
  { rx: /(?:по\s+)?никулден/u,                             month: 12, day: 6  },
  { rx: /(?:на\s+)?игнажден/u,                             month: 12, day: 20 },
  { rx: /(?:по\s+)?бъдни\s+вечер/u,                        month: 12, day: 24 },
  { rx: /(?:по\s+)?коледа/u,                               month: 12, day: 25 },
  { rx: /(?:по\s+)?рождество(?:\s+христово)?/u,            month: 12, day: 25 },
  { rx: /(?:на\s+)?стефановден/u,                          month: 12, day: 27 },
];

// Orthodox Easter — Meeus/Jones/Butcher Julian algorithm adjusted to
// Gregorian. Used only if the transcript says "Великден" / "по Великден".
// Accurate 1900-2099; beyond that a fallback returns null.
function orthodoxEaster(y: number): { month: number; day: number } | null {
  if (y < 1900 || y > 2099) return null;
  const a = y % 4, b = y % 7, c = y % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1 + 13; // +13 = Julian→Gregorian offset
  const dt = new Date(Date.UTC(y, month - 1, day));
  return { month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

// ──────────────────────────────────────────────────────────────────────────
// 2. Unicode-aware word-boundary helpers
// ──────────────────────────────────────────────────────────────────────────

// Build a Unicode-boundary-wrapped regex. The `inner` is interpolated as-is.
function wre(inner: string, flags = ""): RegExp {
  return new RegExp(`(?<![\\p{L}\\d])(?:${inner})(?![\\p{L}\\d])`, flags + "u");
}

function hasWord(s: string, word: string): boolean {
  return wre(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(s);
}

function matchWord(s: string, pattern: string, flags = ""): RegExpMatchArray | null {
  return s.match(wre(pattern, flags));
}

function replaceWord(s: string, pattern: string, repl: string | ((match: string, ...args: any[]) => string)): string {
  return s.replace(wre(pattern, "g"), repl as any);
}

// ──────────────────────────────────────────────────────────────────────────
// 3. Parsing helpers: spoken multi-word numbers
// ──────────────────────────────────────────────────────────────────────────

function parseSpokenCardinal(words: string[]): number | null {
  if (words.length === 0) return null;
  const w0 = words[0];
  if (CARDINALS[w0] == null) return null;
  const base = CARDINALS[w0];
  if (words.length >= 3 && words[1] === "и") {
    const add = CARDINALS[words[2]];
    if (add != null && add < 10) return base + add;
  }
  return base;
}

function parseSpokenOrdinal(words: string[]): number | null {
  if (words.length === 0) return null;
  const last = words[words.length - 1];
  if (ORDINALS[last] != null) {
    if (words.length >= 3 && words[words.length - 2] === "и" && CARDINALS[words[0]] != null) {
      return CARDINALS[words[0]] + ORDINALS[last];
    }
    return ORDINALS[last];
  }
  return null;
}

/**
 * Extract a number that might be a digit (e.g. "25") or spelled-out
 * ("двадесет и пети", "двадесет и пет", "тридесет"). Returns null on
 * anything unrecognised.
 */
function parseNumberLike(phrase: string): number | null {
  const s = (phrase || "").toLowerCase().trim();
  if (!s) return null;
  const digit = s.match(/(\d{1,3})(?:-?(?:ти|ви|ри|ми|ни))?/u);
  if (digit) return parseInt(digit[1], 10);
  const words = s.split(/\s+/).filter(Boolean);
  return parseSpokenOrdinal(words) ?? parseSpokenCardinal(words);
}

// ──────────────────────────────────────────────────────────────────────────
// 4. Date parsing
// ──────────────────────────────────────────────────────────────────────────

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isoOf(d: Date): string {
  return toIso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function parseBGDate(phrase: string, ctx: { now: Date; year: number }): string | null {
  let s = phrase.toLowerCase().replace(/[,;!?]/g, " ").replace(/\s+/g, " ").trim();
  // Strip ordinal suffixes glued to digits: "20-ти" → "20", "5ти" → "5", "1-ви" → "1".
  s = s.replace(/(\d+)-?(?:ти|ви|ри|ми|ни|ото|ата)(?![\p{L}])/gu, "$1");
  // Strip ubiquitous dictation fillers. Keep "а" alone because it can stand
  // in for the "A" suffix in room code 1.3A — but the date parser never
  // sees the room-code slice, so stripping it here is safe.
  s = s.replace(/(?<![\p{L}\d])(ъъ+|ъ|аа+|хм+|мм+|значи|нали|така|ей|ами|ама|обаче|де|бе|ве|абе|тъй|ако\s+може|моля)(?![\p{L}\d])/gu, " ");
  // Strip room-identity slices ("стая X", "апартамент X", "номер X") so the
  // digits of a room code (e.g. "1.3", "4.1") are never misread as a date.
  s = s.replace(/(?<![\p{L}])(стая|апартамент|стаичка|апартаментче|номер)\s+[\p{L}\d\s.\-]+?(?=(?:\s+(?:от|до|за|след|през|с\s+телефон|тел\b|по\s+\d|имейл|е[- ]?mail|email|искат?|с\s+дет|паркинг|с\s+гледка|ранен|ранно|късен|късно|нощувка)|$))/gu, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return null;
  const words = s.split(" ");

  // Today / tomorrow / day after / yesterday — plus colloquial variants.
  if (hasWord(s, "днес") || hasWord(s, "днеска") || hasWord(s, "сега") ||
      hasWord(s, "довечера") || /тази?\s+вечер/u.test(s) ||
      /тази?\s+нощ/u.test(s))
    return isoOf(ctx.now);
  if (hasWord(s, "утре") || hasWord(s, "утрешния") || hasWord(s, "утрешния ден") ||
      /утрешни(?:я|ят)\s+ден/u.test(s) || hasWord(s, "завтра"))
    return isoOf(addDays(ctx.now, 1));
  if (hasWord(s, "вдругиден") || hasWord(s, "другиден") || /други\s+ден/u.test(s)) {
    return isoOf(addDays(ctx.now, 2));
  }
  if (hasWord(s, "вчера") || hasWord(s, "снощи")) return isoOf(addDays(ctx.now, -1));

  // "до края на (седмицата|месеца)" — end-of-week (Sunday) / end-of-month.
  if (/до\s+края\s+на\s+седмицата/u.test(s)) {
    const today = ctx.now.getDay(); // 0=Sun
    const delta = today === 0 ? 0 : 7 - today;
    return isoOf(addDays(ctx.now, delta));
  }
  if (/до\s+края\s+на\s+месеца/u.test(s)) {
    const y = ctx.now.getFullYear(), m = ctx.now.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    return toIso(y, m + 1, last);
  }
  if (/в\s+началото\s+на\s+(?:следващи(?:я|ят)\s+)?месец/u.test(s)) {
    const y = ctx.now.getFullYear(), m = ctx.now.getMonth() + 1;
    const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
    return toIso(ny, nm + 1, 1); // first of *next* month
  }
  if (/в\s+средата\s+на\s+месеца/u.test(s)) {
    return toIso(ctx.now.getFullYear(), ctx.now.getMonth() + 1, 15);
  }

  // Bulgarian holidays — both fixed and computed (Easter).
  for (const h of FIXED_HOLIDAYS) {
    if (h.rx.test(s)) {
      let y = ctx.year;
      // Roll forward if the holiday date has already passed this year.
      const cand = new Date(y, h.month - 1, h.day);
      if (cand < ctx.now && cand.toDateString() !== ctx.now.toDateString()) y += 1;
      return toIso(y, h.month, h.day);
    }
  }
  if (/(?:по\s+)?великден/u.test(s) || /(?:по\s+)?пасха/u.test(s)) {
    const e = orthodoxEaster(ctx.year);
    if (e) {
      let y = ctx.year;
      const cand = new Date(y, e.month - 1, e.day);
      if (cand < ctx.now && cand.toDateString() !== ctx.now.toDateString()) {
        const e2 = orthodoxEaster(y + 1);
        return e2 ? toIso(y + 1, e2.month, e2.day) : null;
      }
      return toIso(y, e.month, e.day);
    }
  }

  // "след N дни / седмица / месец"
  const afterN = s.match(/след\s+([\p{L}\d\s]+?)\s*(ден|дни|дена|седмица|седмици|месец|месеца)(?![\p{L}])/u);
  if (afterN) {
    const n = parseNumberLike(afterN[1]) ?? 1;
    const unit = afterN[2];
    const mult = unit.startsWith("седмиц") ? 7 : unit.startsWith("месец") ? 30 : 1;
    return isoOf(addDays(ctx.now, n * mult));
  }

  // Weekday (optionally prefixed with "следващия/другия/идния")
  const wkRe = new RegExp(
    `(?:(следващ(?:ия|ата|ото|ите)?|друг(?:ия|ата)?|този|тази|идния|идната)\\s+)?(${Object.keys(WEEKDAYS).join("|")})(?![\\p{L}])`,
    "u"
  );
  const wkMatch = s.match(wkRe);
  if (wkMatch) {
    const isNext = /следващ|друг|идн/u.test(wkMatch[1] || "");
    const target = WEEKDAYS[wkMatch[2]];
    const today = ctx.now.getDay();
    let delta = (target - today + 7) % 7;
    if (delta === 0) delta = 7;
    if (isNext && delta < 7) delta += 7;
    return isoOf(addDays(ctx.now, delta));
  }

  // Weekend: "уикенд[а]" / "(този/следващия) уикенд" / "събота и неделя"
  if (/уикенд/u.test(s) || /(?:събот[аи]|съботата)\s+и\s+недел/u.test(s)) {
    const isNext = /следващ|друг|идн/u.test(s);
    const today = ctx.now.getDay();
    let delta = (6 - today + 7) % 7;
    if (delta === 0) delta = 7;
    if (isNext) delta += 7;
    return isoOf(addDays(ctx.now, delta));
  }

  // Numeric date: "25.06", "25/06", "25-06", optional year
  const numDate = s.match(/(\d{1,2})[\s./-](\d{1,2})(?:[\s./-](\d{2,4}))?/u);
  if (numDate) {
    const d = parseInt(numDate[1], 10);
    const m = parseInt(numDate[2], 10);
    let y = numDate[3] ? parseInt(numDate[3], 10) : ctx.year;
    if (y < 100) y += 2000;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return toIso(y, m, d);
  }

  // "<day> <month> [<year>]" — day is a digit or spelled-out ordinal/cardinal
  const monthKeys = Object.keys(MONTHS).sort((a, b) => b.length - a.length); // longest-first
  for (const mn of monthKeys) {
    const re = new RegExp(`([\\p{L}\\d\\s]+?)\\s+${mn}(?:\\s+(\\d{4}))?(?![\\p{L}])`, "u");
    const m = s.match(re);
    if (m) {
      const num = parseNumberLike(m[1]);
      if (num != null && num >= 1 && num <= 31) {
        const y = m[2] ? parseInt(m[2], 10) : ctx.year;
        return toIso(y, MONTHS[mn], num);
      }
    }
  }

  // Bare ordinal (no month): assume current month, or next if day already passed.
  const bareOrd = parseSpokenOrdinal(words);
  if (bareOrd != null && bareOrd >= 1 && bareOrd <= 31) {
    const today = ctx.now.getDate();
    let y = ctx.now.getFullYear(), m = ctx.now.getMonth() + 1;
    if (bareOrd < today) {
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return toIso(y, m, bareOrd);
  }

  // Final fallback: a single bare digit 1-31 — interpret as day-of-current-month.
  // Covers phrases like "от 1-ви до 10-ти май": once we've stripped "-ви" the
  // first leg becomes just "1", which we want to treat as "May 1" (borrowing
  // the other leg's month), but here we just return current-month-1. The
  // calling parseVoice() performs range harmonisation afterwards.
  if (words.length === 1 && /^\d{1,2}$/.test(words[0])) {
    const n = parseInt(words[0], 10);
    if (n >= 1 && n <= 31) {
      const today = ctx.now.getDate();
      let y = ctx.now.getFullYear(), m = ctx.now.getMonth() + 1;
      if (n < today) {
        m += 1;
        if (m > 12) { m = 1; y += 1; }
      }
      return toIso(y, m, n);
    }
  }

  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// 5. Room code matching
// ──────────────────────────────────────────────────────────────────────────

export const ALL_ROOM_CODES = [
  "39.0.1", "1.3", "1.3A", "1.5", "2.4.1", "2.4.2", "2.4.3", "2.5", "5.5",
  "41.0.1", "41.0.2", "1.1", "1.2", "2.2", "41-2", "3.1", "4.1", "4.2",
];

// Decades that must be evaluated as "X and Y" or "X alone".
const DECADE_TOKENS: Array<{ re: RegExp; val: number }> = [
  { re: /трид(?:есет|ейсет|ийсет)/u, val: 30 },
  { re: /четир(?:идесет|ийсет)/u, val: 40 },
  { re: /двад(?:есет|ейсет|айсет)/u, val: 20 },
];

function normalizeCodeTokens(s: string): string {
  let t = ` ${s.toLowerCase()} `;

  // Compound decade + unit: "тридесет и девет" → "39"
  for (const { re, val } of DECADE_TOKENS) {
    const compound = new RegExp(
      `(?<![\\p{L}\\d])${re.source}\\s+и\\s+(един|едно|една|два|две|три|четири|пет|шест|седем|осем|девет)(?![\\p{L}\\d])`,
      "gu"
    );
    t = t.replace(compound, (_m, w) => ` ${val + (CARDINALS[w] || 0)} `);
    const bare = new RegExp(`(?<![\\p{L}\\d])${re.source}(?![\\p{L}\\d])`, "gu");
    t = t.replace(bare, ` ${val} `);
  }

  // Single digits — order matters: match longer tokens first.
  const DIGITS: Array<[RegExp, string]> = [
    [/(?<![\p{L}\d])(четирима)(?![\p{L}\d])/gu, "4"],
    [/(?<![\p{L}\d])(шестима)(?![\p{L}\d])/gu, "6"],
    [/(?<![\p{L}\d])(седмина)(?![\p{L}\d])/gu, "7"],
    [/(?<![\p{L}\d])(осмина)(?![\p{L}\d])/gu, "8"],
    [/(?<![\p{L}\d])(петима)(?![\p{L}\d])/gu, "5"],
    [/(?<![\p{L}\d])(трима)(?![\p{L}\d])/gu, "3"],
    [/(?<![\p{L}\d])(двама)(?![\p{L}\d])/gu, "2"],
    [/(?<![\p{L}\d])(нула)(?![\p{L}\d])/gu, "0"],
    [/(?<![\p{L}\d])(един|една|едно)(?![\p{L}\d])/gu, "1"],
    [/(?<![\p{L}\d])(две|два)(?![\p{L}\d])/gu, "2"],
    [/(?<![\p{L}\d])(три)(?![\p{L}\d])/gu, "3"],
    [/(?<![\p{L}\d])(четири)(?![\p{L}\d])/gu, "4"],
    [/(?<![\p{L}\d])(пет)(?![\p{L}\d])/gu, "5"],
    [/(?<![\p{L}\d])(шест)(?![\p{L}\d])/gu, "6"],
    [/(?<![\p{L}\d])(седем)(?![\p{L}\d])/gu, "7"],
    [/(?<![\p{L}\d])(осем)(?![\p{L}\d])/gu, "8"],
    [/(?<![\p{L}\d])(девет)(?![\p{L}\d])/gu, "9"],
  ];
  for (const [re, repl] of DIGITS) t = t.replace(re, ` ${repl} `);

  // Punctuation words
  t = t.replace(/(?<![\p{L}\d])(точка)(?![\p{L}\d])/gu, ".");
  t = t.replace(/(?<![\p{L}\d])(тире|минус|дефис)(?![\p{L}\d])/gu, "-");
  t = t.replace(/(?<![\p{L}\d])(а|ей)(?![\p{L}\d])/gu, "A");

  // Collapse whitespace and remove spaces around punctuation.
  t = t.replace(/\s+/g, " ").replace(/\s*\.\s*/g, ".").replace(/\s*-\s*/g, "-").trim();

  return t;
}

// Longest-first, so "1.3A" wins over "1.3" and "39.0.1" wins over "1.5".
const ROOM_CODES_BY_LEN = [...ALL_ROOM_CODES].sort((a, b) => b.length - a.length);

/**
 * Narrow the transcript to the slice that is most likely to contain
 * the room code: prefer the substring after "стая" / "апартамент" /
 * "номер". Falls back to the whole string if none of those anchors
 * appear, so short commands still work.
 */
function roomCodeHaystack(transcript: string): string {
  const lower = transcript.toLowerCase();
  const m = lower.match(/(?:стая|апартамент|стаичка|апартаментче|номер)\s+([\p{L}\d\s.\-]+)$/u);
  return m ? m[1] : lower;
}

export function matchRoomCode(transcript: string): string | null {
  const anchored = roomCodeHaystack(transcript);
  const lower = transcript.toLowerCase();

  // 1) literal substring, longest first, on the anchored slice.
  for (const c of ROOM_CODES_BY_LEN) {
    if (anchored.includes(c.toLowerCase())) return c;
  }

  // 2) normalised spoken-digit form on the anchored slice.
  const norm = normalizeCodeTokens(anchored);
  for (const c of ROOM_CODES_BY_LEN) {
    if (norm.includes(c.toLowerCase())) return c;
  }

  // 3) digit-window: try longer windows first.
  const digits = norm.replace(/[^\d\s.-]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  for (let len = Math.min(4, digits.length); len >= 2; len--) {
    for (let i = 0; i + len <= digits.length; i++) {
      const win = digits.slice(i, i + len);
      const candidates = [win.join("."), win.join("-"), win.join("")];
      for (const cand of candidates) {
        const match = ROOM_CODES_BY_LEN.find(c => c.toLowerCase() === cand.toLowerCase());
        if (match) return match;
      }
    }
  }

  // 4) Final fallback — scan whole transcript literally, longest first.
  for (const c of ROOM_CODES_BY_LEN) {
    if (lower.includes(c.toLowerCase())) return c;
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// 6. Phone / name / guest count / duration
// ──────────────────────────────────────────────────────────────────────────

function extractPhone(text: string): string | null {
  // 6.a — already-digit phone with optional + and punctuation
  const m1 = text.match(/((?:\+359|0)[0-9\s\-()]{7,14})/);
  if (m1) {
    const cleaned = m1[1].replace(/[\s\-()]+/g, "");
    if (cleaned.length >= 9) return cleaned;
  }

  // 6.b — spelled-out digits, including "+" spoken as "плюс"
  //         e.g. "плюс три пет девет осем осем осем две три четири пет шест седем"
  const tokens = text.toLowerCase().split(/\s+/);
  const DIGIT: Record<string, string> = {
    "нула": "0", "едно": "1", "един": "1", "една": "1",
    "две": "2", "два": "2", "три": "3", "четири": "4",
    "пет": "5", "шест": "6", "седем": "7", "осем": "8", "девет": "9",
  };
  let run: string[] = [];
  let best: string[] = [];
  let plusSeen = false, bestPlus = false;
  for (const tk of tokens) {
    if (tk === "плюс" || tk === "+") {
      plusSeen = true;
      continue;
    }
    if (DIGIT[tk] != null) {
      run.push(DIGIT[tk]);
      if (run.length > best.length) { best = [...run]; bestPlus = plusSeen; }
    } else if (/^\d+$/.test(tk)) {
      for (const ch of tk) run.push(ch);
      if (run.length > best.length) { best = [...run]; bestPlus = plusSeen; }
    } else {
      run = [];
      plusSeen = false;
    }
  }
  if (best.length >= 9) return (bestPlus ? "+" : "") + best.join("");
  return null;
}

function extractName(text: string): string | null {
  // Phrase forms — most specific first. Explicitly capture 1-3 capitalised tokens.
  const patterns: RegExp[] = [
    /(?:името\s+е|на\s+името\s+на|казва\s+се|записвам|запиша|запиши|записва|регистрирай|резервирай\s+за|резервация\s+за|за\s+гост[а]?|за\s+клиент[а]?)\s+([А-ЯA-Z][\p{L}]+(?:\s+[А-ЯA-Z][\p{L}]+){0,2})/u,
    /(?<![\p{L}])гост(?:ът|а)?\s+(?:е\s+)?([А-ЯA-Z][\p{L}]+(?:\s+[А-ЯA-Z][\p{L}]+){0,2})/u,
    /(?<![\p{L}])клиент(?:ът|а)?\s+(?:е\s+)?([А-ЯA-Z][\p{L}]+(?:\s+[А-ЯA-Z][\p{L}]+){0,2})/u,
    /(?<![\p{L}])за\s+([А-ЯA-Z][\p{L}]+(?:\s+[А-ЯA-Z][\p{L}]+))/u,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1].trim();
  }
  // Fallback: first 1-2 capitalised tokens that aren't months/weekdays/stopwords/fillers.
  const STOP = new Set<string>(
    [
      ...Object.keys(MONTHS),
      ...Object.keys(WEEKDAYS),
      // Workflow words
      "резервация", "резервирай", "резервацията", "стая", "апартамент", "телефон", "тел",
      "бележка", "коментар", "забележка",
      "следващия", "следващата", "следващите", "другия", "другата", "идния", "идната",
      // Dictation fillers
      "ами", "значи", "нали", "така", "нека", "де", "бе", "ве", "абе", "тъй", "моля",
      // Common verbs that webkitSpeech may capitalise mid-sentence
      "пристига", "заминава", "настанява", "идва", "тръгва", "напуска", "освобождава",
    ].map(s => s.toLowerCase())
  );
  const caps = text.split(/\s+/).filter(w =>
    w.length > 2 && /^[А-ЯA-Z][\p{L}]*$/u.test(w) && !STOP.has(w.toLowerCase())
  );
  if (caps.length >= 2) return caps[0] + " " + caps[1];
  if (caps.length === 1) return caps[0];
  return null;
}

function extractGuestCount(text: string): number | null {
  const s = text.toLowerCase();

  // 1) Compound "adults + children" — evaluated FIRST so "за двама възрастни
  //    и две деца" doesn't stop early at "двама".
  const adultsKids = s.match(/(двама|трима|четирима|петима|шестима|\d{1,2})\s+възрастн[иия](?:\s+(?:и\s+)?(двама|трима|четирима|петима|шестима|една|едно|две|три|четири|пет|\d{1,2})\s+дец(?:а|е))?/u);
  if (adultsKids) {
    const a = parseNumberLike(adultsKids[1]) ?? 0;
    const k = adultsKids[2] ? (parseNumberLike(adultsKids[2]) ?? 0) : 0;
    if (a + k >= 1) return Math.min(20, a + k);
  }

  // 2) Grammatical guest-forms: "за двама/трима/четирима/петима/..." — unambiguous.
  const grammatical = s.match(/(?<![\p{L}])за\s+(двама|двоица|трима|троица|четирима|петима|шестима|седмина|осмина)(?![\p{L}])/u);
  if (grammatical) return parseNumberLike(grammatical[1]);

  // 3) Explicit unit: "за N души/гости/човека/човек".
  const withUnit = s.match(/(?<![\p{L}])за\s+([\p{L}\d]+(?:\s+и\s+[\p{L}\d]+)?)\s+(души|гости|човека|човек)(?![\p{L}])/u);
  if (withUnit) {
    const n = parseNumberLike(withUnit[1]);
    if (n != null && n >= 1 && n <= 20) return n;
  }
  const digitWithUnit = s.match(/(?<![\p{L}])за\s+(\d{1,2})\s+(души|гости|човека|човек)(?![\p{L}])/u);
  if (digitWithUnit) return parseInt(digitWithUnit[1], 10);

  // 4) Idiomatic lexemes.
  if (/(?<![\p{L}])(сам(?:ичък|ичка|а)?)(?![\p{L}])/u.test(s)) return 1;
  if (/(?<![\p{L}])(двойка|чифт|двойката)(?![\p{L}])/u.test(s)) return 2;
  if (/(?<![\p{L}])семейство(?![\p{L}])/u.test(s)) return 4;
  if (/(?<![\p{L}])компания(?![\p{L}])/u.test(s)) return 6;

  return null;
}

function extractEmail(text: string): string | null {
  // Standard form after transcript cleanup — webkitSpeech usually
  // renders e-mails as "john at example dot com". Try both shapes.
  const direct = text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
  if (direct) return direct[0].toLowerCase();
  const spoken = text.toLowerCase()
    .replace(/\s+(?:ат|at|кльомба|маймунка|маймуна)\s+/gu, "@")
    .replace(/\s+(?:точка|dot|dots)\s+/gu, ".")
    .replace(/\s+(?:тире|минус|dash|dash)\s+/gu, "-");
  const m = spoken.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/);
  return m ? m[0] : null;
}

function extractPricePerNight(text: string): number | null {
  const s = text.toLowerCase();
  // "по 80 лева на нощ", "по осемдесет евро", "за 120 лв на нощ"
  const re = /(?:по|за|на\s+цена)\s+([\p{L}\d\s]+?)\s*(лв|лева|лв\.|евро|eur|€)(?:\s+(?:на|за)\s+(?:нощ|вечер|ден))?/u;
  const m = s.match(re);
  if (!m) return null;
  const n = parseNumberLike(m[1].trim());
  if (n == null || n < 1 || n > 5000) return null;
  return n;
}

function extractTime(text: string, kind: "arrival" | "departure"): string | null {
  const s = text.toLowerCase();
  const anchors = kind === "arrival"
    ? ["час(?:ът|а)?\\s+(?:на\\s+)?пристигане\\s+", "пристига(?:не)?\\s+в\\s+", "чекин\\s+в\\s+", "check[- ]?in\\s+в\\s+", "настанява\\s+се\\s+в\\s+"]
    : ["час(?:ът|а)?\\s+(?:на\\s+)?заминаване\\s+", "заминава\\s+в\\s+", "чекаут\\s+в\\s+", "check[- ]?out\\s+в\\s+", "напуска\\s+в\\s+"];
  for (const a of anchors) {
    // First shot: pure digit form HH:MM or HH.MM or just HH immediately
    // after the anchor. This is the common case in dictation.
    const reDigit = new RegExp(`${a}(\\d{1,2})(?:[:.](\\d{2}))?(?![\\p{L}\\d])`, "u");
    const dm = s.match(reDigit);
    if (dm) {
      const hh = Math.min(23, parseInt(dm[1], 10));
      const mm = dm[2] ? Math.min(59, parseInt(dm[2], 10)) : 0;
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
    // Second shot: spelled-out hour ("два следобед", "десет сутринта").
    const reWord = new RegExp(`${a}([\\p{L}\\s]+?)(?:\\s+(?:часа?|ч)|\\s+и\\s+\\d|$|[.,;])`, "u");
    const wm = s.match(reWord);
    if (wm) {
      const t = wm[1].trim();
      const spelled = parseNumberLike(t);
      if (spelled != null && spelled >= 0 && spelled <= 23) {
        const pm = /следобед|вечерта|вечер/u.test(t) && spelled < 12;
        const hh = pm ? spelled + 12 : spelled;
        return `${String(hh).padStart(2, "0")}:00`;
      }
    }
  }
  return null;
}

// Detects common "special requests" spoken naturally and emits a
// normalised, Bulgarian-language notes string. Returned value is
// appended to any explicit "бележка" notes from the transcript.
function extractSpecialRequests(text: string): string | null {
  const s = text.toLowerCase();
  const requests: string[] = [];
  const rules: Array<[RegExp, string]> = [
    [/(?:искат?|трябва(?:т)?|нужен|нужно|нуждае)\s+(?:им\s+)?(?:от\s+)?паркинг/u, "паркинг"],
    [/паркомясто/u, "паркинг"],
    [/детск[оа]\s+легло|бебешк[оа]\s+легло|кошар[аи]/u, "детско легло"],
    [/(?:ранен|ранно|по-?рано)\s+(?:чекин|пристигане|настаняване|check[- ]?in)/u, "ранно пристигане"],
    [/(?:късен|късно|по-?късно)\s+(?:чекаут|заминаване|освобождаване|check[- ]?out)/u, "късно освобождаване"],
    [/(?:късно|по-?късно)\s+пристига(?:не)?/u, "късно пристигане"],
    [/със?\s+закуск[аи]|нощувка\s+със?\s+закуск[аи]|B&B|bed\s+(?:and|&)\s+breakfast/iu, "със закуска"],
    [/(?:полу|полу-)пансион/u, "полупансион"],
    [/пълен\s+пансион|all[- ]inclusive/u, "пълен пансион"],
    [/трансфер\s+от\s+летище|трансфер\s+до\s+летище|airport\s+transfer/u, "трансфер от летище"],
    [/(?:тих[аи]|спокойн[аи])\s+стая/u, "тиха стая"],
    [/(?:с\s+)?гледка\s+(?:към\s+)?(?:море(?:то)?|планина(?:та)?|градина(?:та)?|басейн(?:а|ът)?)/u, "с гледка"],
    [/(?:не(?:пушач|пушещи)|без\s+пушене)/u, "непушач"],
    [/пушач/u, "пушач"],
    [/(?:с\s+)?куч(?:е|ета)|(?:с\s+)?дом(?:а|ашен)\s+любимец|pet[- ]friendly/u, "с домашен любимец"],
    [/вегетариан/u, "вегетарианско меню"],
    [/алергия|алергичен|алергични/u, "алергия — отбележи"],
    [/близо\s+до\s+асансьор|на\s+ниски[йя]\s+етаж/u, "на нисък етаж"],
    [/с(?:ъс)?\s+вана|джакузи/u, "стая с джакузи/вана"],
    [/брачна\s+нощ|меден\s+месец|honeymoon/u, "меден месец — специално внимание"],
  ];
  for (const [rx, label] of rules) if (rx.test(s) && !requests.includes(label)) requests.push(label);
  return requests.length ? requests.join("; ") : null;
}

function extractDurationNights(text: string): number | null {
  const s = text.toLowerCase();

  // "за N нощи" — iterate all matches and pick the last one that parses
  // (so "за Николай ... за три нощи" grabs "три нощи", not "Николай").
  // For each match, try progressively longer tails until one parses.
  const nightsRe = /(?<![\p{L}])за\s+([\p{L}\d\s]+?)\s*(нощувк[аи]|нощи|нощ|вечер[ии]?|ден|дни|дена)(?![\p{L}])/gu;
  let best: number | null = null;
  let nm: RegExpExecArray | null;
  while ((nm = nightsRe.exec(s)) !== null) {
    const tokens = nm[1].trim().split(/\s+/).filter(Boolean);
    // Try slicing from the end: 1 token first (usually the numeral),
    // growing up to 3 tokens for compounds like "двадесет и пет".
    for (let k = 1; k <= Math.min(3, tokens.length); k++) {
      const tail = tokens.slice(-k).join(" ");
      const n = parseNumberLike(tail);
      if (n != null && n >= 1 && n <= 60) { best = n; break; }
    }
  }
  if (best != null) return best;

  const wk = s.match(/(?<![\p{L}])за\s+([\p{L}\d\s]+?)\s*(седмиц[аи])(?![\p{L}])/u);
  if (wk) {
    const tail = wk[1].trim().split(/\s+/).slice(-3).join(" ");
    const n = parseNumberLike(tail) ?? 1;
    return n * 7;
  }

  const oneN = s.match(/(?<![\p{L}\d])(една|едно|1)\s+(нощ|вечер)(?![\p{L}])/u);
  if (oneN) return 1;

  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// 7. Public API
// ──────────────────────────────────────────────────────────────────────────

export type ParsedReservation = {
  name: string | null;
  room: string | null;
  start: string | null;
  end: string | null;
  phone: string | null;
  guests: number | null;
  notes: string | null;
  email: string | null;
  pricePerNight: number | null;
  arrivalTime: string | null;
  departureTime: string | null;
};

export function parseVoice(text: string, defaultYear: number, nowDate?: Date): ParsedReservation {
  const now = nowDate || new Date();
  const ctx = { now, year: defaultYear || now.getFullYear() };
  const raw = text || "";
  const s = raw.toLowerCase();

  let start: string | null = null;
  let end: string | null = null;

  // "от <X> до <Y>" — trailing-anchor list now also includes price, email,
  // arrival/departure time and special-request triggers so the range
  // doesn't greedily swallow those later fragments.
  const TRAIL = "за\\s+|в\\s+стая|в\\s+апартамент|с\\s+телефон|тел(?![\\p{L}])|по\\s+\\d+\\s*лв|по\\s+\\d+\\s*евро|имейл|е[- ]?mail|email|искат?|с\\s+дет|паркинг|с\\s+гледка|ранен|ранно|късен|късно|нощувка\\s+със";
  const fromTo = s.match(new RegExp(`(?<![\\p{L}])от\\s+(.+?)\\s+до\\s+(.+?)(?:$|\\s+(?:${TRAIL}))`, "u"));
  if (fromTo) {
    start = parseBGDate(fromTo[1], ctx);
    end   = parseBGDate(fromTo[2], ctx);

    // Range harmonisation: "от 1 до 10 май" — the month is stated only on
    // the second leg. Re-parse the first leg by borrowing the second
    // leg's month if the result is suspicious (too far from end).
    const leg2MonthMatch = Object.keys(MONTHS).find(mn => fromTo[2].toLowerCase().includes(mn));
    if (leg2MonthMatch && start && end) {
      const gapDays = (new Date(end).getTime() - new Date(start).getTime()) / 86400000;
      if (gapDays < 0 || gapDays > 60) {
        const retry = parseBGDate(`${fromTo[1]} ${leg2MonthMatch}`, ctx);
        if (retry) start = retry;
      }
    } else if (leg2MonthMatch && !start) {
      const retry = parseBGDate(`${fromTo[1]} ${leg2MonthMatch}`, ctx);
      if (retry) start = retry;
    }
  }

  // "от <X>" alone — only run if we didn't already see a range.
  if (!start && !end) {
    const fromOnly = s.match(/(?<![\p{L}])от\s+(.+?)(?:$|\s+(?:до\s+|за\s+|в\s+стая|в\s+апартамент|с\s+телефон|тел(?![\p{L}])))/u);
    if (fromOnly) start = parseBGDate(fromOnly[1], ctx);
  }

  // Arrival phraseology
  if (!start) {
    const arrM = s.match(/(?:настанява\s+се|пристига|идва|влиза|check[- ]?in)\s+(?:на\s+)?(.+?)(?:$|\s+(?:за\s+|до\s+|в\s+стая|в\s+апартамент|с\s+телефон|тел(?![\p{L}])))/u);
    if (arrM) start = parseBGDate(arrM[1], ctx);
  }

  // "резервирай за <date>" / "запиши за <date>" — the "за" here means "for the date".
  if (!start) {
    const reserveFor = s.match(/(?:резервирай|резервация|запиши|запис)\s+(?:за\s+)?(.+?)(?:$|\s+(?:за\s+\d|за\s+една|за\s+две|за\s+три|за\s+четири|за\s+пет|в\s+стая|в\s+апартамент|с\s+телефон|тел(?![\p{L}])))/u);
    if (reserveFor) start = parseBGDate(reserveFor[1], ctx);
  }

  // Departure phraseology
  let departureOnly = false;
  if (!end) {
    const depM = s.match(/(?:заминава|тръгва|напуска|освобождава|check[- ]?out)\s+(?:на\s+)?(.+?)(?:$|\s+(?:за\s+|в\s+стая|в\s+апартамент|с\s+телефон|тел(?![\p{L}])))/u);
    if (depM) {
      end = parseBGDate(depM[1], ctx);
      if (end && !start) departureOnly = true;
    }
  }

  // "до края на (седмицата|месеца)" — if it appears standalone, treat it
  // as the end of the range (the parser derives start normally below).
  if (!end && /до\s+края\s+на\s+(?:седмицата|месеца)/u.test(s)) {
    end = parseBGDate(s, ctx);
  }

  // Weekend shortcut (no explicit start): Saturday → Monday.
  if (!start && /уикенд/u.test(s)) {
    const sat = parseBGDate("уикенд", ctx);
    if (sat) {
      start = sat;
      const d = new Date(sat + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 2);
      end = isoOf(d);
    }
  }

  // Fallback: if we still have no start but the transcript contains
  // a parseable date phrase, use it. Strip room-code-like tokens first
  // so they can't be misread as "D.M" dates (e.g. "стая 4.1" != "April 1").
  // Skipped when the only date seen was a departure phrase — we refuse
  // to invent an arrival in that case.
  if (!start && !departureOnly) {
    let searchable = s;
    // Remove "стая <X>" / "апартамент <X>" / "номер <X>" slices entirely —
    // anything after those anchors is room identity, not a date.
    searchable = searchable.replace(/(?<![\p{L}])(стая|апартамент|стаичка|апартаментче|номер)\s+[\p{L}\d\s.\-]+$/u, "");
    // Belt-and-braces: strip any literal room code left in the string.
    for (const c of ROOM_CODES_BY_LEN) {
      searchable = searchable.split(c.toLowerCase()).join(" ");
    }

    // Build a holiday-name regex from the fixed-holiday rules.
    const holidayAlt = FIXED_HOLIDAYS.map(h => h.rx.source).join("|") + "|великден|пасха";
    const candidateRegexes: RegExp[] = [
      /(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)/u,
      new RegExp(`([\\p{L}\\d\\s]+?\\s+(?:${Object.keys(MONTHS).join("|")})(?:\\s+\\d{4})?)(?![\\p{L}])`, "u"),
      /((?:следващ(?:ия|ата)?|другия|другата|този|тази|идния|идната)\s+(?:понеделник|вторник|сряда|четвъртък|петък|събота|неделя))/u,
      /(?<![\p{L}])(днес|утре|вдругиден|другиден|вчера|довечера|утрешния)(?![\p{L}])/u,
      new RegExp(`((?:по\\s+|на\\s+|за\\s+)?(?:${holidayAlt}))`, "u"),
    ];
    for (const re of candidateRegexes) {
      const cm = searchable.match(re);
      if (cm) {
        const d = parseBGDate(cm[1], ctx);
        if (d) { start = d; break; }
      }
    }
  }

  // "за уикенд" as duration when start is known → end = start + 2
  if (start && !end && /(?<![\p{L}])за\s+уикенд/u.test(s)) {
    const d = new Date(start + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 2);
    end = isoOf(d);
  }

  // Duration → derive end from start
  if (start && !end) {
    const n = extractDurationNights(s);
    if (n != null) {
      const d = new Date(start + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
      end = isoOf(d);
    }
  }

  // Sanity: ensure end > start
  if (start && end && new Date(end) <= new Date(start)) {
    const d = new Date(start + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1);
    end = isoOf(d);
  }

  const room = matchRoomCode(raw);
  const name = extractName(raw);
  const phone = extractPhone(raw);
  const guests = extractGuestCount(raw);
  const email = extractEmail(raw);
  const pricePerNight = extractPricePerNight(raw);
  const arrivalTime = extractTime(raw, "arrival");
  const departureTime = extractTime(raw, "departure");

  // Notes: explicit "бележка"/"коментар" text, augmented with any
  // special-request phrases detected anywhere in the transcript.
  const noteParts: string[] = [];
  const noteM = raw.match(/(?:бележк[аи]|коментар|забележк[аи])\s*[:\-]?\s*(.+)$/iu);
  if (noteM) noteParts.push(noteM[1].trim());
  const specials = extractSpecialRequests(raw);
  if (specials) noteParts.push(specials);
  const notes = noteParts.length ? noteParts.join("; ") : null;

  return { name, room, start, end, phone, guests, notes, email, pricePerNight, arrivalTime, departureTime };
}

// ──────────────────────────────────────────────────────────────────────────
// 8. Self-check samples (for manual QA in devtools — unused at runtime)
// ──────────────────────────────────────────────────────────────────────────

export const __VOICE_SAMPLES__ = [
  "резервация за Иван Петров от утре до неделя в стая едно точка три телефон плюс три пет девет осем осем осем две три четири пет шест седем",
  "запиши Мария Георгиева от петнадесети юни до двадесети юни стая 39 0 1 за двама",
  "гост Петър пристига вдругиден за три нощувки в апартамент 2 4 1",
  "настанява се в петък за уикенд стая 4 2",
  "от 25.06 до 30.06 стая 1.3A за Джон Смит",
  "резервирай за следващия понеделник за една седмица стая 5 5",
  "Николай Иванов заминава утре стая 41 тире 2 бележка късно пристигане",
];
