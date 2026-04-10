"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { T } from "@/lib/constants";
import { calculateAll, savePayrollResults } from "@/lib/payroll/calculatePayroll";

const AKASHI_COMPANY_ID = "e85e40ac-71f7-4918-b2fc-36d877337b74";

function generateYearMonthOptions(): string[] {
  const options: string[] = [];
  const now = new Date();
  for (let i = -6; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    options.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return options;
}
function getDefaultYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function getPeriods(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  const ld = new Date(py, pm, 0).getDate();
  return {
    ft: `${py}/${pm}/1〜${py}/${pm}/${ld}`,
    pt: `${py}/${pm}/11〜${y}/${m}/10`,
  };
}

// 正社員用のカラム定義
const FT_COLS: { key: string; label: string; editable: boolean; width: number }[] = [
  { key: "employee_code", label: "コード", editable: false, width: 70 },
  { key: "full_name", label: "氏名", editable: false, width: 100 },
  { key: "work_days", label: "出勤", editable: false, width: 50 },
  { key: "base_salary", label: "基本給", editable: true, width: 90 },
  { key: "position_allowance", label: "役職手当", editable: true, width: 80 },
  { key: "qualification_allowance", label: "資格手当", editable: true, width: 80 },
  { key: "commute_allowance", label: "通勤手当", editable: true, width: 80 },
  { key: "dependent_allowance", label: "扶養手当", editable: true, width: 80 },
  { key: "fixed_overtime", label: "固定残業", editable: true, width: 80 },
  { key: "overtime_pay", label: "超過残業", editable: true, width: 80 },
  { key: "adjustment_allowance", label: "調整手当", editable: true, width: 80 },
  { key: "absence_deduction", label: "欠勤控除", editable: true, width: 80 },
  { key: "total_payment", label: "支給合計", editable: false, width: 100 },
];

// パート用のカラム定義
const PT_COLS: { key: string; label: string; editable: boolean; width: number }[] = [
  { key: "employee_code", label: "コード", editable: false, width: 70 },
  { key: "full_name", label: "氏名", editable: false, width: 100 },
  { key: "work_days", label: "出勤", editable: false, width: 50 },
  { key: "hourly_weekday_minutes", label: "平日時間", editable: true, width: 75 },
  { key: "hourly_rate_weekday", label: "平日時給", editable: true, width: 75 },
  { key: "hourly_saturday_minutes", label: "土曜時間", editable: true, width: 75 },
  { key: "hourly_rate_saturday", label: "土曜時給", editable: true, width: 75 },
  { key: "hourly_sunday_minutes", label: "日曜時間", editable: true, width: 75 },
  { key: "hourly_rate_sunday", label: "日曜時給", editable: true, width: 75 },
  { key: "base_salary", label: "基本給", editable: false, width: 90 },
  { key: "commute_allowance", label: "通勤手当", editable: true, width: 80 },
  { key: "adjustment_allowance", label: "調整手当", editable: true, width: 80 },
  { key: "total_payment", label: "支給合計", editable: false, width: 100 },
];

function recalcFtTotal(r: any): number {
  return (r.base_salary||0)+(r.position_allowance||0)+(r.qualification_allowance||0)
    +(r.commute_allowance||0)+(r.dependent_allowance||0)+(r.fixed_overtime||0)
    +(r.overtime_pay||0)+(r.adjustment_allowance||0)-(r.absence_deduction||0);
}
function recalcPtTotal(r: any): number {
  const base = Math.round(((r.hourly_weekday_minutes||0)/60)*(r.hourly_rate_weekday||0)
    +((r.hourly_saturday_minutes||0)/60)*(r.hourly_rate_saturday||0)
    +((r.hourly_sunday_minutes||0)/60)*(r.hourly_rate_sunday||0));
  return base + (r.commute_allowance||0) + (r.adjustment_allowance||0);
}
function recalcPtBase(r: any): number {
  return Math.round(((r.hourly_weekday_minutes||0)/60)*(r.hourly_rate_weekday||0)
    +((r.hourly_saturday_minutes||0)/60)*(r.hourly_rate_saturday||0)
    +((r.hourly_sunday_minutes||0)/60)*(r.hourly_rate_sunday||0));
}

export default function PayrollSub({ employee }: { employee: any }) {
  const [yearMonth, setYearMonth] = useState(getDefaultYearMonth());
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [editingCell, setEditingCell] = useState<string | null>(null); // "rowIdx-colKey"
  const [storeFilter, setStoreFilter] = useState("all");

  const ymOptions = generateYearMonthOptions();
  const periods = getPeriods(yearMonth);

  const loadData = useCallback(async () => {
    setLoading(true); setError(null); setSuccess(null);
    try {
      const { data, error: fe } = await supabase.from("payroll_monthly")
        .select("*, employees (employee_code, full_name, employment_type, store_id, stores (store_name))")
        .eq("company_id", AKASHI_COMPANY_ID)
        .eq("target_year", parseInt(yearMonth.split("-")[0]))
        .eq("target_month", parseInt(yearMonth.split("-")[1]))
        .order("employee_id");
      if (fe) throw fe;
      // flatten & sort by employee_code
      const mapped = (data || []).map((r: any) => ({
        ...r,
        employee_code: r.employees?.employee_code || "",
        full_name: r.employees?.full_name || "",
        employment_type: r.employees?.employment_type || "",
        store_name: r.employees?.stores?.store_name || "",
        hourly_rate_weekday: r.hourly_rate_weekday || 0,
        hourly_rate_saturday: r.hourly_rate_saturday || 0,
        hourly_rate_sunday: r.hourly_rate_sunday || 0,
      }));
      mapped.sort((a: any, b: any) => a.employee_code.localeCompare(b.employee_code));
      setRows(mapped);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [yearMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCalculate = async () => {
    if (rows.length > 0 && !showConfirm) { setShowConfirm(true); return; }
    setShowConfirm(false); setCalculating(true); setError(null); setSuccess(null);
    try {
      const r = await calculateAll({ yearMonth });
      await savePayrollResults(r, yearMonth);
      await loadData();
      setSuccess("計算完了");
    } catch (e: any) { setError(e.message); }
    finally { setCalculating(false); }
  };

  const handleCellChange = (idx: number, key: string, value: string) => {
    const num = parseInt(value) || 0;
    setRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: num };
      const r = next[idx];
      const isPt = r.employment_type === "パート";
      if (isPt) {
        r.base_salary = recalcPtBase(r);
        r.total_payment = recalcPtTotal(r);
      } else {
        r.total_payment = recalcFtTotal(r);
      }
      return next;
    });
  };

  const handleSaveAll = async () => {
    setSaving(true); setError(null); setSuccess(null);
    try {
      for (const r of rows) {
        const isPt = r.employment_type === "パート";
        const uf: any = {
          total_payment: r.total_payment,
          adjustment_allowance: r.adjustment_allowance || 0,
          calculated_at: new Date().toISOString(),
        };
        if (isPt) {
          uf.hourly_weekday_minutes = r.hourly_weekday_minutes || 0;
          uf.hourly_saturday_minutes = r.hourly_saturday_minutes || 0;
          uf.hourly_sunday_minutes = r.hourly_sunday_minutes || 0;
          uf.base_salary = r.base_salary;
          uf.commute_allowance = r.commute_allowance || 0;
        } else {
          uf.base_salary = r.base_salary || 0;
          uf.position_allowance = r.position_allowance || 0;
          uf.qualification_allowance = r.qualification_allowance || 0;
          uf.commute_allowance = r.commute_allowance || 0;
          uf.dependent_allowance = r.dependent_allowance || 0;
          uf.fixed_overtime = r.fixed_overtime || 0;
          uf.overtime_pay = r.overtime_pay || 0;
          uf.absence_deduction = r.absence_deduction || 0;
        }
        const { error: ue } = await supabase.from("payroll_monthly").update(uf).eq("id", r.id);
        if (ue) throw ue;
      }
      setSuccess("保存しました");
      await loadData();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const matchStore = (r: any) => {
    if (storeFilter === "all") return true;
    return (r.store_name || "").includes(storeFilter);
  };
  const ftRows = rows.filter(r => r.employment_type !== "パート" && matchStore(r));
  const ptRows = rows.filter(r => r.employment_type === "パート" && matchStore(r));

  const ftTotal = ftRows.reduce((s, r) => s + (r.total_payment || 0), 0);
  const ptTotal = ptRows.reduce((s, r) => s + (r.total_payment || 0), 0);

  const STORE_FILTERS = [
    { label: "全店舗", value: "all" },
    { label: "大久保店", value: "大久保" },
    { label: "魚住店", value: "魚住" },
  ];

  return (
    <div>
      {/* 操作エリア */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, padding: 14, backgroundColor: "#f8f9fa", borderRadius: 8, flexWrap: "wrap" }}>
        <label style={{ fontWeight: 700, fontSize: 13 }}>支給年月:</label>
        <select value={yearMonth} onChange={e => setYearMonth(e.target.value)} style={{ padding: "7px 10px", borderRadius: 4, border: "1px solid #ccc", fontSize: 14 }}>
          {ymOptions.map(ym => <option key={ym} value={ym}>{ym.replace("-", "年")}月</option>)}
        </select>
        <button onClick={handleCalculate} disabled={calculating} style={{ padding: "8px 20px", backgroundColor: calculating ? "#ccc" : T.primary, color: "#fff", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: calculating ? "not-allowed" : "pointer" }}>
          {calculating ? "計算中..." : "計算実行"}
        </button>
        {rows.length > 0 && <span style={{ color: "#666", fontSize: 12 }}>最終: {new Date(rows[0]?.calculated_at).toLocaleString("ja-JP")}</span>}
      </div>

      {showConfirm && (
        <div style={{ padding: 14, marginBottom: 14, backgroundColor: "#fff3cd", border: "1px solid #ffc107", borderRadius: 8, fontSize: 13 }}>
          <p style={{ fontWeight: 700, marginBottom: 6 }}>既にデータがあります。上書きしますか？</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleCalculate} style={{ padding: "6px 14px", backgroundColor: "#dc3545", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>上書き</button>
            <button onClick={() => setShowConfirm(false)} style={{ padding: "6px 14px", backgroundColor: "#6c757d", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>キャンセル</button>
          </div>
        </div>
      )}

      {error && <div style={{ padding: 10, marginBottom: 14, backgroundColor: "#f8d7da", borderRadius: 8, color: "#721c24", fontSize: 13 }}>{error}</div>}
      {success && <div style={{ padding: 10, marginBottom: 14, backgroundColor: "#d4edda", borderRadius: 8, color: "#155724", fontSize: 13 }}>{success}</div>}

      {rows.length > 0 && (
        <div style={{ marginBottom: 14, fontSize: 12, color: "#555" }}>
          <span>正社員: {periods.ft}</span><span style={{ marginLeft: 20 }}>パート: {periods.pt}</span>
        </div>
      )}

      {loading && <p style={{ fontSize: 13, color: "#888" }}>読み込み中...</p>}

      {/* 店舗フィルター */}
      {rows.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {STORE_FILTERS.map(f => (
            <button key={f.value} onClick={() => setStoreFilter(f.value)} style={{
              padding: "7px 12px", borderRadius: 20, fontSize: 12, fontWeight: storeFilter === f.value ? 700 : 400,
              cursor: "pointer", border: storeFilter === f.value ? `2px solid ${T.primary}` : `1px solid ${T.border}`,
              backgroundColor: storeFilter === f.value ? T.primary + "15" : "#fff",
              color: storeFilter === f.value ? T.primary : T.textSec,
            }}>{f.label}</button>
          ))}
        </div>
      )}

      {/* 正社員テーブル */}
      {ftRows.length > 0 && (
        <>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, marginTop: 20 }}>正社員（月給制）</h3>
          <SpreadTable cols={FT_COLS} data={ftRows} allRows={rows} editingCell={editingCell} setEditingCell={setEditingCell} onChange={handleCellChange} total={ftTotal} />
        </>
      )}

      {/* パートテーブル */}
      {ptRows.length > 0 && (
        <>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, marginTop: 24 }}>パート（時給制）</h3>
          <SpreadTable cols={PT_COLS} data={ptRows} allRows={rows} editingCell={editingCell} setEditingCell={setEditingCell} onChange={handleCellChange} total={ptTotal} />
        </>
      )}

      {!loading && rows.length === 0 && (
        <p style={{ color: "#888", marginTop: 28, textAlign: "center", fontSize: 13 }}>{yearMonth.replace("-", "年")}月のデータはまだありません。</p>
      )}

      {/* 一括保存ボタン */}
      {rows.length > 0 && (
        <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center" }}>
          <button onClick={handleSaveAll} disabled={saving} style={{ padding: "10px 32px", backgroundColor: saving ? "#ccc" : T.primary, color: "#fff", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "保存中..." : "全員分を保存"}
          </button>
          <span style={{ fontSize: 12, color: "#888" }}>正社員+パート合計: ¥{(ftTotal + ptTotal).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}

/* ── Excel風テーブル（コード・氏名列 左固定） ── */
const STICKY_KEYS = ["employee_code", "full_name"];

function SpreadTable({ cols, data, allRows, editingCell, setEditingCell, onChange, total }: {
  cols: { key: string; label: string; editable: boolean; width: number }[];
  data: any[]; allRows: any[];
  editingCell: string | null; setEditingCell: (v: string | null) => void;
  onChange: (idx: number, key: string, value: string) => void;
  total: number;
}) {
  const fmtVal = (key: string, val: any) => {
    if (key === "work_days") return val != null ? `${val}` : "0";
    if (key.includes("minutes")) return val != null ? `${val}` : "0";
    if (key === "employee_code" || key === "full_name") return val || "";
    return val != null ? `¥${Number(val).toLocaleString()}` : "¥0";
  };

  // sticky列のleft位置を計算
  const stickyLeft: Record<string, number> = {};
  let leftAccum = 0;
  for (const c of cols) {
    if (STICKY_KEYS.includes(c.key)) {
      stickyLeft[c.key] = leftAccum;
      leftAccum += c.width;
    }
  }

  const stickyStyle = (key: string, bg: string): React.CSSProperties =>
    STICKY_KEYS.includes(key) ? { position: "sticky", left: stickyLeft[key], zIndex: 20, backgroundColor: bg, boxShadow: key === "full_name" ? "2px 0 4px rgba(0,0,0,0.06)" : undefined } : {};

  return (
    <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "70vh", border: `1px solid ${T.border}`, borderRadius: 6 }}>
      <table style={{ borderCollapse: "collapse", fontSize: 12, whiteSpace: "nowrap", minWidth: cols.reduce((s, c) => s + c.width, 0) }}>
        <thead>
          <tr style={{ position: "sticky", top: 0, zIndex: 20 }}>
            {cols.map(c => (
              <th key={c.key} style={{
                padding: "8px 6px", backgroundColor: "#f1f3f5", borderBottom: "2px solid #dee2e6",
                borderRight: "1px solid #eee", fontWeight: 700, fontSize: 11,
                textAlign: STICKY_KEYS.includes(c.key) ? "left" : "right",
                position: "sticky", top: 0, zIndex: STICKY_KEYS.includes(c.key) ? 40 : 25,
                width: c.width, minWidth: c.width,
                ...stickyStyle(c.key, "#f1f3f5"),
              }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const globalIdx = allRows.indexOf(row);
            return (
              <tr key={row.id} style={{ borderBottom: "1px solid #eee" }}>
                {cols.map(c => {
                  const cellId = `${globalIdx}-${c.key}`;
                  const isEditing = editingCell === cellId;
                  const isRight = !STICKY_KEYS.includes(c.key);
                  const isTotal = c.key === "total_payment";
                  const val = row[c.key];
                  const baseBg = c.editable ? "#fafbfc" : "#fff";

                  if (isEditing && c.editable) {
                    return (
                      <td key={c.key} style={{ padding: 0, borderRight: "1px solid #eee", ...stickyStyle(c.key, "#fffde7") }}>
                        <input autoFocus type="number" value={val || 0}
                          onChange={e => onChange(globalIdx, c.key, e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={e => { if (e.key === "Enter" || e.key === "Tab") setEditingCell(null); }}
                          style={{ width: "100%", padding: "6px 4px", border: `2px solid ${T.primary}`, borderRadius: 0, textAlign: "right", fontSize: 12, outline: "none", boxSizing: "border-box", backgroundColor: "#fffde7" }}
                        />
                      </td>
                    );
                  }

                  return (
                    <td key={c.key}
                      onClick={() => c.editable ? setEditingCell(cellId) : undefined}
                      style={{
                        padding: "7px 6px", borderRight: "1px solid #eee",
                        textAlign: isRight ? "right" : "left",
                        cursor: c.editable ? "pointer" : "default",
                        fontWeight: isTotal ? 700 : 400,
                        color: isTotal ? T.primary : c.key === "absence_deduction" && val > 0 ? "#dc3545" : T.text,
                        backgroundColor: baseBg,
                        ...stickyStyle(c.key, baseBg),
                      }}>
                      {fmtVal(c.key, val)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ backgroundColor: "#e9ecef", fontWeight: 700 }}>
            {cols.map((c, ci) => {
              if (ci === 0) return <td key={c.key} style={{ padding: "8px 6px", borderRight: "1px solid #eee", ...stickyStyle(c.key, "#e9ecef") }}>合計</td>;
              if (ci === 1) return <td key={c.key} style={{ padding: "8px 6px", borderRight: "1px solid #eee", ...stickyStyle(c.key, "#e9ecef") }}></td>;
              if (ci === cols.length - 1) return <td key={c.key} style={{ padding: "8px 6px", textAlign: "right", color: T.primary, fontSize: 13, borderRight: "1px solid #eee" }}>¥{total.toLocaleString()}</td>;
              return <td key={c.key} style={{ padding: "8px 6px", borderRight: "1px solid #eee" }}></td>;
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
