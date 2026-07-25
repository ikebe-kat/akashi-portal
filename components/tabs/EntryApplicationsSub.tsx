"use client";
import { useState, useEffect, useCallback } from "react";
import { T } from "@/lib/constants";
import Dialog from "@/components/ui/Dialog";
import { supabase } from "@/lib/supabase";

interface EntryApp {
  id: string;
  company_id: string;
  status: string;
  employee_code: string;
  full_name: string;
  full_name_kana: string;
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  postal_code: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account_number: string | null;
  bank_account_holder: string | null;
  basic_pension_number: string | null;
  employment_insurance_number: string | null;
  insurance_card_requested: boolean;
  hire_date: string | null;
  store_id: string | null;
  employment_type: string | null;
  grade: string | null;
  role: string | null;
  department: string | null;
  position: string | null;
  work_pattern_code: string | null;
  holiday_pattern: string | null;
  holiday_calendar: string | null;
  portal_group_id: string | null;
  weekly_work_days: number | null;
  weekly_work_hours: number | null;
  requires_punch: boolean;
  pin: string | null;
  paid_leave_grant_date: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  copied_at: string | null;
}

function normalizeEmployeeCode(code: string): string {
  const m = code.match(/^(DA)(\d+)$/);
  if (m) return m[1] + m[2].padStart(3, "0");
  return code;
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  submitted: { bg: "#FEF3C7", color: "#92400E" },
  approved: { bg: "#D1FAE5", color: "#065F46" },
  rejected: { bg: "#FEE2E2", color: "#991B1B" },
};
const STATUS_LABEL: Record<string, string> = {
  submitted: "申請中",
  approved: "承認済",
  rejected: "却下",
};

export default function EntryApplicationsSub({ employee }: { employee: any }) {
  const [apps, setApps] = useState<EntryApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [dialogMsg, setDialogMsg] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ app: EntryApp; action: "approve" | "register" } | null>(null);

  const companyId = employee?.company_id;

  const fetchApps = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from("entry_applications")
      .select("id,company_id,status,employee_code,full_name,full_name_kana,birth_date,phone,email,postal_code,address,emergency_contact_name,emergency_contact_phone,emergency_contact_relation,bank_name,bank_branch,bank_account_number,bank_account_holder,basic_pension_number,employment_insurance_number,insurance_card_requested,hire_date,store_id,employment_type,grade,role,department,position,work_pattern_code,holiday_pattern,holiday_calendar,portal_group_id,weekly_work_days,weekly_work_hours,requires_punch,pin,paid_leave_grant_date,submitted_at,approved_at,copied_at")
      .eq("company_id", companyId)
      .order("submitted_at", { ascending: false });
    setApps(data || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  const createEmployee = async (app: EntryApp): Promise<{ empId: string | null; error: string | null }> => {
    const code = normalizeEmployeeCode(app.employee_code);

    const { data: existing } = await supabase
      .from("employees")
      .select("id")
      .eq("company_id", app.company_id)
      .eq("employee_code", code)
      .maybeSingle();
    if (existing) return { empId: null, error: `社員コード ${code} は既に登録されています` };

    const payload: Record<string, any> = {
      company_id: app.company_id,
      employee_code: code,
      full_name: app.full_name,
      full_name_kana: app.full_name_kana,
      birth_date: app.birth_date,
      phone: app.phone,
      email: app.email,
      postal_code: app.postal_code,
      address: app.address,
      emergency_contact_name: app.emergency_contact_name,
      emergency_contact_phone: app.emergency_contact_phone,
      emergency_contact_relation: app.emergency_contact_relation,
      bank_name: app.bank_name,
      bank_branch: app.bank_branch,
      bank_account_number: app.bank_account_number,
      bank_account_holder: app.bank_account_holder,
      basic_pension_number: app.basic_pension_number,
      employment_insurance_number: app.employment_insurance_number,
      insurance_card_requested: app.insurance_card_requested || false,
      hire_date: app.hire_date,
      store_id: app.store_id,
      employment_type: app.employment_type,
      grade: app.grade,
      role: app.role || "一般",
      department: app.department,
      position: app.position,
      work_pattern_code: app.work_pattern_code,
      holiday_pattern: app.holiday_pattern,
      holiday_calendar: app.holiday_calendar,
      portal_group_id: app.portal_group_id,
      weekly_work_days: app.weekly_work_days,
      weekly_work_hours: app.weekly_work_hours,
      requires_punch: app.requires_punch ?? true,
      paid_leave_grant_date: app.paid_leave_grant_date,
      is_active: true,
    };

    const { data: ins, error: insErr } = await supabase
      .from("employees")
      .insert(payload)
      .select("id")
      .maybeSingle();
    if (insErr) return { empId: null, error: "employees登録失敗: " + insErr.message };
    if (!ins?.id) return { empId: null, error: "employees登録失敗（RLS?）" };

    if (app.pin) {
      const { error: pinErr } = await supabase
        .from("employee_pins")
        .upsert(
          { employee_id: ins.id, pin: app.pin, updated_at: new Date().toISOString() },
          { onConflict: "employee_id" }
        );
      if (pinErr) {
        console.error("employee_pins upsert error:", pinErr);
      }
    }

    const { error: copyErr } = await supabase
      .from("entry_applications")
      .update({ copied_at: new Date().toISOString() })
      .eq("id", app.id);
    if (copyErr) console.error("entry_applications copied_at update error:", copyErr);

    return { empId: ins.id, error: null };
  };

  const handleApprove = async (app: EntryApp) => {
    setProcessing(app.id);

    const { error: apErr } = await supabase
      .from("entry_applications")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", app.id);
    if (apErr) {
      setProcessing(null);
      setDialogMsg("承認失敗: " + apErr.message);
      return;
    }

    const { empId, error } = await createEmployee({ ...app, status: "approved" });
    setProcessing(null);
    if (error) {
      setDialogMsg(`承認しました。社員登録エラー: ${error}\n従業員管理から手動登録してください。`);
    } else {
      setDialogMsg(`承認＋社員登録完了（${normalizeEmployeeCode(app.employee_code)}）`);
    }
    fetchApps();
  };

  const handleRegister = async (app: EntryApp) => {
    setProcessing(app.id);
    const { empId, error } = await createEmployee(app);
    setProcessing(null);
    if (error) {
      setDialogMsg("社員登録エラー: " + error);
    } else {
      setDialogMsg(`社員登録完了（${normalizeEmployeeCode(app.employee_code)}）`);
    }
    fetchApps();
  };

  const doConfirm = () => {
    if (!confirmTarget) return;
    const { app, action } = confirmTarget;
    setConfirmTarget(null);
    if (action === "approve") handleApprove(app);
    else handleRegister(app);
  };

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: T.textMuted }}>読み込み中...</div>;
  if (apps.length === 0) return <div style={{ textAlign: "center", padding: 60, color: T.textMuted }}><div style={{ fontSize: 24, marginBottom: 8 }}>📋</div><div style={{ fontSize: 14 }}>入社申請はありません</div></div>;

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: T.text }}>入社申請一覧</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {apps.map(app => {
          const st = STATUS_STYLE[app.status] || STATUS_STYLE.submitted;
          const isApprovedNotCopied = app.status === "approved" && !app.copied_at;
          const isCopied = !!app.copied_at;
          const normalizedCode = normalizeEmployeeCode(app.employee_code);
          return (
            <div key={app.id} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 16, backgroundColor: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{app.full_name}
                    <span style={{ fontSize: 12, fontWeight: 400, color: T.textSec, marginLeft: 8 }}>{app.full_name_kana}</span>
                  </div>
                  <div style={{ fontSize: 12, color: T.textSec, marginTop: 2 }}>
                    {normalizedCode} ・ {app.employment_type || "—"} ・ 入社日: {app.hire_date || "未定"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, backgroundColor: st.bg, color: st.color }}>
                    {STATUS_LABEL[app.status] || app.status}
                  </span>
                  {isCopied && (
                    <span style={{ padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, backgroundColor: "#DBEAFE", color: "#1E40AF" }}>登録済</span>
                  )}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", fontSize: 12, color: T.textSec, marginBottom: 10 }}>
                <div>部署: {app.department || "—"}</div>
                <div>店舗: {app.store_id ? "設定済" : "—"}</div>
                <div>勤務体系: {app.work_pattern_code || "—"}</div>
                <div>休日カレンダー: {app.holiday_calendar || "—"}</div>
                <div>申請日: {app.submitted_at?.slice(0, 10) || "—"}</div>
                <div>承認日: {app.approved_at?.slice(0, 10) || "—"}</div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                {app.status === "submitted" && (
                  <button
                    onClick={() => setConfirmTarget({ app, action: "approve" })}
                    disabled={processing === app.id}
                    style={{ flex: 1, padding: "10px", borderRadius: 6, border: "none", backgroundColor: T.success, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: processing === app.id ? 0.6 : 1 }}
                  >
                    {processing === app.id ? "処理中..." : "承認＋社員登録"}
                  </button>
                )}
                {isApprovedNotCopied && (
                  <button
                    onClick={() => setConfirmTarget({ app, action: "register" })}
                    disabled={processing === app.id}
                    style={{ flex: 1, padding: "10px", borderRadius: 6, border: "none", backgroundColor: T.primary, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: processing === app.id ? 0.6 : 1 }}
                  >
                    {processing === app.id ? "処理中..." : "社員登録"}
                  </button>
                )}
                {isCopied && (
                  <div style={{ flex: 1, padding: "10px", borderRadius: 6, backgroundColor: "#F0FDF4", color: "#166534", fontSize: 13, fontWeight: 600, textAlign: "center" }}>
                    社員マスタ登録済み
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {confirmTarget && (
        <Dialog
          mode="confirm"
          confirmLabel={confirmTarget.action === "approve" ? "承認＋登録" : "登録"}
          message={`${confirmTarget.app.full_name}（${normalizeEmployeeCode(confirmTarget.app.employee_code)}）を${confirmTarget.action === "approve" ? "承認して社員登録" : "社員登録"}しますか？`}
          onOk={doConfirm}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
      {dialogMsg && <Dialog message={dialogMsg} onOk={() => setDialogMsg(null)} />}
    </div>
  );
}
