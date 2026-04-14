"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@staypilot.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) { setError("Невалиден email или парола"); return; }
    router.push("/dashboard/calendar");
    router.refresh();
  }

  return (
    <div style={{ minHeight:"100vh", background:"#0f0f1a", display:"flex", alignItems:"center", justifyContent:"center", padding:"24px" }}>
      <form onSubmit={onSubmit} style={{ background:"#fff", borderRadius:"16px", padding:"32px", width:"100%", maxWidth:"400px", boxShadow:"0 20px 60px rgba(0,0,0,.4)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"12px", marginBottom:"24px" }}>
          <div style={{ width:"40px", height:"40px", borderRadius:"10px", background:"linear-gradient(135deg,#6c63ff,#4a43cc)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:"700", fontSize:"16px" }}>SP</div>
          <div>
            <div style={{ fontSize:"18px", fontWeight:"700" }}>StayPilot</div>
            <div style={{ fontSize:"11px", color:"#888" }}>Flora & Lazur · Управление</div>
          </div>
        </div>
        <div style={{ marginBottom:"14px" }}>
          <label style={{ fontSize:"11px", fontWeight:"700", color:"#888", display:"block", marginBottom:"5px" }}>EMAIL</label>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" required
            style={{ height:"38px", width:"100%", border:"1px solid #e0ddd8", borderRadius:"8px", padding:"0 12px", fontSize:"13px" }} />
        </div>
        <div style={{ marginBottom:"20px" }}>
          <label style={{ fontSize:"11px", fontWeight:"700", color:"#888", display:"block", marginBottom:"5px" }}>ПАРОЛА</label>
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" required
            style={{ height:"38px", width:"100%", border:"1px solid #e0ddd8", borderRadius:"8px", padding:"0 12px", fontSize:"13px" }} />
        </div>
        {error && <div style={{ background:"#fff0f0", border:"1px solid #fca5a5", borderRadius:"8px", padding:"10px 12px", fontSize:"12px", color:"#b91c1c", marginBottom:"14px" }}>{error}</div>}
        <button type="submit" disabled={loading}
          style={{ width:"100%", height:"42px", background:"#6c63ff", color:"#fff", border:"none", borderRadius:"9px", fontSize:"14px", fontWeight:"600", cursor:"pointer" }}>
          {loading ? "Влизане..." : "Влез"}
        </button>
        <div style={{ marginTop:"12px", fontSize:"11px", color:"#aaa", textAlign:"center" }}>
          Достъп от всяко устройство · Защитена сесия
        </div>
      </form>
    </div>
  );
}
