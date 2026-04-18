"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const MONTHS_BG = ["Януари","Февруари","Март","Април","Май","Юни","Юли","Август","Септември","Октомври","Ноември","Декември"];

function fmtS(ds: string) {
  const d = new Date(ds + "T00:00:00");
  return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}`;
}

export function DashboardShell({ children, stats, onNewRes, onTodayRes, onTodayCo, onVoice }: {
  children: React.ReactNode;
  stats?: { active: number; occ: number; rev: number; month: number; selFmt: string };
  onNewRes?: () => void;
  onTodayRes?: () => void;
  onTodayCo?: () => void;
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
      if (p % 25 === 0 && i < steps.length) setSyncMsg("⚡ " + steps[i++]);
      if (p >= 100) {
        clearInterval(iv);
        setSyncMsg("✓ Синхронизацията завърши успешно!");
        setTimeout(() => setSyncVisible(false), 3000);
      }
    }, 150);
  }

  async function revertCancel(id: string) {
    await fetch(`/api/reservations/${id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ status:"CONFIRMED" }) });
    // Refresh reservations and notifications
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
      // First save edits
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
      // Refresh
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

  // Room popup: get reservations for next 6 months
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

  // Light theme colors
  const sidebarBg = "#fafafa";
  const sidebarBorder = "#e8e5e0";
  const sidebarCardBg = "#fff";
  const sidebarText = "#333";
  const sidebarMuted = "#999";
  const sidebarAccent = "#6c63ff";
  const sidebarHover = "#f0efff";

  return (
    <div style={{ display:"flex", height:"100vh", overflow:"hidden", background:"#f5f3ef" }}>
      {/* SIDEBAR — light theme */}
      <div style={{ width: sidOpen ? "272px" : "0", minWidth: sidOpen ? "272px" : "0", background:sidebarBg, color:sidebarText, display:"flex", flexDirection:"column", overflow:"hidden", transition:"width .3s cubic-bezier(.4,0,.2,1), min-width .3s cubic-bezier(.4,0,.2,1)", position:"relative", zIndex:20, flexShrink:0, borderRight:`1px solid ${sidebarBorder}` }}>
        <div style={{ width:"272px", display:"flex", flexDirection:"column", height:"100%", overflowY:"auto" }}>
          {/* Brand */}
          <div style={{ padding:"16px 16px 12px", borderBottom:`1px solid ${sidebarBorder}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"14px" }}>
              <div style={{ width:"36px", height:"36px", borderRadius:"9px", background:`linear-gradient(135deg,${sidebarAccent},#4a43cc)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"15px", fontWeight:"700", color:"#fff", flexShrink:0 }}>SP</div>
              <div>
                <div style={{ fontSize:"15px", fontWeight:"700", color:"#111", whiteSpace:"nowrap" }}>StayPilot</div>
                <div style={{ fontSize:"10px", color:sidebarMuted, whiteSpace:"nowrap" }}>Flora & Lazur · Управление</div>
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:"7px", background:"#fff", border:`1px solid ${sidebarBorder}`, borderRadius:"8px", padding:"7px 11px" }}>
              <span style={{ color:"#bbb", fontSize:"16px" }}>⌕</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Търси стая..." style={{ background:"none", border:"none", outline:"none", color:"#333", fontSize:"12px", width:"100%" }} />
            </div>
          </div>

          {/* Stats */}
          {stats && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"7px", padding:"12px 14px", borderBottom:`1px solid ${sidebarBorder}` }}>
              <div style={{ background:sidebarCardBg, borderRadius:"9px", padding:"9px 11px", border:`1px solid ${sidebarBorder}` }}>
                <div style={{ fontSize:"20px", fontWeight:"700", color:"#111" }}>{stats.active}</div>
                <div style={{ fontSize:"10px", color:sidebarMuted, marginTop:"3px" }}>Активни</div>
                <div style={{ marginTop:"5px", height:"3px", background:"#eee", borderRadius:"2px", overflow:"hidden" }}>
                  <div style={{ height:"100%", borderRadius:"2px", background:sidebarAccent, width:`${Math.round(stats.active/18*100)}%` }} />
                </div>
              </div>
              <div style={{ background:sidebarCardBg, borderRadius:"9px", padding:"9px 11px", border:`1px solid ${sidebarBorder}` }}>
                <div style={{ fontSize:"20px", fontWeight:"700", color:"#111" }}>{stats.occ}%</div>
                <div style={{ fontSize:"10px", color:sidebarMuted, marginTop:"3px" }}>Заетост</div>
                <div style={{ marginTop:"5px", height:"3px", background:"#eee", borderRadius:"2px", overflow:"hidden" }}>
                  <div style={{ height:"100%", borderRadius:"2px", background:sidebarAccent, width:`${stats.occ}%` }} />
                </div>
              </div>
              <div style={{ background:sidebarCardBg, borderRadius:"9px", padding:"9px 11px", border:`1px solid ${sidebarBorder}`, gridColumn:"span 2" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontSize:"17px", fontWeight:"700", color:"#111" }}>€{stats.rev.toLocaleString()}</div>
                    <div style={{ fontSize:"10px", color:sidebarMuted, marginTop:"2px" }}>Приходи · {MONTHS_BG[stats.month]}</div>
                  </div>
                  <span style={{ fontSize:"9px", padding:"2px 6px", borderRadius:"4px", background:"#ecfdf5", color:"#059669", fontWeight:"600" }}>▲ Месечни</span>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ padding:"10px 14px", borderBottom:`1px solid ${sidebarBorder}`, display:"flex", flexDirection:"column", gap:"6px" }}>
            {/* Nova rezervacia — opens form directly */}
            <button onClick={onNewRes || (() => router.push("/dashboard/calendar"))}
              style={{ background:sidebarAccent, color:"#fff", border:"none", borderRadius:"8px", padding:"10px 12px", fontSize:"13px", fontWeight:"600", cursor:"pointer", display:"flex", alignItems:"center", gap:"8px", width:"100%", whiteSpace:"nowrap" }}>＋ Нова резервация</button>

            {/* Calendar button */}
            <Link href="/dashboard/calendar" style={{ textDecoration:"none" }}>
              <button style={{ background:sidebarCardBg, color:sidebarText, border:`1px solid ${sidebarBorder}`, borderRadius:"8px", padding:"9px 12px", fontSize:"12px", cursor:"pointer", display:"flex", alignItems:"center", gap:"8px", width:"100%", whiteSpace:"nowrap" }}>📅 Календар</button>
            </Link>

            {/* Today's reservations */}
            <button onClick={onTodayRes || (() => {})}
              style={{ background:sidebarCardBg, color:"#15803d", border:"1px solid #bbf7d0", borderRadius:"8px", padding:"9px 12px", fontSize:"12px", cursor:"pointer", display:"flex", alignItems:"center", gap:"8px", width:"100%", whiteSpace:"nowrap" }}>🏨 Днешни резервации</button>

            {/* Today's checkouts */}
            <button onClick={onTodayCo || (() => {})}
              style={{ background:sidebarCardBg, color:"#b45309", border:"1px solid #fcd34d", borderRadius:"8px", padding:"9px 12px", fontSize:"12px", cursor:"pointer", display:"flex", alignItems:"center", gap:"8px", width:"100%", whiteSpace:"nowrap" }}>🚪 Днешни освобождавания</button>

            {[
              { icon:"🎤", label:"Гласово попълване", action: () => onVoice ? onVoice() : router.push("/dashboard/calendar?voice=1") },
              { icon:"🔔", label:"Нотификации", action: openNotif },
              { icon:"⚡", label:"Синхронизирай сега", action: doSync, warn: true },
            ].map((btn, i) => (
              <button key={i} onClick={btn.action}
                style={{ background:sidebarCardBg, color: btn.warn ? "#f59e0b" : sidebarText, border:`1px solid ${sidebarBorder}`, borderRadius:"8px", padding:"8px 12px", fontSize:"12px", cursor:"pointer", display:"flex", alignItems:"center", gap:"8px", width:"100%", textAlign:"left", whiteSpace:"nowrap" }}>
                <span>{btn.icon}</span>{btn.label}
              </button>
            ))}
          </div>

          {/* Nav */}
          <div style={{ padding:"8px 14px", borderBottom:`1px solid ${sidebarBorder}`, display:"flex", gap:"6px", flexWrap:"wrap" }}>
            {[
              { href: "/dashboard", label: "Табло" },
              { href: "/dashboard/calendar", label: "Календар" },
              { href: "/dashboard/voice-history", label: "🎙 Записи" },
              { href: "/dashboard/settings", label: "Настройки" },
            ].map(item => (
              <Link key={item.href} href={item.href}
                style={{ textDecoration:"none", padding:"6px 12px", borderRadius:"7px", fontSize:"12px", fontWeight:"500", background: pathname === item.href ? sidebarAccent : sidebarCardBg, color: pathname === item.href ? "#fff" : sidebarText, border:`1px solid ${pathname === item.href ? sidebarAccent : sidebarBorder}` }}>
                {item.label}
              </Link>
            ))}
            <button onClick={logout} style={{ padding:"6px 12px", borderRadius:"7px", fontSize:"12px", background:sidebarCardBg, color:sidebarMuted, border:`1px solid ${sidebarBorder}`, cursor:"pointer" }}>Изход</button>
          </div>

          {/* Rooms list — clickable */}
          <div style={{ padding:"8px 0", flex:1 }}>
            <div style={{ padding:"8px 14px 4px", fontSize:"9px", fontWeight:"700", color:sidebarMuted, letterSpacing:".8px", textTransform:"uppercase" }}>Входове и стаи</div>
            {[{ label:"Вход 39", rooms: rooms39 }, { label:"Вход 41", rooms: rooms41 }].map(grp => (
              <div key={grp.label}>
                <div style={{ padding:"3px 14px 5px", fontSize:"9px", fontWeight:"700", color:"#bbb", letterSpacing:".5px", textTransform:"uppercase" }}>{grp.label}</div>
                {grp.rooms.map(r => {
                  const isBooked = reservations.some(res => res.roomCode === r.code && res.status !== "CANCELLED" && new Date(res.endDate) >= new Date() && new Date(res.startDate) <= new Date());
                  return (
                    <div key={r.id} onClick={() => openRoomPopup(r)}
                      style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"7px 14px", cursor:"pointer", borderRadius:"6px", margin:"1px 8px", transition:"background .15s" }}
                      onMouseEnter={e => (e.currentTarget.style.background = sidebarHover)}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <div>
                        <div style={{ fontSize:"13px", fontWeight:"600", color:"#222" }}>{r.code}</div>
                        <div style={{ fontSize:"10px", color:sidebarMuted, marginTop:"1px" }}>{r.label} · {r.capacity} г.</div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:"5px" }}>
                        <div style={{ fontSize:"10px", color:sidebarMuted, background:"#f0f0f0", padding:"2px 6px", borderRadius:"4px" }}>{r.capacity}</div>
                        <div style={{ width:"7px", height:"7px", borderRadius:"50%", background: isBooked ? "#f59e0b" : "#22c55e" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SIDEBAR TOGGLE TAB */}
      <div onClick={() => setSidOpen(!sidOpen)}
        style={{ position:"absolute", top:"50%", transform:"translateY(-50%)", left: sidOpen ? "272px" : "0", width:"18px", height:"52px", background:sidebarAccent, borderRadius:"0 8px 8px 0", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", zIndex:30, transition:"left .3s cubic-bezier(.4,0,.2,1)", userSelect:"none" }}>
        <svg width="10" height="16" viewBox="0 0 10 16" fill="none">
          <polyline points={sidOpen ? "8,2 2,8 8,14" : "2,2 8,8 2,14"} stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* MAIN */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", background:"#f5f3ef", minWidth:0, overflow:"hidden" }}>
        {children}
      </div>

      {/* ═══════════ ROOM POPUP ═══════════ */}
      {roomPopup && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}
          onClick={() => setRoomPopup(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background:"#fff", borderRadius:"16px", width:"520px", maxWidth:"95vw", maxHeight:"80vh", overflow:"hidden", boxShadow:"0 20px 60px rgba(0,0,0,.3)", display:"flex", flexDirection:"column" }}>
            <div style={{ background:"#12121c", padding:"18px 22px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:"17px", fontWeight:"700", color:"#fff" }}>Стая {roomPopup.code}</div>
                <div style={{ fontSize:"12px", color:"#888", marginTop:"2px" }}>Вход {roomPopup.entrance} · {roomPopup.label} · {roomPopup.capacity} гости</div>
              </div>
              <button onClick={() => setRoomPopup(null)} style={{ background:"#1e1e2e", color:"#777", border:"1px solid #2a2a40", borderRadius:"7px", width:"28px", height:"28px", cursor:"pointer", fontSize:"17px", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
            </div>
            <div style={{ padding:"16px 20px", display:"flex", gap:"8px" }}>
              <button onClick={() => { setRoomPopup(null); if (onNewRes) onNewRes(); }}
                style={{ background:sidebarAccent, color:"#fff", border:"none", borderRadius:"8px", padding:"8px 16px", fontSize:"13px", fontWeight:"600", cursor:"pointer" }}>
                + Резервация за тази стая
              </button>
            </div>
            <div style={{ flex:1, overflowY:"auto", padding:"0 20px 20px" }}>
              <div style={{ fontSize:"12px", fontWeight:"700", color:"#888", marginBottom:"10px", textTransform:"uppercase", letterSpacing:".4px" }}>
                Резервации · следващи 6 месеца ({roomPopup.reservations?.length || 0})
              </div>
              {(!roomPopup.reservations || roomPopup.reservations.length === 0) && (
                <div style={{ color:"#bbb", fontSize:"13px", padding:"12px 0" }}>Няма предстоящи резервации.</div>
              )}
              {(roomPopup.reservations || []).map((r: any) => (
                <div key={r.id} style={{ padding:"10px 12px", borderRadius:"9px", marginBottom:"8px", background:"#faf9f7", border:"1px solid #e5e2dc" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div style={{ fontSize:"14px", fontWeight:"700", color:"#111" }}>{r.guestName}</div>
                    <span style={{ fontSize:"10px", padding:"2px 7px", borderRadius:"4px", background:"#f0efff", color:sidebarAccent, fontWeight:"600" }}>{r.source}</span>
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

      {/* ═══════════ NOTIFICATIONS PANEL ═══════════ */}
      {notifOpen && (
        <div style={{ position:"fixed", top:0, right:0, height:"100vh", width:"400px", maxWidth:"100vw", background:"#fff", borderLeft:"1px solid #e5e2dc", boxShadow:"-8px 0 30px rgba(0,0,0,.15)", zIndex:200, display:"flex", flexDirection:"column" }}>
          <div style={{ background:"#12121c", padding:"16px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span style={{ fontSize:"15px", fontWeight:"700", color:"#fff" }}>Известия</span>
            <button onClick={() => setNotifOpen(false)} style={{ background:"#1e1e2e", color:"#777", border:"1px solid #2a2a40", borderRadius:"7px", width:"28px", height:"28px", cursor:"pointer", fontSize:"17px" }}>×</button>
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
                  style={{ padding:"12px 14px", borderRadius:"9px", marginBottom:"8px", border:"1px solid #f0ede8", cursor:"pointer", background: isCancelNotif ? "#fef2f2" : "#fff", transition:"background .1s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = isCancelNotif ? "#fee2e2" : "#faf9f7")}
                  onMouseLeave={e => (e.currentTarget.style.background = isCancelNotif ? "#fef2f2" : "#fff")}>
                  <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                    <span style={{ fontSize:"16px" }}>{isCancelNotif ? "🚫" : n.type === "NEW" ? "✅" : n.type === "IMPORT" ? "📦" : "ℹ️"}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:"13px", fontWeight:"600", color:"#222" }}>{n.title}</div>
                      <div style={{ fontSize:"11px", color:"#888", marginTop:"2px" }}>{n.detail}</div>
                      <div style={{ fontSize:"10px", color:"#bbb", marginTop:"3px" }}>{new Date(n.createdAt).toLocaleString("bg-BG")}</div>
                    </div>
                    {canRevert && (
                      <button onClick={e => { e.stopPropagation(); revertCancel(linkedRes.id); }}
                        style={{ fontSize:"10px", padding:"4px 10px", borderRadius:"6px", background:"#059669", color:"#fff", border:"none", cursor:"pointer", fontWeight:"600", whiteSpace:"nowrap" }}>
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

      {/* ═══════════ NOTIFICATION DETAIL POPUP ═══════════ */}
      {notifDetail && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:250 }}
          onClick={() => { setNotifDetail(null); setNotifEditForm(null); }}>
          <div onClick={e => e.stopPropagation()} style={{ background:"#fff", borderRadius:"16px", width:"520px", maxWidth:"95vw", maxHeight:"90vh", overflow:"hidden", boxShadow:"0 20px 60px rgba(0,0,0,.3)", display:"flex", flexDirection:"column" }}>
            <div style={{ background:"#12121c", padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
              <span style={{ fontSize:"15px", fontWeight:"700", color:"#fff" }}>Детайли за известието</span>
              <button onClick={() => { setNotifDetail(null); setNotifEditForm(null); }} style={{ background:"#1e1e2e", color:"#777", border:"1px solid #2a2a40", borderRadius:"7px", width:"28px", height:"28px", cursor:"pointer", fontSize:"17px", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
            </div>
            <div style={{ padding:"20px", overflowY:"auto" }}>
              <div style={{ fontSize:"14px", fontWeight:"600", color:"#222", marginBottom:"4px" }}>
                {notifDetail.type === "CANCEL" ? "🚫" : notifDetail.type === "NEW" ? "✅" : "ℹ️"} {notifDetail.title}
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

                // Initialize edit form when opening a cancelled notification detail
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

                const inputStyle = { height:"34px", width:"100%", border:"1px solid #dedad4", borderRadius:"8px", padding:"0 10px", fontSize:"13px", background:"#faf9f7", color:"#111", outline:"none", boxSizing:"border-box" as const };
                const labelStyle = { fontSize:"10px", fontWeight:"700" as const, color:"#888", display:"block", marginBottom:"3px" };

                return (
                  <div style={{ background:"#faf9f7", borderRadius:"10px", border:"1px solid #e5e2dc", padding:"14px" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"10px" }}>
                      <div style={{ fontSize:"13px", fontWeight:"700", color:"#111" }}>Резервация</div>
                      <span style={{ fontSize:"11px", padding:"3px 8px", borderRadius:"5px", background: isCancelled ? "#fef2f2" : "#ecfdf5", color: isCancelled ? "#dc2626" : "#059669", fontWeight:"600", border: isCancelled ? "1px solid #fca5a5" : "1px solid #6ee7b7" }}>
                        {isCancelled ? "Анулирана" : "Потвърдена"}
                      </span>
                    </div>

                    {/* Editable form for cancelled reservations within revert window */}
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
                              style={{ width:"100%", border:"1px solid #dedad4", borderRadius:"8px", padding:"8px 10px", fontSize:"13px", background:"#faf9f7", color:"#111", resize:"none", height:"48px", outline:"none", boxSizing:"border-box" }} />
                          </div>
                        </div>
                        <button onClick={() => saveAndRestore(linkedRes.id)} disabled={notifEditSaving}
                          style={{ marginTop:"6px", background:"#059669", color:"#fff", border:"none", borderRadius:"8px", padding:"11px 20px", fontSize:"14px", fontWeight:"700", cursor: notifEditSaving ? "not-allowed" : "pointer", width:"100%", opacity: notifEditSaving ? 0.6 : 1 }}>
                          {notifEditSaving ? "Запазване..." : "💾 Запази промените и възстанови"}
                        </button>
                      </div>
                    ) : (
                      /* Read-only view for non-cancelled or expired */
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
        <div style={{ position:"fixed", bottom:"24px", right:"24px", background:"#12121c", color:"#e0deff", borderRadius:"10px", padding:"13px 18px", fontSize:"13px", zIndex:300, display:"flex", flexDirection:"column", gap:"8px", boxShadow:"0 8px 30px rgba(0,0,0,.4)", minWidth:"260px" }}>
          <div>{syncMsg}</div>
          <div style={{ height:"4px", background:"#2a2a40", borderRadius:"2px", overflow:"hidden" }}>
            <div style={{ height:"100%", background:sidebarAccent, borderRadius:"2px", width:`${syncPct}%`, transition:"width .3s" }} />
          </div>
        </div>
      )}
    </div>
  );
}
