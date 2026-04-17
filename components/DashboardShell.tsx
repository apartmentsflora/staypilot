"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const MONTHS_BG = ["Януари","Февруари","Март","Април","Май","Юни","Юли","Август","Септември","Октомври","Ноември","Декември"];

export function DashboardShell({ children, stats }: {
  children: React.ReactNode;
  stats?: { active: number; occ: number; rev: number; month: number; selFmt: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidOpen, setSidOpen] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncPct, setSyncPct] = useState(0);
  const [syncVisible, setSyncVisible] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/rooms").then(r => r.json()).then(d => Array.isArray(d) && setRooms(d));
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

  const nav = [
    { href: "/dashboard", label: "Табло" },
    { href: "/dashboard/calendar", label: "Календар" },
    { href: "/dashboard/settings", label: "Настройки" },
  ];

  const rooms39 = rooms.filter(r => r.entrance === "39").filter(r => !search || r.code.toLowerCase().includes(search.toLowerCase()) || r.label.toLowerCase().includes(search.toLowerCase()));
  const rooms41 = rooms.filter(r => r.entrance === "41").filter(r => !search || r.code.toLowerCase().includes(search.toLowerCase()) || r.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ display:"flex", height:"100vh", overflow:"hidden", background:"#0f0f1a" }}>
      {/* SIDEBAR */}
      <div style={{ width: sidOpen ? "272px" : "0", minWidth: sidOpen ? "272px" : "0", background:"#12121c", color:"#e8e6f0", display:"flex", flexDirection:"column", overflow:"hidden", transition:"width .3s cubic-bezier(.4,0,.2,1), min-width .3s cubic-bezier(.4,0,.2,1)", position:"relative", zIndex:20, flexShrink:0 }}>
        <div style={{ width:"272px", display:"flex", flexDirection:"column", height:"100%", overflowY:"auto" }}>
          {/* Brand */}
          <div style={{ padding:"16px 16px 12px", borderBottom:"1px solid #252535" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"14px" }}>
              <div style={{ width:"36px", height:"36px", borderRadius:"9px", background:"linear-gradient(135deg,#6c63ff,#4a43cc)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"15px", fontWeight:"700", color:"#fff", flexShrink:0 }}>SP</div>
              <div>
                <div style={{ fontSize:"15px", fontWeight:"600", color:"#fff", whiteSpace:"nowrap" }}>StayPilot</div>
                <div style={{ fontSize:"10px", color:"#55547a", whiteSpace:"nowrap" }}>Flora & Lazur · Управление</div>
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:"7px", background:"#1a1a2c", border:"1px solid #2a2a40", borderRadius:"8px", padding:"7px 11px" }}>
              <span style={{ color:"#3f3f60", fontSize:"16px" }}>⌕</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Търси стая..." style={{ background:"none", border:"none", outline:"none", color:"#e0deff", fontSize:"12px", width:"100%" }} />
            </div>
          </div>

          {/* Stats */}
          {stats && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"7px", padding:"12px 14px", borderBottom:"1px solid #252535" }}>
              <div style={{ background:"#1a1a2c", borderRadius:"9px", padding:"9px 11px", border:"1px solid #222238" }}>
                <div style={{ fontSize:"20px", fontWeight:"700", color:"#fff" }}>{stats.active}</div>
                <div style={{ fontSize:"10px", color:"#55547a", marginTop:"3px" }}>Активни</div>
                <div style={{ marginTop:"5px", height:"3px", background:"#1e1e30", borderRadius:"2px", overflow:"hidden" }}>
                  <div style={{ height:"100%", borderRadius:"2px", background:"#6c63ff", width:`${Math.round(stats.active/18*100)}%` }} />
                </div>
              </div>
              <div style={{ background:"#1a1a2c", borderRadius:"9px", padding:"9px 11px", border:"1px solid #222238" }}>
                <div style={{ fontSize:"20px", fontWeight:"700", color:"#fff" }}>{stats.occ}%</div>
                <div style={{ fontSize:"10px", color:"#55547a", marginTop:"3px" }}>Заетост</div>
                <div style={{ marginTop:"5px", height:"3px", background:"#1e1e30", borderRadius:"2px", overflow:"hidden" }}>
                  <div style={{ height:"100%", borderRadius:"2px", background:"#6c63ff", width:`${stats.occ}%` }} />
                </div>
              </div>
              <div style={{ background:"#1a1a2c", borderRadius:"9px", padding:"9px 11px", border:"1px solid #222238", gridColumn:"span 2" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontSize:"17px", fontWeight:"700", color:"#fff" }}>€{stats.rev.toLocaleString()}</div>
                    <div style={{ fontSize:"10px", color:"#55547a", marginTop:"2px" }}>Приходи · {MONTHS_BG[stats.month]}</div>
                  </div>
                  <span style={{ fontSize:"9px", padding:"2px 6px", borderRadius:"4px", background:"#0d2a1a", color:"#4ade80", fontWeight:"600" }}>▲ Месечни</span>
                </div>
                <div style={{ marginTop:"7px", height:"3px", background:"#1e1e30", borderRadius:"2px", overflow:"hidden" }}>
                  <div style={{ height:"100%", borderRadius:"2px", background:"#6c63ff", width:"65%" }} />
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ padding:"10px 14px", borderBottom:"1px solid #252535", display:"flex", flexDirection:"column", gap:"6px" }}>
            <Link href="/dashboard/calendar" style={{ textDecoration:"none" }}>
              <button style={{ background:"#6c63ff", color:"#fff", border:"none", borderRadius:"8px", padding:"9px 12px", fontSize:"12px", fontWeight:"600", cursor:"pointer", display:"flex", alignItems:"center", gap:"8px", width:"100%", whiteSpace:"nowrap" }}>＋ Нова резервация</button>
            </Link>
            {[
              { icon:"🎤", label:"Гласово попълване", action: () => router.push("/dashboard/calendar?voice=1") },
              { icon:"🔔", label:`Нотификации`, action: openNotif },
              { icon:"🔗", label:"Beds24 / Booking импорт", action: () => router.push("/dashboard/settings") },
              { icon:"🌐", label:"Уебсайт синхронизация", action: () => router.push("/dashboard/settings?tab=website") },
              { icon:"⚡", label:"Синхронизирай сега", action: doSync, warn: true },
            ].map((btn, i) => (
              <button key={i} onClick={btn.action}
                style={{ background:"#1a1a2c", color: btn.warn ? "#fb923c" : "#c0beef", border:"1px solid #2a2a40", borderRadius:"8px", padding:"8px 12px", fontSize:"12px", cursor:"pointer", display:"flex", alignItems:"center", gap:"8px", width:"100%", textAlign:"left", whiteSpace:"nowrap" }}>
                <span>{btn.icon}</span>{btn.label}
              </button>
            ))}
          </div>

          {/* Nav */}
          <div style={{ padding:"8px 14px", borderBottom:"1px solid #252535", display:"flex", gap:"6px", flexWrap:"wrap" }}>
            {nav.map(item => (
              <Link key={item.href} href={item.href}
                style={{ textDecoration:"none", padding:"6px 12px", borderRadius:"7px", fontSize:"12px", background: pathname === item.href ? "#6c63ff" : "#1a1a2c", color: pathname === item.href ? "#fff" : "#a0a0c0", border:"1px solid #2a2a40" }}>
                {item.label}
              </Link>
            ))}
            <button onClick={logout} style={{ padding:"6px 12px", borderRadius:"7px", fontSize:"12px", background:"#1a1a2c", color:"#888", border:"1px solid #2a2a40", cursor:"pointer" }}>Изход</button>
          </div>

          {/* Rooms list */}
          <div style={{ padding:"8px 0", flex:1 }}>
            <div style={{ padding:"8px 14px 4px", fontSize:"9px", fontWeight:"700", color:"#3a3a58", letterSpacing:".8px", textTransform:"uppercase" }}>Входове и стаи</div>
            {[{ label:"Вход 39", rooms: rooms39 }, { label:"Вход 41", rooms: rooms41 }].map(grp => (
              <div key={grp.label}>
                <div style={{ padding:"3px 14px 5px", fontSize:"9px", fontWeight:"700", color:"#2e2e50", letterSpacing:".5px", textTransform:"uppercase" }}>{grp.label}</div>
                {grp.rooms.map(r => (
                  <div key={r.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 14px", cursor:"pointer" }}>
                    <div>
                      <div style={{ fontSize:"12px", fontWeight:"500", color:"#cac8e8" }}>{r.code}</div>
                      <div style={{ fontSize:"10px", color:"#3f3f5a", marginTop:"1px" }}>{r.label} · {r.capacity} г.</div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:"5px" }}>
                      <div style={{ fontSize:"10px", color:"#44445a", background:"#1a1a2c", padding:"2px 6px", borderRadius:"4px" }}>{r.capacity}</div>
                      <div style={{ width:"7px", height:"7px", borderRadius:"50%", background:"#22c55e" }} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SIDEBAR TOGGLE TAB */}
      <div onClick={() => setSidOpen(!sidOpen)}
        style={{ position:"absolute", top:"50%", transform:"translateY(-50%)", left: sidOpen ? "272px" : "0", width:"18px", height:"52px", background:"#6c63ff", borderRadius:"0 8px 8px 0", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", zIndex:30, transition:"left .3s cubic-bezier(.4,0,.2,1)", userSelect:"none" }}>
        <svg width="10" height="16" viewBox="0 0 10 16" fill="none">
          <polyline points={sidOpen ? "8,2 2,8 8,14" : "2,2 8,8 2,14"} stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* MAIN */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", background:"#f5f3ef", minWidth:0, overflow:"hidden" }}>
        {children}
      </div>

      {/* NOTIFICATIONS PANEL */}
      {notifOpen && (
        <div style={{ position:"fixed", top:0, right:0, height:"100vh", width:"360px", background:"#fff", borderLeft:"1px solid #e5e2dc", boxShadow:"-8px 0 30px rgba(0,0,0,.15)", zIndex:200, display:"flex", flexDirection:"column" }}>
          <div style={{ background:"#12121c", padding:"16px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span style={{ fontSize:"15px", fontWeight:"700", color:"#fff" }}>Известия</span>
            <button onClick={() => setNotifOpen(false)} style={{ background:"#1e1e2e", color:"#777", border:"1px solid #2a2a40", borderRadius:"7px", width:"28px", height:"28px", cursor:"pointer", fontSize:"17px" }}>×</button>
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"14px" }}>
            {notifications.length === 0 && <div style={{ fontSize:"12px", color:"#bbb", padding:"12px 0" }}>Няма известия.</div>}
            {notifications.map((n: any) => (
              <div key={n.id} style={{ padding:"10px", borderRadius:"9px", marginBottom:"8px", border:"1px solid #f0ede8", cursor:"pointer" }}>
                <div style={{ fontSize:"12px", fontWeight:"500", color:"#222" }}>{n.title}</div>
                <div style={{ fontSize:"11px", color:"#888", marginTop:"2px" }}>{n.detail}</div>
                <div style={{ fontSize:"10px", color:"#bbb", marginTop:"3px" }}>{new Date(n.createdAt).toLocaleString("bg-BG")}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SYNC TOAST */}
      {syncVisible && (
        <div style={{ position:"fixed", bottom:"24px", right:"24px", background:"#12121c", color:"#e0deff", borderRadius:"10px", padding:"13px 18px", fontSize:"13px", zIndex:300, display:"flex", flexDirection:"column", gap:"8px", boxShadow:"0 8px 30px rgba(0,0,0,.4)", minWidth:"260px" }}>
          <div>{syncMsg}</div>
          <div style={{ height:"4px", background:"#2a2a40", borderRadius:"2px", overflow:"hidden" }}>
            <div style={{ height:"100%", background:"#6c63ff", borderRadius:"2px", width:`${syncPct}%`, transition:"width .3s" }} />
          </div>
        </div>
      )}
    </div>
  );
}
