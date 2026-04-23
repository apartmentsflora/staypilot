"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const MONTHS_BG = ["Януари","Февруари","Март","Април","Май","Юни","Юли","Август","Септември","Октомври","Ноември","Декември"];

function fmtS(ds: string) {
  const d = new Date(ds + "T00:00:00");
  return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}`;
}

// ── Inline SVG icon components ─────────────────────────────────────────────
// Crisp 16×16 icons — no emoji, no external deps
const Ico = {
  search: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  plus: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  calendar: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  checkin: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>,
  checkout: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  mic: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
  bell: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  sync: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
  finance: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  history: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  settings: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  dashboard: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  logout: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  cancel: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
  confirm: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  imported: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6c63ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  info: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
};

function notifIcon(type: string) {
  if (type === "CANCEL") return Ico.cancel;
  if (type === "NEW") return Ico.confirm;
  if (type === "IMPORT") return Ico.imported;
  return Ico.info;
}

export function DashboardShell({ children, stats, onNewRes, onTodayRes, onTodayArrivals, onTodayCo, onPendingCaparo, onVoice }: {
  children: React.ReactNode;
  stats?: { active: number; occ: number; rev: number; month: number; selFmt: string };
  onNewRes?: () => void;
  onTodayRes?: () => void;
  onTodayArrivals?: () => void;
  onTodayCo?: () => void;
  onPendingCaparo?: () => void;
  onVoice?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidOpen, setSidOpen] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncPct, setSyncPct] = useState(0);
  const [syncVisible, setSyncVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [roomPopup, setRoomPopup] = useState<any>(null);
  const [notifDetail, setNotifDetail] = useState<any>(null);
  const [notifEditForm, setNotifEditForm] = useState<any>(null);
  const [notifEditSaving, setNotifEditSaving] = useState(false);

  useEffect(() => {
    fetch("/api/rooms").then(r => r.json()).then(d => Array.isArray(d) && setRooms(d));
    fetch("/api/reservations?includeCancelled=1").then(r => r.json()).then(d => Array.isArray(d) && setReservations(d));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login"); router.refresh();
  }

  async function openNotif() {
    const data = await fetch("/api/notifications").then(r => r.json());
    setNotifications(Array.isArray(data) ? data : []);
    setNotifOpen(true);
  }

  async function doSync() {
    setSyncMsg("Синхронизация с Beds24, Booking.com и уебсайта...");
    setSyncPct(0); setSyncVisible(true);
    const steps = ["Beds24 API...","Booking.com...","Уебсайт...","Финализиране..."];
    let p = 0; let i = 0;
    const iv = setInterval(() => {
      p += 8;
      setSyncPct(Math.min(p, 100));
      if (p % 25 === 0 && i < steps.length) setSyncMsg(steps[i++]);
      if (p >= 100) {
        clearInterval(iv);
        setSyncMsg("Синхронизацията завърши успешно");
        setTimeout(() => setSyncVisible(false), 3000);
      }
    }, 150);
  }

  async function revertCancel(id: string) {
    await fetch(`/api/reservations/${id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ status:"CONFIRMED" }) });
    const data = await fetch("/api/reservations?includeCancelled=1").then(r => r.json());
    if (Array.isArray(data)) setReservations(data);
    const nd = await fetch("/api/notifications").then(r => r.json());
    if (Array.isArray(nd)) setNotifications(nd);
    setNotifDetail(null);
  }

  async function saveAndRestore(id: string) {
    if (!notifEditForm) return;
    setNotifEditSaving(true);
    try {
      await fetch(`/api/reservations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestName: notifEditForm.guestName,
          phone: notifEditForm.phone,
          email: notifEditForm.email || null,
          roomCode: notifEditForm.roomCode,
          startDate: notifEditForm.startDate,
          endDate: notifEditForm.endDate,
          notes: notifEditForm.notes || null,
          guests: Number(notifEditForm.guests) || 1,
          children: Number(notifEditForm.children) || 0,
          status: "CONFIRMED",
        }),
      });
      const data = await fetch("/api/reservations?includeCancelled=1").then(r => r.json());
      if (Array.isArray(data)) setReservations(data);
      const nd = await fetch("/api/notifications").then(r => r.json());
      if (Array.isArray(nd)) setNotifications(nd);
      setNotifDetail(null);
      setNotifEditForm(null);
    } catch (e) {
      console.error("saveAndRestore error", e);
    }
    setNotifEditSaving(false);
  }

  function openRoomPopup(room: any) {
    const now = new Date();
    const sixMonths = new Date(now);
    sixMonths.setMonth(sixMonths.getMonth() + 6);
    const roomRes = reservations.filter(r =>
      r.roomCode === room.code &&
      r.status !== "CANCELLED" &&
      new Date(r.endDate) >= now &&
      new Date(r.startDate) <= sixMonths
    ).sort((a: any, b: any) => a.startDate.localeCompare(b.startDate));
    setRoomPopup({ ...room, reservations: roomRes });
  }

  const rooms39 = rooms.filter(r => r.entrance === "39").filter(r => !search || r.code.toLowerCase().includes(search.toLowerCase()) || r.label.toLowerCase().includes(search.toLowerCase()));
  const rooms41 = rooms.filter(r => r.entrance === "41").filter(r => !search || r.code.toLowerCase().includes(search.toLowerCase()) || r.label.toLowerCase().includes(search.toLowerCase()));
  // v1.2 — Broaden the sidebar search to also match GUEST names. When the
  // user types a name, show up to 8 matching reservations right under the
  // search box. Clicking one jumps to the calendar page with the reservation
  // id in the URL (`?open=<id>`) so the calendar can auto-open it.
  const searchLc = search.trim().toLowerCase();
  const matchingReservations = searchLc.length >= 2
    ? reservations
        .filter(r => (r.guestName || "").toLowerCase().includes(searchLc))
        .slice(0, 8)
    : [];

  // ── Design tokens ──────────────────────────────────────────────────────────
  const sb = {
    bg: "#fafaf9",
    border: "#e7e5e0",
    card: "#ffffff",
    text: "#2d2d2d",
    muted: "#8c8c8c",
    accent: "#4f46e5",     // deeper indigo — more refined than bright purple
    accentSoft: "#eef2ff",
    hover: "#f5f4ff",
  };

  const btnBase = {
    background: sb.card, color: sb.text, border: `1px solid ${sb.border}`,
    borderRadius: "8px", padding: "9px 12px", fontSize: "12.5px",
    cursor: "pointer", display: "flex", alignItems: "center", gap: "8px",
    width: "100%", whiteSpace: "nowrap" as const, fontWeight: "500" as const,
    letterSpacing: ".01em",
  };

  return (
    <div style={{ display:"flex", height:"100vh", overflow:"hidden", background:"#f4f3ef" }}>
      {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
      <div style={{ width: sidOpen ? "264px" : "0", minWidth: sidOpen ? "264px" : "0", background:sb.bg, color:sb.text, display:"flex", flexDirection:"column", overflow:"hidden", transition:"width .3s cubic-bezier(.4,0,.2,1), min-width .3s cubic-bezier(.4,0,.2,1)", position:"relative", zIndex:20, flexShrink:0, borderRight:`1px solid ${sb.border}` }}>
        <div style={{ width:"264px", display:"flex", flexDirection:"column", height:"100%", overflowY:"auto" }}>

          {/* Brand */}
          <div style={{ padding:"18px 16px 14px", borderBottom:`1px solid ${sb.border}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"14px" }}>
              <div style={{ width:"34px", height:"34px", borderRadius:"8px", background:`linear-gradient(135deg,${sb.accent},#3730a3)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"13px", fontWeight:"700", color:"#fff", flexShrink:0, letterSpacing:".5px" }}>SP</div>
              <div>
                <div style={{ fontSize:"14.5px", fontWeight:"700", color:"#111", whiteSpace:"nowrap", letterSpacing:".02em" }}>StayPilot</div>
                <div style={{ fontSize:"10.5px", color:sb.muted, whiteSpace:"nowrap", letterSpacing:".02em" }}>Flora & Lazur</div>
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:"8px", background:"#fff", border:`1px solid ${sb.border}`, borderRadius:"8px", padding:"7px 10px" }}>
              <span style={{ color:"#b0b0b0", display:"flex", flexShrink:0 }}>{Ico.search}</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Търси стая или гост..." style={{ background:"none", border:"none", outline:"none", color:"#333", fontSize:"12px", width:"100%" }} />
            </div>
            {/* v1.2 — Guest-name search results (up to 8). Click → jump to
                calendar with ?open=<id> so the existing page can auto-open it. */}
            {matchingReservations.length > 0 && (
              <div style={{ marginTop:"8px", background:"#fff", border:`1px solid ${sb.border}`, borderRadius:"8px", overflow:"hidden", maxHeight:"260px", overflowY:"auto" }}>
                <div style={{ padding:"6px 10px", fontSize:"9.5px", fontWeight:"700", color:"#888", letterSpacing:".05em", textTransform:"uppercase", borderBottom:`1px solid ${sb.border}`, background:"#fafaf7" }}>
                  Гости ({matchingReservations.length})
                </div>
                {matchingReservations.map((r: any) => (
                  <button key={r.id}
                    onClick={() => { setSearch(""); router.push(`/dashboard/calendar?open=${encodeURIComponent(r.id)}`); }}
                    style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", padding:"7px 10px", fontSize:"11.5px", color:"#111", cursor:"pointer", borderBottom:"1px solid #f3f1ec" }}>
                    <div style={{ fontWeight:"600", color:"#111", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.guestName}</div>
                    <div style={{ fontSize:"10px", color:"#888", marginTop:"2px" }}>
                      {r.roomCode ? `Стая ${r.roomCode} · ` : ""}
                      {r.startDate ? String(r.startDate).slice(0,10) : ""}
                      {r.endDate ? ` → ${String(r.endDate).slice(0,10)}` : ""}
                      {r.status === "CANCELLED" ? " · анулирана" : ""}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Stats */}
          {stats && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px", padding:"12px 14px", borderBottom:`1px solid ${sb.border}` }}>
              <div style={{ background:sb.card, borderRadius:"8px", padding:"10px 11px", border:`1px solid ${sb.border}` }}>
                <div style={{ fontSize:"19px", fontWeight:"700", color:"#111" }}>{stats.active}</div>
                <div style={{ fontSize:"10.5px", color:sb.muted, marginTop:"2px", letterSpacing:".02em" }}>Активни</div>
                <div style={{ marginTop:"6px", height:"2px", background:"#eee", borderRadius:"1px", overflow:"hidden" }}>
                  <div style={{ height:"100%", borderRadius:"1px", background:sb.accent, width:`${Math.round(stats.active/18*100)}%` }} />
                </div>
              </div>
              <div style={{ background:sb.card, borderRadius:"8px", padding:"10px 11px", border:`1px solid ${sb.border}` }}>
                <div style={{ fontSize:"19px", fontWeight:"700", color:"#111" }}>{stats.occ}%</div>
                <div style={{ fontSize:"10.5px", color:sb.muted, marginTop:"2px", letterSpacing:".02em" }}>Заетост</div>
                <div style={{ marginTop:"6px", height:"2px", background:"#eee", borderRadius:"1px", overflow:"hidden" }}>
                  <div style={{ height:"100%", borderRadius:"1px", background:sb.accent, width:`${stats.occ}%` }} />
                </div>
              </div>
              <div style={{ background:sb.card, borderRadius:"8px", padding:"10px 11px", border:`1px solid ${sb.border}`, gridColumn:"span 2" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontSize:"17px", fontWeight:"700", color:"#111", letterSpacing:".01em" }}>{"\u20AC"}{stats.rev.toLocaleString()}</div>
                    <div style={{ fontSize:"10.5px", color:sb.muted, marginTop:"2px", letterSpacing:".02em" }}>Приходи · {MONTHS_BG[stats.month]}</div>
                  </div>
                  <span style={{ fontSize:"9.5px", padding:"2px 7px", borderRadius:"4px", background:"#f0fdf4", color:"#166534", fontWeight:"600", letterSpacing:".03em" }}>Месечни</span>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ padding:"10px 14px", borderBottom:`1px solid ${sb.border}`, display:"flex", flexDirection:"column", gap:"5px" }}>
            <button onClick={onNewRes || (() => router.push("/dashboard/calendar"))}
              style={{ background:sb.accent, color:"#fff", border:"none", borderRadius:"8px", padding:"10px 12px", fontSize:"12.5px", fontWeight:"600", cursor:"pointer", display:"flex", alignItems:"center", gap:"8px", width:"100%", whiteSpace:"nowrap", letterSpacing:".02em" }}>
              <span style={{ display:"flex" }}>{Ico.plus}</span>Нова резервация
            </button>

            <Link href="/dashboard/calendar" style={{ textDecoration:"none" }}>
              <button style={btnBase}>
                <span style={{ display:"flex", color:sb.muted }}>{Ico.calendar}</span>Календар
              </button>
            </Link>

            <button onClick={onTodayRes || (() => {})} style={{ ...btnBase, color:"#166534", borderColor:"#bbf7d0" }}>
              <span style={{ display:"flex", color:"#16a34a" }}>{Ico.checkin}</span>Днешни резервации
            </button>

            <button onClick={onTodayArrivals || (() => {})} style={{ ...btnBase, color:"#1e40af", borderColor:"#bfdbfe" }}>
              <span style={{ display:"flex", color:"#2563eb" }}>{Ico.checkin}</span>Пристигащи днес
            </button>

            <button onClick={onTodayCo || (() => {})} style={{ ...btnBase, color:"#92400e", borderColor:"#fcd34d" }}>
              <span style={{ display:"flex", color:"#d97706" }}>{Ico.checkout}</span>Днешни освобождавания
            </button>

            {/* v1.2 — Pending caparo tab. Badge shows the count of confirmed
                reservations with no caparo received. Hidden when count is 0
                so it doesn't pull attention when there's nothing to chase. */}
            {(() => {
              const pendingCount = reservations.filter((r: any) =>
                r.status === "CONFIRMED" && r.caparoReceived !== true
              ).length;
              return (
                <button onClick={onPendingCaparo || (() => {})}
                  style={{ ...btnBase, color: pendingCount > 0 ? "#9f1239" : "#666", borderColor: pendingCount > 0 ? "#fecdd3" : sb.border, position:"relative" }}>
                  <span style={{ display:"flex", color: pendingCount > 0 ? "#e11d48" : sb.muted }}>{Ico.bell}</span>
                  Чакащо капаро
                  {pendingCount > 0 && (
                    <span style={{ marginLeft:"auto", background:"#e11d48", color:"#fff", borderRadius:"10px", fontSize:"10px", fontWeight:"700", padding:"1px 7px", minWidth:"20px", textAlign:"center" }}>{pendingCount}</span>
                  )}
                </button>
              );
            })()}

            <button onClick={() => onVoice ? onVoice() : router.push("/dashboard/calendar?voice=1")} style={btnBase}>
              <span style={{ display:"flex", color:sb.muted }}>{Ico.mic}</span>Гласово попълване
            </button>

            <button onClick={openNotif} style={btnBase}>
              <span style={{ display:"flex", color:sb.muted }}>{Ico.bell}</span>Нотификации
            </button>

            <button onClick={doSync} style={{ ...btnBase, color:"#b45309", borderColor:"#fde68a" }}>
              <span style={{ display:"flex", color:"#d97706" }}>{Ico.sync}</span>Синхронизирай
            </button>
          </div>

          {/* Nav */}
          <div style={{ padding:"8px 14px", borderBottom:`1px solid ${sb.border}`, display:"flex", gap:"5px", flexWrap:"wrap" }}>
            {[
              { href: "/dashboard", label: "Табло", icon: Ico.dashboard },
              { href: "/dashboard/calendar", label: "Календар", icon: Ico.calendar },
              { href: "/dashboard/finance", label: "Финанси", icon: Ico.finance },
              { href: "/dashboard/voice-history", label: "Записи", icon: Ico.history },
              { href: "/dashboard/settings", label: "Настройки", icon: Ico.settings },
            ].map(item => {
              const active = pathname === item.href;
              return (
                <Link key={item.href} href={item.href}
                  style={{ textDecoration:"none", padding:"5px 10px", borderRadius:"6px", fontSize:"11.5px", fontWeight:"500", display:"flex", alignItems:"center", gap:"5px", background: active ? sb.accent : sb.card, color: active ? "#fff" : sb.text, border:`1px solid ${active ? sb.accent : sb.border}`, letterSpacing:".01em" }}>
                  <span style={{ display:"flex", color: active ? "#fff" : sb.muted }}>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
            <button onClick={logout} style={{ padding:"5px 10px", borderRadius:"6px", fontSize:"11.5px", background:sb.card, color:sb.muted, border:`1px solid ${sb.border}`, cursor:"pointer", display:"flex", alignItems:"center", gap:"5px", letterSpacing:".01em" }}>
              <span style={{ display:"flex" }}>{Ico.logout}</span>Изход
            </button>
          </div>

          {/* Rooms list */}
          <div style={{ padding:"8px 0", flex:1 }}>
            <div style={{ padding:"8px 14px 4px", fontSize:"9.5px", fontWeight:"600", color:sb.muted, letterSpacing:".08em", textTransform:"uppercase" }}>Входове и стаи</div>
            {[{ label:"Вход 39", rooms: rooms39 }, { label:"Вход 41", rooms: rooms41 }].map(grp => (
              <div key={grp.label}>
                <div style={{ padding:"4px 14px 4px", fontSize:"9px", fontWeight:"600", color:"#b5b5b5", letterSpacing:".06em", textTransform:"uppercase" }}>{grp.label}</div>
                {grp.rooms.map(r => {
                  const isBooked = reservations.some(res => res.roomCode === r.code && res.status !== "CANCELLED" && new Date(res.endDate) >= new Date() && new Date(res.startDate) <= new Date());
                  return (
                    <div key={r.id} onClick={() => openRoomPopup(r)}
                      style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"7px 14px", cursor:"pointer", borderRadius:"6px", margin:"1px 8px", transition:"background .15s" }}
                      onMouseEnter={e => (e.currentTarget.style.background = sb.hover)}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <div>
                        <div style={{ fontSize:"13px", fontWeight:"600", color:"#1a1a1a" }}>{r.code}</div>
                        <div style={{ fontSize:"10px", color:sb.muted, marginTop:"1px" }}>{r.label} · {r.capacity} г.</div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                        <div style={{ fontSize:"10px", color:sb.muted, background:"#f0f0ee", padding:"2px 6px", borderRadius:"4px", fontWeight:"500" }}>{r.capacity}</div>
                        <div style={{ width:"6px", height:"6px", borderRadius:"50%", background: isBooked ? "#eab308" : "#22c55e" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SIDEBAR TOGGLE */}
      <div onClick={() => setSidOpen(!sidOpen)}
        style={{ position:"absolute", top:"50%", transform:"translateY(-50%)", left: sidOpen ? "264px" : "0", width:"16px", height:"48px", background:sb.accent, borderRadius:"0 6px 6px 0", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", zIndex:30, transition:"left .3s cubic-bezier(.4,0,.2,1)", userSelect:"none" }}>
        <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
          <polyline points={sidOpen ? "6,2 2,7 6,12" : "2,2 6,7 2,12"} stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* MAIN */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", background:"#f4f3ef", minWidth:0, overflow:"hidden" }}>
        {children}
      </div>

      {/* ── ROOM POPUP ───────────────────────────────────────────────────── */}
      {roomPopup && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.35)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}
          onClick={() => setRoomPopup(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background:"#fff", borderRadius:"14px", width:"500px", maxWidth:"95vw", maxHeight:"80vh", overflow:"hidden", boxShadow:"0 16px 48px rgba(0,0,0,.2)", display:"flex", flexDirection:"column" }}>
            <div style={{ background:"#111118", padding:"18px 22px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:"16px", fontWeight:"700", color:"#fff", letterSpacing:".02em" }}>Стая {roomPopup.code}</div>
                <div style={{ fontSize:"11.5px", color:"#777", marginTop:"3px" }}>Вход {roomPopup.entrance} · {roomPopup.label} · {roomPopup.capacity} гости</div>
              </div>
              <button onClick={() => setRoomPopup(null)} style={{ background:"#1c1c2a", color:"#666", border:"1px solid #2a2a3a", borderRadius:"6px", width:"28px", height:"28px", cursor:"pointer", fontSize:"16px", display:"flex", alignItems:"center", justifyContent:"center" }}>{"\u00D7"}</button>
            </div>
            <div style={{ padding:"14px 20px", display:"flex", gap:"8px" }}>
              <button onClick={() => { setRoomPopup(null); if (onNewRes) onNewRes(); }}
                style={{ background:sb.accent, color:"#fff", border:"none", borderRadius:"8px", padding:"8px 16px", fontSize:"12.5px", fontWeight:"600", cursor:"pointer", letterSpacing:".02em" }}>
                Нова резервация
              </button>
            </div>
            <div style={{ flex:1, overflowY:"auto", padding:"0 20px 20px" }}>
              <div style={{ fontSize:"10.5px", fontWeight:"600", color:"#999", marginBottom:"10px", textTransform:"uppercase", letterSpacing:".06em" }}>
                Предстоящи резервации ({roomPopup.reservations?.length || 0})
              </div>
              {(!roomPopup.reservations || roomPopup.reservations.length === 0) && (
                <div style={{ color:"#bbb", fontSize:"13px", padding:"12px 0" }}>Няма предстоящи резервации.</div>
              )}
              {(roomPopup.reservations || []).map((r: any) => (
                <div key={r.id} style={{ padding:"10px 12px", borderRadius:"8px", marginBottom:"6px", background:"#faf9f7", border:"1px solid #e8e6e0" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div style={{ fontSize:"13.5px", fontWeight:"600", color:"#111" }}>{r.guestName}</div>
                    <span style={{ fontSize:"10px", padding:"2px 7px", borderRadius:"4px", background:sb.accentSoft, color:sb.accent, fontWeight:"600" }}>{r.source}</span>
                  </div>
                  <div style={{ fontSize:"12px", color:"#888", marginTop:"3px" }}>
                    {fmtS(r.startDate.slice(0,10))} — {fmtS(r.endDate.slice(0,10))} · {r.phone || ""}
                  </div>
                  {r.notes && <div style={{ fontSize:"11px", color:"#aaa", marginTop:"2px", fontStyle:"italic" }}>{r.notes}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── NOTIFICATIONS PANEL ──────────────────────────────────────────── */}
      {notifOpen && (
        <div style={{ position:"fixed", top:0, right:0, height:"100vh", width:"400px", maxWidth:"100vw", background:"#fff", borderLeft:"1px solid #e8e6e0", boxShadow:"-6px 0 24px rgba(0,0,0,.1)", zIndex:200, display:"flex", flexDirection:"column" }}>
          <div style={{ background:"#111118", padding:"16px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span style={{ fontSize:"14.5px", fontWeight:"700", color:"#fff", letterSpacing:".02em" }}>Известия</span>
            <button onClick={() => setNotifOpen(false)} style={{ background:"#1c1c2a", color:"#666", border:"1px solid #2a2a3a", borderRadius:"6px", width:"28px", height:"28px", cursor:"pointer", fontSize:"16px" }}>{"\u00D7"}</button>
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"14px" }}>
            {notifications.length === 0 && <div style={{ fontSize:"12px", color:"#bbb", padding:"12px 0" }}>Няма известия.</div>}
            {notifications.map((n: any) => {
              const isCancelNotif = n.type === "CANCEL";
              const linkedRes = n.reservationId ? reservations.find(r => r.id === n.reservationId) : null;
              const canRevert = isCancelNotif && linkedRes && linkedRes.status === "CANCELLED" && (
                !linkedRes.cancelledAt || (Date.now() - new Date(linkedRes.cancelledAt).getTime()) < 24 * 60 * 60 * 1000
              );

              return (
                <div key={n.id} onClick={() => setNotifDetail(n)}
                  style={{ padding:"12px 14px", borderRadius:"8px", marginBottom:"6px", border:"1px solid #edeae5", cursor:"pointer", background: isCancelNotif ? "#fef8f8" : "#fff", transition:"background .1s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = isCancelNotif ? "#fdf2f2" : "#faf9f7")}
                  onMouseLeave={e => (e.currentTarget.style.background = isCancelNotif ? "#fef8f8" : "#fff")}>
                  <div style={{ display:"flex", alignItems:"flex-start", gap:"10px" }}>
                    <span style={{ display:"flex", flexShrink:0, marginTop:"1px" }}>{notifIcon(n.type)}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:"13px", fontWeight:"600", color:"#222" }}>{n.title}</div>
                      <div style={{ fontSize:"11px", color:"#888", marginTop:"2px" }}>{n.detail}</div>
                      <div style={{ fontSize:"10px", color:"#bbb", marginTop:"3px" }}>{new Date(n.createdAt).toLocaleString("bg-BG")}</div>
                    </div>
                    {canRevert && (
                      <button onClick={e => { e.stopPropagation(); revertCancel(linkedRes.id); }}
                        style={{ fontSize:"10.5px", padding:"4px 10px", borderRadius:"5px", background:"#059669", color:"#fff", border:"none", cursor:"pointer", fontWeight:"600", whiteSpace:"nowrap" }}>
                        Възстанови
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── NOTIFICATION DETAIL POPUP ────────────────────────────────────── */}
      {notifDetail && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.35)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:250 }}
          onClick={() => { setNotifDetail(null); setNotifEditForm(null); }}>
          <div onClick={e => e.stopPropagation()} style={{ background:"#fff", borderRadius:"14px", width:"500px", maxWidth:"95vw", maxHeight:"90vh", overflow:"hidden", boxShadow:"0 16px 48px rgba(0,0,0,.2)", display:"flex", flexDirection:"column" }}>
            <div style={{ background:"#111118", padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
              <span style={{ fontSize:"14.5px", fontWeight:"700", color:"#fff", letterSpacing:".02em" }}>Детайли за известието</span>
              <button onClick={() => { setNotifDetail(null); setNotifEditForm(null); }} style={{ background:"#1c1c2a", color:"#666", border:"1px solid #2a2a3a", borderRadius:"6px", width:"28px", height:"28px", cursor:"pointer", fontSize:"16px", display:"flex", alignItems:"center", justifyContent:"center" }}>{"\u00D7"}</button>
            </div>
            <div style={{ padding:"20px", overflowY:"auto" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"8px", fontSize:"14px", fontWeight:"600", color:"#222", marginBottom:"4px" }}>
                <span style={{ display:"flex" }}>{notifIcon(notifDetail.type)}</span>{notifDetail.title}
              </div>
              <div style={{ fontSize:"13px", color:"#555", marginBottom:"8px" }}>{notifDetail.detail}</div>
              <div style={{ fontSize:"11px", color:"#999", marginBottom:"16px" }}>{new Date(notifDetail.createdAt).toLocaleString("bg-BG")}</div>

              {(() => {
                const linkedRes = notifDetail.reservationId ? reservations.find(r => r.id === notifDetail.reservationId) : null;
                if (!linkedRes) return null;
                const isCancelled = linkedRes.status === "CANCELLED";
                const canRevert = isCancelled && (
                  !linkedRes.cancelledAt || (Date.now() - new Date(linkedRes.cancelledAt).getTime()) < 24 * 60 * 60 * 1000
                );

                if (isCancelled && canRevert && !notifEditForm) {
                  setTimeout(() => setNotifEditForm({
                    guestName: linkedRes.guestName || "",
                    phone: linkedRes.phone || "",
                    email: linkedRes.email || "",
                    roomCode: linkedRes.roomCode || "",
                    startDate: linkedRes.startDate?.slice(0,10) || "",
                    endDate: linkedRes.endDate?.slice(0,10) || "",
                    notes: linkedRes.notes || "",
                    guests: String(linkedRes.guests || 1),
                    children: String(linkedRes.children || 0),
                  }), 0);
                }

                const inputStyle = { height:"34px", width:"100%", border:"1px solid #dedad4", borderRadius:"7px", padding:"0 10px", fontSize:"13px", background:"#faf9f7", color:"#111", outline:"none", boxSizing:"border-box" as const };
                const labelStyle = { fontSize:"10px", fontWeight:"600" as const, color:"#888", display:"block", marginBottom:"3px", letterSpacing:".04em" };

                return (
                  <div style={{ background:"#faf9f7", borderRadius:"10px", border:"1px solid #e8e6e0", padding:"14px" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"10px" }}>
                      <div style={{ fontSize:"13px", fontWeight:"700", color:"#111" }}>Резервация</div>
                      <span style={{ fontSize:"10.5px", padding:"3px 8px", borderRadius:"5px", background: isCancelled ? "#fef2f2" : "#f0fdf4", color: isCancelled ? "#dc2626" : "#059669", fontWeight:"600", border: isCancelled ? "1px solid #fca5a5" : "1px solid #86efac" }}>
                        {isCancelled ? "Анулирана" : "Потвърдена"}
                      </span>
                    </div>

                    {isCancelled && canRevert && notifEditForm ? (
                      <div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px", marginBottom:"8px" }}>
                          <div style={{ gridColumn:"1 / -1" }}>
                            <label style={labelStyle}>ГОСТ</label>
                            <input value={notifEditForm.guestName} onChange={e => setNotifEditForm((f:any) => ({...f, guestName:e.target.value}))} style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>ТЕЛЕФОН</label>
                            <input value={notifEditForm.phone} onChange={e => setNotifEditForm((f:any) => ({...f, phone:e.target.value}))} style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>EMAIL</label>
                            <input value={notifEditForm.email} onChange={e => setNotifEditForm((f:any) => ({...f, email:e.target.value}))} style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>СТАЯ</label>
                            <select value={notifEditForm.roomCode} onChange={e => setNotifEditForm((f:any) => ({...f, roomCode:e.target.value}))} style={inputStyle}>
                              <option value="">Избери...</option>
                              {rooms.map(r => <option key={r.id} value={r.code}>{r.code} · {r.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={labelStyle}>ИЗТОЧНИК</label>
                            <div style={{ ...inputStyle, display:"flex", alignItems:"center", fontSize:"13px", color:"#555" }}>{linkedRes.source}</div>
                          </div>
                          <div>
                            <label style={labelStyle}>ДАТА НАЧАЛО</label>
                            <input type="date" value={notifEditForm.startDate} onChange={e => setNotifEditForm((f:any) => ({...f, startDate:e.target.value}))} style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>ДАТА КРАЙ</label>
                            <input type="date" value={notifEditForm.endDate} onChange={e => setNotifEditForm((f:any) => ({...f, endDate:e.target.value}))} style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>ВЪЗРАСТНИ</label>
                            <input type="number" value={notifEditForm.guests} onChange={e => setNotifEditForm((f:any) => ({...f, guests:e.target.value}))} style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>ДЕЦА</label>
                            <input type="number" value={notifEditForm.children} onChange={e => setNotifEditForm((f:any) => ({...f, children:e.target.value}))} style={inputStyle} />
                          </div>
                          <div style={{ gridColumn:"1 / -1" }}>
                            <label style={labelStyle}>БЕЛЕЖКИ</label>
                            <textarea value={notifEditForm.notes} onChange={e => setNotifEditForm((f:any) => ({...f, notes:e.target.value}))}
                              style={{ width:"100%", border:"1px solid #dedad4", borderRadius:"7px", padding:"8px 10px", fontSize:"13px", background:"#faf9f7", color:"#111", resize:"none", height:"48px", outline:"none", boxSizing:"border-box" }} />
                          </div>
                        </div>
                        <button onClick={() => saveAndRestore(linkedRes.id)} disabled={notifEditSaving}
                          style={{ marginTop:"6px", background:"#059669", color:"#fff", border:"none", borderRadius:"8px", padding:"11px 20px", fontSize:"13px", fontWeight:"600", cursor: notifEditSaving ? "not-allowed" : "pointer", width:"100%", opacity: notifEditSaving ? 0.6 : 1, letterSpacing:".02em" }}>
                          {notifEditSaving ? "Запазване..." : "Запази и възстанови"}
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize:"13px", color:"#444" }}><strong>Гост:</strong> {linkedRes.guestName}</div>
                        <div style={{ fontSize:"13px", color:"#444", marginTop:"3px" }}><strong>Стая:</strong> {linkedRes.roomCode}</div>
                        <div style={{ fontSize:"13px", color:"#444", marginTop:"3px" }}><strong>Дати:</strong> {fmtS(linkedRes.startDate.slice(0,10))} — {fmtS(linkedRes.endDate.slice(0,10))}</div>
                        <div style={{ fontSize:"13px", color:"#444", marginTop:"3px" }}><strong>Телефон:</strong> {linkedRes.phone || "—"}</div>
                        <div style={{ fontSize:"13px", color:"#444", marginTop:"3px" }}><strong>Източник:</strong> {linkedRes.source}</div>
                        {linkedRes.notes && <div style={{ fontSize:"12px", color:"#888", marginTop:"4px", fontStyle:"italic" }}>{linkedRes.notes}</div>}
                        <div style={{ fontSize:"13px", color:"#444", marginTop:"3px" }}><strong>Възрастни:</strong> {linkedRes.guests || 1} · <strong>Деца:</strong> {linkedRes.children || 0}</div>

                        {isCancelled && !canRevert && (
                          <div style={{ marginTop:"10px", fontSize:"12px", color:"#dc2626", background:"#fef2f2", padding:"8px 10px", borderRadius:"6px" }}>
                            Срокът за възстановяване (24 часа) е изтекъл.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* SYNC TOAST */}
      {syncVisible && (
        <div style={{ position:"fixed", bottom:"24px", right:"24px", background:"#111118", color:"#d4d4d8", borderRadius:"10px", padding:"13px 18px", fontSize:"12.5px", zIndex:300, display:"flex", flexDirection:"column", gap:"8px", boxShadow:"0 6px 24px rgba(0,0,0,.3)", minWidth:"260px", letterSpacing:".01em" }}>
          <div>{syncMsg}</div>
          <div style={{ height:"3px", background:"#27272a", borderRadius:"2px", overflow:"hidden" }}>
            <div style={{ height:"100%", background:sb.accent, borderRadius:"2px", width:`${syncPct}%`, transition:"width .3s" }} />
          </div>
        </div>
      )}
    </div>
  );
}
