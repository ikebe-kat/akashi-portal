"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { T, AKASHI_COMPANY_ID } from "@/lib/constants";
import { calculateAll, savePayrollResults, getChangeLogCount } from "@/lib/payroll/calculatePayroll";
import { FT_CONFIG_FIELDS, PT_CONFIG_FIELDS, buildUiToConfigMap } from "@/lib/payroll/configFields";

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

// パート用カラム定義（統一時給：平日/土/日が同じ→時間1本）
const PT_UNIFIED_COLS: { key: string; label: string; editable: boolean; width: number }[] = [
  { key: "employee_code", label: "コード", editable: false, width: 70 },
  { key: "full_name", label: "氏名", editable: false, width: 100 },
  { key: "work_days", label: "出勤", editable: false, width: 50 },
  { key: "paid_leave_days", label: "有給日", editable: false, width: 50 },
  { key: "paid_leave_amount", label: "有給額", editable: true, width: 80 },
  { key: "hourly_weekday_minutes", label: "労働時間", editable: true, width: 75 },
  { key: "hourly_rate_weekday", label: "時給", editable: true, width: 75 },
  { key: "base_salary", label: "基本給", editable: false, width: 90 },
  { key: "commute_allowance", label: "通勤手当", editable: true, width: 80 },
  { key: "adjustment_allowance", label: "調整手当", editable: true, width: 80 },
  { key: "total_payment", label: "支給合計", editable: false, width: 100 },
];
// パート用カラム定義（分割時給：曜日別に時間・時給を表示）
const PT_SPLIT_COLS: { key: string; label: string; editable: boolean; width: number }[] = [
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
  const [calcStep, setCalcStep] = useState<'idle' | 'mode_select' | 'confirm_preserve' | 'confirm_full'>('idle');
  const [changeLogCount, setChangeLogCount] = useState(0);
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
          paid_leave_days: r.paid_leave_days || 0,
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

  const isOwnerUser = ["D02", "D18", "D67"].includes(employee?.employee_code);

  const handleCalculate = () => {
    if (rows.length === 0) {
      handleConfirmCalc('preserve');
      return;
    }
    setCalcStep('mode_select');
  };

  const handleSelectMode = async (mode: 'preserve' | 'full') => {
    if (mode === 'full') {
      const count = await getChangeLogCount(yearMonth);
      setChangeLogCount(count);
      setCalcStep('confirm_full');
    } else {
      setCalcStep('confirm_preserve');
    }
  };

  const handleConfirmCalc = async (mode: 'preserve' | 'full') => {
    setCalcStep('idle'); setCalculating(true); setError(null); setSuccess(null);
    try {
      const r = await calculateAll({ yearMonth, mode });
      await savePayrollResults(r, yearMonth, mode);
      await loadData();
      setSuccess(mode === 'preserve' ? "再計算完了（手修正を維持）" : "完全再計算完了");
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
      const rpcRows: any[] = [];
      let totalChanges = 0;
      for (const r of rows) {
        const orig = originalRows.find((o: any) => o.id === r.id);
        const isPt = r.employment_type === "パート";
        const payrollFields: any = {
          total_payment: r.total_payment,
          adjustment_allowance: r.adjustment_allowance || 0,
        };
        if (isPt) {
          payrollFields.hourly_weekday_minutes = r.hourly_weekday_minutes || 0;
          payrollFields.hourly_saturday_minutes = r.hourly_saturday_minutes || 0;
          payrollFields.hourly_sunday_minutes = r.hourly_sunday_minutes || 0;
          payrollFields.base_salary = r.base_salary;
          payrollFields.commute_allowance = r.commute_allowance || 0;
          payrollFields.paid_leave_amount = r.paid_leave_amount || 0;
        } else {
          payrollFields.base_salary = r.base_salary || 0;
          payrollFields.position_allowance = r.position_allowance || 0;
          payrollFields.qualification_allowance = r.qualification_allowance || 0;
          payrollFields.commute_allowance = r.commute_allowance || 0;
          payrollFields.dependent_allowance = r.dependent_allowance || 0;
          payrollFields.fixed_overtime = r.fixed_overtime || 0;
          payrollFields.overtime_pay = r.overtime_pay || 0;
          payrollFields.absence_deduction = r.absence_deduction || 0;
        }
        // 差分記録
        const changeLogs: any[] = [];
        if (orig) {
          for (const [field] of Object.entries(TRACKED_FIELDS)) {
            const oldVal = orig[field] ?? 0;
            const newVal = r[field] ?? 0;
            if (oldVal !== newVal) {
              changeLogs.push({ field_name: field, old_value: oldVal, new_value: newVal });
            }
          }
        }
        // config 変更の算出
        const configMap = buildUiToConfigMap(isPt ? PT_CONFIG_FIELDS : FT_CONFIG_FIELDS);
        const configChanges: Record<string, number> = {};
        if (orig) {
          for (const [field, col] of Object.entries(configMap)) {
            if ((orig[field] ?? 0) !== (r[field] ?? 0)) {
              configChanges[col] = r[field] ?? 0;
            }
          }
        }
        totalChanges += changeLogs.length;
        rpcRows.push({
          employee_id: r.employee_id,
          employment_type: r.employment_type,
          payroll_monthly_id: r.id,
          payroll_fields: payrollFields,
          config_changes: Object.keys(configChanges).length > 0 ? configChanges : null,
          change_logs: changeLogs.length > 0 ? changeLogs : null,
        });
      }
      const { error: rpcErr } = await supabase.rpc("fn_save_payroll_and_config", {
        p_year_month: yearMonth,
        p_changed_by: employee?.employee_code || "unknown",
        p_rows: rpcRows,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      setSuccess(`保存しました${totalChanges > 0 ? `（${totalChanges}件の変更を記録）` : ""}`);
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

  const exportExcel = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const [ty, tm] = yearMonth.split("-").map(Number);
    if (rows.length === 0) return;

    const thin: any = { top: {style:"thin"}, left: {style:"thin"}, bottom: {style:"thin"}, right: {style:"thin"} };
    const hdrFill: any = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDDDDD" } };
    const totalFill: any = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE9ECEF" } };
    const bFont: any = { bold: true, size: 10, name: "Yu Gothic" };
    const nFont: any = { size: 10, name: "Yu Gothic" };
    const tFont: any = { bold: true, size: 12, name: "Yu Gothic" };

    const sorted = [...rows].sort((a: any, b: any) => (a.employee_code || "").localeCompare(b.employee_code || ""));
    const ft = sorted.filter((r: any) => r.employment_type !== "パート");
    const pt = sorted.filter((r: any) => r.employment_type === "パート");
    const ptu = pt.filter((r: any) => !isSplitRate(r));
    const pts = pt.filter((r: any) => isSplitRate(r));

    const cellVal = (key: string, row: any): any => {
      if (key === "employee_code" || key === "full_name") return row[key] || "";
      if (key === "work_days" || key === "paid_leave_days") return Number(row[key] || 0);
      if (key.includes("minutes")) return Number(row[key] || 0) / 60;
      return Number(row[key] || 0);
    };
    const isText = (key: string) => key === "employee_code" || key === "full_name";
    const isTime = (key: string) => key.includes("minutes");

    type ColDef = { key: string; label: string; width: number };
    const writeSheet = (sheetName: string, title: string, cols: ColDef[], data: any[]) => {
      if (data.length === 0) return;
      const ws = wb.addWorksheet(sheetName);
      ws.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
      cols.forEach((c, i) => { ws.getColumn(i + 1).width = Math.round(c.width / 6); });

      let r = 1;
      ws.getCell(r, 1).value = `${title}　${tm}月支給分`;
      ws.getCell(r, 1).font = tFont;
      r += 2;

      cols.forEach((c, i) => {
        const cell = ws.getCell(r, i + 1);
        cell.value = c.label; cell.font = bFont;
        cell.alignment = { horizontal: "center", wrapText: true };
        cell.border = thin; cell.fill = hdrFill;
      });
      r++;

      for (const row of data) {
        cols.forEach((c, i) => {
          const cell = ws.getCell(r, i + 1);
          cell.value = cellVal(c.key, row);
          cell.font = c.key === "total_payment" ? { ...nFont, bold: true } : nFont;
          cell.border = thin;
          if (!isText(c.key)) {
            cell.alignment = { horizontal: "right" };
            if (isTime(c.key)) cell.numFmt = "0.00";
            else if (c.key !== "work_days" && c.key !== "paid_leave_days") cell.numFmt = "#,##0";
          }
        });
        r++;
      }

      const totalPayment = data.reduce((s: number, d: any) => s + Number(d.total_payment || 0), 0);
      cols.forEach((c, i) => {
        const cell = ws.getCell(r, i + 1);
        if (i === 0) cell.value = "合計";
        else if (c.key === "total_payment") {
          cell.value = totalPayment; cell.numFmt = "#,##0"; cell.alignment = { horizontal: "right" };
        } else cell.value = null;
        cell.font = bFont; cell.border = thin; cell.fill = totalFill;
      });
    };

    writeSheet("正社員（月給制）", "正社員（月給制）", FT_COLS, ft);
    if (ptu.length > 0) writeSheet("パート（時給制）", "パート（時給制）", PT_UNIFIED_COLS, ptu);
    if (pts.length > 0) writeSheet("パート（曜日別時給）", "パート（曜日別時給）", PT_SPLIT_COLS, pts);

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const fpm = tm === 1 ? 12 : tm - 1;
    const fpy = tm === 1 ? ty - 1 : ty;
    a.download = `明石西_給与_${fpy}-${String(fpm).padStart(2, "0")}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const matchStore = (r: any) => {
    if (storeFilter === "all") return true;
    return (r.store_name || "").includes(storeFilter);
  };
  const ftRows = rows.filter(r => r.employment_type !== "パート" && matchStore(r));
  const ptRows = rows.filter(r => r.employment_type === "パート" && matchStore(r));

  const ftTotal = ftRows.reduce((s, r) => s + (r.total_payment || 0), 0);
  const ptTotal = ptRows.reduce((s, r) => s + (r.total_payment || 0), 0);

  const isSplitRate = (r: any) => {
    const wd = r.hourly_rate_weekday || 0;
    const sat = r.hourly_rate_saturday || wd;
    const sun = r.hourly_rate_sunday || wd;
    return sat !== wd || sun !== wd;
  };
  const ptUnified = ptRows.filter(r => !isSplitRate(r));
  const ptSplit = ptRows.filter(r => isSplitRate(r));
  const ptUnifiedTotal = ptUnified.reduce((s, r) => s + (r.total_payment || 0), 0);
  const ptSplitTotal = ptSplit.reduce((s, r) => s + (r.total_payment || 0), 0);

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

      {calcStep === 'mode_select' && (
        <div style={{ padding: 14, marginBottom: 14, backgroundColor: "#e3f2fd", border: "1px solid #2196F3", borderRadius: 8, fontSize: 13 }}>
          <p style={{ fontWeight: 700, marginBottom: 8 }}>計算モードを選択してください</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => handleSelectMode('preserve')} style={{ padding: "8px 16px", backgroundColor: "#1976D2", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>再計算（手修正を残す）</button>
            {isOwnerUser && (
              <button onClick={() => handleSelectMode('full')} style={{ padding: "8px 16px", backgroundColor: "#d32f2f", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>完全再計算（全部やり直し）</button>
            )}
            <button onClick={() => setCalcStep('idle')} style={{ padding: "8px 16px", backgroundColor: "#6c757d", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 }}>キャンセル</button>
          </div>
        </div>
      )}

      {calcStep === 'confirm_preserve' && (
        <div style={{ padding: 14, marginBottom: 14, backgroundColor: "#fff3cd", border: "1px solid #ffc107", borderRadius: 8, fontSize: 13 }}>
          <p style={{ fontWeight: 700, marginBottom: 6 }}>打刻データから再計算します。手修正した値はそのまま残ります。</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => handleConfirmCalc('preserve')} style={{ padding: "6px 14px", backgroundColor: "#1976D2", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>実行</button>
            <button onClick={() => setCalcStep('idle')} style={{ padding: "6px 14px", backgroundColor: "#6c757d", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>キャンセル</button>
          </div>
        </div>
      )}

      {calcStep === 'confirm_full' && (
        <div style={{ padding: 14, marginBottom: 14, backgroundColor: "#fce4ec", border: "1px solid #ef5350", borderRadius: 8, fontSize: 13 }}>
          <p style={{ fontWeight: 700, marginBottom: 6, color: "#c62828" }}>⚠ 手修正{changeLogCount}件が消えます。全カラムを計算値で上書きします。よろしいですか？</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => handleConfirmCalc('full')} style={{ padding: "6px 14px", backgroundColor: "#d32f2f", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>完全再計算を実行</button>
            <button onClick={() => setCalcStep('idle')} style={{ padding: "6px 14px", backgroundColor: "#6c757d", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>キャンセル</button>
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
          <button onClick={exportExcel} disabled={rows.length === 0} style={{
            padding: "7px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
            cursor: rows.length === 0 ? "not-allowed" : "pointer", border: "2px solid #0D6EFD",
            backgroundColor: "#0D6EFD15", color: "#0D6EFD", marginLeft: "auto",
          }}>Excel出力</button>
          <button onClick={loadHistory} style={{
            padding: "7px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
            cursor: "pointer", border: "2px solid #7C3AED",
            backgroundColor: "#7C3AED15", color: "#7C3AED",
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
          {ptUnified.length > 0 && (
            <SpreadTable cols={PT_UNIFIED_COLS} data={ptUnified} allRows={rows} editingCell={editingCell} setEditingCell={setEditingCell} onChange={handleCellChange} total={ptUnifiedTotal} />
          )}
          {ptSplit.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <SpreadTable cols={PT_SPLIT_COLS} data={ptSplit} allRows={rows} editingCell={editingCell} setEditingCell={setEditingCell} onChange={handleCellChange} total={ptSplitTotal} />
            </div>
          )}
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
    if (key.includes("minutes")) return ((val || 0) / 60).toFixed(2);
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
                    const isTimeCol = c.key.includes("minutes");
                    const inputStyle = { width: "100%", padding: "6px 4px", border: `2px solid ${T.primary}`, borderRadius: 0 as const, textAlign: "right" as const, fontSize: 12, outline: "none", boxSizing: "border-box" as const, backgroundColor: "#fffde7" };
                    if (isTimeCol) {
                      const hoursVal = (val || 0) / 60;
                      return (
                        <td key={c.key} style={{ padding: 0, borderRight: "1px solid #eee", ...stickyTdStyle(c.key, "#fffde7") }}>
                          <input autoFocus type="number" step="0.25"
                            defaultValue={hoursVal || ""}
                            onBlur={e => {
                              const h = parseFloat(e.target.value) || 0;
                              onChange(globalIdx, c.key, String(Math.floor(h * 4) * 15));
                              setEditingCell(null);
                            }}
                            onKeyDown={e => { if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                            style={inputStyle}
                          />
                        </td>
                      );
                    }
                    return (
                      <td key={c.key} style={{ padding: 0, borderRight: "1px solid #eee", ...stickyTdStyle(c.key, "#fffde7") }}>
                        <input autoFocus type="number" value={val === 0 || val === "0" ? "" : val}
                          onChange={e => onChange(globalIdx, c.key, e.target.value)}
                          onBlur={e => { if (e.target.value === "") onChange(globalIdx, c.key, "0"); setEditingCell(null); }}
                          onKeyDown={e => { if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                          style={inputStyle}
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
