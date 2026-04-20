"use client";
import { useEffect, useState, useMemo } from "react";
import { DashboardShell } from "@/components/DashboardShell";

// ── types ──────────────────────────────────────────────────────────────────────
interface VoiceTranscript {
  id: string;
  created_at: string;
  transcript: string;
  guest_name: string | null;
  room_code: string | null;
  check_in: string | null;
  check_out: string | null;
  phone: string | null;
  guests: number | null;
  children: number | null;
  notes: string | null;
  source: string | null;
}

type SortCol = "created_at" | "guest_name" | "check_in" | "check_out";

// ── helpers ────────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ── component ──────────────────────────────────────────────────────────────────
export default function VoiceHistoryPage() {
  const [transcripts, setTranscripts] = useState<VoiceTranscript[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortCol, setSortCol] = useState<SortCol>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/voice-history?sort=${sortCol}&order=${sortAsc ? "asc" : "desc"}`)
      .then((r) => r.json())
      .then((d) => {
        setTranscripts(d.transcripts || []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [sortCol, sortAsc]);

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return transcripts;
    const q = search.toLowerCase();
    return transcripts.filter(
      (t) =>
        (t.transcript || "").toLowerCase().includes(q) ||
        (t.guest_name || "").toLowerCase().includes(q) ||
        (t.room_code || "").toLowerCase().includes(q) ||
        (t.phone || "").toLowerCase().includes(q) ||
        (t.notes || "").toLowerCase().includes(q)
    );
  }, [transcripts, search]);

  function sortArrow(col: SortCol) {
    if (sortCol !== col) return " ↕";
    return sortAsc ? " ↑" : " ↓";
  }

  // ── styles ─────────────────────────────────────────────────────────────────
  const accent = "#6c63ff";
  const borderColor = "#e8e5e0";
  const mutedText = "#888";

  const thStyle: React.CSSProperties = {
    padding: "10px 12px",
    textAlign: "left",
    fontSize: "12px",
    fontWeight: 600,
    color: "#555",
    borderBottom: `2px solid ${borderColor}`,
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
    background: "#fafafa",
  };

  const tdStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: "13px",
    borderBottom: `1px solid ${borderColor}`,
    verticalAlign: "top",
  };

  return (
    <DashboardShell>
      <div style={{ padding: "24px 28px", maxWidth: "1400px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0, color: "#1a1a1a" }}>
              Гласови записи
            </h1>
            <p style={{ fontSize: "13px", color: mutedText, margin: "4px 0 0" }}>
              Последни 30 дни · {filtered.length} {filtered.length === 1 ? "запис" : "записа"}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <input
              type="text"
              placeholder="Търсене по гост, стая, текст..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: "8px 14px",
                fontSize: "13px",
                border: `1px solid ${borderColor}`,
                borderRadius: "8px",
                outline: "none",
                width: "260px",
                background: "#fff",
              }}
            />
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div style={{ padding: "14px 18px", background: "#fff0f0", border: "1px solid #ffb3b3", borderRadius: "10px", color: "#dc2626", fontSize: "13px", marginBottom: "16px" }}>
            Грешка: {error}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div style={{ textAlign: "center", padding: "60px 0", color: mutedText, fontSize: "14px" }}>
            Зареждане...
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: mutedText }}>
            <div style={{ marginBottom: "12px" }}><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#b0b0b0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg></div>
            <div style={{ fontSize: "15px", fontWeight: 500 }}>
              {search ? "Няма съвпадения" : "Няма гласови записи за последните 30 дни"}
            </div>
            <div style={{ fontSize: "13px", marginTop: "6px" }}>
              {search
                ? "Опитайте с различна заявка за търсене."
                : "Използвайте гласовия бутон в календара, за да създадете запис."}
            </div>
          </div>
        )}

        {/* Table */}
        {!loading && filtered.length > 0 && (
          <div style={{ background: "#fff", border: `1px solid ${borderColor}`, borderRadius: "12px", overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle} onClick={() => toggleSort("created_at")}>
                      Дата{sortArrow("created_at")}
                    </th>
                    <th style={thStyle} onClick={() => toggleSort("guest_name")}>
                      Гост{sortArrow("guest_name")}
                    </th>
                    <th style={{ ...thStyle, cursor: "default" }}>Стая</th>
                    <th style={thStyle} onClick={() => toggleSort("check_in")}>
                      Настаняване{sortArrow("check_in")}
                    </th>
                    <th style={thStyle} onClick={() => toggleSort("check_out")}>
                      Напускане{sortArrow("check_out")}
                    </th>
                    <th style={{ ...thStyle, cursor: "default" }}>Тел.</th>
                    <th style={{ ...thStyle, cursor: "default" }}>Гости</th>
                    <th style={{ ...thStyle, cursor: "default" }}>Транскрипт</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    const isExpanded = expanded === t.id;
                    const transcriptPreview =
                      t.transcript.length > 80
                        ? t.transcript.slice(0, 80) + "…"
                        : t.transcript;
                    return (
                      <tr
                        key={t.id}
                        onClick={() => setExpanded(isExpanded ? null : t.id)}
                        style={{
                          cursor: "pointer",
                          background: isExpanded ? "#f8f7ff" : "#fff",
                          transition: "background .15s",
                        }}
                        onMouseEnter={(e) => {
                          if (!isExpanded) e.currentTarget.style.background = "#fafafa";
                        }}
                        onMouseLeave={(e) => {
                          if (!isExpanded) e.currentTarget.style.background = "#fff";
                        }}
                      >
                        <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "#555", fontSize: "12px" }}>
                          {fmtDateTime(t.created_at)}
                        </td>
                        <td style={{ ...tdStyle, fontWeight: 600, color: "#1a1a1a" }}>
                          {t.guest_name || <span style={{ color: mutedText }}>—</span>}
                        </td>
                        <td style={tdStyle}>
                          {t.room_code ? (
                            <span style={{ background: "#f0efff", color: accent, padding: "2px 8px", borderRadius: "5px", fontSize: "12px", fontWeight: 600 }}>
                              {t.room_code}
                            </span>
                          ) : (
                            <span style={{ color: mutedText }}>—</span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{fmtDate(t.check_in)}</td>
                        <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{fmtDate(t.check_out)}</td>
                        <td style={{ ...tdStyle, whiteSpace: "nowrap", fontSize: "12px" }}>
                          {t.phone || <span style={{ color: mutedText }}>—</span>}
                        </td>
                        <td style={{ ...tdStyle, whiteSpace: "nowrap", fontSize: "12px" }}>
                          {t.guests != null ? (
                            <>
                              {t.guests}В
                              {t.children ? ` + ${t.children}Д` : ""}
                            </>
                          ) : (
                            <span style={{ color: mutedText }}>—</span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, maxWidth: "320px", color: "#444" }}>
                          {isExpanded ? (
                            <div>
                              <div style={{ marginBottom: "6px", lineHeight: "1.5" }}>{t.transcript}</div>
                              {t.notes && (
                                <div style={{ fontSize: "12px", color: accent, marginTop: "4px" }}>
                                  {t.notes}
                                </div>
                              )}
                              {t.source && (
                                <div style={{ fontSize: "11px", color: mutedText, marginTop: "4px" }}>
                                  Източник: {t.source}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: "12px", color: "#666" }}>{transcriptPreview}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
