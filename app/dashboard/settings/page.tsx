"use client";
import { useState, useEffect } from "react";
import { DashboardShell } from "@/components/DashboardShell";

export default function SettingsPage() {
  const [beds24Key, setBeds24Key] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [webhookKey, setWebhookKey] = useState("sp_live_" + Math.random().toString(36).slice(2, 12));
  const [saved, setSaved] = useState("");
  const [appUrl, setAppUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number; cancelled: number; skipped: number; total: number } | null>(null);
  const [importError, setImportError] = useState("");
  const [beds24Connected, setBeds24Connected] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupMsg, setSetupMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setAppUrl(window.location.origin);
    fetch("/api/integrations/settings").then(r => r.json()).then(d => {
      if (d.beds24?.refreshToken || d.beds24?.apiKey) {
        setBeds24Key(d.beds24.refreshToken || d.beds24.apiKey);
        setBeds24Connected(true);
      }
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
              <div style={{ fontSize:"11px", color:"#888" }}>Property IDs: 322955 · 322959 · 18 стаи</div>
            </div>
            <div style={{ marginLeft:"auto", fontSize:"11px", color:"#16a34a", fontWeight:"600" }}>● Конфигуриран</div>
          </div>
          <label style={{ fontSize:"11px", fontWeight:"700", color:"#888", display:"block", marginBottom:"4px" }}>
            {beds24Connected ? "BEDS24 СВЪРЗАН" : "BEDS24 INVITE CODE"}
          </label>
          {beds24Connected ? (
            <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
              <div style={{ flex:1, background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:"8px", padding:"10px 14px", fontSize:"12px", color:"#15803d" }}>
                ✓ Beds24 е свързан. Може да импортираш резервации по-долу.
              </div>
              <button onClick={() => { setBeds24Connected(false); setBeds24Key(""); setSetupMsg(null); }}
                style={{ background:"#f5f3ef", color:"#555", border:"1px solid #dedad4", borderRadius:"8px", padding:"0 14px", height:"36px", fontSize:"12px", cursor:"pointer", whiteSpace:"nowrap" }}>
                Свържи отново
              </button>
            </div>
          ) : (
            <>
              <div style={{ display:"flex", gap:"8px" }}>
                <input value={beds24Key} onChange={e => setBeds24Key(e.target.value)} placeholder="Постави invite code от Beds24..."
                  style={{ flex:1, height:"36px", border:"1px solid #dedad4", borderRadius:"8px", padding:"0 12px", fontSize:"13px", background:"#faf9f7", outline:"none" }} />
                <button
                  disabled={setupLoading || !beds24Key.trim()}
                  onClick={async () => {
                    setSetupLoading(true); setSetupMsg(null);
                    try {
                      const r = await fetch("/api/integrations/beds24/setup", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ inviteCode: beds24Key.trim() }),
                      });
                      const d = await r.json();
                      if (d.ok) {
                        setSetupMsg({ ok: true, text: d.message || "Свързан!" });
                        setBeds24Connected(true);
                      } else {
                        setSetupMsg({ ok: false, text: d.error + (d.detail ? ` — ${JSON.stringify(d.detail)}` : "") });
                      }
                    } catch (e: any) { setSetupMsg({ ok: false, text: e.message || "Грешка" }); }
                    setSetupLoading(false);
                  }}
                  style={{
                    background: setupLoading ? "#d1d5db" : "#6c63ff", color:"#fff", border:"none", borderRadius:"8px",
                    padding:"0 16px", fontSize:"13px", fontWeight:"600", cursor: setupLoading ? "not-allowed" : "pointer"
                  }}>
                  {setupLoading ? "Свързване..." : "Свържи"}
                </button>
              </div>
              {setupMsg && (
                <div style={{ marginTop:"8px", fontSize:"11px", color: setupMsg.ok ? "#16a34a" : "#dc2626", fontWeight:"500" }}>
                  {setupMsg.ok ? "✓" : "✗"} {setupMsg.text}
                </div>
              )}
              <div style={{ marginTop:"10px", fontSize:"11px", color:"#888" }}>
                Beds24 → Settings → MARKETPLACE → API → Generate new invite code → постави го тук
              </div>
            </>
          )}

          {/* Bootstrap import */}
          <div style={{ marginTop:"14px", borderTop:"1px solid #e5e2dc", paddingTop:"14px" }}>
            <div style={{ fontSize:"12px", fontWeight:"600", marginBottom:"6px" }}>Импорт на съществуващи резервации</div>
            <div style={{ fontSize:"11px", color:"#888", marginBottom:"10px" }}>
              Изтегля всички резервации от Beds24 (следващите 6 месеца) и ги синхронизира с локалната база. Безопасно е да се пуска многократно — не дублира записи.
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
              <button
                disabled={importing}
                onClick={async () => {
                  setImporting(true); setImportResult(null); setImportError("");
                  try {
                    const r = await fetch("/api/integrations/beds24/import", { method: "POST" });
                    if (!r.ok) throw new Error(await r.text());
                    const d = await r.json();
                    setImportResult(d);
                  } catch (e: any) { setImportError(e.message || "Грешка при импорт"); }
                  setImporting(false);
                }}
                style={{
                  background: importing ? "#d1d5db" : "#0369a1", color:"#fff", border:"none", borderRadius:"8px",
                  padding:"0 16px", height:"36px", fontSize:"13px", fontWeight:"600", cursor: importing ? "not-allowed" : "pointer",
                  display:"flex", alignItems:"center", gap:"6px"
                }}>
                {importing ? "Импортиране..." : "Импортирай от Beds24"}
              </button>
              {importResult && (
                <div style={{ fontSize:"11px", color:"#16a34a", fontWeight:"500" }}>
                  ✓ Готово: {importResult.inserted} нови · {importResult.updated} обновени · {importResult.cancelled} отменени · {importResult.skipped} пропуснати
                </div>
              )}
              {importError && (
                <div style={{ fontSize:"11px", color:"#dc2626", fontWeight:"500" }}>✗ {importError}</div>
              )}
            </div>
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
