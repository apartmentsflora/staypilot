"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { DashboardShell } from "@/components/DashboardShell";

// ── helpers ──────────────────────────────────────────────────────────────────
const MBG = ["Януари","Февруари","Март","Април","Май","Юни","Юли","Август","Септември","Октомври","Ноември","Декември"];
function fmtDate(ds: string) {
  if (!ds) return "—";
  const d = new Date(ds);
  return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${d.getFullYear()}`;
}
function fmtMoney(n: number) {
  return n.toLocaleString("bg-BG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function nightsBetween(s: string, e: string) {
  return Math.max(1, Math.round((new Date(e).getTime() - new Date(s).getTime()) / 86400000));
}

const EXPENSE_CATEGORIES = [
  "Ток", "Вода", "Интернет", "Ремонт", "Персонал", "Оборудване",
  "Спално бельо", "Консумативи", "Почистване", "Застраховка",
  "Данъци", "Реклама", "Комисионни", "Друго",
];

const SOURCE_COLORS: Record<string, string> = {
  "Booking": "#003580",
  "Airbnb": "#FF5A5F",
  "Beds24": "#22c55e",
  "Директна": "#8b5cf6",
  "Телефон": "#f59e0b",
  "Уебсайт": "#06b6d4",
  "Expedia": "#fbbf24",
};

type Tab = "overview" | "expenses" | "settings";

// ── main component ──────────────────────────────────────────────────────────
export default function FinancePage() {
  const now = new Date();
  const [tab, setTab] = useState<Tab>("overview");
  const [reservations, setReservations] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Period filter
  const [periodMonth, setPeriodMonth] = useState(now.getMonth());
  const [periodYear, setPeriodYear] = useState(now.getFullYear());
  const [periodMode, setPeriodMode] = useState<"month"|"year"|"all">("month");

  // Source filter
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  // Expense form
  const [expForm, setExpForm] = useState({ category: "Друго", description: "", amount: "", date: new Date().toISOString().slice(0,10) });
  const [expEditing, setExpEditing] = useState<string|null>(null);

  // Commission editing
  const [editingCommission, setEditingCommission] = useState<string|null>(null);
  const [editRate, setEditRate] = useState("");

  // ── load data ──
  const load = useCallback(async () => {
    setLoading(true);
    const [rRes, eRes, cRes] = await Promise.all([
      fetch("/api/reservations?includeCancelled=1"),
      fetch("/api/expenses"),
      fetch("/api/finance/commissions"),
    ]);
    if (rRes.ok) setReservations(await rRes.json());
    if (eRes.ok) setExpenses(await eRes.json());
    if (cRes.ok) setCommissions(await cRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── commission rate lookup ──
  const rateMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of commissions) m[c.source] = Number(c.rate) || 0;
    return m;
  }, [commissions]);

  // ── period filtering ──
  const periodStart = useMemo(() => {
    if (periodMode === "all") return null;
    if (periodMode === "year") return new Date(periodYear, 0, 1);
    return new Date(periodYear, periodMonth, 1);
  }, [periodMode, periodYear, periodMonth]);

  const periodEnd = useMemo(() => {
    if (periodMode === "all") return null;
    if (periodMode === "year") return new Date(periodYear + 1, 0, 1);
    return new Date(periodYear, periodMonth + 1, 1);
  }, [periodMode, periodYear, periodMonth]);

  const periodLabel = useMemo(() => {
    if (periodMode === "all") return "Всички";
    if (periodMode === "year") return `${periodYear}`;
    return `${MBG[periodMonth]} ${periodYear}`;
  }, [periodMode, periodMonth, periodYear]);

  // Filter reservations by period (check-in falls within period)
  const filteredRes = useMemo(() => {
    let list = reservations.filter(r => r.status !== "CANCELLED");
    if (periodStart && periodEnd) {
      list = list.filter(r => {
        const ci = new Date(r.startDate);
        return ci >= periodStart && ci < periodEnd;
      });
    }
    if (sourceFilter !== "all") {
      list = list.filter(r => r.source === sourceFilter);
    }
    return list;
  }, [reservations, periodStart, periodEnd, sourceFilter]);

  // Filter expenses by period
  const filteredExp = useMemo(() => {
    if (!periodStart || !periodEnd) return expenses;
    return expenses.filter(e => {
      const d = new Date(e.date + "T00:00:00");
      return d >= periodStart && d < periodEnd;
    });
  }, [expenses, periodStart, periodEnd]);

  // ── financial calculations ──
  const finance = useMemo(() => {
    let totalRevenue = 0;
    let totalCommission = 0;
    const bySource: Record<string, { count: number; revenue: number; commission: number }> = {};

    for (const r of filteredRes) {
      const nights = nightsBetween(r.startDate, r.endDate);
      const ppn = Number(r.pricePerNight) || 0;
      const total = ppn * nights;
      const rate = rateMap[r.source] || 0;
      const commission = total * (rate / 100);

      totalRevenue += total;
      totalCommission += commission;

      if (!bySource[r.source]) bySource[r.source] = { count: 0, revenue: 0, commission: 0 };
      bySource[r.source].count++;
      bySource[r.source].revenue += total;
      bySource[r.source].commission += commission;
    }

    const totalExpenses = filteredExp.reduce((sum, e) => sum + Number(e.amount), 0);
    const netRevenue = totalRevenue - totalCommission;
    const netProfit = netRevenue - totalExpenses;

    return { totalRevenue, totalCommission, netRevenue, totalExpenses, netProfit, bySource, totalBookings: filteredRes.length };
  }, [filteredRes, filteredExp, rateMap]);

  // ── expense by category ──
  const expensesByCategory = useMemo(() => {
    const cats: Record<string, number> = {};
    for (const e of filteredExp) {
      cats[e.category] = (cats[e.category] || 0) + Number(e.amount);
    }
    return Object.entries(cats).sort((a, b) => b[1] - a[1]);
  }, [filteredExp]);

  // ── unique sources ──
  const allSources = useMemo(() => {
    const s = new Set(reservations.map(r => r.source));
    return Array.from(s).sort();
  }, [reservations]);

  // ── CRUD operations ──
  async function saveExpense() {
    const amt = parseFloat(expForm.amount);
    if (!amt || amt <= 0 || !expForm.date) return;
    const payload = { category: expForm.category, description: expForm.description || null, amount: amt, date: expForm.date };

    if (expEditing) {
      await fetch(`/api/expenses/${expEditing}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } else {
      await fetch("/api/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }
    setExpForm({ category: "Друго", description: "", amount: "", date: new Date().toISOString().slice(0,10) });
    setExpEditing(null);
    await load();
  }

  async function deleteExpense(id: string) {
    if (!confirm("Сигурни ли сте, че искате да изтриете този разход?")) return;
    await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    await load();
  }

  function editExpense(e: any) {
    setExpForm({ category: e.category, description: e.description || "", amount: String(e.amount), date: e.date });
    setExpEditing(e.id);
    setTab("expenses");
  }

  async function saveCommission(source: string) {
    const rate = parseFloat(editRate);
    if (isNaN(rate) || rate < 0 || rate > 100) return;
    await fetch("/api/finance/commissions", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, rate }) });
    setEditingCommission(null);
    setEditRate("");
    await load();
  }

  // ── period navigation ──
  function prevPeriod() {
    if (periodMode === "month") {
      if (periodMonth === 0) { setPeriodMonth(11); setPeriodYear(y => y - 1); }
      else setPeriodMonth(m => m - 1);
    } else if (periodMode === "year") {
      setPeriodYear(y => y - 1);
    }
  }
  function nextPeriod() {
    if (periodMode === "month") {
      if (periodMonth === 11) { setPeriodMonth(0); setPeriodYear(y => y + 1); }
      else setPeriodMonth(m => m + 1);
    } else if (periodMode === "year") {
      setPeriodYear(y => y + 1);
    }
  }

  // ── styles ──
  const cardS: React.CSSProperties = { background: "#fff", borderRadius: "12px", border: "1px solid #e5e2dc", padding: "18px 20px", marginBottom: "14px" };
  const headerS: React.CSSProperties = { fontSize: "14px", fontWeight: "700", color: "#222", marginBottom: "14px", display: "flex", alignItems: "center", justifyContent: "space-between" };
  const btnS = (active: boolean): React.CSSProperties => ({
    padding: "6px 14px", borderRadius: "7px", fontSize: "12px", fontWeight: "600", cursor: "pointer", border: `1px solid ${active ? "#6c63ff" : "#dedad4"}`,
    background: active ? "#6c63ff" : "#fff", color: active ? "#fff" : "#555",
  });
  const inputS: React.CSSProperties = { height: "36px", border: "1px solid #dedad4", borderRadius: "8px", padding: "0 11px", fontSize: "13px", background: "#faf9f7", color: "#111", outline: "none", boxSizing: "border-box" };

  // ── mobile CSS ──
  const mobileCSS = `
    @media (max-width: 768px) {
      .fin-grid-4 { grid-template-columns: 1fr 1fr !important; }
      .fin-grid-2 { grid-template-columns: 1fr !important; }
      .fin-table { font-size: 11px !important; }
      .fin-table th, .fin-table td { padding: 6px 8px !important; }
    }
  `;

  return (
    <DashboardShell
      stats={{ active: 0, occ: 0, rev: 0, month: now.getMonth(), selFmt: "" }}
      onNewRes={() => {}} onTodayRes={() => {}} onTodayCo={() => {}} onVoice={() => {}}
    >
      <style dangerouslySetInnerHTML={{ __html: mobileCSS }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* TOPBAR */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e5e2dc", padding: "12px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "20px", fontWeight: "700" }}>Финанси</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            {/* Tab buttons */}
            {([["overview", "Преглед"], ["expenses", "Разходи"], ["settings", "Комисионни"]] as const).map(([t, l]) => (
              <button key={t} onClick={() => setTab(t)} style={btnS(tab === t)}>{l}</button>
            ))}
            <div style={{ width: "1px", height: "24px", background: "#e5e2dc", margin: "0 4px" }} />
            {/* Period mode */}
            {([["month", "Месец"], ["year", "Година"], ["all", "Всичко"]] as const).map(([m, l]) => (
              <button key={m} onClick={() => setPeriodMode(m)} style={{ ...btnS(periodMode === m), padding: "4px 10px", fontSize: "11px" }}>{l}</button>
            ))}
            {periodMode !== "all" && (
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <button onClick={prevPeriod} style={{ background: "#f5f3ef", border: "1px solid #dedad4", borderRadius: "6px", width: "26px", height: "26px", cursor: "pointer", fontSize: "14px" }}>‹</button>
                <span style={{ fontSize: "13px", fontWeight: "600", minWidth: "120px", textAlign: "center" }}>{periodLabel}</span>
                <button onClick={nextPeriod} style={{ background: "#f5f3ef", border: "1px solid #dedad4", borderRadius: "6px", width: "26px", height: "26px", cursor: "pointer", fontSize: "14px" }}>›</button>
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>Зареждане...</div>
          ) : (
            <>
              {/* ═══════════ TAB: OVERVIEW ═══════════ */}
              {tab === "overview" && (
                <>
                  {/* KPI Cards */}
                  <div className="fin-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "14px" }}>
                    <div style={{ ...cardS, marginBottom: 0, background: "linear-gradient(135deg, #f0fdf4, #dcfce7)", borderColor: "#86efac" }}>
                      <div style={{ fontSize: "11px", fontWeight: "700", color: "#15803d", letterSpacing: ".3px", textTransform: "uppercase" }}>Приходи (бруто)</div>
                      <div style={{ fontSize: "26px", fontWeight: "800", color: "#14532d", marginTop: "6px" }}>€{fmtMoney(finance.totalRevenue)}</div>
                      <div style={{ fontSize: "11px", color: "#22c55e", marginTop: "4px" }}>{finance.totalBookings} резервации</div>
                    </div>
                    <div style={{ ...cardS, marginBottom: 0, background: "linear-gradient(135deg, #fff7ed, #ffedd5)", borderColor: "#fdba74" }}>
                      <div style={{ fontSize: "11px", fontWeight: "700", color: "#9a3412", letterSpacing: ".3px", textTransform: "uppercase" }}>Комисионни</div>
                      <div style={{ fontSize: "26px", fontWeight: "800", color: "#7c2d12", marginTop: "6px" }}>€{fmtMoney(finance.totalCommission)}</div>
                      <div style={{ fontSize: "11px", color: "#ea580c", marginTop: "4px" }}>
                        {finance.totalRevenue > 0 ? `${(finance.totalCommission / finance.totalRevenue * 100).toFixed(1)}% от бруто` : "—"}
                      </div>
                    </div>
                    <div style={{ ...cardS, marginBottom: 0, background: "linear-gradient(135deg, #fef2f2, #fee2e2)", borderColor: "#fca5a5" }}>
                      <div style={{ fontSize: "11px", fontWeight: "700", color: "#991b1b", letterSpacing: ".3px", textTransform: "uppercase" }}>Разходи</div>
                      <div style={{ fontSize: "26px", fontWeight: "800", color: "#7f1d1d", marginTop: "6px" }}>€{fmtMoney(finance.totalExpenses)}</div>
                      <div style={{ fontSize: "11px", color: "#dc2626", marginTop: "4px" }}>{filteredExp.length} записа</div>
                    </div>
                    <div style={{ ...cardS, marginBottom: 0, background: finance.netProfit >= 0 ? "linear-gradient(135deg, #eff6ff, #dbeafe)" : "linear-gradient(135deg, #fef2f2, #fee2e2)", borderColor: finance.netProfit >= 0 ? "#93c5fd" : "#fca5a5" }}>
                      <div style={{ fontSize: "11px", fontWeight: "700", color: finance.netProfit >= 0 ? "#1e3a8a" : "#991b1b", letterSpacing: ".3px", textTransform: "uppercase" }}>Нетна печалба</div>
                      <div style={{ fontSize: "26px", fontWeight: "800", color: finance.netProfit >= 0 ? "#1e40af" : "#dc2626", marginTop: "6px" }}>€{fmtMoney(finance.netProfit)}</div>
                      <div style={{ fontSize: "11px", color: finance.netProfit >= 0 ? "#3b82f6" : "#ef4444", marginTop: "4px" }}>
                        Нето: €{fmtMoney(finance.netRevenue)}
                      </div>
                    </div>
                  </div>

                  {/* Revenue by source + Expenses by category */}
                  <div className="fin-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                    {/* By source */}
                    <div style={cardS}>
                      <div style={headerS}>
                        <span>Приходи по източник</span>
                      </div>
                      {Object.entries(finance.bySource).length === 0 ? (
                        <div style={{ fontSize: "12px", color: "#bbb", padding: "12px 0" }}>Няма данни за периода.</div>
                      ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ borderBottom: "2px solid #f0ede8" }}>
                              <th style={{ textAlign: "left", padding: "6px 8px", fontSize: "11px", fontWeight: "700", color: "#888" }}>Източник</th>
                              <th style={{ textAlign: "center", padding: "6px 8px", fontSize: "11px", fontWeight: "700", color: "#888" }}>Бр.</th>
                              <th style={{ textAlign: "right", padding: "6px 8px", fontSize: "11px", fontWeight: "700", color: "#888" }}>Приход</th>
                              <th style={{ textAlign: "right", padding: "6px 8px", fontSize: "11px", fontWeight: "700", color: "#888" }}>Комис.</th>
                              <th style={{ textAlign: "right", padding: "6px 8px", fontSize: "11px", fontWeight: "700", color: "#888" }}>Нето</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(finance.bySource).sort((a, b) => b[1].revenue - a[1].revenue).map(([src, d]) => (
                              <tr key={src} style={{ borderBottom: "1px solid #f0ede8" }}>
                                <td style={{ padding: "8px", fontSize: "12px" }}>
                                  <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: SOURCE_COLORS[src] || "#999", marginRight: "6px" }} />
                                  {src}
                                </td>
                                <td style={{ textAlign: "center", padding: "8px", fontSize: "12px", fontWeight: "600" }}>{d.count}</td>
                                <td style={{ textAlign: "right", padding: "8px", fontSize: "12px", fontWeight: "600", color: "#15803d" }}>€{fmtMoney(d.revenue)}</td>
                                <td style={{ textAlign: "right", padding: "8px", fontSize: "12px", color: "#ea580c" }}>€{fmtMoney(d.commission)} <span style={{ fontSize: "10px", opacity: 0.6 }}>({rateMap[src] || 0}%)</span></td>
                                <td style={{ textAlign: "right", padding: "8px", fontSize: "12px", fontWeight: "700", color: "#1e40af" }}>€{fmtMoney(d.revenue - d.commission)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* By expense category */}
                    <div style={cardS}>
                      <div style={headerS}>
                        <span>Разходи по категория</span>
                        <button onClick={() => setTab("expenses")} style={{ fontSize: "11px", color: "#6c63ff", background: "none", border: "none", cursor: "pointer" }}>Добави →</button>
                      </div>
                      {expensesByCategory.length === 0 ? (
                        <div style={{ fontSize: "12px", color: "#bbb", padding: "12px 0" }}>Няма разходи за периода.</div>
                      ) : (
                        <>
                          {expensesByCategory.map(([cat, amt]) => {
                            const pct = finance.totalExpenses > 0 ? (amt / finance.totalExpenses * 100) : 0;
                            return (
                              <div key={cat} style={{ marginBottom: "10px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "3px" }}>
                                  <span style={{ fontWeight: "600", color: "#333" }}>{cat}</span>
                                  <span style={{ fontWeight: "700", color: "#7f1d1d" }}>€{fmtMoney(amt)} <span style={{ fontSize: "10px", opacity: 0.5 }}>({pct.toFixed(0)}%)</span></span>
                                </div>
                                <div style={{ height: "6px", borderRadius: "3px", background: "#f5f3ef", overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, borderRadius: "3px", background: "linear-gradient(90deg, #f87171, #dc2626)" }} />
                                </div>
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  </div>

                  {/* P&L summary bar */}
                  <div style={{ ...cardS, background: "#12121c", borderColor: "#2a2a40" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", flexWrap: "wrap", gap: "16px" }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "10px", fontWeight: "700", color: "#6c63ff", letterSpacing: ".5px", textTransform: "uppercase" }}>Бруто приходи</div>
                        <div style={{ fontSize: "20px", fontWeight: "800", color: "#22c55e" }}>€{fmtMoney(finance.totalRevenue)}</div>
                      </div>
                      <div style={{ fontSize: "20px", color: "#555" }}>−</div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "10px", fontWeight: "700", color: "#6c63ff", letterSpacing: ".5px", textTransform: "uppercase" }}>Комисионни</div>
                        <div style={{ fontSize: "20px", fontWeight: "800", color: "#fb923c" }}>€{fmtMoney(finance.totalCommission)}</div>
                      </div>
                      <div style={{ fontSize: "20px", color: "#555" }}>−</div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "10px", fontWeight: "700", color: "#6c63ff", letterSpacing: ".5px", textTransform: "uppercase" }}>Разходи</div>
                        <div style={{ fontSize: "20px", fontWeight: "800", color: "#f87171" }}>€{fmtMoney(finance.totalExpenses)}</div>
                      </div>
                      <div style={{ fontSize: "20px", color: "#555" }}>=</div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "10px", fontWeight: "700", color: "#6c63ff", letterSpacing: ".5px", textTransform: "uppercase" }}>Нетна печалба</div>
                        <div style={{ fontSize: "24px", fontWeight: "900", color: finance.netProfit >= 0 ? "#22c55e" : "#ef4444" }}>€{fmtMoney(finance.netProfit)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Reservations table with source filter */}
                  <div style={cardS}>
                    <div style={headerS}>
                      <span>Резервации · {periodLabel}</span>
                      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                        <button onClick={() => setSourceFilter("all")} style={{ ...btnS(sourceFilter === "all"), padding: "3px 8px", fontSize: "10px" }}>Всички</button>
                        {allSources.map(src => (
                          <button key={src} onClick={() => setSourceFilter(src)} style={{ ...btnS(sourceFilter === src), padding: "3px 8px", fontSize: "10px" }}>{src}</button>
                        ))}
                      </div>
                    </div>
                    {filteredRes.length === 0 ? (
                      <div style={{ fontSize: "12px", color: "#bbb", padding: "12px 0" }}>Няма резервации за периода.</div>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table className="fin-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: "700px" }}>
                          <thead>
                            <tr style={{ borderBottom: "2px solid #f0ede8" }}>
                              {["Гост", "Стая", "Източник", "Настаняване", "Напускане", "Нощи", "€/нощ", "Общо", "Комис.", "Нето"].map(h => (
                                <th key={h} style={{ textAlign: h === "Гост" || h === "Стая" || h === "Източник" ? "left" : "right", padding: "8px 10px", fontSize: "11px", fontWeight: "700", color: "#888", whiteSpace: "nowrap" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredRes.map(r => {
                              const nights = nightsBetween(r.startDate, r.endDate);
                              const ppn = Number(r.pricePerNight) || 0;
                              const total = ppn * nights;
                              const rate = rateMap[r.source] || 0;
                              const comm = total * rate / 100;
                              return (
                                <tr key={r.id} style={{ borderBottom: "1px solid #f0ede8" }}>
                                  <td style={{ padding: "8px 10px", fontSize: "12px", fontWeight: "600" }}>{r.guestName}</td>
                                  <td style={{ padding: "8px 10px", fontSize: "12px" }}>{r.roomCode}</td>
                                  <td style={{ padding: "8px 10px", fontSize: "12px" }}>
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "600", background: `${SOURCE_COLORS[r.source] || "#999"}18`, color: SOURCE_COLORS[r.source] || "#999", border: `1px solid ${SOURCE_COLORS[r.source] || "#999"}40` }}>
                                      {r.source}
                                    </span>
                                  </td>
                                  <td style={{ textAlign: "right", padding: "8px 10px", fontSize: "12px" }}>{fmtDate(r.startDate)}</td>
                                  <td style={{ textAlign: "right", padding: "8px 10px", fontSize: "12px" }}>{fmtDate(r.endDate)}</td>
                                  <td style={{ textAlign: "right", padding: "8px 10px", fontSize: "12px", fontWeight: "600" }}>{nights}</td>
                                  <td style={{ textAlign: "right", padding: "8px 10px", fontSize: "12px" }}>€{ppn > 0 ? fmtMoney(ppn) : "—"}</td>
                                  <td style={{ textAlign: "right", padding: "8px 10px", fontSize: "12px", fontWeight: "700", color: "#15803d" }}>€{total > 0 ? fmtMoney(total) : "—"}</td>
                                  <td style={{ textAlign: "right", padding: "8px 10px", fontSize: "12px", color: "#ea580c" }}>{comm > 0 ? `€${fmtMoney(comm)}` : "—"}</td>
                                  <td style={{ textAlign: "right", padding: "8px 10px", fontSize: "12px", fontWeight: "700", color: "#1e40af" }}>€{total > 0 ? fmtMoney(total - comm) : "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr style={{ borderTop: "2px solid #222", background: "#faf9f7" }}>
                              <td colSpan={6} style={{ padding: "10px", fontSize: "12px", fontWeight: "700" }}>Общо ({filteredRes.length} рез.)</td>
                              <td style={{ textAlign: "right", padding: "10px", fontSize: "12px" }}></td>
                              <td style={{ textAlign: "right", padding: "10px", fontSize: "13px", fontWeight: "800", color: "#15803d" }}>€{fmtMoney(finance.totalRevenue)}</td>
                              <td style={{ textAlign: "right", padding: "10px", fontSize: "13px", fontWeight: "700", color: "#ea580c" }}>€{fmtMoney(finance.totalCommission)}</td>
                              <td style={{ textAlign: "right", padding: "10px", fontSize: "13px", fontWeight: "800", color: "#1e40af" }}>€{fmtMoney(finance.netRevenue)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ═══════════ TAB: EXPENSES ═══════════ */}
              {tab === "expenses" && (
                <>
                  {/* Add/Edit form */}
                  <div style={{ ...cardS, background: "#faf9f7" }}>
                    <div style={headerS}>
                      <span>{expEditing ? "Редактиране на разход" : "Добави нов разход"}</span>
                      {expEditing && (
                        <button onClick={() => { setExpEditing(null); setExpForm({ category: "Друго", description: "", amount: "", date: new Date().toISOString().slice(0,10) }); }}
                          style={{ fontSize: "11px", color: "#dc2626", background: "none", border: "none", cursor: "pointer" }}>Откажи</button>
                      )}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr auto", gap: "10px", alignItems: "end" }}>
                      <div>
                        <label style={{ fontSize: "11px", fontWeight: "700", color: "#888", display: "block", marginBottom: "4px" }}>КАТЕГОРИЯ</label>
                        <select value={expForm.category} onChange={e => setExpForm(f => ({ ...f, category: e.target.value }))}
                          style={{ ...inputS, width: "100%" }}>
                          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: "11px", fontWeight: "700", color: "#888", display: "block", marginBottom: "4px" }}>ОПИСАНИЕ</label>
                        <input value={expForm.description} onChange={e => setExpForm(f => ({ ...f, description: e.target.value }))}
                          placeholder="Сметка за ток март, ремонт баня..."
                          style={{ ...inputS, width: "100%" }} />
                      </div>
                      <div>
                        <label style={{ fontSize: "11px", fontWeight: "700", color: "#888", display: "block", marginBottom: "4px" }}>СУМА (€)</label>
                        <input type="number" step="0.01" min="0" value={expForm.amount} onChange={e => setExpForm(f => ({ ...f, amount: e.target.value }))}
                          placeholder="0.00" style={{ ...inputS, width: "100%" }} />
                      </div>
                      <div>
                        <label style={{ fontSize: "11px", fontWeight: "700", color: "#888", display: "block", marginBottom: "4px" }}>ДАТА</label>
                        <input type="date" value={expForm.date} onChange={e => setExpForm(f => ({ ...f, date: e.target.value }))}
                          style={{ ...inputS, width: "100%" }} />
                      </div>
                      <button onClick={saveExpense}
                        style={{ background: "#6c63ff", color: "#fff", border: "none", borderRadius: "8px", padding: "0 18px", height: "36px", fontSize: "13px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap" }}>
                        {expEditing ? "Запази" : "Добави"}
                      </button>
                    </div>
                  </div>

                  {/* Expense list */}
                  <div style={cardS}>
                    <div style={headerS}>
                      <span>Разходи · {periodLabel}</span>
                      <span style={{ fontSize: "14px", fontWeight: "800", color: "#dc2626" }}>Общо: €{fmtMoney(finance.totalExpenses)}</span>
                    </div>
                    {filteredExp.length === 0 ? (
                      <div style={{ fontSize: "12px", color: "#bbb", padding: "12px 0" }}>Няма разходи за периода.</div>
                    ) : (
                      <table className="fin-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ borderBottom: "2px solid #f0ede8" }}>
                            {["Дата", "Категория", "Описание", "Сума", ""].map(h => (
                              <th key={h} style={{ textAlign: h === "Сума" ? "right" : "left", padding: "8px 10px", fontSize: "11px", fontWeight: "700", color: "#888" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredExp.map(e => (
                            <tr key={e.id} style={{ borderBottom: "1px solid #f0ede8" }}>
                              <td style={{ padding: "8px 10px", fontSize: "12px" }}>{fmtDate(e.date)}</td>
                              <td style={{ padding: "8px 10px", fontSize: "12px" }}>
                                <span style={{ padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "600", background: "#fef3c7", color: "#78350f", border: "1px solid #fcd34d" }}>
                                  {e.category}
                                </span>
                              </td>
                              <td style={{ padding: "8px 10px", fontSize: "12px", color: "#555" }}>{e.description || "—"}</td>
                              <td style={{ textAlign: "right", padding: "8px 10px", fontSize: "13px", fontWeight: "700", color: "#dc2626" }}>€{fmtMoney(Number(e.amount))}</td>
                              <td style={{ padding: "8px 10px", textAlign: "right" }}>
                                <button onClick={() => editExpense(e)} style={{ fontSize: "10px", padding: "3px 8px", borderRadius: "4px", background: "#eff6ff", border: "1px solid #93c5fd", color: "#1d4ed8", cursor: "pointer", marginRight: "4px" }}>Edit</button>
                                <button onClick={() => deleteExpense(e.id)} style={{ fontSize: "10px", padding: "3px 8px", borderRadius: "4px", background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", cursor: "pointer" }}>Del</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}

              {/* ═══════════ TAB: COMMISSION SETTINGS ═══════════ */}
              {tab === "settings" && (
                <div style={cardS}>
                  <div style={headerS}>
                    <span>Комисионни по източник</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#888", marginBottom: "14px" }}>
                    Задайте процент комисионна за всеки канал. Тези стойности се използват за изчисляване на нетните приходи.
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", maxWidth: "500px" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #f0ede8" }}>
                        <th style={{ textAlign: "left", padding: "8px 10px", fontSize: "11px", fontWeight: "700", color: "#888" }}>Източник</th>
                        <th style={{ textAlign: "right", padding: "8px 10px", fontSize: "11px", fontWeight: "700", color: "#888" }}>Комисионна %</th>
                        <th style={{ padding: "8px 10px", width: "80px" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {commissions.map(c => (
                        <tr key={c.source} style={{ borderBottom: "1px solid #f0ede8" }}>
                          <td style={{ padding: "10px", fontSize: "13px", fontWeight: "600" }}>
                            <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: SOURCE_COLORS[c.source] || "#999", marginRight: "8px" }} />
                            {c.source}
                          </td>
                          <td style={{ textAlign: "right", padding: "10px" }}>
                            {editingCommission === c.source ? (
                              <input type="number" step="0.1" min="0" max="100" value={editRate}
                                onChange={e => setEditRate(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") saveCommission(c.source); }}
                                style={{ ...inputS, width: "80px", textAlign: "right" }} autoFocus />
                            ) : (
                              <span style={{ fontSize: "15px", fontWeight: "700", color: Number(c.rate) > 0 ? "#ea580c" : "#22c55e" }}>
                                {Number(c.rate)}%
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "10px", textAlign: "right" }}>
                            {editingCommission === c.source ? (
                              <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                                <button onClick={() => saveCommission(c.source)}
                                  style={{ fontSize: "10px", padding: "4px 10px", borderRadius: "5px", background: "#6c63ff", color: "#fff", border: "none", cursor: "pointer", fontWeight: "600" }}>OK</button>
                                <button onClick={() => { setEditingCommission(null); setEditRate(""); }}
                                  style={{ fontSize: "10px", padding: "4px 10px", borderRadius: "5px", background: "#f5f3ef", color: "#666", border: "1px solid #dedad4", cursor: "pointer" }}>✕</button>
                              </div>
                            ) : (
                              <button onClick={() => { setEditingCommission(c.source); setEditRate(String(c.rate)); }}
                                style={{ fontSize: "10px", padding: "4px 10px", borderRadius: "5px", background: "#eff6ff", color: "#1d4ed8", border: "1px solid #93c5fd", cursor: "pointer" }}>Промени</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
