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

const EMPTY_FORM = { guestName:"", phone:"", email:"", roomCode:"", startDate:"", endDate:"", source:"Телефон", notes:"", pricePerNight:80, guests:"2", children:"0", cots:"0", arrivalTime:"14:00", departTime:"11:00", caparoReceived:false, caparoAmount:"" };

// ── main component ────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const now = new Date();
  const [yr, setYr] = useState(now.getFullYear());
  const [mo, setMo] = useState(now.getMonth());
  const [sel, setSel] = useState(toDS(now));
  const [tlAnchor, setTlAnchor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  // v1.2 — User-picked range length for the horizontal room timeline.
  // Default 9 days (matches the legacy hardcoded window).
  const [tlDaysCount, setTlDaysCount] = useState<number>(9);
  const [rooms, setRooms] = useState<any[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [filters, setFilters] = useState({ bk:true, b2:true, ph:true, dr:true, web:true, ab:true });
  const [modal, setModal] = useState(false);
  const [editingRes, setEditingRes] = useState<any>(null); // null = new, object = editing
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceParsed, setVoiceParsed] = useState<any>(null);
  const [voiceStatus, setVoiceStatus] = useState<"idle"|"listening"|"processing">("idle");
  const [transcript, setTranscript] = useState("");
  const recogRef = useRef<any>(null);
  const [cancelConfirm, setCancelConfirm] = useState<any>(null);
  const [detailRes, setDetailRes] = useState<any>(null); // for viewing full details
  const [todayFullScreen, setTodayFullScreen] = useState<"res"|"co"|"arr"|"caparo"|null>(null);
  const [justSaved, setJustSaved] = useState(false); // flash "saved" banner after creation
  const [msgSending, setMsgSending] = useState<"welcome"|"farewell"|null>(null);
  const [msgPreview, setMsgPreview] = useState<{type:"welcome"|"farewell", resId:string, emailHtml:string, emailSubject:string, waText:string, phone:string, email:string}|null>(null);
  const [editableWaText, setEditableWaText] = useState("");
  const [editableEmailHtml, setEditableEmailHtml] = useState("");
  const [editableEmailSubject, setEditableEmailSubject] = useState("");
  const [emailEditMode, setEmailEditMode] = useState(false);
  const [previewTab, setPreviewTab] = useState<"email"|"whatsapp">("email");
  const lastFetchRef = useRef<string>("");
  const [syncing, setSyncing] = useState(false);
  const [autoSync, setAutoSync] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sp_autoSync");
      return saved !== "off"; // default ON
    }
    return true;
  });

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
              if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                new Notification("Нова резервация", {
                  body: `${n.guestName} · Стая ${n.roomCode} · ${n.startDate?.slice(0,10)} – ${n.endDate?.slice(0,10)}`,
                  icon: "/icon-192.png",
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
      const res = await fetch("/api/integrations/beds24/poll");
      if (res.ok) {
        await load();
      }
    } catch { /* non-fatal */ }
    // Auto-send emails (welcome on creation day, farewell on checkout day after 11AM)
    try { await fetch("/api/messages/auto-send"); } catch { /* non-fatal */ }
    // v1.2 — Caparo reminders (2-day no-caparo alerts). Idempotent: the
    // server only reminds reservations it hasn't already reminded.
    try { await fetch("/api/caparo/check-reminders"); } catch { /* non-fatal */ }
    setSyncing(false);
    syncingRef.current = false;
  }, [load]);

  useEffect(() => {
    if (!autoSync) return; // auto-sync disabled — skip polling entirely
    syncNow(); // immediate first sync on page load
    const iv = setInterval(syncNow, 30_000); // every 30 seconds
    return () => clearInterval(iv);
  }, [syncNow, autoSync]);

  // ── Service Worker + Push subscription ──────────────────────────────────
  const [pushState, setPushState] = useState<"loading"|"subscribed"|"unsubscribed"|"unsupported">("loading");
  const swRegRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushState("unsupported");
      return;
    }
    // Register SW + check existing subscription
    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      swRegRef.current = reg;
      const sub = await reg.pushManager.getSubscription();
      setPushState(sub ? "subscribed" : "unsubscribed");
    }).catch(() => setPushState("unsupported"));

    // Also request notification permission
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const togglePush = useCallback(async () => {
    if (!swRegRef.current) return;
    try {
      const reg = swRegRef.current;
      const existing = await reg.pushManager.getSubscription();

      if (existing) {
        // Unsubscribe from the browser's PushManager (stops OS-level pushes
        // for this device immediately) AND wipe EVERY server-side record so
        // no lingering endpoint on another browser / device keeps firing.
        await existing.unsubscribe();
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: true }),
        });
        setPushState("unsubscribed");
      } else {
        // Subscribe
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return;

        const vapidRes = await fetch("/api/push/vapid");
        if (!vapidRes.ok) return;
        const { publicKey } = await vapidRes.json();

        // Convert VAPID key to Uint8Array
        const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);
        const raw = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/") + padding);
        const arr = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: arr,
        });
        const json = sub.toJSON();
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: json.keys,
            label: navigator.userAgent.slice(0, 80),
          }),
        });
        setPushState("subscribed");
      }
    } catch (e) {
      console.error("[push] toggle failed:", e);
    }
  }, []);

  // ── ALERT notifications — poll for urgent alerts (cots, late check-in) ──
  const [urgentAlerts, setUrgentAlerts] = useState<any[]>([]);
  const seenAlertIdsRef = useRef<Set<string>>(new Set());
  const dismissedAlertIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // v1.2 — FIX for "Push OFF button doesn't work":
    //   Previously this poll fired `new Notification()` every 10s regardless
    //   of the push toggle. That call is a separate browser API from the
    //   Service-Worker PushManager, so unsubscribing didn't silence it.
    //   Now:
    //     (a) skip the poll entirely when autoSync is off (no server load),
    //     (b) even when polling, only fire the system notification when
    //         pushState === "subscribed".
    //   The in-page ALERT banner still renders so staff see urgent items
    //   without being pinged at the OS level.
    if (!autoSync) return;
    const poll = async () => {
      try {
        const res = await fetch("/api/notifications");
        if (!res.ok) return;
        const all: any[] = await res.json();
        const alerts = all.filter((n: any) => n.type === "ALERT");
        // Show undismissed alerts in the banner (always, regardless of push toggle).
        setUrgentAlerts(alerts.filter((a: any) => !dismissedAlertIdsRef.current.has(a.id)));
        // Fire browser system notification ONLY if the user has Push ON.
        if (pushState !== "subscribed") {
          // Still mark as "seen" so a later re-enable doesn't back-fill old alerts.
          for (const a of alerts) seenAlertIdsRef.current.add(a.id);
          return;
        }
        for (const a of alerts) {
          if (seenAlertIdsRef.current.has(a.id)) continue;
          seenAlertIdsRef.current.add(a.id);
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(a.title || "Специално известие", {
              body: a.detail || "",
              icon: "/favicon.ico",
              tag: `alert-${a.id}`,
              requireInteraction: true,
            });
          }
        }
      } catch {}
    };
    poll(); // immediate
    const iv = setInterval(poll, 10_000);
    return () => clearInterval(iv);
  }, [autoSync, pushState]);

  const dismissAlert = useCallback((id: string) => {
    dismissedAlertIdsRef.current.add(id);
    setUrgentAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  // ── Open voice modal from URL query param (?voice=1) ────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("voice") === "1") {
      setVoiceOpen(true);
      window.history.replaceState({}, "", "/dashboard/calendar");
    }
  }, []);

  // v1.2 — Open a reservation directly from the sidebar guest search.
  // Waits until `reservations` is loaded so we can resolve the id to an
  // actual row and hydrate the edit modal.
  useEffect(() => {
    if (!reservations || !reservations.length) return;
    const params = new URLSearchParams(window.location.search);
    const openId = params.get("open");
    if (!openId) return;
    const res = reservations.find(r => r.id === openId);
    if (res) {
      openEditRes(res);
      window.history.replaceState({}, "", "/dashboard/calendar");
    }
  }, [reservations]);

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
        cots: voiceParsed?.cots != null ? String(voiceParsed.cots) : "0",
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
        cots: String(editingRes.cots || 0),
        arrivalTime: editingRes.arrivalTime || "14:00",
        departTime: editingRes.departTime || "11:00",
        caparoReceived: editingRes.caparoReceived === true,
        caparoAmount: editingRes.caparoAmount != null ? String(editingRes.caparoAmount) : "",
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
    if (r.source==="Airbnb"  && !filters.ab) return false;
    return true;
  }), [reservations, filters]);

  const activeOn  = useCallback((ds: string) => visRes.filter(r => inRange(ds, r)), [visRes]);
  const checkouts = useCallback((ds: string) => visRes.filter(r => r.endDate.slice(0,10) === ds), [visRes]);
  // v1.2 — Today's ARRIVALS: reservations whose startDate matches `ds`.
  // Distinct from `activeOn(ds)` which also includes ongoing stays.
  const arrivals  = useCallback((ds: string) => visRes.filter(r => r.startDate.slice(0,10) === ds), [visRes]);

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
    const off = (first.getDay()+6)%7; // days from Mon to first of month
    const daysInMonth = new Date(yr, mo + 1, 0).getDate();
    const totalCells = off + daysInMonth; // leading blanks + actual days
    const rows = Math.ceil(totalCells / 7);
    const start = addD(first, -off);
    return Array.from({length: rows * 7}, (_,i) => addD(start, i));
  }, [yr, mo]);

  // ── timeline ──────────────────────────────────────────────────────────────
  const tlDays = useMemo(() => Array.from({length: Math.max(1, Math.min(60, tlDaysCount))}, (_,i) => addD(tlAnchor, i)), [tlAnchor, tlDaysCount]);

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
    // continuous=true keeps listening through pauses — prevents Chrome
    // from cutting off after the first sentence. User clicks stop to finish.
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    recogRef.current = rec;
    lastTranscriptRef.current = "";
    setVoiceStatus("listening");
    setTranscript("");

    rec.onresult = (e: any) => {
      // Accumulate ALL final results (continuous mode fires multiple final chunks)
      let allFinal = "";
      let interimT = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) allFinal += e.results[i][0].transcript;
        else interimT += e.results[i][0].transcript;
      }
      const displayText = (allFinal + (interimT ? " " + interimT : "")).trim();
      if (displayText) {
        setTranscript(displayText);
        lastTranscriptRef.current = allFinal || displayText;
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
      // In continuous mode, onend fires when user clicks stop or on error.
      // Process the accumulated transcript.
      if (lastTranscriptRef.current) {
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
    const payload = {
      ...form,
      guests: Number(form.guests)||1,
      children: Number(form.children)||0,
      cots: Number(form.cots)||0,
      pricePerNight: Number(form.pricePerNight)||0,
      // v1.2 — Caparo: ensure boolean + numeric coercion before send.
      caparoReceived: form.caparoReceived === true,
      caparoAmount: form.caparoAmount !== "" && form.caparoAmount != null
        ? Number(form.caparoAmount) : null,
    };

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
      const saved = await res.json();
      setVoiceParsed(null);
      await load();
      if (editingRes) {
        // Was editing — close modal
        setModal(false); setEditingRes(null);
        setForm({...EMPTY_FORM});
        setJustSaved(false);
      } else {
        // Was creating — switch to editing mode so message buttons appear
        setEditingRes(saved);
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 8000);
      }
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

  // ── change guest language on reservation ─────────────────────────────────
  async function changeGuestLang(resId: string, lang: string) {
    await fetch(`/api/reservations/${resId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestLang: lang }),
    });
    if (editingRes) setEditingRes({ ...editingRes, guestLang: lang });
  }

  // ── open message preview modal ──────────────────────────────────────────
  async function openMsgPreview(resId: string, type: "welcome" | "farewell") {
    setMsgSending(type);
    try {
      const resp = await fetch("/api/messages/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: resId, type }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        alert(data.error || "Грешка при зареждане на шаблон");
        setMsgSending(null);
        return;
      }
      setMsgPreview({ type, resId, emailHtml: data.emailHtml, emailSubject: data.emailSubject, waText: data.waText, phone: data.phone, email: data.email });
      setEditableWaText(data.waText);
      setEditableEmailHtml(data.emailHtml);
      setEditableEmailSubject(data.emailSubject);
      setEmailEditMode(false);
      setPreviewTab("email");
    } catch (e: any) {
      alert("Грешка: " + (e.message || "Неуспешно зареждане"));
    }
    setMsgSending(null);
  }

  // ── send email from preview modal ─────────────────────────────────────────
  async function sendEmailFromPreview() {
    if (!msgPreview) return;
    setMsgSending(msgPreview.type);
    try {
      const resp = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: msgPreview.resId,
          type: msgPreview.type,
          customWaText: editableWaText,
          ...(emailEditMode ? { customHtml: editableEmailHtml, customSubject: editableEmailSubject } : {}),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        alert(data.error || "Грешка при изпращане");
        setMsgSending(null);
        return;
      }
      const parts: string[] = [];
      if (data.emailSent) parts.push("Email изпратен успешно");
      if (data.emailError) parts.push("Email: " + data.emailError);
      alert(parts.join("\n"));
      await load();
    } catch (e: any) {
      alert("Грешка: " + (e.message || "Неуспешно изпращане"));
    }
    setMsgSending(null);
  }

  // ── open WhatsApp with edited text ────────────────────────────────────────
  function openWhatsAppFromPreview() {
    if (!msgPreview || !msgPreview.phone) {
      alert("Няма телефонен номер");
      return;
    }
    const cleaned = msgPreview.phone.replace(/[^\d+]/g, "").replace(/^\+/, "");
    const url = `https://wa.me/${cleaned}?text=${encodeURIComponent(editableWaText)}`;
    window.open(url, "_blank");
  }

  const activeToday = activeOn(sel);
  const coToday = checkouts(sel);
  const arrivalsToday = arrivals(sel);
  const todayStr = toDS(now);
  const activeTodayReal = activeOn(todayStr);
  const coTodayReal = checkouts(todayStr);
  const arrivalsTodayReal = arrivals(todayStr);

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
      onTodayArrivals={() => setTodayFullScreen("arr")}
      onTodayCo={() => setTodayFullScreen("co")}
      onPendingCaparo={() => setTodayFullScreen("caparo")}
      onVoice={() => setVoiceOpen(true)}
    >
      <style dangerouslySetInnerHTML={{__html: mobileCSS}} />
      {/* ── URGENT ALERT BANNER ──────────────────────────────────────── */}
      {urgentAlerts.length > 0 && (
        <div style={{ background:"#fef2f2", borderBottom:"2px solid #f87171", padding:"0" }}>
          {urgentAlerts.map((a: any) => (
            <div key={a.id} style={{ display:"flex", alignItems:"center", gap:"10px", padding:"10px 18px", borderBottom:"1px solid #fecaca" }}>
              <span style={{ fontSize:"20px", lineHeight:1 }}>⚠</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:"14px", color:"#991b1b" }}>{a.title?.replace(/^⚠\s*/, "")}</div>
                <div style={{ fontSize:"13px", color:"#b91c1c", marginTop:"2px" }}>{a.detail}</div>
              </div>
              <button
                onClick={() => dismissAlert(a.id)}
                style={{ background:"#fff", border:"1px solid #fca5a5", borderRadius:"6px", padding:"4px 12px", fontSize:"12px", color:"#991b1b", cursor:"pointer", fontWeight:600, whiteSpace:"nowrap" }}
              >
                OK
              </button>
            </div>
          ))}
        </div>
      )}
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
            {(["bk","b2","ph","dr","web","ab"] as const).map((k) => {
              const labels = { bk:"Booking.com", b2:"Beds24", ph:"Телефон", dr:"Директна", web:"Уебсайт", ab:"Airbnb" };
              return (
                <button key={k} onClick={() => setFilters(f => ({...f, [k]:!f[k]}))}
                  style={{ border:"1px solid #dedad4", borderRadius:"7px", padding:"5px 10px", fontSize:"11px", background: filters[k] ? "#f0efff" : "#fff", color: filters[k] ? "#6c63ff" : "#555", cursor:"pointer", borderColor: filters[k] ? "#6c63ff" : "#dedad4" }}>
                  {labels[k]}
                </button>
              );
            })}
            <div style={{ display:"flex", alignItems:"center", gap:"5px", background: autoSync ? "#f0fdf4" : "#fef2f2", border: `1px solid ${autoSync ? "#bbf7d0" : "#fecaca"}`, borderRadius:"7px", padding:"5px 10px", fontSize:"11px", color: autoSync ? "#15803d" : "#991b1b", cursor:"pointer", userSelect:"none" }}
              onClick={() => { const next = !autoSync; setAutoSync(next); localStorage.setItem("sp_autoSync", next ? "on" : "off"); }}
              title={autoSync ? "Натисни за изключване на авто-синхронизация" : "Натисни за включване на авто-синхронизация"}>
              <div style={{ width:"6px", height:"6px", borderRadius:"50%", background: autoSync ? "#22c55e" : "#ef4444", animation: autoSync ? "pulse 2s infinite" : "none" }} />
              {autoSync ? "Auto · 30с" : "Auto · Изкл."}
            </div>
            <button onClick={syncNow} disabled={syncing}
              style={{ background: syncing ? "#fef3c7" : "#eff6ff", color: syncing ? "#92400e" : "#1d4ed8", border: `1px solid ${syncing ? "#fcd34d" : "#93c5fd"}`, borderRadius:"7px", padding:"5px 12px", fontSize:"11px", fontWeight:"600", cursor: syncing ? "default" : "pointer", opacity: syncing ? 0.8 : 1 }}>
              {syncing ? "Синхр..." : "Sync"}
            </button>
            {pushState !== "unsupported" && (
              <button onClick={togglePush} disabled={pushState === "loading"}
                style={{ background: pushState === "subscribed" ? "#f0fdf4" : "#fef2f2", color: pushState === "subscribed" ? "#15803d" : "#991b1b", border: `1px solid ${pushState === "subscribed" ? "#bbf7d0" : "#fecaca"}`, borderRadius:"7px", padding:"5px 10px", fontSize:"11px", cursor:"pointer", fontWeight:600 }}
                title={pushState === "subscribed" ? "Push известия включени — натисни за изключване" : "Включи push известия на това устройство"}>
                {pushState === "subscribed" ? "Push ON" : pushState === "loading" ? "..." : "Push OFF"}
              </button>
            )}
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
                const dr = outside ? [] : activeOn(ds);
                if (outside) return (
                  <div key={ds} style={{ borderRight:"1px solid #f0ede8", borderBottom:"1px solid #f0ede8", minHeight:"120px", background:"#fafaf8" }} />
                );
                return (
                  <div key={ds} onClick={() => { setSel(ds); openNewRes(ds); }}
                    style={{ borderRight:"1px solid #f0ede8", borderBottom:"1px solid #f0ede8", padding:"7px 6px", minHeight:"120px", cursor:"pointer", background: isSel ? "#f0efff" : "white", outline: isSel ? "2px solid #6c63ff" : "none", outlineOffset:"-2px", transition:"background .1s" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"5px" }}>
                      <span style={{ fontSize:"12px", fontWeight:"600", color: isToday ? "#fff" : outside ? "#bbb" : "#333", background: isToday ? "#6c63ff" : "transparent", borderRadius: isToday ? "50%" : "0", width: isToday ? "21px" : "auto", height: isToday ? "21px" : "auto", display:"flex", alignItems:"center", justifyContent:"center" }}>{dt.getDate()}</span>
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
            <div style={{ padding:"11px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid #eee", background:"#faf9f7", flexWrap:"wrap", gap:"8px" }}>
              <span style={{ fontSize:"13px", fontWeight:"700" }}>Стаи · хоризонтален изглед</span>
              {/* v1.2 — Date-range jump tool: pick any FROM date and a number
                  of days to show (1–60). Overrides the default 9-day window
                  and the ± 3-day step pagination. */}
              <div style={{ display:"flex", gap:"6px", alignItems:"center", flexWrap:"wrap" }}>
                <label style={{ fontSize:"10px", fontWeight:"600", color:"#888", textTransform:"uppercase", letterSpacing:".03em" }}>
                  От&nbsp;
                  <input type="date" value={toDS(tlAnchor)}
                    onChange={e => { const v = e.target.value; if (v) setTlAnchor(new Date(v + "T12:00:00")); }}
                    style={{ height:"26px", border:"1px solid #dedad4", borderRadius:"6px", padding:"0 7px", fontSize:"11px", background:"#fff", color:"#111" }} />
                </label>
                <label style={{ fontSize:"10px", fontWeight:"600", color:"#888", textTransform:"uppercase", letterSpacing:".03em" }}>
                  До&nbsp;
                  <input type="date" value={toDS(addD(tlAnchor, Math.max(0, tlDaysCount - 1)))}
                    onChange={e => {
                      const v = e.target.value;
                      if (!v) return;
                      const end = new Date(v + "T12:00:00");
                      const diff = Math.ceil((end.getTime() - tlAnchor.getTime()) / 86400000) + 1;
                      if (diff >= 1 && diff <= 60) setTlDaysCount(diff);
                      else if (diff < 1) { setTlAnchor(end); setTlDaysCount(1); }
                    }}
                    style={{ height:"26px", border:"1px solid #dedad4", borderRadius:"6px", padding:"0 7px", fontSize:"11px", background:"#fff", color:"#111" }} />
                </label>
                <select value={tlDaysCount} onChange={e => setTlDaysCount(parseInt(e.target.value, 10))}
                  style={{ height:"26px", border:"1px solid #dedad4", borderRadius:"6px", padding:"0 7px", fontSize:"11px", background:"#fff", color:"#111" }}>
                  {[7, 9, 14, 21, 30].map(n => <option key={n} value={n}>{n} дни</option>)}
                </select>
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
                  Гласово попълване
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
                    { label:"Кошари (до 3г.)", id:"cots", placeholder:"0", type:"number" },
                    { label:"Дата начало", id:"startDate", type:"date" },
                    { label:"Дата край", id:"endDate", type:"date" },
                    { label:"Час пристигане", id:"arrivalTime", type:"time" },
                    { label:"Час заминаване", id:"departTime", type:"time" },
                    { label:"Цена / нощ (€)", id:"pricePerNight", type:"number" },
                  ].map(f => (
                    <div key={f.id} style={f.span ? {gridColumn:"1 / -1"} : {}}>
                      <label style={{ fontSize:"11px", fontWeight:"700", color:"#888", display:"block", marginBottom:"4px" }}>{f.label.toUpperCase()}</label>
                      <input type={f.type||"text"} placeholder={f.placeholder||""} value={form[f.id]||""}
                        // endDate: set min to startDate so the picker opens near that month
                        {...(f.id === "endDate" && form.startDate ? { min: form.startDate } : {})}
                        onChange={e => {
                          const val = e.target.value;
                          setForm((prev:any) => {
                            const next = {...prev, [f.id]: val};
                            // When startDate changes, auto-advance endDate if it's empty or before new startDate
                            if (f.id === "startDate" && val) {
                              if (!prev.endDate || prev.endDate <= val) {
                                const nextDay = new Date(val + "T00:00:00");
                                nextDay.setDate(nextDay.getDate() + 1);
                                next.endDate = `${nextDay.getFullYear()}-${String(nextDay.getMonth()+1).padStart(2,"0")}-${String(nextDay.getDate()).padStart(2,"0")}`;
                              }
                            }
                            return next;
                          });
                        }}
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
                      {!editingRes && voiceParsed?.room && !availableRooms.find((r:any) => r.code === form.roomCode) && form.roomCode && (
                        <option value={form.roomCode}>{form.roomCode} (от глас)</option>
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
                {/* v1.2 — CAPARO (deposit). Tick when received + write the
                    amount. Used by the "Чакащо капаро" sidebar tab to chase
                    overdue deposits. */}
                <div style={{ marginTop:"9px", background: form.caparoReceived ? "#f0fdf4" : "#fff8ee", border:`1px solid ${form.caparoReceived ? "#bbf7d0" : "#fde68a"}`, borderRadius:"8px", padding:"10px 13px" }}>
                  <label style={{ display:"flex", alignItems:"center", gap:"8px", cursor:"pointer" }}>
                    <input type="checkbox" checked={form.caparoReceived === true}
                      onChange={e => setForm((f:any) => ({...f, caparoReceived: e.target.checked}))} />
                    <span style={{ fontSize:"12.5px", fontWeight:"700", color: form.caparoReceived ? "#166534" : "#92400e", letterSpacing:".02em" }}>
                      {form.caparoReceived ? "✓ Капаро получено" : "Капаро получено?"}
                    </span>
                  </label>
                  {form.caparoReceived && (
                    <div style={{ marginTop:"8px", display:"flex", alignItems:"center", gap:"8px" }}>
                      <label style={{ fontSize:"11px", fontWeight:"600", color:"#666" }}>Сума €</label>
                      <input type="number" min="0" step="0.01" value={form.caparoAmount}
                        onChange={e => setForm((f:any) => ({...f, caparoAmount: e.target.value}))}
                        placeholder="0.00"
                        style={{ flex:1, height:"30px", border:"1px solid #dedad4", borderRadius:"6px", padding:"0 9px", fontSize:"13px", background:"#fff", color:"#111", outline:"none" }} />
                    </div>
                  )}
                </div>
                <div style={{ background:"#f5f3ff", border:"1px solid #ddd3fe", borderRadius:"8px", padding:"9px 13px", marginTop:"9px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ fontSize:"12px", color:"#6c63ff" }}>
                    {nights} нощи · {Number(form.guests)||0} възр. · {Number(form.children)||0} деца{(Number(form.children)||0) > 0 ? ` (+€${((Number(form.children)||0) * 12.5).toFixed(2)}/нощ)` : ""}{(Number(form.cots)||0) > 0 ? ` · ${Number(form.cots)} кош. (+€${((Number(form.cots)||0) * 25).toFixed(2)}/нощ)` : ""}
                  </div>
                  <div style={{ fontSize:"19px", fontWeight:"700", color:"#4c1d95" }}>€{Math.round(((Number(form.pricePerNight)||0) + (Number(form.children)||0) * 12.5 + (Number(form.cots)||0) * 25) * nights)}</div>
                </div>
                <div style={{ display:"flex", gap:"7px", marginTop:"11px", flexWrap:"wrap" }}>
                  <button onClick={saveRes} style={{ background:"#6c63ff", color:"#fff", border:"none", borderRadius:"8px", padding:"9px 18px", fontSize:"13px", fontWeight:"600", cursor:"pointer" }}>
                    {editingRes ? "Запази промените" : "Запази резервацията"}
                  </button>
                  {editingRes && (
                    <button onClick={() => setCancelConfirm(editingRes)} style={{ background:"#fee2e2", color:"#dc2626", border:"1px solid #fca5a5", borderRadius:"8px", padding:"9px 14px", fontSize:"13px", cursor:"pointer", fontWeight:"600" }}>
                      Анулирай
                    </button>
                  )}
                  <button onClick={() => { setModal(false); setEditingRes(null); setVoiceParsed(null); }} style={{ background:"#f5f3ef", color:"#666", border:"1px solid #dedad4", borderRadius:"8px", padding:"9px 14px", fontSize:"13px", cursor:"pointer" }}>Затвори</button>
                </div>
                {/* ── "Just saved" banner after creating ── */}
                {justSaved && editingRes && (
                  <div style={{ marginTop:"9px", background:"#f0fdf4", border:"1px solid #86efac", borderRadius:"8px", padding:"10px 13px", display:"flex", alignItems:"center", gap:"8px" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    <span style={{ fontSize:"13px", fontWeight:"700", color:"#15803d" }}>Резервацията е запазена! Можете да изпратите съобщение на госта.</span>
                  </div>
                )}
                {/* ── Message buttons (only when editing existing reservation) ── */}
                {editingRes && editingRes.status !== "CANCELLED" && (
                  <div style={{ marginTop:"11px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:"8px", padding:"10px 13px" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"8px" }}>
                      <div style={{ fontSize:"11px", fontWeight:"700", color:"#15803d", letterSpacing:".3px" }}>СЪОБЩЕНИЯ</div>
                      <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                        <label style={{ fontSize:"11px", color:"#6b7280" }}>Език:</label>
                        <select
                          value={editingRes.guestLang || "en"}
                          onChange={(e) => changeGuestLang(editingRes.id, e.target.value)}
                          style={{ fontSize:"12px", padding:"3px 6px", borderRadius:"6px", border:"1px solid #bbf7d0", background:"#fff", color:"#122943", cursor:"pointer" }}>
                          <option value="en">🇬🇧 English</option>
                          <option value="bg">🇧🇬 Български</option>
                          <option value="de">🇩🇪 Deutsch</option>
                          <option value="fr">🇫🇷 Français</option>
                          <option value="ru">🇷🇺 Русский</option>
                          <option value="uk">🇺🇦 Українська</option>
                          <option value="no">🇳🇴 Norsk</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:"7px", flexWrap:"wrap", alignItems:"center" }}>
                      <button
                        disabled={msgSending === "welcome"}
                        onClick={() => openMsgPreview(editingRes.id, "welcome")}
                        style={{ background:"#122943", color:"#C9A84C", border:"none", borderRadius:"8px", padding:"8px 14px", fontSize:"12px", fontWeight:"600", cursor: msgSending === "welcome" ? "wait" : "pointer", opacity: msgSending === "welcome" ? .6 : 1, display:"flex", alignItems:"center", gap:"6px" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                        {msgSending === "welcome" ? "Зареждане..." : "Добре дошли"}
                      </button>
                      <button
                        disabled={msgSending === "farewell"}
                        onClick={() => openMsgPreview(editingRes.id, "farewell")}
                        style={{ background:"#C9A84C", color:"#122943", border:"none", borderRadius:"8px", padding:"8px 14px", fontSize:"12px", fontWeight:"600", cursor: msgSending === "farewell" ? "wait" : "pointer", opacity: msgSending === "farewell" ? .6 : 1, display:"flex", alignItems:"center", gap:"6px" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        {msgSending === "farewell" ? "Зареждане..." : "Сбогуване"}
                      </button>
                    </div>
                    {/* Sent status indicators */}
                    <div style={{ display:"flex", gap:"12px", marginTop:"8px", fontSize:"11px", color:"#6b7280" }}>
                      {editingRes.welcomeSentAt && (
                        <span style={{ color:"#15803d" }}>Добре дошли: изпратено {new Date(editingRes.welcomeSentAt).toLocaleDateString("bg-BG")} {new Date(editingRes.welcomeSentAt).toLocaleTimeString("bg-BG", { hour:"2-digit", minute:"2-digit" })}</span>
                      )}
                      {editingRes.farewellSentAt && (
                        <span style={{ color:"#15803d" }}>Сбогуване: изпратено {new Date(editingRes.farewellSentAt).toLocaleDateString("bg-BG")} {new Date(editingRes.farewellSentAt).toLocaleTimeString("bg-BG", { hour:"2-digit", minute:"2-digit" })}</span>
                      )}
                    </div>
                  </div>
                )}
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
                      <div key={r.id} onClick={(e) => { e.stopPropagation(); setModal(false); setEditingRes(null); setTimeout(() => openEditRes(r), 100); }}
                        style={{ display:"flex", alignItems:"center", gap:"8px", padding:"8px 10px", background:"#fffbf0", borderRadius:"8px", marginBottom:"6px", borderLeft:"3px solid #f59e0b", cursor:"pointer" }}>
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
            <div style={{ marginBottom:"16px" }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
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
              {todayFullScreen === "res"
                ? `Резервации за ${fmtS(sel)}`
                : todayFullScreen === "arr"
                  ? `Пристигащи за ${fmtS(sel)}`
                  : todayFullScreen === "caparo"
                    ? "Чакащо капаро"
                    : `Освобождавания за ${fmtS(sel)}`}
            </span>
            <button onClick={() => setTodayFullScreen(null)}
              style={{ background:"#1e1e2e", color:"#fff", border:"1px solid #2a2a40", borderRadius:"7px", width:"32px", height:"32px", cursor:"pointer", fontSize:"18px" }}>×</button>
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"16px" }}>
            {todayFullScreen === "caparo" ? (
              (() => {
                // v1.2 — Pending caparo = confirmed reservations where
                // caparoReceived is still false. Sorted oldest-first so
                // the most overdue ones surface at the top.
                const pending = reservations
                  .filter((r: any) => r.status === "CONFIRMED" && r.caparoReceived !== true)
                  .sort((a: any, b: any) => (a.createdAt || "").localeCompare(b.createdAt || ""));
                if (pending.length === 0) {
                  return <div style={{ color:"#bbb", padding:"24px", textAlign:"center" }}>Няма чакащи капара 🎉</div>;
                }
                return pending.map((r: any) => {
                  const ageMs = r.createdAt ? (Date.now() - new Date(r.createdAt).getTime()) : 0;
                  const ageDays = Math.floor(ageMs / 86400000);
                  const overdue = ageDays >= 2;
                  return (
                    <div key={r.id} onClick={() => { setTodayFullScreen(null); openEditRes(r); }}
                      style={{ borderRadius:"12px", padding:"14px 16px", marginBottom:"10px", background: overdue ? "#fef2f2" : "#fffbf0", border:`1px solid ${overdue ? "#fecaca" : "#fde68a"}`, borderLeft:`4px solid ${overdue ? "#e11d48" : "#f59e0b"}`, cursor:"pointer" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"6px" }}>
                        <div style={{ width:"36px", height:"36px", borderRadius:"50%", background: overdue ? "#e11d48" : "#f59e0b", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"14px", fontWeight:"700" }}>{(r.guestName||"?")[0]}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:"15px", fontWeight:"700", color:"#111" }}>{r.guestName}</div>
                          <div style={{ fontSize:"12px", color:"#888" }}>Стая {r.roomCode} · {r.source}</div>
                        </div>
                        <div style={{ fontSize:"11px", padding:"3px 9px", borderRadius:"999px", background: overdue ? "#e11d48" : "#f59e0b", color:"#fff", fontWeight:"600" }}>
                          {ageDays === 0 ? "днес" : ageDays === 1 ? "преди 1 ден" : `преди ${ageDays} дни`}
                        </div>
                      </div>
                      <div style={{ fontSize:"12px", color:"#666" }}>{fmtS(r.startDate.slice(0,10))} — {fmtS(r.endDate.slice(0,10))}{r.phone ? ` · ${r.phone}` : ""}</div>
                      {overdue && (
                        <div style={{ marginTop:"8px", fontSize:"11px", color:"#9f1239", fontWeight:"600" }}>
                          ⚠ Над 2 дни без капаро — време е да напомниш
                        </div>
                      )}
                    </div>
                  );
                });
              })()
            ) : todayFullScreen === "arr" ? (
              arrivalsToday.length === 0 ? <div style={{ color:"#bbb", padding:"20px", textAlign:"center" }}>Няма пристигащи за този ден.</div> :
              arrivalsToday.map(r => {
                const cs = resStyle(r);
                return (
                  <div key={r.id} onClick={() => { setTodayFullScreen(null); openEditRes(r); }}
                    style={{ borderRadius:"12px", padding:"14px 16px", marginBottom:"10px", background:cs.bg, border:`1px solid ${cs.bd}`, borderLeft:`4px solid ${cs.bd}`, color:cs.tx, cursor:"pointer" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"8px" }}>
                      <div style={{ width:"36px", height:"36px", borderRadius:"50%", background:cs.bd, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"14px", fontWeight:"700", color:"#fff" }}>{(r.guestName||"?")[0]}</div>
                      <div>
                        <div style={{ fontSize:"16px", fontWeight:"700" }}>{r.guestName}</div>
                        <div style={{ fontSize:"13px", opacity:.75 }}>Стая {r.roomCode} · Вход {r.room?.entrance || ""}</div>
                      </div>
                    </div>
                    <div style={{ fontSize:"13px", opacity:.7 }}>{r.phone} · {r.email || ""}</div>
                    <div style={{ fontSize:"13px", opacity:.7, marginTop:"4px" }}>{fmtS(r.startDate.slice(0,10))} — {fmtS(r.endDate.slice(0,10))} · {r.source}</div>
                    {r.arrivalTime && <div style={{ fontSize:"12px", opacity:.8, marginTop:"4px", fontWeight:"600" }}>🕒 Пристига: {r.arrivalTime}</div>}
                    {r.notes && <div style={{ fontSize:"12px", opacity:.6, marginTop:"4px", fontStyle:"italic" }}>{r.notes}</div>}
                    <div style={{ display:"flex", gap:"8px", marginTop:"10px" }}>
                      <span style={{ fontSize:"11px", padding:"3px 8px", borderRadius:"5px", background:cs.bd, color:"#fff" }}>{r.source}</span>
                    </div>
                  </div>
                );
              })
            ) : todayFullScreen === "res" ? (
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

      {/* ═══════════ MESSAGE PREVIEW MODAL ═══════════ */}
      {msgPreview && (
        <div style={{ position:"fixed", inset:0, background:"rgba(5,5,15,.65)", display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"24px 14px", zIndex:115, overflowY:"auto" }}
          onClick={e => { if (e.currentTarget===e.target) setMsgPreview(null); }}>
          <div style={{ background:"#fff", borderRadius:"14px", width:"720px", maxWidth:"100%", overflow:"hidden", border:"1px solid #dedad4", boxShadow:"0 20px 60px rgba(0,0,0,.3)", maxHeight:"90vh", display:"flex", flexDirection:"column" }}>
            {/* Header */}
            <div style={{ background:"#122943", padding:"15px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
              <div>
                <div style={{ fontSize:"15px", fontWeight:"700", color:"#C9A84C" }}>
                  {msgPreview.type === "welcome" ? "Добре дошли — преглед" : "Сбогуване — преглед"}
                </div>
                <div style={{ fontSize:"11px", color:"rgba(255,253,248,0.5)", marginTop:"2px" }}>
                  {msgPreview.email && `Email: ${msgPreview.email}`}{msgPreview.email && msgPreview.phone ? " · " : ""}{msgPreview.phone && `Тел: ${msgPreview.phone}`}
                </div>
              </div>
              <button onClick={() => setMsgPreview(null)} style={{ background:"#1a3556", color:"#C9A84C", border:"1px solid rgba(201,168,76,0.3)", borderRadius:"7px", width:"28px", height:"28px", cursor:"pointer", fontSize:"17px", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
            </div>

            {/* Tabs */}
            <div style={{ display:"flex", borderBottom:"1px solid #e5e2da", flexShrink:0 }}>
              <button onClick={() => setPreviewTab("email")}
                style={{ flex:1, padding:"10px", fontSize:"13px", fontWeight:"600", background: previewTab === "email" ? "#fffdf8" : "#f5f3ee", color: previewTab === "email" ? "#122943" : "#999", border:"none", borderBottom: previewTab === "email" ? "2px solid #C9A84C" : "2px solid transparent", cursor:"pointer" }}>
                Email
              </button>
              <button onClick={() => setPreviewTab("whatsapp")}
                style={{ flex:1, padding:"10px", fontSize:"13px", fontWeight:"600", background: previewTab === "whatsapp" ? "#fffdf8" : "#f5f3ee", color: previewTab === "whatsapp" ? "#122943" : "#999", border:"none", borderBottom: previewTab === "whatsapp" ? "2px solid #25d366" : "2px solid transparent", cursor:"pointer" }}>
                WhatsApp
              </button>
            </div>

            {/* Content */}
            <div style={{ flex:1, overflow:"auto" }}>
              {previewTab === "email" ? (
                <div style={{ padding:"0" }}>
                  <div style={{ padding:"12px 16px", fontSize:"12px", color:"#6b7280", background:"#f9f8f5", borderBottom:"1px solid #e5e2da", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"8px" }}>
                    {emailEditMode ? (
                      <div style={{ flex:1 }}>
                        <label style={{ fontSize:"11px", fontWeight:"600", color:"#6b7280" }}>Тема:</label>
                        <input value={editableEmailSubject} onChange={e => setEditableEmailSubject(e.target.value)}
                          style={{ width:"100%", padding:"6px 8px", fontSize:"12px", border:"1px solid #d1d5db", borderRadius:"6px", marginTop:"3px" }} />
                      </div>
                    ) : (
                      <div><strong>Тема:</strong> {editableEmailSubject}</div>
                    )}
                    <button onClick={() => setEmailEditMode(!emailEditMode)}
                      style={{ background: emailEditMode ? "#122943" : "#f3f4f6", color: emailEditMode ? "#C9A84C" : "#6b7280", border:"1px solid #d1d5db", borderRadius:"6px", padding:"5px 10px", fontSize:"11px", fontWeight:"600", cursor:"pointer", whiteSpace:"nowrap" }}>
                      {emailEditMode ? "Преглед" : "Редактирай"}
                    </button>
                  </div>
                  {emailEditMode ? (
                    <textarea
                      value={editableEmailHtml}
                      onChange={e => setEditableEmailHtml(e.target.value)}
                      style={{ width:"100%", height:"520px", padding:"12px", fontSize:"13px", fontFamily:"monospace", border:"none", borderTop:"1px solid #e5e2da", resize:"none", color:"#122943", background:"#fffdf8" }}
                    />
                  ) : (
                    <iframe
                      srcDoc={editableEmailHtml}
                      style={{ width:"100%", height:"520px", border:"none" }}
                      sandbox="allow-same-origin"
                      title="Email preview"
                    />
                  )}
                </div>
              ) : (
                <div style={{ padding:"16px" }}>
                  <label style={{ display:"block", fontSize:"12px", fontWeight:"600", color:"#6b7280", marginBottom:"6px" }}>
                    Редактирайте текста преди изпращане:
                  </label>
                  <textarea
                    value={editableWaText}
                    onChange={e => setEditableWaText(e.target.value)}
                    style={{ width:"100%", minHeight:"320px", padding:"14px", fontSize:"14px", lineHeight:"1.7", border:"1px solid #d1d5db", borderRadius:"10px", fontFamily:"system-ui, sans-serif", resize:"vertical", color:"#122943" }}
                  />
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ padding:"14px 16px", borderTop:"1px solid #e5e2da", display:"flex", gap:"10px", flexShrink:0, background:"#faf9f7" }}>
              {previewTab === "email" ? (
                <button
                  disabled={!!msgSending || !msgPreview.email}
                  onClick={sendEmailFromPreview}
                  style={{ flex:1, background:"#122943", color:"#C9A84C", border:"none", borderRadius:"10px", padding:"11px 18px", fontSize:"13px", fontWeight:"700", cursor: msgSending ? "wait" : "pointer", opacity: msgSending ? .6 : 1, display:"flex", alignItems:"center", justifyContent:"center", gap:"8px" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  {msgSending ? "Изпращане..." : msgPreview.email ? "Изпрати Email" : "Няма email адрес"}
                </button>
              ) : (
                <button
                  disabled={!msgPreview.phone}
                  onClick={openWhatsAppFromPreview}
                  style={{ flex:1, background:"#25d366", color:"#fff", border:"none", borderRadius:"10px", padding:"11px 18px", fontSize:"13px", fontWeight:"700", cursor: msgPreview.phone ? "pointer" : "not-allowed", opacity: msgPreview.phone ? 1 : .5, display:"flex", alignItems:"center", justifyContent:"center", gap:"8px" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 0 1-4.243-1.214l-.302-.18-3.13.82.836-3.052-.196-.312A8 8 0 1 1 12 20z"/></svg>
                  {msgPreview.phone ? "Отвори WhatsApp" : "Няма телефонен номер"}
                </button>
              )}
              <button onClick={() => setMsgPreview(null)}
                style={{ background:"#f3f4f6", color:"#6b7280", border:"1px solid #d1d5db", borderRadius:"10px", padding:"11px 18px", fontSize:"13px", fontWeight:"600", cursor:"pointer" }}>
                Затвори
              </button>
            </div>
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
                <div style={{ fontSize:"15px", fontWeight:"700", color:"#fff" }}>Гласово попълване</div>
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
                    {voiceStatus==="listening" ? <svg width="24" height="24" viewBox="0 0 24 24" fill="#ef4444"><circle cx="12" cy="12" r="8"/></svg> : voiceStatus==="processing" ? <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6c63ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>}
                  </button>
                  <div style={{ textAlign:"center", fontSize:"13px", color:"#555", marginBottom:"14px", minHeight:"20px" }}>
                    {voiceStatus==="idle"
                      ? (whisperAvailable && !hasSpeechAPI
                          ? "Натисни микрофона, говори, после натисни отново за спиране"
                          : "Натисни микрофона и говори на български")
                      : voiceStatus==="listening"
                      ? (whisperAvailable && !hasSpeechAPI ? "Записвам... натисни микрофона за край" : "Слушам... говорете ясно")
                      : "Обработвам..."}
                  </div>
                </>
              )}

              {/* MODE 3: Manual text input — shown when no voice API available */}
              {!hasSpeechAPI && !whisperAvailable ? (
                <div style={{ marginBottom:"14px" }}>
                  <div style={{ background:"#fef3c7", border:"1px solid #fcd34d", borderRadius:"8px", padding:"10px 12px", marginBottom:"12px", fontSize:"12px", color:"#78350f" }}>
                    {"Вашият браузър не поддържа гласово разпознаване. Въведете командата с текст."}
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
                    ["Стая", voiceParsed.room || "Моля, кажете стая"],
                    ["От дата", voiceParsed.start ? fmtS(voiceParsed.start) : null],
                    ["До дата", voiceParsed.end ? fmtS(voiceParsed.end) : null],
                    ["Възрастни", voiceParsed.guests != null ? String(voiceParsed.guests) : null],
                    ["Деца", voiceParsed.children != null ? String(voiceParsed.children) : null],
                    ["Кошари", voiceParsed.cots != null ? String(voiceParsed.cots) : null],
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
                  Потвърди и продължи
                </button>
                <button onClick={() => { stopVoice(); setVoiceParsed(null); setTranscript(""); setManualInput(""); }} style={{ background:"#f5f3ef", color:"#666", border:"1px solid #dedad4", borderRadius:"8px", padding:"12px 14px", fontSize:"14px", cursor:"pointer", WebkitTapHighlightColor:"transparent", WebkitAppearance:"none" }}>Опитай пак</button>
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
