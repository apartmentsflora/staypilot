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
};
function chipStyle(src: string) {
  const c = CHIP_COLORS[src] || "#f9fafb|#d1d5db|#374151";
  const [bg,bd,tx] = c.split("|");
  return { bg, bd, tx };
}
// Voice parsing now lives in lib/voice.ts so it can be unit-tested and
// extended without touching the calendar UI.

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
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceParsed, setVoiceParsed] = useState<any>(null);
  const [voiceStatus, setVoiceStatus] = useState<"idle"|"listening"|"processing">("idle");
  const [transcript, setTranscript] = useState("");
  const recogRef = useRef<any>(null);

  // Form state
  const [form, setForm] = useState({ guestName:"", phone:"", email:"", roomCode:"", startDate:"", endDate:"", source:"Телефон", notes:"", pricePerNight:80 });
  const nights = useMemo(() => {
    if (!form.startDate || !form.endDate) return 1;
    return Math.max(1, Math.round((parseD(form.endDate).getTime() - parseD(form.startDate).getTime()) / 86400000));
  }, [form.startDate, form.endDate]);

  const load = useCallback(async () => {
    const [rRes, bRes] = await Promise.all([fetch("/api/rooms"), fetch("/api/reservations")]);
    if (rRes.ok) setRooms(await rRes.json());
    if (bRes.ok) setReservations(await bRes.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  // Preload voice form dates when modal opens
  useEffect(() => {
    if (modal) {
      const end = toDS(addD(parseD(sel), 1));
      setForm(f => ({
        ...f,
        startDate: voiceParsed?.start || sel,
        endDate: voiceParsed?.end || end,
        guestName: voiceParsed?.name || f.guestName,
        phone: voiceParsed?.phone || f.phone,
        roomCode: voiceParsed?.room || f.roomCode,
        email: voiceParsed?.email || (f as any).email || "",
        notes: voiceParsed?.notes || f.notes,
        guests: voiceParsed?.guests || (f as any).guests || "",
        pricePerNight: voiceParsed?.pricePerNight || f.pricePerNight,
        arrivalTime: voiceParsed?.arrivalTime || (f as any).arrivalTime || "14:00",
        departTime: voiceParsed?.departureTime || (f as any).departTime || "11:00",
      }));
    }
  }, [modal, sel, voiceParsed]);

  // ── filter + derived ──────────────────────────────────────────────────────
  const visRes = useMemo(() => reservations.filter(r => {
    if (r.source==="Booking" && !filters.bk) return false;
    if (r.source==="Beds24"  && !filters.b2) return false;
    if (r.source==="Телефон" && !filters.ph) return false;
    if ((r.source==="Директна"||r.source==="Direct") && !filters.dr) return false;
    if (r.source==="Уебсайт" && !filters.web) return false;
    return true;
  }), [reservations, filters]);

  const activeOn  = useCallback((ds: string) => visRes.filter(r => inRange(ds, r)), [visRes]);
  const checkouts = useCallback((ds: string) => visRes.filter(r => r.endDate.slice(0,10) === ds), [visRes]);

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
  function startVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Гласовото попълване изисква Chrome браузър."); return; }
    const rec = new SR();
    rec.lang = "bg-BG"; rec.continuous = false; rec.interimResults = true; rec.maxAlternatives = 3;
    recogRef.current = rec;
    setVoiceStatus("listening"); setTranscript("");
    rec.onresult = (e: any) => {
      const t = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join(" ");
      setTranscript(t);
      if (e.results[0].isFinal) {
        setVoiceStatus("processing");
        const parsed = parseVoice(t, yr);
        setVoiceParsed(parsed);
        setVoiceStatus("idle");
      }
    };
    rec.onerror = () => setVoiceStatus("idle");
    rec.onend = () => { if (voiceStatus === "listening") setVoiceStatus("idle"); };
    rec.start();
  }

  function stopVoice() {
    try { recogRef.current?.stop(); } catch {}
    setVoiceStatus("idle");
  }

  function confirmVoice() {
    stopVoice(); setVoiceOpen(false); setModal(true);
  }

  // ── save reservation ──────────────────────────────────────────────────────
  async function saveRes() {
    if (!form.guestName.trim() || !form.roomCode || !form.startDate || !form.endDate) return;
    const res = await fetch("/api/reservations", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ ...form }),
    });
    if (res.ok) {
      setModal(false); setVoiceParsed(null);
      setForm({ guestName:"", phone:"", email:"", roomCode:"", startDate:"", endDate:"", source:"Телефон", notes:"", pricePerNight:80 });
      await load();
    } else {
      const e = await res.json();
      alert(e.error || "Грешка при запис");
    }
  }

  async function cancelRes(id: string) {
    await fetch(`/api/reservations/${id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ status:"CANCELLED" }) });
    await load();
  }

  const activeToday = activeOn(sel);
  const coToday = checkouts(sel);
  const todayStr = toDS(now);

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <DashboardShell stats={{ active: activeOn(todayStr).length, occ: Math.round(activeOn(todayStr).length/18*100), rev: 0, month: mo, selFmt: fmtS(sel) }}>
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* TOPBAR */}
        <div style={{ background:"#fff", borderBottom:"1px solid #e5e2dc", padding:"10px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"10px", flexWrap:"wrap", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
            <button onClick={() => { const d = new Date(yr,mo-1,1); setYr(d.getFullYear()); setMo(d.getMonth()); }}
              style={{ background:"#f5f3ef", border:"1px solid #dedad4", borderRadius:"7px", width:"28px", height:"28px", cursor:"pointer", fontSize:"16px" }}>‹</button>
            <span style={{ fontSize:"18px", fontWeight:"700", minWidth:"165px", textAlign:"center" }}>{MBG[mo]} {yr}</span>
            <button onClick={() => { const d = new Date(yr,mo+1,1); setYr(d.getFullYear()); setMo(d.getMonth()); }}
              style={{ background:"#f5f3ef", border:"1px solid #dedad4", borderRadius:"7px", width:"28px", height:"28px", cursor:"pointer", fontSize:"16px" }}>›</button>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:"7px", flexWrap:"wrap" }}>
            {(["bk","b2","ph","dr","web"] as const).map((k,i) => {
              const labels = { bk:"Booking.com", b2:"Beds24", ph:"Телефон", dr:"Директна", web:"Уебсайт" };
              return (
                <button key={k} onClick={() => setFilters(f => ({...f, [k]:!f[k]}))}
                  style={{ border:"1px solid #dedad4", borderRadius:"7px", padding:"5px 10px", fontSize:"11px", background: filters[k] ? "#f0efff" : "#fff", color: filters[k] ? "#6c63ff" : "#555", cursor:"pointer", borderColor: filters[k] ? "#6c63ff" : "#dedad4" }}>
                  {labels[k]}
                </button>
              );
            })}
            <div style={{ display:"flex", alignItems:"center", gap:"5px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:"7px", padding:"5px 10px", fontSize:"11px", color:"#15803d" }}>
              <div style={{ width:"6px", height:"6px", borderRadius:"50%", background:"#22c55e" }} />
              Синхр. активна
            </div>
            <button onClick={() => { setSel(toDS(now)); setModal(true); }}
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
                  <div key={ds} onClick={() => { setSel(ds); setModal(true); }}
                    style={{ borderRight:"1px solid #f0ede8", borderBottom:"1px solid #f0ede8", padding:"7px 6px", minHeight:"120px", cursor:"pointer", background: isSel ? "#f0efff" : "white", outline: isSel ? "2px solid #6c63ff" : "none", outlineOffset:"-2px", opacity: outside ? 0.4 : 1, transition:"background .1s" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"5px" }}>
                      <span style={{ fontSize:"12px", fontWeight:"600", color: isToday ? "#fff" : "#333", background: isToday ? "#6c63ff" : "transparent", borderRadius: isToday ? "50%" : "0", width: isToday ? "21px" : "auto", height: isToday ? "21px" : "auto", display:"flex", alignItems:"center", justifyContent:"center" }}>{dt.getDate()}</span>
                      {dr.length > 0 && <span style={{ fontSize:"10px", background:"#6c63ff", color:"#fff", borderRadius:"4px", padding:"1px 5px", fontWeight:"600" }}>{dr.length}</span>}
                    </div>
                    {dr.slice(0,3).map(r => {
                      const cs = chipStyle(r.source);
                      return (
                        <div key={r.id} style={{ borderRadius:"7px", padding:"5px 7px", marginBottom:"3px", background:cs.bg, border:`1px solid ${cs.bd}`, color:cs.tx, display:"flex", alignItems:"center", gap:"5px" }}
                          onClick={e => { e.stopPropagation(); setSel(ds); setModal(true); }}>
                          <div style={{ width:"18px", height:"18px", borderRadius:"50%", background:cs.bd, color:cs.tx, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"8px", fontWeight:"700", flexShrink:0 }}>
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
                        const cs = res ? chipStyle(res.source) : null;
                        return (
                          <td key={ds} style={{ borderBottom:"1px solid #f0ede8", borderRight:"1px solid #f0ede8", padding:"4px 5px", height:"52px", background: isSel ? "#f9f8ff" : "#fff", verticalAlign:"middle" }}>
                            {res && cs ? (
                              <div style={{ borderRadius:"6px", padding:"4px 7px", background:cs.bg, border:`1px solid ${cs.bd}`, color:cs.tx, height:"44px", display:"flex", flexDirection:"column", justifyContent:"center", cursor:"pointer" }}
                                onClick={() => { setSel(ds); setModal(true); }}>
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

          {/* BOTTOM PANELS */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px", marginBottom:"14px" }}>
            <div style={{ background:"#fff", borderRadius:"12px", border:"1px solid #e5e2dc", padding:"13px 15px" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"10px" }}>
                <span style={{ fontSize:"13px", fontWeight:"700" }}>Резервации за {fmtS(sel)}</span>
              </div>
              {activeToday.length === 0 && <div style={{ fontSize:"12px", color:"#bbb", padding:"8px 0" }}>Няма активни резервации.</div>}
              {activeToday.map(r => {
                const cs = chipStyle(r.source);
                return (
                  <div key={r.id} style={{ borderRadius:"9px", padding:"10px 12px", marginBottom:"8px", background:cs.bg, border:`1px solid ${cs.bd}`, color:cs.tx }}>
                    <div style={{ display:"flex", alignItems:"flex-start", gap:"9px" }}>
                      <div style={{ width:"30px", height:"30px", borderRadius:"50%", background:cs.bd, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"11px", fontWeight:"700", flexShrink:0 }}>{(r.guestName||"?")[0]}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:"13px", fontWeight:"700" }}>{r.guestName}</div>
                        <div style={{ fontSize:"11px", opacity:.75, marginTop:"2px" }}>Стая {r.roomCode} · {r.phone}</div>
                        <div style={{ fontSize:"11px", opacity:.65, marginTop:"1px" }}>{fmtS(r.startDate.slice(0,10))} — {fmtS(r.endDate.slice(0,10))}</div>
                        {r.notes && <div style={{ fontSize:"11px", opacity:.6, marginTop:"3px", fontStyle:"italic" }}>{r.notes}</div>}
                        <div style={{ display:"flex", gap:"5px", marginTop:"6px", flexWrap:"wrap" }}>
                          <span style={{ fontSize:"10px", padding:"2px 6px", borderRadius:"4px", background:cs.bd, color:cs.tx, fontWeight:"500" }}>{r.source}</span>
                        </div>
                      </div>
                      <button onClick={() => cancelRes(r.id)} style={{ fontSize:"10px", padding:"3px 8px", borderRadius:"5px", background:"rgba(255,255,255,.6)", border:`1px solid ${cs.bd}`, cursor:"pointer", color:cs.tx, flexShrink:0 }}>Анулирай</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ background:"#fff", borderRadius:"12px", border:"1px solid #e5e2dc", padding:"13px 15px" }}>
              <div style={{ fontSize:"13px", fontWeight:"700", marginBottom:"10px" }}>Освобождавания за {fmtS(sel)}</div>
              {coToday.length === 0 && <div style={{ fontSize:"12px", color:"#bbb", padding:"8px 0" }}>Няма освобождавания.</div>}
              {coToday.map(r => (
                <div key={r.id} style={{ display:"flex", alignItems:"center", gap:"9px", padding:"8px 10px", background:"#fffbf0", borderRadius:"8px", marginBottom:"6px", borderLeft:"3px solid #f59e0b" }}>
                  <div style={{ width:"28px", height:"28px", borderRadius:"50%", background:"#fcd34d", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"10px", fontWeight:"700" }}>{(r.guestName||"?")[0]}</div>
                  <div>
                    <div style={{ fontSize:"12px", fontWeight:"700" }}>{r.guestName}</div>
                    <div style={{ fontSize:"11px", color:"#aaa" }}>Стая {r.roomCode} · освобождава на {fmtS(sel)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* RESERVATION MODAL */}
      {modal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(5,5,15,.6)", display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"24px 14px", zIndex:100, overflowY:"auto" }}
          onClick={e => { if (e.currentTarget === e.target) { setModal(false); setVoiceParsed(null); } }}>
          <div style={{ background:"#fff", borderRadius:"16px", width:"880px", maxWidth:"100%", overflow:"hidden", border:"1px solid #e5e2dc", boxShadow:"0 30px 90px rgba(0,0,0,.35)" }}>
            <div style={{ background:"#12121c", padding:"16px 22px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:"15px", fontWeight:"700", color:"#fff" }}>Нова резервация · {fmtS(sel)}</div>
                <div style={{ fontSize:"11px", color:"#55547a", marginTop:"2px" }}>Заетите стаи се скриват автоматично · Синхронизира се с Beds24 и Booking.com</div>
              </div>
              <div style={{ display:"flex", gap:"8px" }}>
                <button onClick={() => { setModal(false); setVoiceOpen(true); }} style={{ background:"#1e1e2e", color:"#a09fff", border:"1px solid #2a2a40", borderRadius:"7px", padding:"6px 12px", cursor:"pointer", fontSize:"12px" }}>🎤 Гласово</button>
                <button onClick={() => { setModal(false); setVoiceParsed(null); }} style={{ background:"#1e1e2e", color:"#777", border:"1px solid #2a2a40", borderRadius:"7px", width:"28px", height:"28px", cursor:"pointer", fontSize:"17px", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr" }}>
              <div style={{ padding:"18px 20px", borderRight:"1px solid #f0ede8" }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"9px" }}>
                  {[
                    { label:"Гост", id:"guestName", placeholder:"Иван Петров" },
                    { label:"Телефон", id:"phone", placeholder:"+359888..." },
                    { label:"Email", id:"email", placeholder:"guest@example.com" },
                    { label:"Брой гости", id:"guests", placeholder:"2", type:"number" },
                    { label:"Дата начало", id:"startDate", type:"date" },
                    { label:"Дата край", id:"endDate", type:"date" },
                    { label:"Час пристигане", id:"arrivalTime", type:"time", defaultVal:"14:00" },
                    { label:"Час заминаване", id:"departTime", type:"time", defaultVal:"11:00" },
                    { label:"Цена / нощ (€)", id:"pricePerNight", type:"number" },
                  ].map(f => (
                    <div key={f.id} style={f.id==="guestName"||f.id==="email"||f.id==="notes"?{gridColumn:"span 1"}:{}}>
                      <label style={{ fontSize:"11px", fontWeight:"700", color:"#888", display:"block", marginBottom:"4px" }}>{f.label.toUpperCase()}</label>
                      <input type={f.type||"text"} placeholder={f.placeholder||""} value={(form as any)[f.id]||f.defaultVal||""}
                        onChange={e => setForm(prev => ({...prev, [f.id]: e.target.value}))}
                        style={{ height:"36px", width:"100%", border:"1px solid #dedad4", borderRadius:"8px", padding:"0 11px", fontSize:"13px", background:"#faf9f7", color:"#111", outline:"none" }} />
                    </div>
                  ))}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"9px", marginTop:"9px" }}>
                  <div>
                    <label style={{ fontSize:"11px", fontWeight:"700", color:"#888", display:"block", marginBottom:"4px" }}>СТАЯ</label>
                    <select value={form.roomCode} onChange={e => setForm(f => ({...f,roomCode:e.target.value}))}
                      style={{ height:"36px", width:"100%", border:"1px solid #dedad4", borderRadius:"8px", padding:"0 11px", fontSize:"13px", background:"#faf9f7", color:"#111", outline:"none" }}>
                      <option value="">Избери стая...</option>
                      {rooms.map(r => <option key={r.id} value={r.code}>{r.code} · Вход {r.entrance} · {r.label} ({r.capacity} г.)</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:"11px", fontWeight:"700", color:"#888", display:"block", marginBottom:"4px" }}>ИЗТОЧНИК</label>
                    <select value={form.source} onChange={e => setForm(f => ({...f,source:e.target.value}))}
                      style={{ height:"36px", width:"100%", border:"1px solid #dedad4", borderRadius:"8px", padding:"0 11px", fontSize:"13px", background:"#faf9f7", color:"#111", outline:"none" }}>
                      {["Телефон","Booking","Beds24","Директна","Уебсайт","Airbnb"].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginTop:"9px" }}>
                  <label style={{ fontSize:"11px", fontWeight:"700", color:"#888", display:"block", marginBottom:"4px" }}>СПЕЦИАЛНИ ЖЕЛАНИЯ</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({...f,notes:e.target.value}))} placeholder="Ранно пристигане, паркинг, детско легло..."
                    style={{ width:"100%", border:"1px solid #dedad4", borderRadius:"8px", padding:"8px 11px", fontSize:"13px", background:"#faf9f7", color:"#111", resize:"none", height:"52px", outline:"none" }} />
                </div>
                <div style={{ background:"#f5f3ff", border:"1px solid #ddd3fe", borderRadius:"8px", padding:"9px 13px", marginTop:"9px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ fontSize:"12px", color:"#6c63ff" }}>{nights} нощи</div>
                  <div style={{ fontSize:"19px", fontWeight:"700", color:"#4c1d95" }}>€{Math.round(form.pricePerNight * nights)}</div>
                </div>
                <div style={{ display:"flex", gap:"7px", marginTop:"11px" }}>
                  <button onClick={saveRes} style={{ background:"#6c63ff", color:"#fff", border:"none", borderRadius:"8px", padding:"9px 18px", fontSize:"13px", fontWeight:"600", cursor:"pointer" }}>💾 Запази резервацията</button>
                  <button onClick={() => { setModal(false); setVoiceParsed(null); }} style={{ background:"#f5f3ef", color:"#666", border:"1px solid #dedad4", borderRadius:"8px", padding:"9px 14px", fontSize:"13px", cursor:"pointer" }}>Затвори</button>
                </div>
                <div style={{ fontSize:"10px", color:"#bbb", marginTop:"7px" }}>Синхронизира се автоматично с Beds24, Booking.com и уебсайта</div>
              </div>
              <div style={{ padding:"18px 20px", background:"#faf9f7", maxHeight:"580px", overflowY:"auto" }}>
                <div style={{ fontSize:"11px", fontWeight:"700", color:"#888", letterSpacing:".4px", textTransform:"uppercase", marginBottom:"8px", paddingBottom:"6px", borderBottom:"1px solid #eee" }}>Активни резервации за {fmtS(sel)}</div>
                {activeToday.length === 0 && <div style={{ fontSize:"12px", color:"#bbb", padding:"8px 0" }}>Няма активни.</div>}
                {activeToday.map(r => {
                  const cs = chipStyle(r.source);
                  return (
                    <div key={r.id} style={{ borderRadius:"9px", padding:"10px 12px", marginBottom:"8px", background:cs.bg, border:`1px solid ${cs.bd}`, color:cs.tx }}>
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

      {/* VOICE MODAL */}
      {voiceOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(5,5,15,.6)", display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"40px 14px", zIndex:110 }}
          onClick={e => { if (e.currentTarget===e.target) { stopVoice(); setVoiceOpen(false); } }}>
          <div style={{ background:"#fff", borderRadius:"14px", width:"560px", maxWidth:"100%", overflow:"hidden", border:"1px solid #dedad4", boxShadow:"0 20px 60px rgba(0,0,0,.3)" }}>
            <div style={{ background:"#12121c", padding:"15px 20px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:"15px", fontWeight:"700", color:"#fff" }}>🎤 Гласово попълване</div>
                <div style={{ fontSize:"11px", color:"#55547a", marginTop:"2px" }}>Говорете на български – системата разпознава данните</div>
              </div>
              <button onClick={() => { stopVoice(); setVoiceOpen(false); }} style={{ background:"#1e1e2e", color:"#777", border:"1px solid #2a2a40", borderRadius:"7px", width:"28px", height:"28px", cursor:"pointer", fontSize:"17px", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
            </div>
            <div style={{ padding:"20px" }}>
              <button onClick={voiceStatus==="listening" ? stopVoice : startVoice}
                style={{ width:"80px", height:"80px", borderRadius:"50%", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", fontSize:"32px", background: voiceStatus==="listening" ? "#6c63ff" : voiceStatus==="processing" ? "#f59e0b" : "#f5f3ff", boxShadow: voiceStatus==="listening" ? "0 0 0 8px rgba(108,99,255,.2)" : "none" }}>
                {voiceStatus==="listening" ? "🔴" : voiceStatus==="processing" ? "⏳" : "🎤"}
              </button>
              <div style={{ textAlign:"center", fontSize:"13px", color:"#555", marginBottom:"14px", minHeight:"20px" }}>
                {voiceStatus==="idle" ? "Натисни микрофона и говори на български" : voiceStatus==="listening" ? "Слушам... говорете ясно" : "Обработвам..."}
              </div>
              {transcript && (
                <div style={{ background:"#f5f3ef", borderRadius:"8px", padding:"12px", minHeight:"50px", fontSize:"13px", color:"#333", marginBottom:"14px", border:"1px solid #e5e2dc", fontStyle:"italic" }}>
                  "{transcript}"
                </div>
              )}
              {voiceParsed && (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px", marginBottom:"14px" }}>
                  {[["Гост",voiceParsed.name],["Стая",voiceParsed.room],["От дата",voiceParsed.start?fmtS(voiceParsed.start):"—"],["До дата",voiceParsed.end?fmtS(voiceParsed.end):"—"],["Телефон",voiceParsed.phone||null]].filter(([,v])=>v).map(([lbl,val])=>(
                    <div key={lbl as string} style={{ background:"#f0efff", borderRadius:"7px", padding:"8px 11px", border:"1px solid #ddd3fe" }}>
                      <div style={{ fontSize:"10px", fontWeight:"700", color:"#6c63ff", letterSpacing:".3px" }}>{(lbl as string).toUpperCase()}</div>
                      <div style={{ fontSize:"12px", fontWeight:"600", color:"#3b0764", marginTop:"3px" }}>{val as string}</div>
                    </div>
                  ))}
                </div>
              )}
              {!voiceParsed && !transcript && (
                <div style={{ background:"#faf9f7", borderRadius:"8px", padding:"12px", border:"1px solid #e5e2dc", marginBottom:"14px" }}>
                  <div style={{ fontSize:"11px", fontWeight:"700", color:"#888", marginBottom:"7px" }}>Примерни команди:</div>
                  {["Резервация за Иван Петров стая 1.3 от пети май до десети май","Запиши Мария Иванова стая 2.4.1 от 12 юни до 15 юни","Нова резервация стая 41.0.2 Georgi Kolev от 3 юли до 7 юли"].map((ex,i) => (
                    <div key={i} style={{ fontSize:"12px", color:"#555", marginBottom:"4px", paddingLeft:"12px", position:"relative" }}>
                      <span style={{ position:"absolute", left:0, color:"#6c63ff" }}>›</span>{ex}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display:"flex", gap:"8px" }}>
                <button onClick={confirmVoice} disabled={!voiceParsed}
                  style={{ background: voiceParsed ? "#6c63ff" : "#ddd", color:"#fff", border:"none", borderRadius:"8px", padding:"9px 18px", fontSize:"13px", fontWeight:"600", cursor: voiceParsed ? "pointer" : "not-allowed", flex:1 }}>
                  ✓ Потвърди и продължи
                </button>
                <button onClick={() => { stopVoice(); setVoiceParsed(null); setTranscript(""); }} style={{ background:"#f5f3ef", color:"#666", border:"1px solid #dedad4", borderRadius:"8px", padding:"9px 14px", fontSize:"13px", cursor:"pointer" }}>🔄 Опитай пак</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
