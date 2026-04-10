"use client";
// ShiftSub.tsx — シフト管理（管理者閲覧用マトリクス）
// パートのみ表示。shift_type=work→★、shift_type=off→休、有給→有
import { useState, useEffect, useCallback } from "react";
import { T, DOW } from "@/lib/constants";
import { supabase } from "@/lib/supabase";

const COMPANY_ID = "e85e40ac-71f7-4918-b2fc-36d877337b74";

const daysInMonth = (yr: number, mo: number) => new Date(yr, mo, 0).getDate();
const dateStr = (yr: number, mo: number, d: number) =>
  `${yr}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const dowOf = (yr: number, mo: number, d: number) => new Date(yr, mo - 1, d).getDay();
const surname = (name: string) => (name || "").split(/\s+/)[0] || name;

const C = {
  work: "#059669",     // 緑 = 出勤日登録(★)
  off: "#1a4b24",      // 濃緑 = 公休登録
  yukyu: "#1d4ed8",    // 青 = 有給
  saturday: "#EBF5FB",
  sunday: "#FDEDEC",
} as const;

interface Emp {
  id: string;
  employee_code: string;
  full_name: string;
  store_id: string;
  store_name: string;
  shift_type: string; // 'work' | 'off'
}

interface ShiftReq {
  id: string;
  employee_id: string;
  attendance_date: string;
  type: string; // 'shift_work' | 'shift_off' | 'yukyu' etc
  status: string;
}

const STORE_FILTERS = [
  { label: "全店舗", value: "all" },
  { label: "大久保店", value: "大久保" },
  { label: "魚住店", value: "魚住" },
];

export default function ShiftSub({ employee }: { employee: any }) {
  const now = new Date();
  const [yr, setYr] = useState(now.getFullYear());
  const [mo, setMo] = useState(now.getMonth() + 1);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [shiftReqs, setShiftReqs] = useState<ShiftReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeFilter, setStoreFilter] = useState("all");

  const days = daysInMonth(yr, mo);

  const loadData = useCallback(async () => {
    setLoading(true);
    const monthStart = dateStr(yr, mo, 1);
    const monthEnd = dateStr(yr, mo, days);

    // パート従業員 + shift_type取得
    const { data: emps } = await supabase.from("employees")
      .select("id, employee_code, full_name, store_id, stores (store_name), employee_payroll_config (shift_type)")
      .eq("company_id", COMPANY_ID)
      .eq("employment_type", "パート")
      .eq("is_active", true)
      .order("employee_code");

    // leave_requests（shift_work, shift_off, yukyu）
    const { data: reqs } = await supabase.from("leave_requests")
      .select("id, employee_id, attendance_date, type, status")
      .eq("company_id", COMPANY_ID)
      .in("type", ["shift_work", "shift_off", "yukyu"])
      .gte("attendance_date", monthStart)
      .lte("attendance_date", monthEnd);

    // attendance_daily（有給確認用）
    const { data: att } = await supabase.from("attendance_daily")
      .select("employee_id, attendance_date, reason")
      .eq("company_id", COMPANY_ID)
      .gte("attendance_date", monthStart)
      .lte("attendance_date", monthEnd)
      .not("reason", "is", null);

    const mapped = (emps || []).map((e: any) => ({
      id: e.id,
      employee_code: e.employee_code,
      full_name: e.full_name,
      store_id: e.store_id,
      store_name: e.stores?.store_name || "",
      shift_type: e.employee_payroll_config?.[0]?.shift_type || "work",
    }));

    // attendance_dailyの有給をShiftReq形式に変換して追加
    const attYukyu = (att || [])
      .filter((a: any) => a.reason?.includes("有給"))
      .map((a: any) => ({
        id: `att-${a.employee_id}-${a.attendance_date}`,
        employee_id: a.employee_id,
        attendance_date: a.attendance_date,
        type: "yukyu",
        status: "approved",
      }));

    setEmployees(mapped);
    setShiftReqs([...(reqs || []), ...attYukyu]);
    setLoading(false);
  }, [yr, mo, days]);

  useEffect(() => { loadData(); }, [loadData]);

  const stepMo = (dir: 1 | -1) => {
    let nm = mo + dir, ny = yr;
    if (nm < 1) { nm = 12; ny--; }
    if (nm > 12) { nm = 1; ny++; }
    setYr(ny); setMo(nm);
  };

  // フィルタリング
  const filteredEmps = employees.filter(e =>
    storeFilter === "all" || e.store_name.includes(storeFilter)
  );

  // セル状態判定
  const getCellInfo = (emp: Emp, day: number): { label: string; bg: string; fg: string } => {
    const ds = dateStr(yr, mo, day);
    const dow = dowOf(yr, mo, day);
    const isSat = dow === 6, isSun = dow === 0;
    const defaultBg = isSun ? C.sunday : isSat ? C.saturday : "#fff";

    // 有給チェック
    const yukyuReq = shiftReqs.find(r => r.employee_id === emp.id && r.attendance_date === ds && r.type === "yukyu" && r.status === "approved");
    if (yukyuReq) return { label: "有", bg: C.yukyu, fg: "#fff" };

    if (emp.shift_type === "work") {
      const req = shiftReqs.find(r => r.employee_id === emp.id && r.attendance_date === ds && r.type === "shift_work" && r.status === "approved");
      if (req) return { label: "★", bg: C.work, fg: "#fff" };
    } else {
      const req = shiftReqs.find(r => r.employee_id === emp.id && r.attendance_date === ds && r.type === "shift_off" && r.status === "approved");
      if (req) return { label: "休", bg: C.off, fg: "#fff" };
    }

    return { label: "", bg: defaultBg, fg: T.textMuted };
  };

  return (
    <div>
      {/* 月選択 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button onClick={() => stepMo(-1)} style={navBtn}>&lt;</button>
        <span style={{ fontSize: 16, fontWeight: 700, color: T.text, minWidth: 120, textAlign: "center" }}>
          {yr}年{mo}月
        </span>
        <button onClick={() => stepMo(1)} style={navBtn}>&gt;</button>
      </div>

      {/* 店舗フィルター */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {STORE_FILTERS.map(f => (
          <button key={f.value} onClick={() => setStoreFilter(f.value)} style={{
            padding: "7px 12px", borderRadius: 20, fontSize: 12, fontWeight: storeFilter === f.value ? 700 : 400,
            cursor: "pointer", border: storeFilter === f.value ? `2px solid ${T.primary}` : `1px solid ${T.border}`,
            backgroundColor: storeFilter === f.value ? T.primary + "15" : "#fff",
            color: storeFilter === f.value ? T.primary : T.textSec,
          }}>{f.label}</button>
        ))}
      </div>

      {/* 凡例 */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12, padding: "8px 12px", backgroundColor: "#fff", border: `1px solid ${T.border}`, flexWrap: "wrap" }}>
        {[
          { color: C.work, label: "出勤日(★)" },
          { color: C.off, label: "公休(休)" },
          { color: C.yukyu, label: "有給(有)" },
          { color: "#E5E7EB", label: "未登録", border: true },
        ].map(item => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 16, height: 16, backgroundColor: item.color, border: item.border ? `1px solid ${T.border}` : "none" }} />
            <span style={{ fontSize: 11, color: T.textSec }}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* テーブル */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: T.textSec, fontSize: 13 }}>読み込み中...</div>
      ) : (
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 11, minWidth: "100%", backgroundColor: "#fff" }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, position: "sticky", left: 0, zIndex: 10, backgroundColor: T.primary, color: "#fff", minWidth: 70 }}>名前</th>
                {Array.from({ length: days }, (_, i) => {
                  const d = i + 1;
                  const dow = dowOf(yr, mo, d);
                  const isSun = dow === 0, isSat = dow === 6;
                  return (
                    <th key={d} style={{
                      ...thStyle,
                      backgroundColor: isSun ? C.sunday : isSat ? C.saturday : T.primary,
                      color: isSun ? "#DC2626" : isSat ? "#2563EB" : "#fff",
                      minWidth: 36,
                    }}>
                      <div style={{ lineHeight: 1 }}>{d}</div>
                      <div style={{ fontSize: 9, fontWeight: 400, lineHeight: 1 }}>{DOW[dow]}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filteredEmps.map(emp => (
                <tr key={emp.id}>
                  <td style={{ ...tdNameStyle, position: "sticky", left: 0, zIndex: 5, backgroundColor: "#fff" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{surname(emp.full_name)}</span>
                      <span style={{ fontSize: 9, color: T.textMuted }}>{emp.shift_type === "off" ? "休" : "出"}</span>
                    </div>
                  </td>
                  {Array.from({ length: days }, (_, i) => {
                    const d = i + 1;
                    const cell = getCellInfo(emp, d);
                    return (
                      <td key={d} style={{
                        ...tdCellStyle,
                        backgroundColor: cell.bg,
                        color: cell.fg,
                      }}>
                        {cell.label}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filteredEmps.length === 0 && !loading && (
        <div style={{ textAlign: "center", padding: 40, color: T.textMuted, fontSize: 13 }}>該当するパートはいません</div>
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: "50%", border: `1px solid ${T.border}`,
  backgroundColor: "#fff", cursor: "pointer", fontSize: 14,
  display: "flex", alignItems: "center", justifyContent: "center",
  color: T.text, fontWeight: 700,
};

const thStyle: React.CSSProperties = {
  padding: "3px 2px", textAlign: "center", fontSize: 12, fontWeight: 600,
  borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap", lineHeight: 1,
};

const tdNameStyle: React.CSSProperties = {
  padding: "4px 8px", borderRight: `1px solid ${T.border}`,
  borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap",
};

const tdCellStyle: React.CSSProperties = {
  padding: "2px 2px", textAlign: "center", fontSize: 11, fontWeight: 700,
  borderRight: `1px solid #eee`, borderBottom: `1px solid ${T.border}`,
  minWidth: 36, userSelect: "none",
};
