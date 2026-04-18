export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

// POST /api/transcribe
// Accepts audio blob, sends to OpenAI Whisper for Bulgarian transcription.
// Requires OPENAI_API_KEY env var on Netlify.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "NO_API_KEY", message: "OPENAI_API_KEY не е конфигуриран" },
      { status: 501 }
    );
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    // Guard: reject extremely small audio files (< 1KB) — likely empty/corrupt.
    // Whisper hallucinates aggressively on silence or near-empty audio.
    if (audioFile.size < 1024) {
      return NextResponse.json(
        { error: "AUDIO_TOO_SHORT", message: "Записът е твърде кратък. Моля, опитайте отново." },
        { status: 400 }
      );
    }

    // Forward to OpenAI Whisper API
    // CRITICAL: iOS Safari produces audio/mp4 (AAC in MP4 container).
    // Whisper truncates transcriptions with .mp4 extension — must use .m4a.
    // The client should already send the correct filename, but we enforce it here too.
    let fname = audioFile.name || "recording.webm";
    if ((audioFile.type || fname).includes("mp4")) {
      fname = fname.replace(/\.mp4$/, ".m4a");
      if (!fname.endsWith(".m4a")) fname = "recording.m4a";
    }
    const whisperForm = new FormData();
    whisperForm.append("file", audioFile, fname);
    whisperForm.append("model", "whisper-1");
    whisperForm.append("language", "bg");
    whisperForm.append("response_format", "json");
    // Temperature 0 = deterministic output, reduces hallucinations.
    whisperForm.append("temperature", "0");
    // Prompt guides Whisper's output format — helps it produce room codes
    // with dots/dashes and recognise reservation-domain vocabulary.
    // IMPORTANT: Whisper truncates the prompt from the BEGINNING if it
    // exceeds 224 tokens. Most critical terms (room codes) go LAST.
    whisperForm.append("prompt",
      "Резервация за хотел Флора. " +
      "Гост, от дата, до дата, телефон, деца, възрастни, нощувки, бележка. " +
      "Месеци: януари, февруари, март, април, май, юни, юли, август, септември, октомври, ноември, декември. " +
      "Стаи: 1.1, 1.2, 1.3, 1.3A, 1.5, 2.2, 2.4.1, 2.4.2, 2.4.3, 2.5, 3.1, 4.1, 4.2, 5.5, 39.0.1, 41.0.1, 41.0.2, 41-2."
    );

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: whisperForm,
    });

    if (!whisperRes.ok) {
      const err = await whisperRes.text();
      console.error("[transcribe] Whisper error:", whisperRes.status, err);
      return NextResponse.json(
        { error: "Whisper API error", detail: err },
        { status: 502 }
      );
    }

    const result = await whisperRes.json();
    const text = (result.text || "").trim();

    // Hallucination detection — Whisper produces known garbage on silence/noise.
    // Common Bulgarian hallucination patterns:
    const HALLUCINATION_PATTERNS = [
      /^\.+$/,                                    // Just dots/periods
      /субтитри/i,                                // "Subtitles by..."
      /благодар[яи].*гледане/i,                   // "Thanks for watching"
      /^(.)(\s*\1){5,}/,                          // Same character repeated 6+ times
    ];

    if (!text || HALLUCINATION_PATTERNS.some(rx => rx.test(text))) {
      return NextResponse.json(
        { text: "", warning: "NO_SPEECH", message: "Не беше разпознат говор. Моля, опитайте отново." }
      );
    }

    // Detect excessive repetition (same phrase repeated 3+ times)
    // This catches Whisper's loop-hallucination on background noise
    const words = text.split(/\s+/);
    if (words.length >= 6) {
      const half = Math.floor(words.length / 2);
      for (let len = 2; len <= half; len++) {
        const chunk = words.slice(0, len).join(" ");
        let reps = 0;
        for (let i = 0; i <= words.length - len; i += len) {
          if (words.slice(i, i + len).join(" ") === chunk) reps++;
        }
        if (reps >= 3) {
          return NextResponse.json(
            { text: "", warning: "HALLUCINATION", message: "Разпознат е шум, не говор. Моля, опитайте отново." }
          );
        }
      }
    }

    return NextResponse.json({ text });
  } catch (e: any) {
    console.error("[transcribe] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/transcribe — check if Whisper is available
export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;
  return NextResponse.json({ available: !!apiKey });
}
