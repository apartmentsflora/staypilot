import { caparoReminderEmailHtml, caparoReminderEmailSubject } from "../lib/email-templates.ts";
import fs from "node:fs";
import path from "node:path";

const langs = ["en", "bg", "de", "ru", "uk", "fr", "no"];
const outDir = "/tmp";
for (const lang of langs) {
  const td = {
    guestName: "Elena Peneva",
    roomCode: "41.2",
    checkin: "02.07.2026",
    checkout: "03.07.2026",
    nights: 1,
    total: "€122",
    guests: 2,
    children: 0,
    cots: 0,
    arrivalTime: "15:00",
    departTime: "11:00",
    notes: "",
    lang,
  };
  const html = caparoReminderEmailHtml(td);
  const subject = caparoReminderEmailSubject(td.guestName, lang);
  const out = path.join(outDir, `caparo-preview-${lang}.html`);
  fs.writeFileSync(out, `<!-- Subject: ${subject} -->\n${html}`);
  console.log(`${lang.padEnd(2)}  ${subject}`);
  console.log(`     → ${out} (${html.length} bytes)`);
}
