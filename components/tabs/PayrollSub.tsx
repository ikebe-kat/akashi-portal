"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { T, AKASHI_COMPANY_ID } from "@/lib/constants";
import { calculateAll, savePayrollResults } from "@/lib/payroll/calculatePayroll";

// AKASHI_COMPANY_ID は lib/constants.ts からimport済み

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
  { key: "paid_leave_days", label: "有給日", editable: false, width: 50 },
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
  { key: "paid_leave_days", label: "有給日", editable: false, width: 50 },
  { key: "paid_leave_amount", label: "有給額", editable: true, width: 80 },
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
  return base + (r.commute_allowance||0) + (r.adjustment_allowance||0) + (r.paid_leave_amount||0);
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
  const [originalRows, setOriginalRows] = useState<any[]>([]); // 差分比較用
  const [showHistory, setShowHistory] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [historyFilter, setHistoryFilter] = useState("all"); // employee_code or "all"

  const ymOptions = generateYearMonthOptions();
  const periods = getPeriods(yearMonth);

  const loadData = useCallback(async () => {
    setLoading(true); setError(null); setSuccess(null);
    try {
      const { data, error: fe } = await supabase.from("payroll_monthly")
        .select("*, employees (employee_code, full_name, employment_type, store_id, stores (store_name), employee_payroll_config (hourly_wage_weekday, hourly_wage_saturday, hourly_wage_sunday))")
        .eq("company_id", AKASHI_COMPANY_ID)
        .eq("target_year", parseInt(yearMonth.split("-")[0]))
        .eq("target_month", parseInt(yearMonth.split("-")[1]))
        .order("employee_id");
      if (fe) throw fe;
      // 有給日数を取得（対象月のattendance_dailyから承認済み有給を集計）
      const [y, m] = yearMonth.split("-").map(Number);
      const monthStart = `${y}-${String(m).padStart(2,"0")}-01`;
      const monthEnd = `${y}-${String(m).padStart(2,"0")}-${new Date(y, m, 0).getDate()}`;
      const { data: attData } = await supabase.from("attendance_daily")
        .select("employee_id, reason")
        .eq("company_id", AKASHI_COMPANY_ID)
        .gte("attendance_date", monthStart).lte("attendance_date", monthEnd)
        .like("reason", "%有給%");
      const leaveDaysMap: Record<string, number> = {};
      (attData || []).forEach((a: any) => {
        if (!a.reason) return;
        let days = 0;
        if (a.reason.includes("有給（全日）")) days = 1;
        else if (a.reason.includes("午前有給") || a.reason.includes("午後有給")) days = 0.5;
        if (days > 0) leaveDaysMap[a.employee_id] = (leaveDaysMap[a.employee_id] || 0) + days;
      });

      // flatten & sort by employee_code
      const mapped = (data || []).map((r: any) => {
        const cfg = r.employees?.employee_payroll_config?.[0] || {};
        return {
          ...r,
          employee_code: r.employees?.employee_code || "",
          full_name: r.employees?.full_name || "",
          employment_type: r.employees?.employment_type || "",
          store_name: r.employees?.stores?.store_name || "",
          hourly_rate_weekday: cfg.hourly_wage_weekday || 0,
          hourly_rate_saturday: cfg.hourly_wage_saturday || 0,
          hourly_rate_sunday: cfg.hourly_wage_sunday || 0,
          paid_leave_days: leaveDaysMap[r.employee_id] || 0,
          paid_leave_amount: r.paid_leave_amount || 0,
        };
      });
      mapped.sort((a: any, b: any) => a.employee_code.localeCompare(b.employee_code));
      setRows(mapped);
      setOriginalRows(mapped.map((r: any) => ({ ...r })));
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

  const FIELD_LIMITS: Record<string, [number, number]> = {
    base_salary: [0, 999999], position_allowance: [0, 999999], qualification_allowance: [0, 999999],
    commute_allowance: [0, 99999], dependent_allowance: [0, 999999],
    fixed_overtime: [0, 999999], overtime_pay: [0, 999999],
    adjustment_allowance: [-999999, 999999], absence_deduction: [0, 999999],
    paid_leave_amount: [0, 999999],
    hourly_weekday_minutes: [0, 9999], hourly_saturday_minutes: [0, 9999], hourly_sunday_minutes: [0, 9999],
    hourly_rate_weekday: [0, 9999], hourly_rate_saturday: [0, 9999], hourly_rate_sunday: [0, 9999],
  };

  const handleCellChange = (idx: number, key: string, value: string) => {
    let num = parseInt(value) || 0;
    const limits = FIELD_LIMITS[key];
    if (limits) num = Math.max(limits[0], Math.min(limits[1], num));
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

  // 差分記録対象のカラム→日本語ラベル
  const TRACKED_FIELDS: Record<string, string> = {
    base_salary: "基本給", position_allowance: "役職手当", qualification_allowance: "資格手当",
    commute_allowance: "通勤手当", dependent_allowance: "扶養手当", fixed_overtime: "固定残業",
    overtime_pay: "超過残業", adjustment_allowance: "調整手当", absence_deduction: "欠勤控除",
    paid_leave_amount: "有給額",
    hourly_weekday_minutes: "平日時間", hourly_saturday_minutes: "土曜時間", hourly_sunday_minutes: "日曜時間",
  };

  const handleSaveAll = async () => {
    setSaving(true); setError(null); setSuccess(null);
    try {
      const changeLogs: any[] = [];
      for (const r of rows) {
        const orig = originalRows.find((o: any) => o.id === r.id);
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
          uf.paid_leave_amount = r.paid_leave_amount || 0;
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
        // 差分記録
        if (orig) {
          for (const [field] of Object.entries(TRACKED_FIELDS)) {
            const oldVal = orig[field] ?? 0;
            const newVal = r[field] ?? 0;
            if (oldVal !== newVal) {
              changeLogs.push({
                payroll_monthly_id: r.id,
                employee_id: r.employee_id,
                changed_by: employee?.employee_code || "unknown",
                field_name: field,
                old_value: oldVal,
                new_value: newVal,
              });
            }
          }
        }
        const { error: ue } = await supabase.from("payroll_monthly").update(uf).eq("id", r.id);
        if (ue) throw ue;
      }
      // 差分があればログ保存
      if (changeLogs.length > 0) {
        const { error: logErr } = await supabase.from("payroll_change_logs").insert(changeLogs);
        if (logErr) { setError("給与データは保存しましたが、変更履歴の記録に失敗しました: " + logErr.message); await loadData(); return; }
      }
      setSuccess(`保存しました${changeLogs.length > 0 ? `（${changeLogs.length}件の変更を記録）` : ""}`);
      await loadData();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  // 変更履歴取得
  const loadHistory = async () => {
    const [y, m] = yearMonth.split("-").map(Number);
    const { data } = await supabase.from("payroll_change_logs")
      .select("*, employees (employee_code, full_name)")
      .in("payroll_monthly_id", rows.map(r => r.id))
      .order("changed_at", { ascending: false });
    setHistoryLogs(data || []);
    setShowHistory(true);
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
        {rows.length > 0 && <span style={{ color: "#666", fontSize: 12 }}>最終: {new Date(Math.max(...rows.map(r => new Date(r.calculated_at).getTime()))).toLocaleString("ja-JP")}</span>}
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

      {/* 店舗フィルター + 変更履歴ボタン */}
      {rows.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          {STORE_FILTERS.map(f => (
            <button key={f.value} onClick={() => setStoreFilter(f.value)} style={{
              padding: "7px 12px", borderRadius: 20, fontSize: 12, fontWeight: storeFilter === f.value ? 700 : 400,
              cursor: "pointer", border: storeFilter === f.value ? `2px solid ${T.primary}` : `1px solid ${T.border}`,
              backgroundColor: storeFilter === f.value ? T.primary + "15" : "#fff",
              color: storeFilter === f.value ? T.primary : T.textSec,
            }}>{f.label}</button>
          ))}
          <button onClick={loadHistory} style={{
            padding: "7px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
            cursor: "pointer", border: "2px solid #7C3AED",
            backgroundColor: "#7C3AED15", color: "#7C3AED", marginLeft: "auto",
          }}>変更履歴</button>
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

      {/* 変更履歴モーダル */}
      {showHistory && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}
          onClick={() => setShowHistory(false)}>
          <div style={{ backgroundColor: "#fff", borderRadius: 10, padding: 24, width: "100%", maxWidth: 640, maxHeight: "80vh", overflow: "auto" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#7C3AED", margin: 0 }}>変更履歴 — {yearMonth.replace("-","年")}月</h3>
              <button onClick={() => setShowHistory(false)} style={{ border: "none", backgroundColor: "transparent", fontSize: 18, cursor: "pointer", color: T.textMuted }}>✕</button>
            </div>
            {/* 従業員フィルタ */}
            <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}>
              <button onClick={() => setHistoryFilter("all")} style={{ padding: "5px 10px", borderRadius: 16, fontSize: 11, fontWeight: historyFilter === "all" ? 700 : 400, cursor: "pointer", border: historyFilter === "all" ? "2px solid #7C3AED" : `1px solid ${T.border}`, backgroundColor: historyFilter === "all" ? "#7C3AED15" : "#fff", color: historyFilter === "all" ? "#7C3AED" : T.textSec }}>全員</button>
              {[...new Set(historyLogs.map((l: any) => l.employees?.employee_code).filter(Boolean))].sort().map(code => (
                <button key={code} onClick={() => setHistoryFilter(code)} style={{ padding: "5px 10px", borderRadius: 16, fontSize: 11, fontWeight: historyFilter === code ? 700 : 400, cursor: "pointer", border: historyFilter === code ? "2px solid #7C3AED" : `1px solid ${T.border}`, backgroundColor: historyFilter === code ? "#7C3AED15" : "#fff", color: historyFilter === code ? "#7C3AED" : T.textSec }}>{code}</button>
              ))}
            </div>
            {historyLogs.length === 0 ? (
              <p style={{ textAlign: "center", color: T.textMuted, padding: 32, fontSize: 13 }}>変更履歴はありません</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ backgroundColor: "#f3f0ff", borderBottom: "2px solid #7C3AED" }}>
                  <th style={{ padding: "8px 6px", textAlign: "left" }}>従業員</th>
                  <th style={{ padding: "8px 6px", textAlign: "left" }}>項目</th>
                  <th style={{ padding: "8px 6px", textAlign: "right" }}>変更前</th>
                  <th style={{ padding: "8px 6px", textAlign: "center" }}>→</th>
                  <th style={{ padding: "8px 6px", textAlign: "right" }}>変更後</th>
                  <th style={{ padding: "8px 6px", textAlign: "left" }}>変更者</th>
                  <th style={{ padding: "8px 6px", textAlign: "left" }}>日時</th>
                </tr></thead>
                <tbody>
                  {historyLogs
                    .filter((l: any) => historyFilter === "all" || l.employees?.employee_code === historyFilter)
                    .map((l: any) => (
                    <tr key={l.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "6px" }}>{l.employees?.employee_code} {l.employees?.full_name}</td>
                      <td style={{ padding: "6px" }}>{TRACKED_FIELDS[l.field_name] || l.field_name}</td>
                      <td style={{ padding: "6px", textAlign: "right", color: "#991B1B" }}>¥{(l.old_value ?? 0).toLocaleString()}</td>
                      <td style={{ padding: "6px", textAlign: "center", color: T.textMuted }}>→</td>
                      <td style={{ padding: "6px", textAlign: "right", color: "#065F46", fontWeight: 600 }}>¥{(l.new_value ?? 0).toLocaleString()}</td>
                      <td style={{ padding: "6px" }}>{l.changed_by}</td>
                      <td style={{ padding: "6px", color: T.textMuted, fontSize: 11 }}>{new Date(l.changed_at).toLocaleString("ja-JP")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
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
    if (key === "paid_leave_days") return val != null ? `${val}` : "0";
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

  // td用: 左固定のみ
  const stickyTdStyle = (key: string, bg: string): React.CSSProperties =>
    STICKY_KEYS.includes(key) ? { position: "sticky", left: stickyLeft[key], zIndex: 20, backgroundColor: bg, boxShadow: key === "full_name" ? "2px 0 4px rgba(0,0,0,0.06)" : undefined } : {};

  // th用: 左固定+上固定の両方
  const stickyThStyle = (key: string): React.CSSProperties =>
    STICKY_KEYS.includes(key)
      ? { position: "sticky", top: 0, left: stickyLeft[key], zIndex: 40, backgroundColor: "#f1f3f5", boxShadow: key === "full_name" ? "2px 0 4px rgba(0,0,0,0.06)" : undefined }
      : { position: "sticky", top: 0, zIndex: 30, backgroundColor: "#f1f3f5" };

  return (
    <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "70vh", border: `1px solid ${T.border}`, borderRadius: 6 }}>
      <table style={{ borderCollapse: "collapse", fontSize: 12, whiteSpace: "nowrap", minWidth: cols.reduce((s, c) => s + c.width, 0) }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c.key} style={{
                padding: "8px 6px", borderBottom: "2px solid #dee2e6",
                borderRight: "1px solid #eee", fontWeight: 700, fontSize: 11,
                textAlign: STICKY_KEYS.includes(c.key) ? "left" : "right",
                width: c.width, minWidth: c.width,
                ...stickyThStyle(c.key),
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
                      <td key={c.key} style={{ padding: 0, borderRight: "1px solid #eee", ...stickyTdStyle(c.key, "#fffde7") }}>
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
                        ...stickyTdStyle(c.key, baseBg),
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
              if (ci === 0) return <td key={c.key} style={{ padding: "8px 6px", borderRight: "1px solid #eee", ...stickyTdStyle(c.key, "#e9ecef") }}>合計</td>;
              if (ci === 1) return <td key={c.key} style={{ padding: "8px 6px", borderRight: "1px solid #eee", ...stickyTdStyle(c.key, "#e9ecef") }}></td>;
              if (ci === cols.length - 1) return <td key={c.key} style={{ padding: "8px 6px", textAlign: "right", color: T.primary, fontSize: 13, borderRight: "1px solid #eee" }}>¥{total.toLocaleString()}</td>;
              return <td key={c.key} style={{ padding: "8px 6px", borderRight: "1px solid #eee" }}></td>;
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
