"use client";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { parseVoice } from "@/lib/voice";

const MBG = ["Януари","Февруари","Март","Април","Май","Юни","Юли","Август","Септември","Октомври","Ноември","Декември"];
const WD  = ["Пон","Вт","Сря","Чет","Пет","Съб","Нед"];

// ── helpers ──────────────────────────────────────────────────────────────────
function toDS(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function parseD(s: string) { return new Date(s + "T00:00:00"); }
function addD(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function fmtS(ds: string) { const d = parseD(ds); return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}`; }
function inRange(ds: string, r: any) { const d = parseD(ds); return d >= parseD(r.startDate.slice(0,10)) && d < parseD(r.endDate.slice(0,10)); }

const CHIP_COLORS: Record<string,string> = {
  "Телефон":"#fffbeb|#fcd34d|#78350f",
  "Booking":"#eff6ff|#93c5fd|#1e3a8a",
  "Beds24":"#f0fdf4|#86efac|#14532d",
  "Директна":"#f5f3ff|#c4b5fd|#3b0764",
  "Уебсайт":"#f0fdfa|#5eead4|#134e4a",
  "Airbnb":"#fff1f2|#fda4af|#881337",
};
function chipStyle(src: string) {
  const c = CHIP_COLORS[src] || "#f9fafb|#d1d5db|#374151";
  const [bg,bd,tx] = c.split("|");
  return { bg, bd, tx };
}

// ── Distinct per-reservation colors ───────────────────────────────────────
// 16 visually distinct palettes: bg | border | text
const RES_PALETTE = [
  "#eef2ff|#818cf8|#312e81", // indigo
  "#fef3c7|#f59e0b|#78350f", // amber
  "#dcfce7|#4ade80|#14532d", // green
  "#fce7f3|#f472b6|#831843", // pink
  "#e0e7ff|#6366f1|#3730a3", // blue-indigo
  "#fed7aa|#fb923c|#7c2d12", // orange
  "#d1fae5|#34d399|#064e3b", // emerald
  "#ede9fe|#a78bfa|#4c1d95", // violet
  "#fef9c3|#facc15|#713f12", // yellow
  "#cffafe|#22d3ee|#155e75", // cyan
  "#ffe4e6|#fb7185|#9f1239", // rose
  "#dbeafe|#60a5fa|#1e3a8a", // blue
  "#f3e8ff|#c084fc|#581c87", // purple
  "#ccfbf1|#2dd4bf|#134e4a", // teal
  "#ffedd5|#fdba74|#9a3412", // light-orange
  "#e0f2fe|#38bdf8|#075985", // sky
];
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
function resStyle(r: { id: string; source: string }) {
  // Use hash of reservation ID to pick a distinct color
  const idx = hashId(r.id) % RES_PALETTE.length;
  const [bg, bd, tx] = RES_PALETTE[idx].split("|");
  return { bg, bd, tx };
}

const EMPTY_FORM = { guestName:"", phone:"", email:"", roomCode:"", startDate:"", endDate:"", source:"Телефон", notes:"", pricePerNight:80, guests:"2", children:"0", arrivalTime:"14:00", departTime:"11:00" };

// ── main component ────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const now = new Date();
  const [yr, setYr] = useState(now.getFullYear());
  const [mo, setMo] = useState(now.getMonth());
  const [sel, setSel] = useState(toDS(now));
  const [tlAnchor, setTlAnchor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [rooms, setRooms] = useState<any[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [filters, setFilters] = useState({ bk:true, b2:true, ph:true, dr:true, web:true });
  const [modal, setModal] = useState(false);
  const [editingRes, setEditingRes] = useState<any>(null); // null = new, object = editing
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceParsed, setVoiceParsed] = useState<any>(null);
  const [voiceStatus, setVoiceStatus] = useState<"idle"|"listening"|"processing">("idle");
  const [transcript, setTranscript] = useState("");
  const recogRef = useRef<any>(null);
  const [cancelConfirm, setCancelConfirm] = useState<any>(null);
  const [detailRes, setDetailRes] = useState<any>(null); // for viewing full details
  const [todayFullScreen, setTodayFullScreen] = useState<"res"|"co"|null>(null);
  const lastFetchRef = useRef<string>("");
  const [syncing, setSyncing] = useState(false);

  // Form state
  const [form, setForm] = useState<any>({...EMPTY_FORM});
  const nights = useMemo(() => {
    if (!form.startDate || !form.endDate) return 1;
    return Math.max(1, Math.round((parseD(form.endDate).getTime() - parseD(form.startDate).getTime()) / 86400000));
  }, [form.startDate, form.endDate]);

  const load = useCallback(async () => {
    const [rRes, bRes] = await Promise.all([fetch("/api/rooms"), fetch("/api/reservations")]);
    if (rRes.ok) setRooms(await rRes.json());
    if (bRes.ok) {
      const data = await bRes.json();
      setReservations(data);
      lastFetchRef.current = new Date().toISOString();
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Auto-refresh every 10 seconds (incremental) ──────────────────────────
  useEffect(() => {
    const iv = setInterval(async () => {
      try {
        const res = await fetch("/api/reservations");
        if (res.ok) {
          const data = await res.json();
          setReservations(prev => {
            // Check if anything changed
            if (JSON.stringify(prev.map((r:any)=>r.id+r.status+r.updatedAt)) === JSON.stringify(data.map((r:any)=>r.id+r.status+r.updatedAt))) return prev;
            // Something changed — check for new reservations for push notification
            const prevIds = new Set(prev.map((r:any)=>r.id));
            const newOnes = data.filter((r:any) => !prevIds.has(r.id));
            for (const n of newOnes) {
              if (Notification.permission === "granted") {
                new Notification("Нова резервация", {
                  body: `${n.guestName} · Стая ${n.roomCode} · ${n.startDate?.slice(0,10)} – ${n.endDate?.slice(0,10)}`,
                  icon: "/favicon.ico",
                  tag: `res-${n.id}`,
                });
              }
            }
            return data;
          });
          lastFetchRef.current = new Date().toISOString();
        }
      } catch {}
    }, 10000);
    return () => clearInterval(iv);
  }, []);

  // ── Beds24 auto-sync every 30s — safety net when webhooks don't fire ────
  // Calls the full import endpoint (same as Sync Now button) automatically.
  // 2 calls per cycle × 2 per min = ~20 calls/5min (33% of Beds24's 60/5min limit).
  const syncingRef = useRef(false);
  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const res = await fetch("/api/integrations/beds24/import", { method: "POST" });
      if (res.ok) {
        await load();
      }
    } catch { /* non-fatal */ }
    setSyncing(false);
    syncingRef.current = false;
  }, [load]);

  useEffect(() => {
    syncNow(); // immediate first sync on page load
    const iv = setInterval(syncNow, 30_000); // every 30 seconds
    return () => clearInterval(iv);
  }, [syncNow]);

  // ── Request notification permission on mount ─────────────────────────────
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // ── Open voice modal from URL query param (?voice=1) ────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("voice") === "1") {
      setVoiceOpen(true);
      window.history.replaceState({}, "", "/dashboard/calendar");
    }
  }, []);

  // Preload form when modal opens
  useEffect(() => {
    if (modal && !editingRes) {
      const end = toDS(addD(parseD(sel), 1));
      setForm({
        ...EMPTY_FORM,
        startDate: voiceParsed?.start || sel,
        endDate: voiceParsed?.end || end,
        guestName: voiceParsed?.name || "",
        phone: voiceParsed?.phone || "",
        roomCode: voiceParsed?.room || "",
        email: voiceParsed?.email || "",
        notes: voiceParsed?.notes || "",
        guests: voiceParsed?.guests || "2",
        children: voiceParsed?.children != null ? String(voiceParsed.children) : "0",
        pricePerNight: voiceParsed?.pricePerNight || 80,
        arrivalTime: voiceParsed?.arrivalTime || "14:00",
        departTime: voiceParsed?.departureTime || "11:00",
      });
    }
  }, [modal, sel, voiceParsed, editingRes]);

  // Load form from editing reservation
  useEffect(() => {
    if (editingRes) {
      setForm({
        guestName: editingRes.guestName || "",
        phone: editingRes.phone || "",
        email: editingRes.email || "",
        roomCode: editingRes.roomCode || "",
        startDate: editingRes.startDate?.slice(0,10) || "",
        endDate: editingRes.endDate?.slice(0,10) || "",
        source: editingRes.source || "Телефон",
        notes: editingRes.notes || "",
        pricePerNight: editingRes.pricePerNight || 80,
        guests: String(editingRes.guests || 2),
        children: String(editingRes.children || 0),
        arrivalTime: editingRes.arrivalTime || "14:00",
        departTime: editingRes.departTime || "11:00",
      });
    }
  }, [editingRes]);

  // ── filter + derived ──────────────────────────────────────────────────────
  const visRes = useMemo(() => reservations.filter(r => {
    if (r.status === "CANCELLED") return false;
    if (r.source==="Booking" && !filters.bk) return false;
    if (r.source==="Beds24"  && !filters.b2) return false;
    if (r.source==="Телефон" && !filters.ph) return false;
    if ((r.source==="Директна"||r.source==="Direct") && !filters.dr) return false;
    if (r.source==="Уебсайт" && !filters.web) return false;
    return true;
  }), [reservations, filters]);

  const activeOn  = useCallback((ds: string) => visRes.filter(r => inRange(ds, r)), [visRes]);
  const checkouts = useCallback((ds: string) => visRes.filter(r => r.endDate.slice(0,10) === ds), [visRes]);

  // ── Available rooms for selected dates (filter booked ones) ───────────────
  const availableRooms = useMemo(() => {
    if (!form.startDate || !form.endDate) return rooms;
    const s = form.startDate;
    const e = form.endDate;
    const bookedCodes = new Set(
      reservations
        .filter(r => r.status !== "CANCELLED" && r.startDate.slice(0,10) < e && r.endDate.slice(0,10) > s)
        .filter(r => !editingRes || r.id !== editingRes.id) // exclude current reservation when editing
        .map(r => r.roomCode)
    );
    return rooms.filter(r => !bookedCodes.has(r.code));
  }, [rooms, reservations, form.startDate, form.endDate, editingRes]);

  // ── calendar grid ─────────────────────────────────────────────────────────
  const calGrid = useMemo(() => {
    const first = new Date(yr, mo, 1);
    const off = (first.getDay()+6)%7;
    const start = addD(first, -off);
    return Array.from({length:42}, (_,i) => addD(start, i));
  }, [yr, mo]);

  // ── timeline ──────────────────────────────────────────────────────────────
  const tlDays = useMemo(() => Array.from({length:9}, (_,i) => addD(tlAnchor, i)), [tlAnchor]);

  // ── voice ─────────────────────────────────────────────────────────────────
  const lastTranscriptRef = useRef("");
  const mediaRecRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [whisperAvailable, setWhisperAvailable] = useState<boolean | null>(null);
  const [manualInput, setManualInput] = useState("");

  // Save transcript to history (fire-and-forget, non-critical)
  function saveTranscriptHistory(text: string, parsed: ReturnType<typeof parseVoice>) {
    fetch("/api/voice-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: text,
        guest_name: parsed.name,
        room_code: parsed.room,
        check_in: parsed.start,
        check_out: parsed.end,
        phone: parsed.phone,
        guests: parsed.guests,
        children: parsed.children,
        notes: parsed.notes,
        source: parsed.source,
      }),
    }).catch(() => {});
  }

  // Detect iOS/iPadOS — ALL browsers on iOS use WebKit and NONE support SpeechRecognition
  const isIOS = typeof navigator !== "undefined" && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Mac") && "ontouchend" in document)
  );
  // Chrome/Firefox on iOS cannot use getUserMedia reliably — only Safari works
  const isIOSNonSafari = isIOS && typeof navigator !== "undefined" && (
    /CriOS/.test(navigator.userAgent) || /FxiOS/.test(navigator.userAgent)
  );
  const hasSpeechAPI = !isIOS && typeof window !== "undefined" && !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );

  // Check if Whisper backend is configured (once on mount)
  useEffect(() => {
    fetch("/api/transcribe").then(r => r.json())
      .then(d => setWhisperAvailable(d.available === true))
      .catch(() => setWhisperAvailable(false));
  }, []);

  // Start native SpeechRecognition (Chrome/Firefox/Edge/macOS Safari)
  function startNativeVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "bg-BG";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    recogRef.current = rec;
    lastTranscriptRef.current = "";
    setVoiceStatus("listening");
    setTranscript("");

    rec.onresult = (e: any) => {
      let finalT = "";
      let interimT = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalT += e.results[i][0].transcript;
        else interimT += e.results[i][0].transcript;
      }
      const displayText = finalT || interimT;
      if (displayText) {
        setTranscript(displayText);
        lastTranscriptRef.current = displayText;
      }
      if (finalT) {
        setVoiceStatus("processing");
        const parsed = parseVoice(finalT, yr);
        setVoiceParsed(parsed);
        saveTranscriptHistory(finalT, parsed);
        setVoiceStatus("idle");
      }
    };
    rec.onerror = (e: any) => {
      console.warn("Voice error:", e.error);
      if (e.error === "not-allowed") {
        alert("Микрофонът е блокиран. Разрешете достъп в настройките.");
      }
      setVoiceStatus("idle");
    };
    rec.onend = () => {
      if (lastTranscriptRef.current && !voiceParsed) {
        setVoiceStatus("processing");
        const parsed = parseVoice(lastTranscriptRef.current, yr);
        setVoiceParsed(parsed);
        saveTranscriptHistory(lastTranscriptRef.current, parsed);
        setVoiceStatus("idle");
      } else {
        setVoiceStatus(prev => prev === "listening" ? "idle" : prev);
      }
    };
    try { rec.start(); } catch { setVoiceStatus("idle"); }
  }

  // Start MediaRecorder (iOS Safari → sends to Whisper API)
  // Also tried on Chrome/Firefox iOS — if getUserMedia fails, we fall back to manual text.
  async function startMediaRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // iOS Safari: audio/mp4 is the ONLY reliable format (14.5-17.x)
      // Safari 18.4+: audio/webm;codecs=opus also works
      // Chrome/desktop: audio/webm;codecs=opus
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
      const rec = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      const actualMime = rec.mimeType || mimeType;
      audioChunksRef.current = [];

      rec.ondataavailable = (e: any) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      rec.onstop = async () => {
        // Stop all mic tracks immediately
        stream.getTracks().forEach(t => t.stop());

        const blob = new Blob(audioChunksRef.current, { type: actualMime });
        if (blob.size < 500) {
          setTranscript("Записът е твърде кратък. Опитайте отново.");
          setVoiceStatus("idle");
          return;
        }

        setVoiceStatus("processing");
        setTranscript("Обработвам записа...");

        try {
          const fd = new FormData();
          // CRITICAL: Whisper needs .m4a for iOS MP4 recordings, NOT .mp4
          // Using .mp4 causes truncated/broken transcriptions
          const ext = actualMime.includes("mp4") ? "m4a" : "webm";
          fd.append("audio", blob, `recording.${ext}`);

          const res = await fetch("/api/transcribe", { method: "POST", body: fd });
          const data = await res.json();

          if (data.error === "NO_API_KEY") {
            setTranscript("Whisper API ключът не е конфигуриран. Използвайте ръчно въвеждане.");
          } else if (data.error === "AUDIO_TOO_SHORT") {
            setTranscript(data.message || "Записът е твърде кратък. Моля, опитайте отново.");
          } else if (data.warning) {
            // Hallucination or no-speech detected by server
            setTranscript(data.message || "Не беше разпознат говор. Моля, опитайте отново.");
          } else if (data.text) {
            setTranscript(data.text);
            const parsed = parseVoice(data.text, yr);
            setVoiceParsed(parsed);
            saveTranscriptHistory(data.text, parsed);
          } else {
            setTranscript("Не успях да разпозная речта. Опитайте отново или въведете ръчно.");
          }
        } catch (e) {
          console.error("Whisper transcribe failed:", e);
          setTranscript("Грешка при връзка със сървъра. Опитайте отново.");
        }
        setVoiceStatus("idle");
      };

      rec.onerror = (e: any) => {
        console.error("MediaRecorder error:", e);
        stream.getTracks().forEach(t => t.stop());
        setTranscript("Грешка при запис. Опитайте отново.");
        setVoiceStatus("idle");
      };

      mediaRecRef.current = rec;
      // CRITICAL: Do NOT pass timeslice — it is broken on iOS Safari
      // ondataavailable will fire once when stop() is called
      rec.start();
      setVoiceStatus("listening");
      setTranscript("");
    } catch (err: any) {
      console.error("getUserMedia failed:", err);
      // On Chrome/Firefox iOS, getUserMedia always fails — show manual input gracefully
      if (isIOSNonSafari) {
        setTranscript("Гласовото записване не е налично в този браузър. Въведете командата с текст по-долу.");
      } else if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setTranscript("Микрофонът е блокиран. Разрешете достъп в настройките на браузъра.");
      } else {
        setTranscript("Не може да се стартира микрофонът. Въведете командата с текст по-долу.");
      }
      setVoiceStatus("idle");
    }
  }

  function startVoice() {
    if (hasSpeechAPI) {
      startNativeVoice();
    } else if (whisperAvailable) {
      // Try MediaRecorder on any platform — if it fails (e.g., Chrome iOS),
      // the catch block shows a graceful fallback message + manual input.
      startMediaRecording();
    }
    // If neither available, the UI shows manual text input instead
  }

  // Process manual text input
  function processManualInput() {
    if (!manualInput.trim()) return;
    setVoiceStatus("processing");
    setTranscript(manualInput);
    const parsed = parseVoice(manualInput, yr);
    setVoiceParsed(parsed);
    saveTranscriptHistory(manualInput, parsed);
    setVoiceStatus("idle");
  }

  function stopVoice() {
    try { recogRef.current?.stop(); } catch {}
    try {
      if (mediaRecRef.current && mediaRecRef.current.state === "recording") {
        mediaRecRef.current.stop(); // triggers onstop → Whisper
        return; // don't set idle yet, onstop handler will
      }
    } catch {}
    setVoiceStatus("idle");
  }

  function confirmVoice() {
    stopVoice(); setVoiceOpen(false); setEditingRes(null); setModal(true);
  }

  // ── open new reservation modal ────────────────────────────────────────────
  function openNewRes(date?: string) {
    setEditingRes(null);
    setVoiceParsed(null);
    if (date) setSel(date);
    setModal(true);
  }

  // ── open edit reservation modal ───────────────────────────────────────────
  function openEditRes(r: any) {
    setEditingRes(r);
    setSel(r.startDate.slice(0,10));
    setModal(true);
  }

  // ── save reservation ──────────────────────────────────────────────────────
  async function saveRes() {
    if (!form.guestName.trim() || !form.roomCode || !form.startDate || !form.endDate) return;
    const payload = { ...form, guests: Number(form.guests)||1, children: Number(form.children)||0, pricePerNight: Number(form.pricePerNight)||0 };

    let res;
    if (editingRes) {
      res = await fetch(`/api/reservations/${editingRes.id}`, {
        method: "PATCH",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetch("/api/reservations", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload),
      });
    }
    if (res.ok) {
      setModal(false); setEditingRes(null); setVoiceParsed(null);
      setForm({...EMPTY_FORM});
      await load();
    } else {
      const e = await res.json();
      alert(e.error || "Грешка при запис");
    }
  }

  // ── cancel with confirmation ──────────────────────────────────────────────
  async function doCancel(id: string) {
    await fetch(`/api/reservations/${id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ status:"CANCELLED" }) });
    setCancelConfirm(null);
    setDetailRes(null);
    setModal(false);
    await load();
  }

  // ── revert cancellation ───────────────────────────────────────────────────
  async function revertCancel(id: string) {
    await fetch(`/api/reservations/${id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ status:"CONFIRMED" }) });
    await load();
  }

  const activeToday = activeOn(sel);
  const coToday = checkouts(sel);
  const todayStr = toDS(now);
  const activeTodayReal = activeOn(todayStr);
  const coTodayReal = checkouts(todayStr);

  // ── CSS for mobile ────────────────────────────────────────────────────────
  const mobileCSS = `
    @media (max-width: 768px) {
      .modal-grid { grid-template-columns: 1fr !important; }
      .modal-right { display: none !important; }
      .form-grid { grid-template-columns: 1fr !important; }
      .form-grid > div { grid-column: span 1 !important; }
      .bottom-panels { grid-template-columns: 1fr !important; }
      .topbar-wrap { flex-direction: column; align-items: stretch !important; }
      .today-cards { grid-template-columns: 1fr !important; }
      .today-card { cursor: pointer; }
    }
  `;

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <DashboardShell
      stats={{ active: activeTodayReal.length, occ: Math.round(activeTodayReal.length/18*100), rev: 0, month: mo, selFmt: fmtS(sel) }}
      onNewRes={() => openNewRes()}
      onTodayRes={() => setTodayFullScreen("res")}
      onTodayCo={() => setTodayFullScreen("co")}
      onVoice={() => setVoiceOpen(true)}
    >
      <style dangerouslySetInnerHTML={{__html: mobileCSS}} />
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* TOPBAR */}
        <div className="topbar-wrap" style={{ background:"#fff", borderBottom:"1px solid #e5e2dc", padding:"10px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"10px", flexWrap:"wrap", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
            <button onClick={() => { const d = new Date(yr,mo-1,1); setYr(d.getFullYear()); setMo(d.getMonth()); }}
              style={{ background:"#f5f3ef", border:"1px solid #dedad4", borderRadius:"7px", width:"28px", height:"28px", cursor:"pointer", fontSize:"16px" }}>‹</button>
            <span style={{ fontSize:"18px", fontWeight:"700", minWidth:"165px", textAlign:"center" }}>{MBG[mo]} {yr}</span>
            <button onClick={() => { const d = new Date(yr,mo+1,1); setYr(d.getFullYear()); setMo(d.getMonth()); }}
              style={{ background:"#f5f3ef", border:"1px solid #dedad4", borderRadius:"7px", width:"28px", height:"28px", cursor:"pointer", fontSize:"16px" }}>›</button>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:"7px", flexWrap:"wrap" }}>
            {(["bk","b2","ph","dr","web"] as const).map((k) => {
              const labels = { bk:"Booking.com", b2:"Beds24", ph:"Телефон", dr:"Директна", web:"Уебсайт" };
              return (
                <button key={k} onClick={() => setFilters(f => ({...f, [k]:!f[k]}))}
                  style={{ border:"1px solid #dedad4", borderRadius:"7px", padding:"5px 10px", fontSize:"11px", background: filters[k] ? "#f0efff" : "#fff", color: filters[k] ? "#6c63ff" : "#555", cursor:"pointer", borderColor: filters[k] ? "#6c63ff" : "#dedad4" }}>
                  {labels[k]}
                </button>
              );
            })}
            <div style={{ display:"flex", alignItems:"center", gap:"5px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:"7px", padding:"5px 10px", fontSize:"11px", color:"#15803d" }}>
              <div style={{ width:"6px", height:"6px", borderRadius:"50%", background:"#22c55e", animation:"pulse 2s infinite" }} />
              Beds24 · 30с
            </div>
            <button onClick={syncNow} disabled={syncing}
              style={{ background: syncing ? "#fef3c7" : "#eff6ff", color: syncing ? "#92400e" : "#1d4ed8", border: `1px solid ${syncing ? "#fcd34d" : "#93c5fd"}`, borderRadius:"7px", padding:"5px 12px", fontSize:"11px", fontWeight:"600", cursor: syncing ? "default" : "pointer", opacity: syncing ? 0.8 : 1 }}>
              {syncing ? "⟳ Синхр..." : "⟳ Sync Now"}
            </button>
            <button onClick={() => openNewRes(toDS(now))}
              style={{ background:"#6c63ff", color:"#fff", border:"none", borderRadius:"8px", padding:"7px 14px", fontSize:"12px", fontWeight:"600", cursor:"pointer" }}>
              + Нова резервация
            </button>
          </div>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"14px 18px" }}>
          {/* CALENDAR */}
          <div style={{ background:"#fff", borderRadius:"12px", border:"1px solid #e5e2dc", overflow:"hidden", marginBottom:"14px" }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,minmax(0,1fr))", background:"#faf9f7", borderBottom:"1px solid #eee" }}>
              {WD.map(d => <div key={d} style={{ textAlign:"center", padding:"8px 2px", fontSize:"11px", fontWeight:"700", color:"#888" }}>{d}</div>)}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,minmax(0,1fr))" }}>
              {calGrid.map(dt => {
                const ds = toDS(dt);
                const outside = dt.getMonth() !== mo;
                const isSel = ds === sel;
                const isToday = ds === todayStr;
                const dr = activeOn(ds);
                return (
                  <div key={ds} onClick={() => { setSel(ds); openNewRes(ds); }}
                    style={{ borderRight:"1px solid #f0ede8", borderBottom:"1px solid #f0ede8", padding:"7px 6px", minHeight:"120px", cursor:"pointer", background: isSel ? "#f0efff" : "white", outline: isSel ? "2px solid #6c63ff" : "none", outlineOffset:"-2px", opacity: outside ? 0.4 : 1, transition:"background .1s" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"5px" }}>
                      <span style={{ fontSize:"12px", fontWeight:"600", color: isToday ? "#fff" : "#333", background: isToday ? "#6c63ff" : "transparent", borderRadius: isToday ? "50%" : "0", width: isToday ? "21px" : "auto", height: isToday ? "21px" : "auto", display:"flex", alignItems:"center", justifyContent:"center" }}>{dt.getDate()}</span>
                      {dr.length > 0 && <span style={{ fontSize:"10px", background:"#6c63ff", color:"#fff", borderRadius:"4px", padding:"1px 5px", fontWeight:"600" }}>{dr.length}</span>}
                    </div>
                    {dr.slice(0,3).map(r => {
                      const cs = resStyle(r);
                      return (
                        <div key={r.id} style={{ borderRadius:"7px", padding:"5px 7px", marginBottom:"3px", background:cs.bg, border:`1px solid ${cs.bd}`, color:cs.tx, display:"flex", alignItems:"center", gap:"5px" }}
                          onClick={e => { e.stopPropagation(); openEditRes(r); }}>
                          <div style={{ width:"18px", height:"18px", borderRadius:"50%", background:cs.bd, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"8px", fontWeight:"700", flexShrink:0 }}>
                            {(r.guestName||"?")[0].toUpperCase()}
                          </div>
                          <div style={{ minWidth:0 }}>
                            <div style={{ fontSize:"11px", fontWeight:"600", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.guestName}</div>
                            <div style={{ fontSize:"10px", opacity:.7 }}>{r.roomCode}</div>
                          </div>
                        </div>
                      );
                    })}
                    {dr.length > 3 && <div style={{ fontSize:"10px", color:"#999", padding:"1px 4px" }}>+{dr.length-3} още</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* TODAY PANELS — above timeline */}
          <div className="today-cards" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px", marginBottom:"14px" }}>
            {/* Reservations for selected date */}
            <div className="today-card" style={{ background:"#fff", borderRadius:"12px", border:"1px solid #e5e2dc", padding:"13px 15px" }}
              onClick={() => { if (window.innerWidth <= 768) setTodayFullScreen("res"); }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"10px" }}>
                <span style={{ fontSize:"13px", fontWeight:"700" }}>Резервации за {fmtS(sel)}</span>
                <span style={{ fontSize:"10px", color:"#6c63ff", cursor:"pointer" }} onClick={(e) => { e.stopPropagation(); setTodayFullScreen("res"); }}>Виж всички →</span>
              </div>
              {activeToday.length === 0 && <div style={{ fontSize:"12px", color:"#bbb", padding:"8px 0" }}>Няма активни резервации.</div>}
              {activeToday.slice(0,4).map(r => {
                const cs = resStyle(r);
                return (
                  <div key={r.id} onClick={e => { e.stopPropagation(); openEditRes(r); }}
                    style={{ borderRadius:"9px", padding:"10px 12px", marginBottom:"8px", background:cs.bg, border:`1px solid ${cs.bd}`, color:cs.tx, cursor:"pointer", transition:"transform .1s" }}>
                    <div style={{ display:"flex", alignItems:"flex-start", gap:"9px" }}>
                      <div style={{ width:"30px", height:"30px", borderRadius:"50%", background:cs.bd, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"11px", fontWeight:"700", flexShrink:0, color:"#fff" }}>{(r.guestName||"?")[0]}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:"13px", fontWeight:"700" }}>{r.guestName}</div>
                        <div style={{ fontSize:"11px", opacity:.75, marginTop:"2px" }}>Стая {r.roomCode} · {r.phone}</div>
                        <div style={{ fontSize:"11px", opacity:.65, marginTop:"1px" }}>{fmtS(r.startDate.slice(0,10))} — {fmtS(r.endDate.slice(0,10))}</div>
                        {r.notes && <div style={{ fontSize:"11px", opacity:.6, marginTop:"3px", fontStyle:"italic" }}>{r.notes}</div>}
                        <div style={{ display:"flex", gap:"5px", marginTop:"6px", flexWrap:"wrap" }}>
                          <span style={{ fontSize:"10px", padding:"2px 6px", borderRadius:"4px", background:cs.bd, color:"#fff", fontWeight:"500" }}>{r.source}</span>
                        </div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); setCancelConfirm(r); }}
                        style={{ fontSize:"10px", padding:"3px 8px", borderRadius:"5px", background:"rgba(255,255,255,.7)", border:"1px solid #fca5a5", cursor:"pointer", color:"#dc2626", flexShrink:0 }}>Анулирай</button>
                    </div>
                  </div>
                );
              })}
              {activeToday.length > 4 && <div style={{ fontSize:"11px", color:"#999", textAlign:"center" }}>+{activeToday.length-4} още</div>}
            </div>

            {/* Checkouts */}
            <div className="today-card" style={{ background:"#fff", borderRadius:"12px", border:"1px solid #e5e2dc", padding:"13px 15px" }}
              onClick={() => { if (window.innerWidth <= 768) setTodayFullScreen("co"); }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"10px" }}>
                <span style={{ fontSize:"13px", fontWeight:"700" }}>Освобождавания за {fmtS(sel)}</span>
                <span style={{ fontSize:"10px", color:"#6c63ff", cursor:"pointer" }} onClick={(e) => { e.stopPropagation(); setTodayFullScreen("co"); }}>Виж всички →</span>
              </div>
              {coToday.length === 0 && <div style={{ fontSize:"12px", color:"#bbb", padding:"8px 0" }}>Няма освобождавания.</div>}
              {coToday.map(r => (
                <div key={r.id} onClick={e => { e.stopPropagation(); openEditRes(r); }}
                  style={{ display:"flex", alignItems:"center", gap:"9px", padding:"8px 10px", background:"#fffbf0", borderRadius:"8px", marginBottom:"6px", borderLeft:"3px solid #f59e0b", cursor:"pointer" }}>
                  <div style={{ width:"28px", height:"28px", borderRadius:"50%", background:"#fcd34d", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"10px", fontWeight:"700" }}>{(r.guestName||"?")[0]}</div>
                  <div>
                    <div style={{ fontSize:"12px", fontWeight:"700" }}>{r.guestName}</div>
                    <div style={{ fontSize:"11px", color:"#aaa" }}>Стая {r.roomCode} · {r.phone || ""}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* TIMELINE */}
          <div style={{ background:"#fff", borderRadius:"12px", border:"1px solid #e5e2dc", overflow:"hidden", marginBottom:"14px" }}>
            <div style={{ padding:"11px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid #eee", background:"#faf9f7" }}>
              <span style={{ fontSize:"13px", fontWeight:"700" }}>Стаи · хоризонтален изглед</span>
              <div style={{ display:"flex", gap:"6px" }}>
                <button onClick={() => setTlAnchor(a => addD(a,-3))} style={{ border:"1px solid #dedad4", borderRadius:"6px", padding:"4px 11px", fontSize:"11px", background:"#fff", cursor:"pointer" }}>← Назад 3</button>
                <button onClick={() => setTlAnchor(a => addD(a,3))} style={{ border:"1px solid #dedad4", borderRadius:"6px", padding:"4px 11px", fontSize:"11px", background:"#fff", cursor:"pointer" }}>Напред 3 →</button>
              </div>
            </div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", minWidth:"820px" }}>
                <thead>
                  <tr>
                    <th style={{ background:"#faf9f7", fontSize:"10px", fontWeight:"700", color:"#888", padding:"7px 12px", borderBottom:"1px solid #eee", borderRight:"1px solid #f0ede8", textAlign:"left", minWidth:"155px" }}>Стая</th>
                    {tlDays.map(d => {
                      const ds = toDS(d); const isSel = ds === sel;
                      return <th key={ds} style={{ background: isSel ? "#f0efff" : "#faf9f7", fontSize:"10px", fontWeight:"700", color: isSel ? "#6c63ff" : "#888", padding:"7px 8px", borderBottom:"1px solid #eee", borderRight:"1px solid #f0ede8", textAlign:"center", minWidth:"84px" }}>{d.getDate()}<br/>{MBG[d.getMonth()].slice(0,3)}</th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rooms.map(room => (
                    <tr key={room.id}>
                      <td style={{ background:"#fdfcfb", padding:"7px 12px", borderBottom:"1px solid #f0ede8", borderRight:"1px solid #f0ede8" }}>
                        <div style={{ fontSize:"12px", fontWeight:"700", color:"#222" }}>{room.code}</div>
                        <div style={{ fontSize:"10px", color:"#aaa", marginTop:"1px" }}>Вход {room.entrance} · {room.capacity} г. · {room.label}</div>
                      </td>
                      {tlDays.map(d => {
                        const ds = toDS(d); const isSel = ds === sel;
                        const res = visRes.find(r => r.roomCode === room.code && inRange(ds, r));
                        const cs = res ? resStyle(res) : null;
                        return (
                          <td key={ds} style={{ borderBottom:"1px solid #f0ede8", borderRight:"1px solid #f0ede8", padding:"4px 5px", height:"52px", background: isSel ? "#f9f8ff" : "#fff", verticalAlign:"middle" }}>
                            {res && cs ? (
                              <div style={{ borderRadius:"6px", padding:"4px 7px", background:cs.bg, border:`1px solid ${cs.bd}`, color:cs.tx, height:"44px", display:"flex", flexDirection:"column", justifyContent:"center", cursor:"pointer" }}
                                onClick={() => openEditRes(res)}>
                                <div style={{ fontWeight:"700", fontSize:"11px", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{res.guestName.split(" ")[0]}</div>
                                <div style={{ fontSize:"9px", opacity:.7 }}>{fmtS(res.startDate.slice(0,10))}–{fmtS(res.endDate.slice(0,10))}</div>
                              </div>
                            ) : (
                              <div style={{ fontSize:"10px", color:"#d0cdc8", textAlign:"center" }}>—</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ RESERVATION MODAL (new + edit) ═══════════ */}
      {modal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(5,5,15,.6)", display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"24px 14px", zIndex:100, overflowY:"auto" }}
          onClick={e => { if (e.currentTarget === e.target) { setModal(false); setEditingRes(null); setVoiceParsed(null); } }}>
          <div style={{ background:"#fff", borderRadius:"16px", width:"880px", maxWidth:"100%", overflow:"hidden", border:"1px solid #e5e2dc", boxShadow:"0 30px 90px rgba(0,0,0,.35)" }}>
            <div style={{ background:"#12121c", padding:"16px 22px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:"15px", fontWeight:"700", color:"#fff" }}>
                  {editingRes ? `Редактиране · ${editingRes.guestName}` : `Нова резервация · ${fmtS(sel)}`}
                </div>
                <div style={{ fontSize:"12px", color:"#a09fff", marginTop:"4px", background:"rgba(108,99,255,.15)", display:"inline-block", padding:"3px 10px", borderRadius:"5px", border:"1px solid rgba(108,99,255,.3)" }}>
                  Синхронизира се с Beds24 и Booking.com
                </div>
              </div>
              <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                <button onClick={() => { setModal(false); setVoiceOpen(true); }}
                  style={{ background:"linear-gradient(135deg,#6c63ff,#4a43cc)", color:"#fff", border:"2px solid #a09fff", borderRadius:"8px", padding:"7px 14px", cursor:"pointer", fontSize:"13px", fontWeight:"600", display:"flex", alignItems:"center", gap:"6px", whiteSpace:"nowrap", boxShadow:"0 2px 8px rgba(108,99,255,.3)" }}>
                  🎤 Гласово попълване
                </button>
                <button onClick={() => { setModal(false); setEditingRes(null); setVoiceParsed(null); }} style={{ background:"#1e1e2e", color:"#777", border:"1px solid #2a2a40", borderRadius:"7px", width:"28px", height:"28px", cursor:"pointer", fontSize:"17px", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
              </div>
            </div>
            <div className="modal-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr" }}>
              <div style={{ padding:"18px 20px", borderRight:"1px solid #f0ede8" }}>
                <div className="form-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"9px" }}>
                  {[
                    { label:"Гост", id:"guestName", placeholder:"Иван Петров", span:true },
                    { label:"Телефон", id:"phone", placeholder:"+359888..." },
                    { label:"Email", id:"email", placeholder:"guest@example.com" },
                    { label:"Брой възрастни", id:"guests", placeholder:"2", type:"number" },
                    { label:"Брой деца", id:"children", placeholder:"0", type:"number" },
                    { label:"Дата начало", id:"startDate", type:"date" },
                    { label:"Дата край", id:"endDate", type:"date" },
                    { label:"Час пристигане", id:"arrivalTime", type:"time" },
                    { label:"Час заминаване", id:"departTime", type:"time" },
                    { label:"Цена / нощ (€)", id:"pricePerNight", type:"number" },
                  ].map(f => (
                    <div key={f.id} style={f.span ? {gridColumn:"1 / -1"} : {}}>
                      <label style={{ fontSize:"11px", fontWeight:"700", color:"#888", display:"block", marginBottom:"4px" }}>{f.label.toUpperCase()}</label>
                      <input type={f.type||"text"} placeholder={f.placeholder||""} value={form[f.id]||""}
                        onChange={e => setForm((prev:any) => ({...prev, [f.id]: e.target.value}))}
                        style={{ height:"36px", width:"100%", border:"1px solid #dedad4", borderRadius:"8px", padding:"0 11px", fontSize:"13px", background:"#faf9f7", color:"#111", outline:"none", boxSizing:"border-box" }} />
                    </div>
                  ))}
                </div>
                <div className="form-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"9px", marginTop:"9px" }}>
                  <div>
                    <label style={{ fontSize:"11px", fontWeight:"700", color:"#888", display:"block", marginBottom:"4px" }}>СТАЯ</label>
                    <select value={form.roomCode} onChange={e => setForm((f:any) => ({...f,roomCode:e.target.value}))}
                      style={{ height:"36px", width:"100%", border:"1px solid #dedad4", borderRadius:"8px", padding:"0 11px", fontSize:"13px", background:"#faf9f7", color:"#111", outline:"none", boxSizing:"border-box" }}>
                      <option value="">Избери стая...</option>
                      {availableRooms.map(r => <option key={r.id} value={r.code}>{r.code} · Вход {r.entrance} · {r.label} ({r.capacity} г.)</option>)}
                      {editingRes && !availableRooms.find((r:any) => r.code === form.roomCode) && form.roomCode && (
                        <option value={form.roomCode}>{form.roomCode} (текуща стая)</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:"11px", fontWeight:"700", color:"#888", display:"block", marginBottom:"4px" }}>ИЗТОЧНИК</label>
                    <select value={form.source} onChange={e => setForm((f:any) => ({...f,source:e.target.value}))}
                      style={{ height:"36px", width:"100%", border:"1px solid #dedad4", borderRadius:"8px", padding:"0 11px", fontSize:"13px", background:"#faf9f7", color:"#111", outline:"none", boxSizing:"border-box" }}>
                      {["Телефон","Booking","Beds24","Директна","Уебсайт","Airbnb"].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginTop:"9px" }}>
                  <label style={{ fontSize:"11px", fontWeight:"700", color:"#888", display:"block", marginBottom:"4px" }}>СПЕЦИАЛНИ ЖЕЛАНИЯ</label>
                  <textarea value={form.notes} onChange={e => setForm((f:any) => ({...f,notes:e.target.value}))} placeholder="Ранно пристигане, паркинг, детско легло..."
                    style={{ width:"100%", border:"1px solid #dedad4", borderRadius:"8px", padding:"8px 11px", fontSize:"13px", background:"#faf9f7", color:"#111", resize:"none", height:"52px", outline:"none", boxSizing:"border-box" }} />
                </div>
                <div style={{ background:"#f5f3ff", border:"1px solid #ddd3fe", borderRadius:"8px", padding:"9px 13px", marginTop:"9px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ fontSize:"12px", color:"#6c63ff" }}>
                    {nights} нощи · {Number(form.guests)||0} възр. · {Number(form.children)||0} деца
                  </div>
                  <div style={{ fontSize:"19px", fontWeight:"700", color:"#4c1d95" }}>€{Math.round((Number(form.pricePerNight)||0) * nights)}</div>
                </div>
                <div style={{ display:"flex", gap:"7px", marginTop:"11px", flexWrap:"wrap" }}>
                  <button onClick={saveRes} style={{ background:"#6c63ff", color:"#fff", border:"none", borderRadius:"8px", padding:"9px 18px", fontSize:"13px", fontWeight:"600", cursor:"pointer" }}>
                    {editingRes ? "💾 Запази промените" : "💾 Запази резервацията"}
                  </button>
                  {editingRes && (
                    <button onClick={() => setCancelConfirm(editingRes)} style={{ background:"#fee2e2", color:"#dc2626", border:"1px solid #fca5a5", borderRadius:"8px", padding:"9px 14px", fontSize:"13px", cursor:"pointer", fontWeight:"600" }}>
                      Анулирай
                    </button>
                  )}
                  <button onClick={() => { setModal(false); setEditingRes(null); setVoiceParsed(null); }} style={{ background:"#f5f3ef", color:"#666", border:"1px solid #dedad4", borderRadius:"8px", padding:"9px 14px", fontSize:"13px", cursor:"pointer" }}>Затвори</button>
                </div>
                {/* Mobile: active reservations shown below buttons */}
                <div className="modal-mobile-active" style={{ display:"none" }}>
                  <style dangerouslySetInnerHTML={{__html:`@media(max-width:768px){.modal-mobile-active{display:block!important;margin-top:14px}}`}} />
                  <div style={{ fontSize:"11px", fontWeight:"700", color:"#888", letterSpacing:".4px", textTransform:"uppercase", marginBottom:"8px", paddingBottom:"6px", borderBottom:"1px solid #eee" }}>Активни резервации за {fmtS(sel)}</div>
                  {activeToday.length === 0 && <div style={{ fontSize:"12px", color:"#bbb" }}>Няма активни.</div>}
                  {activeToday.map(r => {
                    const cs = resStyle(r);
                    return (
                      <div key={r.id} onClick={() => { setModal(false); setTimeout(() => openEditRes(r), 100); }}
                        style={{ borderRadius:"9px", padding:"8px 10px", marginBottom:"6px", background:cs.bg, border:`1px solid ${cs.bd}`, color:cs.tx, cursor:"pointer" }}>
                        <div style={{ fontSize:"12px", fontWeight:"700" }}>{r.guestName}</div>
                        <div style={{ fontSize:"11px", opacity:.75 }}>Стая {r.roomCode} · {fmtS(r.startDate.slice(0,10))} — {fmtS(r.endDate.slice(0,10))}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize:"10px", color:"#bbb", marginTop:"7px" }}>Синхронизира се автоматично с Beds24, Booking.com и уебсайта</div>
              </div>
              {/* Right panel — desktop only */}
              <div className="modal-right" style={{ padding:"18px 20px", background:"#faf9f7", maxHeight:"650px", overflowY:"auto" }}>
                <div style={{ fontSize:"11px", fontWeight:"700", color:"#888", letterSpacing:".4px", textTransform:"uppercase", marginBottom:"8px", paddingBottom:"6px", borderBottom:"1px solid #eee" }}>Активни резервации за {fmtS(sel)}</div>
                {activeToday.length === 0 && <div style={{ fontSize:"12px", color:"#bbb", padding:"8px 0" }}>Няма активни.</div>}
                {activeToday.map(r => {
                  const cs = resStyle(r);
                  return (
                    <div key={r.id} onClick={() => { setModal(false); setTimeout(() => openEditRes(r), 100); }}
                      style={{ borderRadius:"9px", padding:"10px 12px", marginBottom:"8px", background:cs.bg, border:`1px solid ${cs.bd}`, color:cs.tx, cursor:"pointer" }}>
                      <div style={{ fontSize:"13px", fontWeight:"700" }}>{r.guestName}</div>
                      <div style={{ fontSize:"11px", opacity:.75, marginTop:"2px" }}>Стая {r.roomCode} · {r.phone}</div>
                      <div style={{ fontSize:"11px", opacity:.65, marginTop:"1px" }}>{fmtS(r.startDate.slice(0,10))} — {fmtS(r.endDate.slice(0,10))}</div>
                    </div>
                  );
                })}
                {coToday.length > 0 && (
                  <>
                    <div style={{ fontSize:"11px", fontWeight:"700", color:"#888", letterSpacing:".4px", textTransform:"uppercase", marginBottom:"8px", paddingBottom:"6px", borderBottom:"1px solid #eee", marginTop:"14px" }}>Освобождавания</div>
                    {coToday.map(r => (
                      <div key={r.id} style={{ display:"flex", alignItems:"center", gap:"8px", padding:"8px 10px", background:"#fffbf0", borderRadius:"8px", marginBottom:"6px", borderLeft:"3px solid #f59e0b" }}>
                        <div style={{ fontSize:"12px", fontWeight:"700" }}>{r.guestName}</div>
                        <div style={{ fontSize:"11px", color:"#aaa" }}>Стая {r.roomCode}</div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ CANCEL CONFIRMATION POPUP ═══════════ */}
      {cancelConfirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}
          onClick={() => setCancelConfirm(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background:"#fff", borderRadius:"16px", padding:"32px", maxWidth:"460px", width:"90%", textAlign:"center", boxShadow:"0 20px 60px rgba(0,0,0,.3)" }}>
            <div style={{ fontSize:"48px", marginBottom:"16px" }}>⚠️</div>
            <div style={{ fontSize:"20px", fontWeight:"700", color:"#111", marginBottom:"12px" }}>
              Сигурни ли сте, че искате да анулирате тази резервация?
            </div>
            <div style={{ fontSize:"14px", color:"#666", marginBottom:"8px" }}>
              <strong>{cancelConfirm.guestName}</strong> · Стая {cancelConfirm.roomCode}
            </div>
            <div style={{ fontSize:"13px", color:"#999", marginBottom:"24px" }}>
              {fmtS(cancelConfirm.startDate.slice(0,10))} — {fmtS(cancelConfirm.endDate.slice(0,10))} · {cancelConfirm.source}
            </div>
            <div style={{ fontSize:"12px", color:"#f59e0b", background:"#fffbeb", border:"1px solid #fcd34d", borderRadius:"8px", padding:"10px", marginBottom:"20px" }}>
              Резервацията ще бъде анулирана и в Beds24. Можете да я възстановите до 24 часа.
            </div>
            <div style={{ display:"flex", gap:"10px", justifyContent:"center" }}>
              <button onClick={() => doCancel(cancelConfirm.id)}
                style={{ background:"#dc2626", color:"#fff", border:"none", borderRadius:"10px", padding:"12px 28px", fontSize:"15px", fontWeight:"700", cursor:"pointer" }}>
                Да, анулирай
              </button>
              <button onClick={() => setCancelConfirm(null)}
                style={{ background:"#f5f3ef", color:"#666", border:"1px solid #dedad4", borderRadius:"10px", padding:"12px 28px", fontSize:"15px", cursor:"pointer" }}>
                Не, запази
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ FULL-SCREEN TODAY LIST (mobile) ═══════════ */}
      {todayFullScreen && (
        <div style={{ position:"fixed", inset:0, background:"#fff", zIndex:150, display:"flex", flexDirection:"column" }}>
          <div style={{ background:"#12121c", padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
            <span style={{ fontSize:"16px", fontWeight:"700", color:"#fff" }}>
              {todayFullScreen === "res" ? `Резервации за ${fmtS(sel)}` : `Освобождавания за ${fmtS(sel)}`}
            </span>
            <button onClick={() => setTodayFullScreen(null)}
              style={{ background:"#1e1e2e", color:"#fff", border:"1px solid #2a2a40", borderRadius:"7px", width:"32px", height:"32px", cursor:"pointer", fontSize:"18px" }}>×</button>
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"16px" }}>
            {todayFullScreen === "res" ? (
              activeToday.length === 0 ? <div style={{ color:"#bbb", padding:"20px", textAlign:"center" }}>Няма активни резервации.</div> :
              activeToday.map(r => {
                const cs = resStyle(r);
                return (
                  <div key={r.id} onClick={() => { setTodayFullScreen(null); openEditRes(r); }}
                    style={{ borderRadius:"12px", padding:"14px 16px", marginBottom:"10px", background:cs.bg, border:`1px solid ${cs.bd}`, color:cs.tx, cursor:"pointer" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"8px" }}>
                      <div style={{ width:"36px", height:"36px", borderRadius:"50%", background:cs.bd, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"14px", fontWeight:"700", color:"#fff" }}>{(r.guestName||"?")[0]}</div>
                      <div>
                        <div style={{ fontSize:"16px", fontWeight:"700" }}>{r.guestName}</div>
                        <div style={{ fontSize:"13px", opacity:.75 }}>Стая {r.roomCode} · Вход {r.room?.entrance || ""}</div>
                      </div>
                    </div>
                    <div style={{ fontSize:"13px", opacity:.7 }}>{r.phone} · {r.email || ""}</div>
                    <div style={{ fontSize:"13px", opacity:.7, marginTop:"4px" }}>{fmtS(r.startDate.slice(0,10))} — {fmtS(r.endDate.slice(0,10))} · {r.source}</div>
                    {r.notes && <div style={{ fontSize:"12px", opacity:.6, marginTop:"4px", fontStyle:"italic" }}>{r.notes}</div>}
                    <div style={{ display:"flex", gap:"8px", marginTop:"10px" }}>
                      <span style={{ fontSize:"11px", padding:"3px 8px", borderRadius:"5px", background:cs.bd, color:"#fff" }}>{r.source}</span>
                      <button onClick={e => { e.stopPropagation(); setCancelConfirm(r); }}
                        style={{ fontSize:"11px", padding:"3px 8px", borderRadius:"5px", background:"rgba(220,38,38,.1)", border:"1px solid #fca5a5", color:"#dc2626", cursor:"pointer" }}>Анулирай</button>
                    </div>
                  </div>
                );
              })
            ) : (
              coToday.length === 0 ? <div style={{ color:"#bbb", padding:"20px", textAlign:"center" }}>Няма освобождавания.</div> :
              coToday.map(r => (
                <div key={r.id} onClick={() => { setTodayFullScreen(null); openEditRes(r); }}
                  style={{ display:"flex", alignItems:"center", gap:"12px", padding:"14px 16px", background:"#fffbf0", borderRadius:"12px", marginBottom:"10px", borderLeft:"4px solid #f59e0b", cursor:"pointer" }}>
                  <div style={{ width:"36px", height:"36px", borderRadius:"50%", background:"#fcd34d", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"14px", fontWeight:"700" }}>{(r.guestName||"?")[0]}</div>
                  <div>
                    <div style={{ fontSize:"16px", fontWeight:"700" }}>{r.guestName}</div>
                    <div style={{ fontSize:"13px", color:"#aaa" }}>Стая {r.roomCode} · {r.phone || ""}</div>
                    <div style={{ fontSize:"12px", color:"#ccc", marginTop:"2px" }}>{fmtS(r.startDate.slice(0,10))} — {fmtS(r.endDate.slice(0,10))}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ═══════════ VOICE MODAL ═══════════ */}
      {voiceOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(5,5,15,.6)", display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"24px 14px", zIndex:110, overflowY:"auto" }}
          onClick={e => { if (e.currentTarget===e.target) { stopVoice(); setVoiceOpen(false); } }}>
          <div style={{ background:"#fff", borderRadius:"14px", width:"560px", maxWidth:"100%", overflow:"hidden", border:"1px solid #dedad4", boxShadow:"0 20px 60px rgba(0,0,0,.3)" }}>
            <div style={{ background:"#12121c", padding:"15px 20px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:"15px", fontWeight:"700", color:"#fff" }}>🎤 Гласово попълване</div>
                <div style={{ fontSize:"11px", color:"#55547a", marginTop:"2px" }}>
                  {hasSpeechAPI ? "Chrome, Firefox, Edge · Говорете на български" :
                   whisperAvailable ? "Записване + Whisper AI · Говорете на български" :
                   "Въведете текст или използвайте клавиатурата"}
                </div>
              </div>
              <button onClick={() => { stopVoice(); setVoiceOpen(false); setManualInput(""); }} style={{ background:"#1e1e2e", color:"#777", border:"1px solid #2a2a40", borderRadius:"7px", width:"28px", height:"28px", cursor:"pointer", fontSize:"17px", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
            </div>
            <div style={{ padding:"20px" }}>

              {/* MODE 1: Native SpeechRecognition (desktop Chrome/Firefox/Edge/macOS Safari) */}
              {/* MODE 2: MediaRecorder + Whisper (iOS Safari, or try on Chrome iOS too) */}
              {(hasSpeechAPI || whisperAvailable) && (
                <>
                  <button onClick={voiceStatus==="listening" ? stopVoice : startVoice}
                    style={{ width:"80px", height:"80px", borderRadius:"50%", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", fontSize:"32px", background: voiceStatus==="listening" ? "#6c63ff" : voiceStatus==="processing" ? "#f59e0b" : "#f5f3ff", boxShadow: voiceStatus==="listening" ? "0 0 0 8px rgba(108,99,255,.2)" : "none", WebkitTapHighlightColor:"transparent" }}>
                    {voiceStatus==="listening" ? "🔴" : voiceStatus==="processing" ? "⏳" : "🎤"}
                  </button>
                  <div style={{ textAlign:"center", fontSize:"13px", color:"#555", marginBottom:"14px", minHeight:"20px" }}>
                    {voiceStatus==="idle"
                      ? (whisperAvailable && !hasSpeechAPI
                          ? "Натисни микрофона, говори, после натисни отново за спиране"
                          : "Натисни микрофона и говори на български")
                      : voiceStatus==="listening"
                      ? (whisperAvailable && !hasSpeechAPI ? "🔴 Записвам... натисни микрофона за край" : "Слушам... говорете ясно")
                      : "Обработвам..."}
                  </div>
                </>
              )}

              {/* MODE 3: Manual text input — shown when no voice API available */}
              {!hasSpeechAPI && !whisperAvailable ? (
                <div style={{ marginBottom:"14px" }}>
                  <div style={{ background:"#fef3c7", border:"1px solid #fcd34d", borderRadius:"8px", padding:"10px 12px", marginBottom:"12px", fontSize:"12px", color:"#78350f" }}>
                    {"Вашият браузър не поддържа гласово разпознаване. Въведете командата с текст или използвайте бутона 🎤 на клавиатурата."}
                  </div>
                  <textarea
                    value={manualInput}
                    onChange={e => setManualInput(e.target.value)}
                    placeholder="Резервация за Иван Петров стая 1.3 от пети май до десети май"
                    style={{ width:"100%", border:"1px solid #dedad4", borderRadius:"8px", padding:"12px", fontSize:"14px", background:"#faf9f7", color:"#111", resize:"none", height:"80px", outline:"none", boxSizing:"border-box" }}
                  />
                  <button onClick={processManualInput} disabled={!manualInput.trim()}
                    style={{ marginTop:"8px", background: manualInput.trim() ? "#6c63ff" : "#ddd", color:"#fff", border:"none", borderRadius:"8px", padding:"10px 16px", fontSize:"13px", fontWeight:"600", cursor: manualInput.trim() ? "pointer" : "not-allowed", width:"100%" }}>
                    Обработи текста
                  </button>
                </div>
              ) : null}

              {transcript && (
                <div style={{ background:"#f5f3ef", borderRadius:"8px", padding:"12px", minHeight:"50px", fontSize:"13px", color:"#333", marginBottom:"14px", border:"1px solid #e5e2dc", fontStyle:"italic" }}>
                  &ldquo;{transcript}&rdquo;
                </div>
              )}
              {voiceParsed && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px", marginBottom:"14px" }}>
                  {([
                    ["Гост", voiceParsed.name],
                    ["Стая", voiceParsed.room || "⚠ Моля, кажете стая"],
                    ["От дата", voiceParsed.start ? fmtS(voiceParsed.start) : null],
                    ["До дата", voiceParsed.end ? fmtS(voiceParsed.end) : null],
                    ["Възрастни", voiceParsed.guests != null ? String(voiceParsed.guests) : null],
                    ["Деца", voiceParsed.children != null ? String(voiceParsed.children) : null],
                    ["Телефон", voiceParsed.phone],
                    ["Email", voiceParsed.email],
                    ["Цена/нощ", voiceParsed.pricePerNight != null ? `€${voiceParsed.pricePerNight}` : null],
                    ["Пристигане", voiceParsed.arrivalTime],
                    ["Заминаване", voiceParsed.departureTime],
                    ["Източник", voiceParsed.source],
                    ["Бележки", voiceParsed.notes],
                  ] as [string, string | null][]).filter(([,v]) => v != null).map(([lbl, val]) => {
                    const isRoomWarning = lbl === "Стая" && !voiceParsed.room;
                    return (
                    <div key={lbl} style={{
                      background: isRoomWarning ? "#fff0f0" : "#f0efff",
                      borderRadius:"7px", padding:"8px 11px",
                      border: isRoomWarning ? "1px solid #ffb3b3" : "1px solid #ddd3fe",
                      ...((lbl === "Бележки" || lbl === "Източник") ? { gridColumn: "1 / -1" } : {})
                    }}>
                      <div style={{ fontSize:"10px", fontWeight:"700", color: isRoomWarning ? "#dc2626" : "#6c63ff", letterSpacing:".3px" }}>{lbl.toUpperCase()}</div>
                      <div style={{ fontSize:"12px", fontWeight:"600", color: isRoomWarning ? "#dc2626" : "#3b0764", marginTop:"3px" }}>{val}</div>
                    </div>
                    );
                  })}
                </div>
              )}
              {!voiceParsed && !transcript && (hasSpeechAPI || whisperAvailable) && (
                <div style={{ background:"#faf9f7", borderRadius:"8px", padding:"12px", border:"1px solid #e5e2dc", marginBottom:"14px" }}>
                  <div style={{ fontSize:"11px", fontWeight:"700", color:"#888", marginBottom:"7px" }}>Примерни команди:</div>
                  {["Резервация за Иван Петров стая 1.3 от пети май до десети май","Запиши Мария Иванова стая 2.4.1 от 12 юни до 15 юни","Нова резервация стая 41.0.2 Georgi Kolev от 3 юли до 7 юли"].map((ex,i) => (
                    <div key={i} style={{ fontSize:"12px", color:"#555", marginBottom:"4px", paddingLeft:"12px", position:"relative" }}>
                      <span style={{ position:"absolute", left:0, color:"#6c63ff" }}>›</span>{ex}
                    </div>
                  ))}
                </div>
              )}
              {/* Manual text fallback — always available as secondary option when using Whisper */}
              {!hasSpeechAPI && whisperAvailable && voiceStatus === "idle" && !voiceParsed && (
                <div style={{ borderTop:"1px solid #eee", paddingTop:"12px", marginBottom:"12px" }}>
                  <div style={{ fontSize:"11px", color:"#888", marginBottom:"6px" }}>Или въведете командата с текст:</div>
                  <div style={{ display:"flex", gap:"6px" }}>
                    <input
                      value={manualInput}
                      onChange={e => setManualInput(e.target.value)}
                      placeholder="Резервация за Иван Петров стая 1.3 от 5 май до 10 май"
                      onKeyDown={e => { if (e.key === "Enter") processManualInput(); }}
                      style={{ flex:1, border:"1px solid #dedad4", borderRadius:"8px", padding:"8px 10px", fontSize:"13px", background:"#faf9f7", color:"#111", outline:"none", boxSizing:"border-box" }}
                    />
                    <button onClick={processManualInput} disabled={!manualInput.trim()}
                      style={{ background: manualInput.trim() ? "#6c63ff" : "#ddd", color:"#fff", border:"none", borderRadius:"8px", padding:"8px 14px", fontSize:"12px", fontWeight:"600", cursor: manualInput.trim() ? "pointer" : "not-allowed", whiteSpace:"nowrap" }}>
                      Обработи
                    </button>
                  </div>
                </div>
              )}
              <div style={{ display:"flex", gap:"8px" }}>
                <button onClick={confirmVoice} disabled={!voiceParsed}
                  style={{ background: voiceParsed ? "#6c63ff" : "#ddd", color:"#fff", border:"none", borderRadius:"8px", padding:"12px 18px", fontSize:"14px", fontWeight:"600", cursor: voiceParsed ? "pointer" : "not-allowed", flex:1, WebkitTapHighlightColor:"transparent", WebkitAppearance:"none" }}>
                  ✓ Потвърди и продължи
                </button>
                <button onClick={() => { stopVoice(); setVoiceParsed(null); setTranscript(""); setManualInput(""); }} style={{ background:"#f5f3ef", color:"#666", border:"1px solid #dedad4", borderRadius:"8px", padding:"12px 14px", fontSize:"14px", cursor:"pointer", WebkitTapHighlightColor:"transparent", WebkitAppearance:"none" }}>🔄 Опитай пак</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pulse animation */}
      <style dangerouslySetInnerHTML={{__html:`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}} />
    </DashboardShell>
  );
}
