"use client";
import { useState, useEffect } from "react";
import { DashboardShell } from "@/components/DashboardShell";

export default function SettingsPage() {
  const [beds24Key, setBeds24Key] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [webhookKey, setWebhookKey] = useState("sp_live_" + Math.random().toString(36).slice(2, 12));
  const [saved, setSaved] = useState("");
  const [appUrl, setAppUrl] = useState("");

  useEffect(() => {
    setAppUrl(window.location.origin);
    fetch("/api/integrations/settings").then(r => r.json()).then(d => {
      if (d.beds24?.apiKey) setBeds24Key(d.beds24.apiKey);
      if (d.website?.url) setWebsiteUrl(d.website.url);
      if (d.website?.apiKey) setWebhookKey(d.website.apiKey);
    });
  }, []);

  async function save(provider: string, values: any) {
    await fetch("/api/integrations/settings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, values }),
    });
    setSaved(provider);
    setTimeout(() => setSaved(""), 2500);
  }

  const WEBHOOK_URLS = [
    { label: "Beds24 webhook URL", url: `${appUrl}/api/integrations/beds24/webhook`, desc: "Постави в Beds24 → Notifications → Webhook" },
    { label: "Booking.com webhook URL", url: `${appUrl}/api/integrations/booking/webhook`, desc: "Постави в Booking.com Extranet → Connectivity" },
    { label: "Уебсайт webhook URL", url: `${appUrl}/api/integrations/website/webhook`, desc: "Постави в booking формата на уебсайта" },
    { label: "Проверка на наличност (API)", url: `${appUrl}/api/availability?start=2026-06-01&end=2026-06-05`, desc: "GET endpoint за свободни стаи по дати" },
  ];

  return (
    <DashboardShell>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
        <div style={{ fontSize:"18px", fontWeight:"700", color:"#111", marginBottom:"16px" }}>Настройки · Интеграции</div>

        {/* Beds24 */}
        <div style={{ background:"#fff", borderRadius:"12px", border:"1px solid #e5e2dc", padding:"16px 18px", marginBottom:"14px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"14px" }}>
            <div style={{ width:"36px", height:"36px", borderRadius:"8px", background:"#e0f2fe", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:"700", fontSize:"12px", color:"#0369a1" }}>B24</div>
            <div>
              <div style={{ fontSize:"14px", fontWeight:"700" }}>Beds24</div>
              <div style={{ fontSize:"11px", color:"#888" }}>Property IDs: 320505 · 320506 · 18 стаи</div>
            </div>
            <div style={{ marginLeft:"auto", fontSize:"11px", color:"#16a34a", fontWeight:"600" }}>● Конфигуриран</div>
          </div>
          <label style={{ fontSize:"11px", fontWeight:"700", color:"#888", display:"block", marginBottom:"4px" }}>BEDS24 API KEY</label>
          <div style={{ display:"flex", gap:"8px" }}>
            <input value={beds24Key} onChange={e => setBeds24Key(e.target.value)} placeholder="Въведи Beds24 API ключ..."
              style={{ flex:1, height:"36px", border:"1px solid #dedad4", borderRadius:"8px", padding:"0 12px", fontSize:"13px", background:"#faf9f7", outline:"none" }} />
            <button onClick={() => save("beds24", { apiKey: beds24Key })}
              style={{ background: saved==="beds24" ? "#16a34a" : "#6c63ff", color:"#fff", border:"none", borderRadius:"8px", padding:"0 16px", fontSize:"13px", fontWeight:"600", cursor:"pointer" }}>
              {saved==="beds24" ? "✓ Запазено" : "Запази"}
            </button>
          </div>
          <div style={{ marginTop:"10px", fontSize:"11px", color:"#888" }}>
            Намери API ключа в: Beds24 → Settings → Account → API Keys
          </div>
        </div>

        {/* Booking.com */}
        <div style={{ background:"#fff", borderRadius:"12px", border:"1px solid #e5e2dc", padding:"16px 18px", marginBottom:"14px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"12px" }}>
            <div style={{ width:"36px", height:"36px", borderRadius:"8px", background:"#dbeafe", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:"700", fontSize:"12px", color:"#1e40af" }}>BK</div>
            <div>
              <div style={{ fontSize:"14px", fontWeight:"700" }}>Booking.com</div>
              <div style={{ fontSize:"11px", color:"#888" }}>Hotel IDs: 2248792 · 2310023 · Channel Manager: Beds24</div>
            </div>
          </div>
          <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:"8px", padding:"10px 14px", fontSize:"12px", color:"#15803d" }}>
            ✓ Booking.com се синхронизира автоматично чрез Beds24 като Channel Manager. Не са нужни допълнителни настройки тук — всичко минава в реално време.
          </div>
        </div>

        {/* Website */}
        <div style={{ background:"#fff", borderRadius:"12px", border:"1px solid #e5e2dc", padding:"16px 18px", marginBottom:"14px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"14px" }}>
            <div style={{ width:"36px", height:"36px", borderRadius:"8px", background:"#f0fdf4", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"18px" }}>🌐</div>
            <div>
              <div style={{ fontSize:"14px", fontWeight:"700" }}>Уебсайт · Директни резервации</div>
              <div style={{ fontSize:"11px", color:"#888" }}>Двупосочна синхронизация с хотелския сайт</div>
            </div>
          </div>
          <div style={{ marginBottom:"10px" }}>
            <label style={{ fontSize:"11px", fontWeight:"700", color:"#888", display:"block", marginBottom:"4px" }}>URL НА УЕБСАЙТА</label>
            <div style={{ display:"flex", gap:"8px" }}>
              <input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder="https://flora-lazur.com"
                style={{ flex:1, height:"36px", border:"1px solid #dedad4", borderRadius:"8px", padding:"0 12px", fontSize:"13px", background:"#faf9f7", outline:"none" }} />
              <button onClick={() => save("website", { url: websiteUrl, apiKey: webhookKey })}
                style={{ background: saved==="website" ? "#16a34a" : "#34d399", color:"#fff", border:"none", borderRadius:"8px", padding:"0 16px", fontSize:"13px", fontWeight:"600", cursor:"pointer" }}>
                {saved==="website" ? "✓ Запазено" : "Запази"}
              </button>
            </div>
          </div>
          <div>
            <label style={{ fontSize:"11px", fontWeight:"700", color:"#888", display:"block", marginBottom:"4px" }}>API КЛЮЧ ЗА УЕБСАЙТА</label>
            <div style={{ display:"flex", gap:"8px" }}>
              <input value={webhookKey} readOnly style={{ flex:1, height:"36px", border:"1px solid #dedad4", borderRadius:"8px", padding:"0 12px", fontSize:"12px", background:"#f5f3ef", outline:"none", fontFamily:"monospace" }} />
              <button onClick={() => navigator.clipboard?.writeText(webhookKey)}
                style={{ background:"#f5f3ef", color:"#555", border:"1px solid #dedad4", borderRadius:"8px", padding:"0 14px", fontSize:"12px", cursor:"pointer" }}>Копирай</button>
            </div>
            <div style={{ fontSize:"11px", color:"#888", marginTop:"5px" }}>Изпрати X-StayPilot-Key: {webhookKey.slice(0,12)}... заедно с всяка заявка от уебсайта</div>
          </div>
        </div>

        {/* Webhook URLs */}
        <div style={{ background:"#fff", borderRadius:"12px", border:"1px solid #e5e2dc", padding:"16px 18px" }}>
          <div style={{ fontSize:"14px", fontWeight:"700", marginBottom:"14px" }}>Webhook адреси</div>
          {WEBHOOK_URLS.map((w, i) => (
            <div key={i} style={{ marginBottom:"12px" }}>
              <div style={{ fontSize:"11px", fontWeight:"700", color:"#888", marginBottom:"4px" }}>{w.label}</div>
              <div style={{ display:"flex", gap:"8px" }}>
                <input value={w.url} readOnly style={{ flex:1, height:"34px", border:"1px solid #e5e2dc", borderRadius:"7px", padding:"0 10px", fontSize:"11px", background:"#f5f3ef", fontFamily:"monospace", outline:"none" }} />
                <button onClick={() => navigator.clipboard?.writeText(w.url)} style={{ background:"#f5f3ef", color:"#555", border:"1px solid #dedad4", borderRadius:"7px", padding:"0 12px", fontSize:"11px", cursor:"pointer" }}>Копирай</button>
              </div>
              <div style={{ fontSize:"10px", color:"#aaa", marginTop:"3px" }}>{w.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
