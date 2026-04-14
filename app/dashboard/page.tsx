import { DashboardShell } from "@/components/DashboardShell";
import { supabaseAdmin } from "@/lib/supabase";

export default async function DashboardPage() {
  const today = new Date().toISOString();
  const [{ count: activeCount }, { data: rooms }, { data: notifs }, { data: syncEvents }] = await Promise.all([
    supabaseAdmin.from("Reservation").select("*", { count:"exact", head:true }).eq("status","CONFIRMED").lte("startDate", today).gte("endDate", today),
    supabaseAdmin.from("Room").select("id"),
    supabaseAdmin.from("Notification").select("*").order("createdAt", { ascending: false }).limit(10),
    supabaseAdmin.from("SyncEvent").select("*").order("createdAt", { ascending: false }).limit(5),
  ]);

  const roomCount = rooms?.length || 18;
  const occ = Math.round(((activeCount || 0) / roomCount) * 100);
  const now = new Date();

  return (
    <DashboardShell stats={{ active: activeCount || 0, occ, rev: 0, month: now.getMonth(), selFmt: `${now.getDate()}.${now.getMonth()+1}` }}>
      <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"12px", marginBottom:"16px" }}>
          {[
            { label:"Активни резервации", val: activeCount || 0 },
            { label:"Стаи общо", val: roomCount },
            { label:"Заетост днес", val: `${occ}%` },
          ].map((s, i) => (
            <div key={i} style={{ background:"#fff", borderRadius:"12px", border:"1px solid #e5e2dc", padding:"16px" }}>
              <div style={{ fontSize:"11px", color:"#888", marginBottom:"6px" }}>{s.label}</div>
              <div style={{ fontSize:"28px", fontWeight:"700", color:"#111" }}>{s.val}</div>
            </div>
          ))}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
          <div style={{ background:"#fff", borderRadius:"12px", border:"1px solid #e5e2dc", padding:"14px 16px" }}>
            <div style={{ fontSize:"13px", fontWeight:"700", color:"#111", marginBottom:"12px" }}>Последни известия</div>
            {(!notifs || notifs.length === 0) && <div style={{ fontSize:"12px", color:"#bbb" }}>Няма известия.</div>}
            {(notifs || []).map((n: any) => (
              <div key={n.id} style={{ padding:"9px 0", borderBottom:"1px solid #f5f3ef" }}>
                <div style={{ fontSize:"12px", fontWeight:"500", color:"#222" }}>{n.title}</div>
                <div style={{ fontSize:"11px", color:"#888", marginTop:"2px" }}>{n.detail}</div>
              </div>
            ))}
          </div>
          <div style={{ background:"#fff", borderRadius:"12px", border:"1px solid #e5e2dc", padding:"14px 16px" }}>
            <div style={{ fontSize:"13px", fontWeight:"700", color:"#111", marginBottom:"12px" }}>Синхронизация лог</div>
            {(!syncEvents || syncEvents.length === 0) && <div style={{ fontSize:"12px", color:"#bbb" }}>Няма записи.</div>}
            {(syncEvents || []).map((e: any) => (
              <div key={e.id} style={{ padding:"9px 0", borderBottom:"1px solid #f5f3ef" }}>
                <div style={{ fontSize:"12px", fontWeight:"500", color:"#222" }}>{e.provider} · {e.direction}</div>
                <div style={{ fontSize:"11px", color: e.status === "SUCCESS" || e.status === "PROCESSED" ? "#16a34a" : "#888", marginTop:"2px" }}>{e.status} · {new Date(e.createdAt).toLocaleString("bg-BG")}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
