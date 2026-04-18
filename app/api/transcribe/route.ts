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

    // Forward to OpenAI Whisper API
    const whisperForm = new FormData();
    whisperForm.append("file", audioFile, "recording.webm");
    whisperForm.append("model", "whisper-1");
    whisperForm.append("language", "bg");
    whisperForm.append("response_format", "json");

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
    return NextResponse.json({ text: result.text || "" });
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
