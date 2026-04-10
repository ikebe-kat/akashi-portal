"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { T } from "@/lib/constants";
import { calculateAll, savePayrollResults } from "@/lib/payroll/calculatePayroll";
import type { PayrollResult } from "@/lib/payroll/types";

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
function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}時間${m > 0 ? m + "分" : ""}`;
}

export default function PayrollSub({ employee }: { employee: any }) {
  const [yearMonth, setYearMonth] = useState(getDefaultYearMonth());
  const [savedResults, setSavedResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const yearMonthOptions = generateYearMonthOptions();

  const loadSavedResults = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: fe } = await supabase.from("payroll_monthly")
        .select("*, employees (employee_code, full_name, employment_type)")
        .eq("company_id", AKASHI_COMPANY_ID)
        .eq("target_year", parseInt(yearMonth.split("-")[0]))
        .eq("target_month", parseInt(yearMonth.split("-")[1]))
        .order("employee_id");
      if (fe) throw fe;
      setSavedResults(data || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [yearMonth]);

  useEffect(() => { loadSavedResults(); }, [loadSavedResults]);

  const handleCalculate = async () => {
    if (savedResults.length > 0 && !showConfirm) { setShowConfirm(true); return; }
    setShowConfirm(false); setCalculating(true); setError(null);
    try {
      const r = await calculateAll({ yearMonth });
      await savePayrollResults(r, yearMonth);
      await loadSavedResults();
    } catch (e: any) { setError(e.message); }
    finally { setCalculating(false); }
  };

  const displayData = savedResults.map((r: any) => ({
    id: r.id, employee_id: r.employee_id,
    employee_code: r.employees?.employee_code || "",
    employee_name: r.employees?.full_name || "",
    employment_type: r.employees?.employment_type || r.employment_type || "",
    work_days: r.work_days, gross_total: r.total_payment,
    has_warning: r.overtime_exceeded, calculated_at: r.calculated_at,
  }));
  const fulltimeData = displayData.filter(d => d.employment_type !== "パート");
  const parttimeData = displayData.filter(d => d.employment_type === "パート");

  const [y, m] = yearMonth.split("-").map(Number);
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  const ftPeriod = `${prevY}/${prevM}/1〜${prevY}/${prevM}/${new Date(prevY, prevM, 0).getDate()}`;
  const ptPeriod = `${prevY}/${prevM}/11〜${y}/${m}/10`;

  // 詳細表示中
  if (detailId) {
    return <PayrollDetail employeeId={detailId} yearMonth={yearMonth} onBack={() => { setDetailId(null); loadSavedResults(); }} />;
  }

  return (
    <div>
      {/* 操作エリア */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, padding: 14, backgroundColor: "#f8f9fa", borderRadius: 8, flexWrap: "wrap" }}>
        <label style={{ fontWeight: 700, fontSize: 13 }}>支給年月:</label>
        <select value={yearMonth} onChange={e => setYearMonth(e.target.value)} style={{ padding: "7px 10px", borderRadius: 4, border: "1px solid #ccc", fontSize: 14 }}>
          {yearMonthOptions.map(ym => <option key={ym} value={ym}>{ym.replace("-", "年")}月</option>)}
        </select>
        <button onClick={handleCalculate} disabled={calculating} style={{ padding: "8px 20px", backgroundColor: calculating ? "#ccc" : T.primary, color: "#fff", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: calculating ? "not-allowed" : "pointer" }}>
          {calculating ? "計算中..." : "計算実行"}
        </button>
        {savedResults.length > 0 && <span style={{ color: "#666", fontSize: 12 }}>最終計算: {new Date(savedResults[0]?.calculated_at).toLocaleString("ja-JP")}</span>}
      </div>

      {showConfirm && (
        <div style={{ padding: 14, marginBottom: 14, backgroundColor: "#fff3cd", border: "1px solid #ffc107", borderRadius: 8 }}>
          <p style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>既に給与データが存在します。上書きしますか？</p>
          <p style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>※ 調整手当は引き継がれます</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleCalculate} style={{ padding: "6px 14px", backgroundColor: "#dc3545", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>上書き</button>
            <button onClick={() => setShowConfirm(false)} style={{ padding: "6px 14px", backgroundColor: "#6c757d", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>キャンセル</button>
          </div>
        </div>
      )}

      {error && <div style={{ padding: 10, marginBottom: 14, backgroundColor: "#f8d7da", border: "1px solid #f5c6cb", borderRadius: 8, color: "#721c24", fontSize: 13 }}>{error}</div>}

      {savedResults.length > 0 && (
        <div style={{ marginBottom: 14, fontSize: 12, color: "#555" }}>
          <span>正社員: {ftPeriod}</span><span style={{ marginLeft: 20 }}>パート: {ptPeriod}</span>
        </div>
      )}

      {loading && <p style={{ fontSize: 13, color: "#888" }}>読み込み中...</p>}

      {fulltimeData.length > 0 && (
        <>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, marginTop: 20 }}>正社員（月給制）</h3>
          <PayrollTable data={fulltimeData} onRowClick={setDetailId} />
        </>
      )}
      {parttimeData.length > 0 && (
        <>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, marginTop: 24 }}>パート（時給制）</h3>
          <PayrollTable data={parttimeData} onRowClick={setDetailId} />
        </>
      )}
      {!loading && savedResults.length === 0 && (
        <p style={{ color: "#888", marginTop: 28, textAlign: "center", fontSize: 13 }}>{yearMonth.replace("-", "年")}月の給与データはまだありません。</p>
      )}
    </div>
  );
}

/* ── 一覧テーブル ── */
function PayrollTable({ data, onRowClick }: { data: { employee_id: string; employee_code: string; employee_name: string; employment_type: string; work_days: number; gross_total: number; has_warning: boolean }[]; onRowClick: (id: string) => void }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr style={{ backgroundColor: "#f1f3f5" }}>
          <th style={th}>コード</th><th style={th}>氏名</th><th style={th}>区分</th>
          <th style={{ ...th, textAlign: "right" }}>出勤</th><th style={{ ...th, textAlign: "right" }}>支給合計</th><th style={th}>状態</th>
        </tr></thead>
        <tbody>{data.map(r => (
          <tr key={r.employee_id} onClick={() => onRowClick(r.employee_id)} style={{ cursor: "pointer", borderBottom: "1px solid #dee2e6", backgroundColor: r.has_warning ? "#fff3cd" : "transparent" }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = r.has_warning ? "#ffe69c" : "#f8f9fa"; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = r.has_warning ? "#fff3cd" : "transparent"; }}>
            <td style={td}>{r.employee_code}</td><td style={td}>{r.employee_name}</td><td style={td}>{r.employment_type}</td>
            <td style={{ ...td, textAlign: "right" }}>{r.work_days}日</td>
            <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>¥{r.gross_total.toLocaleString()}</td>
            <td style={td}>{r.has_warning && <span style={{ color: "#dc3545", fontSize: 12 }}>要確認</span>}</td>
          </tr>
        ))}</tbody>
        <tfoot><tr style={{ backgroundColor: "#e9ecef", fontWeight: 700 }}>
          <td style={td} colSpan={4}>合計</td>
          <td style={{ ...td, textAlign: "right" }}>¥{data.reduce((s, r) => s + r.gross_total, 0).toLocaleString()}</td>
          <td style={td}></td>
        </tr></tfoot>
      </table>
    </div>
  );
}
const th: React.CSSProperties = { padding: "8px 10px", textAlign: "left", fontWeight: 700, borderBottom: "2px solid #dee2e6", fontSize: 12 };
const td: React.CSSProperties = { padding: "8px 10px" };

/* ── 個人詳細（インライン表示） ── */
function PayrollDetail({ employeeId, yearMonth, onBack }: { employeeId: string; yearMonth: string; onBack: () => void }) {
  const [data, setData] = useState<any>(null);
  const [editData, setEditData] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: row, error: fe } = await supabase.from("payroll_monthly")
        .select("*, employees (employee_code, full_name)")
        .eq("employee_id", employeeId)
        .eq("target_year", parseInt(yearMonth.split("-")[0]))
        .eq("target_month", parseInt(yearMonth.split("-")[1]))
        .eq("company_id", AKASHI_COMPANY_ID).single();
      if (fe) throw fe;
      setData(row);
      setEditData({
        base_salary: row.base_salary, position_allowance: row.position_allowance,
        qualification_allowance: row.qualification_allowance, commute_allowance: row.commute_allowance,
        dependent_allowance: row.dependent_allowance, fixed_overtime: row.fixed_overtime,
        overtime_pay: row.overtime_pay, adjustment_allowance: row.adjustment_allowance,
        absence_deduction: row.absence_deduction,
        hourly_weekday_minutes: row.hourly_weekday_minutes, hourly_saturday_minutes: row.hourly_saturday_minutes,
        hourly_sunday_minutes: row.hourly_sunday_minutes,
        hourly_rate_weekday: row.hourly_rate_weekday || 0, hourly_rate_saturday: row.hourly_rate_saturday || 0,
        hourly_rate_sunday: row.hourly_rate_sunday || 0,
      });
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [employeeId, yearMonth]);

  useEffect(() => { if (employeeId && yearMonth) loadData(); }, [loadData]);

  const calcGross = (): number => {
    if (!data) return 0;
    const pt = data.employment_type === "パート";
    if (pt) {
      const base = Math.round(((editData.hourly_weekday_minutes||0)/60)*(editData.hourly_rate_weekday||0)
        +((editData.hourly_saturday_minutes||0)/60)*(editData.hourly_rate_saturday||0)
        +((editData.hourly_sunday_minutes||0)/60)*(editData.hourly_rate_sunday||0));
      return base + (editData.commute_allowance||0) + (editData.adjustment_allowance||0);
    }
    return (editData.base_salary||0)+(editData.position_allowance||0)+(editData.qualification_allowance||0)
      +(editData.commute_allowance||0)+(editData.dependent_allowance||0)+(editData.fixed_overtime||0)
      +(editData.overtime_pay||0)+(editData.adjustment_allowance||0)-(editData.absence_deduction||0);
  };

  const handleSave = async () => {
    if (!data) return;
    setSaving(true); setError(null); setSuccess(false);
    try {
      const gross = calcGross();
      const pt = data.employment_type === "パート";
      const uf: any = { adjustment_allowance: editData.adjustment_allowance||0, total_payment: gross, calculated_at: new Date().toISOString() };
      if (pt) {
        uf.hourly_weekday_minutes = editData.hourly_weekday_minutes||0;
        uf.hourly_saturday_minutes = editData.hourly_saturday_minutes||0;
        uf.hourly_sunday_minutes = editData.hourly_sunday_minutes||0;
        uf.base_salary = Math.round(((editData.hourly_weekday_minutes||0)/60)*(editData.hourly_rate_weekday||0)
          +((editData.hourly_saturday_minutes||0)/60)*(editData.hourly_rate_saturday||0)
          +((editData.hourly_sunday_minutes||0)/60)*(editData.hourly_rate_sunday||0));
        uf.commute_allowance = editData.commute_allowance||0;
      } else {
        uf.base_salary=editData.base_salary||0; uf.position_allowance=editData.position_allowance||0;
        uf.qualification_allowance=editData.qualification_allowance||0; uf.commute_allowance=editData.commute_allowance||0;
        uf.dependent_allowance=editData.dependent_allowance||0; uf.fixed_overtime=editData.fixed_overtime||0;
        uf.overtime_pay=editData.overtime_pay||0; uf.absence_deduction=editData.absence_deduction||0;
      }
      const { error: ue } = await supabase.from("payroll_monthly").update(uf).eq("id", data.id);
      if (ue) throw ue;
      setSuccess(true); await loadData();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const onChange = (f: string, v: string) => setEditData(p => ({ ...p, [f]: parseInt(v)||0 }));

  if (loading) return <p style={{ fontSize: 13, color: "#888" }}>読み込み中...</p>;
  if (!data) return <p style={{ fontSize: 13 }}>データが見つかりません</p>;

  const pt = data.employment_type === "パート";
  const gross = calcGross();

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ padding: "6px 14px", backgroundColor: "#6c757d", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>← 一覧に戻る</button>
        <span style={{ fontSize: 16, fontWeight: 700 }}>{data.employees?.employee_code} {data.employees?.full_name}</span>
        <span style={{ fontSize: 12, color: "#666" }}>{yearMonth.replace("-","年")}月</span>
      </div>

      {error && <div style={{ padding: 10, marginBottom: 12, backgroundColor: "#f8d7da", borderRadius: 6, color: "#721c24", fontSize: 12 }}>{error}</div>}
      {success && <div style={{ padding: 10, marginBottom: 12, backgroundColor: "#d4edda", borderRadius: 6, color: "#155724", fontSize: 12 }}>保存しました</div>}

      {/* 基本情報 */}
      <Sec title="基本情報">
        <Info label="区分" value={data.employment_type} />
        <Info label="対象期間" value={`${data.period_start} 〜 ${data.period_end}`} />
        <Info label="出勤日数" value={`${data.work_days}日`} />
        <Info label="総労働時間" value={formatMinutes(data.actual_work_minutes)} />
        {!pt && <>
          <Info label="残業時間" value={formatMinutes(data.overtime_minutes)} />
          <Info label="欠勤日数" value={`${data.absence_days}日`} />
          <Info label="残業単価" value={`¥${Math.round(data.overtime_unit_price||0).toLocaleString()}/h`} />
        </>}
      </Sec>

      {pt && (
        <Sec title="曜日別労働時間・時給">
          <MinRow label="平日" mf="hourly_weekday_minutes" rf="hourly_rate_weekday" ed={editData} oc={onChange} />
          <MinRow label="土曜" mf="hourly_saturday_minutes" rf="hourly_rate_saturday" ed={editData} oc={onChange} />
          <MinRow label="日曜" mf="hourly_sunday_minutes" rf="hourly_rate_sunday" ed={editData} oc={onChange} />
          <div style={{ borderTop: "2px solid #333", marginTop: 6, paddingTop: 6 }}>
            <Info label="基本給与（合計）" value={`¥${Math.round(((editData.hourly_weekday_minutes||0)/60)*(editData.hourly_rate_weekday||0)+((editData.hourly_saturday_minutes||0)/60)*(editData.hourly_rate_saturday||0)+((editData.hourly_sunday_minutes||0)/60)*(editData.hourly_rate_sunday||0)).toLocaleString()}`} bold />
          </div>
        </Sec>
      )}

      <Sec title="支給項目">
        {!pt ? <>
          <ERow label="基本給" f="base_salary" ed={editData} oc={onChange} />
          <ERow label="役職手当" f="position_allowance" ed={editData} oc={onChange} />
          <ERow label="資格手当" f="qualification_allowance" ed={editData} oc={onChange} />
          <ERow label="通勤手当" f="commute_allowance" ed={editData} oc={onChange} />
          <ERow label="扶養手当" f="dependent_allowance" ed={editData} oc={onChange} />
          <ERow label="固定残業手当" f="fixed_overtime" ed={editData} oc={onChange} />
          <ERow label="超過残業手当" f="overtime_pay" ed={editData} oc={onChange} />
        </> : <ERow label="通勤手当" f="commute_allowance" ed={editData} oc={onChange} />}
        <ERow label="調整手当" f="adjustment_allowance" ed={editData} oc={onChange} hl />
      </Sec>

      {!pt && <Sec title="控除項目"><ERow label="欠勤控除" f="absence_deduction" ed={editData} oc={onChange} /></Sec>}

      <div style={{ padding: 14, marginTop: 20, backgroundColor: "#e8f4fd", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>支給合計</span>
        <span style={{ fontSize: 22, fontWeight: 700, color: T.primary }}>¥{gross.toLocaleString()}</span>
      </div>

      <div style={{ marginTop: 20 }}>
        <button onClick={handleSave} disabled={saving} style={{ padding: "10px 28px", backgroundColor: saving ? "#ccc" : T.primary, color: "#fff", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
          {saving ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}

/* ── ヘルパー ── */
function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ marginTop: 20 }}><h3 style={{ fontSize: 14, fontWeight: 700, paddingBottom: 6, borderBottom: `2px solid ${T.primary}`, marginBottom: 10 }}>{title}</h3>{children}</div>;
}
function Info({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #eee", fontWeight: bold ? 700 : 400, fontSize: 13 }}><span style={{ color: "#555" }}>{label}</span><span>{value}</span></div>;
}
function ERow({ label, f, ed, oc, hl }: { label: string; f: string; ed: Record<string,number>; oc: (f:string,v:string)=>void; hl?: boolean }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #eee", backgroundColor: hl ? "#fffbeb" : "transparent" }}>
    <span style={{ color: "#555", fontSize: 13 }}>{label}</span>
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ fontSize: 13 }}>¥</span>
      <input type="number" value={ed[f]||0} onChange={e=>oc(f,e.target.value)} style={{ width: 110, padding: "3px 6px", border: "1px solid #ccc", borderRadius: 4, textAlign: "right", fontSize: 13 }} />
    </div>
  </div>;
}
function MinRow({ label, mf, rf, ed, oc }: { label: string; mf: string; rf: string; ed: Record<string,number>; oc: (f:string,v:string)=>void }) {
  const mins = ed[mf]||0, rate = ed[rf]||0;
  return <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 90px", gap: 6, alignItems: "center", padding: "5px 0", borderBottom: "1px solid #eee", fontSize: 13 }}>
    <span style={{ color: "#555", fontWeight: 700 }}>{label}</span>
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      <input type="number" value={mins} onChange={e=>oc(mf,e.target.value)} style={{ width: 70, padding: "3px 6px", border: "1px solid #ccc", borderRadius: 4, textAlign: "right" }} />
      <span style={{ fontSize: 11, color: "#888" }}>分</span>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}><span>×¥</span>
      <input type="number" value={rate} onChange={e=>oc(rf,e.target.value)} style={{ width: 70, padding: "3px 6px", border: "1px solid #ccc", borderRadius: 4, textAlign: "right" }} />
    </div>
    <span style={{ textAlign: "right", fontWeight: 700 }}>¥{Math.round((mins/60)*rate).toLocaleString()}</span>
  </div>;
}
