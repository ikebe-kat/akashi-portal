"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { T, DOW, AKASHI_COMPANY_ID } from "@/lib/constants";
import { ReasonBadges } from "@/components/ui";
import Dialog from "@/components/ui/Dialog";
import { notifyPush } from "@/lib/notifyPush";

const HONBU_CODES = ["D02", "D18", "D49", "D67"];

function storeShort(name: string | null) {
  if (!name) return "—";
  if (name.includes("大久保")) return "大久保店";
  if (name.includes("魚住")) return "魚住店";
  if (name.includes("本部")) return "本部";
  return name;
}

interface LeaveReq {
  id: string; employee_id: string; attendance_date: string; end_date: string | null;
  reason: string; request_comment: string; approver_id: string | null;
  status: string; approved_by: string | null; approved_at: string | null;
  reject_reason: string | null; created_at: string;
  emp_name?: string; emp_code?: string; store_name?: string;
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  "申請中": { bg: "#FEF3C7", color: "#92400E" },
  "承認": { bg: "#D1FAE5", color: "#065F46" },
  "却下": { bg: "#FEE2E2", color: "#991B1B" },
};

export default function LeaveApprovalSub({ employee }: { employee: any }) {
  const [requests, setRequests] = useState<LeaveReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("申請中");
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ message: string; mode: "alert" | "confirm"; onOk: () => void } | null>(null);

  const fetchRequests = useCallback(async () => {
    if (!employee?.company_id) return;
    setLoading(true);
    const { data: empData } = await supabase.from("employees").select("id, employee_code, full_name, store_id")
      .eq("company_id", employee.company_id);
    const { data: storeData } = await supabase.from("stores").select("id, store_name").eq("company_id", employee.company_id);
    const storeMap: Record<string, string> = {};
    (storeData || []).forEach((s: any) => { storeMap[s.id] = s.store_name || ""; });
    const empMap: Record<string, { code: string; name: string; store_name: string }> = {};
    (empData || []).forEach((e: any) => {
      empMap[e.id] = { code: e.employee_code, name: e.full_name, store_name: storeMap[e.store_id] || "" };
    });

    const { data } = await supabase.from("leave_requests").select("*")
      .eq("company_id", employee.company_id)
      .not("type", "in", '("shift_work","shift_off")')
      .order("created_at", { ascending: false });
    const enriched = (data || []).map((r: any) => ({
      ...r,
      emp_name: empMap[r.employee_id]?.name || "不明",
      emp_code: empMap[r.employee_id]?.code || "—",
      store_name: empMap[r.employee_id]?.store_name || "",
    }));
    setRequests(enriched);
    setLoading(false);
  }, [employee?.company_id]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // 権限フィルタ:
  //   HONBU（D02/D18/D49/D67）→ 全件
  //   DA001/DA002（店長）→ approver_id が自分のものだけ（= 自分宛に来た申請のみ）
  //   それ以外 → 空（承認権限なし）
  // 店舗名で絞ると店長本人の申請（approver_id=D18）も同じ店舗にマッチして見えてしまい、
  // 自己承認が可能になるため approver_id で厳密に絞る。
  const permFiltered = useMemo(() => {
    const myCode = employee?.employee_code || "";
    if (HONBU_CODES.includes(myCode)) return requests;
    if (myCode === "DA001" || myCode === "DA002") {
      return requests.filter(r => r.approver_id === employee.id);
    }
    return [];
  }, [requests, employee?.employee_code, employee?.id]);

  const filtered = useMemo(() => {
    if (filter === "全件") return permFiltered;
    return permFiltered.filter(r => r.status === filter);
  }, [permFiltered, filter]);

  const counts = useMemo(() => {
    let pending = 0, approved = 0, rejected = 0;
    permFiltered.forEach(r => {
      if (r.status === "申請中") pending++;
      else if (r.status === "承認") approved++;
      else if (r.status === "却下") rejected++;
    });
    return { pending, approved, rejected, total: permFiltered.length };
  }, [permFiltered]);

  // leave_requests を申請中に戻す（後段失敗時の補償）
  const rollbackLeaveRequest = async (id: string) => {
    await supabase.from("leave_requests").update({
      status: "申請中", approved_by: null, approved_at: null,
      reject_reason: null, updated_at: new Date().toISOString(),
    }).eq("id", id);
  };

  const showErr = (msg: string) => setDialog({ message: msg, mode: "alert", onOk: () => setDialog(null) });

  const handleApprove = async (req: LeaveReq) => {
    setProcessing(req.id);

    // ① leave_requests を「承認」に更新
    const { data: lrUpd, error: lrErr } = await supabase.from("leave_requests").update({
      status: "承認", approved_by: employee.id, approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", req.id).select();
    if (lrErr) { console.error("approve leave_requests err:", lrErr); setProcessing(null); showErr("承認に失敗しました: " + lrErr.message); return; }
    if (!lrUpd || lrUpd.length === 0) { console.error("approve leave_requests 0 rows (RLS?):", { id: req.id }); setProcessing(null); showErr("承認が保存できませんでした。RLS の可能性があります。管理者に連絡してください。"); return; }

    // ② attendance_daily に有給を反映
    const d = new Date(req.attendance_date);
    const { data: attUp, error: attErr } = await supabase.from("attendance_daily").upsert({
      employee_id: req.employee_id, company_id: req.company_id || employee.company_id,
      attendance_date: req.attendance_date, day_of_week: DOW[d.getDay()],
      reason: req.reason, updated_at: new Date().toISOString(),
    }, { onConflict: "employee_id,attendance_date" }).select();
    if (attErr) {
      console.error("approve attendance_daily err:", attErr);
      await rollbackLeaveRequest(req.id);
      setProcessing(null); showErr("出勤簿への登録に失敗したため承認を取り消しました: " + attErr.message); fetchRequests(); return;
    }
    if (!attUp || attUp.length === 0) {
      console.error("approve attendance_daily 0 rows (RLS?):", { employee_id: req.employee_id, date: req.attendance_date });
      await rollbackLeaveRequest(req.id);
      setProcessing(null); showErr("出勤簿への登録が保存できなかったため承認を取り消しました（RLS の可能性）。管理者に連絡してください。"); fetchRequests(); return;
    }

    // ③ 有給残を消費（KAT=FIFO古い方から、明石西=LIFO新しい方から）
    const yukyuDays = req.reason?.includes("有給（全日）") ? 1 : req.reason?.includes("午前有給") || req.reason?.includes("午後有給") ? 0.5 : 0;
    if (yukyuDays > 0) {
      const isAkashi = employee?.company_id === AKASHI_COMPANY_ID;
      const today = new Date().toISOString().slice(0, 10);
      const { data: grants, error: grantsErr } = await supabase.from("paid_leave_grants")
        .select("id, remaining_days").eq("employee_id", req.employee_id)
        .gt("remaining_days", 0).gte("expiry_date", today).order("expiry_date", { ascending: !isAkashi });
      if (grantsErr) {
        console.error("paid_leave_grants select err:", grantsErr);
        // 承認・出勤簿は通っているのでロールバックはせず警告
        showErr("承認は通りましたが有給残の取得に失敗しました。残数を管理者画面で確認してください: " + grantsErr.message);
      } else {
        let remaining = yukyuDays;
        let consumeFailed = false;
        for (const g of (grants || [])) {
          if (remaining <= 0) break;
          const consume = Math.min(remaining, Number(g.remaining_days));
          const { data: cUpd, error: consumeErr } = await supabase.from("paid_leave_grants").update({
            remaining_days: Number(g.remaining_days) - consume,
          }).eq("id", g.id).select();
          if (consumeErr) { console.error("paid_leave_grants update err:", consumeErr); consumeFailed = true; break; }
          if (!cUpd || cUpd.length === 0) { console.error("paid_leave_grants update 0 rows (RLS?):", { id: g.id }); consumeFailed = true; break; }
          remaining -= consume;
        }
        if (consumeFailed) {
          showErr("承認は通りましたが有給残の更新に失敗しました。管理者画面で残数を確認・修正してください。");
        } else if (remaining > 0) {
          // 残数不足で消費しきれなかった（事前チェック漏れ）
          console.error("paid_leave_grants insufficient remaining:", { req_id: req.id, remaining });
          showErr(`承認は通りましたが消費できなかった日数があります（残: ${remaining}日）。管理者で確認してください。`);
        }
      }
    }

    notifyPush("leave_request_approved", {
      company_id: employee.company_id, employee_id: req.employee_id,
      employee_name: req.emp_name, reason: req.reason,
      attendance_date: req.attendance_date, approved_by_name: employee.full_name,
    });

    setProcessing(null);
    fetchRequests();
  };

  const handleReject = async (req: LeaveReq) => {
    const reason = rejectReasons[req.id]?.trim();
    if (!reason) { showErr("却下理由を入力してください"); return; }
    setProcessing(req.id);
    const { data: upd, error } = await supabase.from("leave_requests").update({
      status: "却下", approved_by: employee.id, approved_at: new Date().toISOString(),
      reject_reason: reason, updated_at: new Date().toISOString(),
    }).eq("id", req.id).select();
    if (error) { console.error("reject err:", error); setProcessing(null); showErr("却下に失敗しました: " + error.message); return; }
    if (!upd || upd.length === 0) { console.error("reject 0 rows (RLS?):", { id: req.id }); setProcessing(null); showErr("却下が保存できませんでした（RLS の可能性）。管理者に連絡してください。"); return; }

    notifyPush("leave_request_rejected", {
      company_id: employee.company_id, employee_id: req.employee_id,
      employee_name: req.emp_name, reason: req.reason,
      attendance_date: req.attendance_date, reject_reason: reason,
      rejected_by_name: employee.full_name,
    });

    setProcessing(null);
    fetchRequests();
  };

  const confirmAction = (req: LeaveReq, action: "approve" | "reject") => {
    if (action === "approve") {
      setDialog({ message: `${req.emp_name}さんの有給申請（${req.attendance_date}）を承認しますか？`, mode: "confirm",
        onOk: () => { setDialog(null); handleApprove(req); } });
    } else {
      if (!rejectReasons[req.id]?.trim()) { setDialog({ message: "却下理由を入力してください", mode: "alert", onOk: () => setDialog(null) }); return; }
      setDialog({ message: `${req.emp_name}さんの有給申請（${req.attendance_date}）を却下しますか？`, mode: "confirm",
        onOk: () => { setDialog(null); handleReject(req); } });
    }
  };

  const fmtDate = (d: string) => {
    const dt = new Date(d);
    return `${dt.getFullYear()}/${String(dt.getMonth()+1).padStart(2,"0")}/${String(dt.getDate()).padStart(2,"0")}`;
  };
  const fmtDateTime = (d: string) => {
    const dt = new Date(d);
    return `${dt.getMonth()+1}/${dt.getDate()} ${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}`;
  };

  const filterBtns = [
    { label: "申請中", value: "申請中", count: counts.pending, color: "#92400E" },
    { label: "承認", value: "承認", count: counts.approved, color: T.success },
    { label: "却下", value: "却下", count: counts.rejected, color: T.danger },
    { label: "全件", value: "全件", count: counts.total, color: T.textSec },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {filterBtns.map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)} style={{
            padding: "8px 14px", borderRadius: 20, fontSize: 12, fontWeight: filter === f.value ? 700 : 400,
            cursor: "pointer", border: filter === f.value ? `2px solid ${f.color}` : `1px solid ${T.border}`,
            backgroundColor: filter === f.value ? f.color + "15" : "#fff", color: filter === f.value ? f.color : T.textSec,
          }}>{f.label}<span style={{ marginLeft: 4, fontSize: 11, fontWeight: 700 }}>{f.count}</span></button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: T.textMuted, fontSize: 14 }}>読み込み中...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: T.textMuted }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 14 }}>{filter === "申請中" ? "未処理の申請はありません" : "該当する申請はありません"}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map(req => {
            const sc = STATUS_COLORS[req.status] || STATUS_COLORS["申請中"];
            const isPending = req.status === "申請中";
            return (
              <div key={req.id} style={{ border: `1px solid ${isPending ? "#3B82F640" : T.border}`, borderRadius: 8, padding: 16, backgroundColor: isPending ? "#FAFCFF" : "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{req.emp_name}</span>
                    <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 6 }}>{req.emp_code}</span>
                    <span style={{ fontSize: 11, color: T.textSec, marginLeft: 6 }}>{storeShort(req.store_name || null)}</span>
                  </div>
                  <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, backgroundColor: sc.bg, color: sc.color }}>{req.status}</span>
                </div>

                <div style={{ marginBottom: 10, padding: "10px 12px", backgroundColor: "#F8FAFC", borderRadius: 6 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: T.text, marginBottom: 4 }}>{fmtDate(req.attendance_date)}<span style={{ fontSize: 13, fontWeight: 400, color: T.textSec, marginLeft: 6 }}>({["日","月","火","水","木","金","土"][new Date(req.attendance_date).getDay()]})</span></div>
                  <ReasonBadges reason={req.reason} />
                </div>

                <div style={{ fontSize: 13, color: T.text, marginBottom: 6, padding: "8px 10px", backgroundColor: "#EFF6FF", borderRadius: 6, borderLeft: "3px solid #3B82F6" }}>
                  💬 {req.request_comment}
                </div>

                <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>申請日時: {fmtDateTime(req.created_at)}</div>

                {req.status === "承認" && req.approved_at && (
                  <div style={{ fontSize: 11, color: T.success, marginTop: 4 }}>✅ 承認日時: {fmtDateTime(req.approved_at)}</div>
                )}
                {req.status === "却下" && (
                  <div>
                    {req.approved_at && <div style={{ fontSize: 11, color: T.danger, marginTop: 4 }}>❌ 却下日時: {fmtDateTime(req.approved_at)}</div>}
                    {req.reject_reason && (
                      <div style={{ fontSize: 12, color: T.textSec, marginTop: 4, padding: "8px 10px", backgroundColor: "#FEF2F2", borderRadius: 6, borderLeft: "3px solid #EF4444" }}>
                        却下理由: {req.reject_reason}
                      </div>
                    )}
                  </div>
                )}

                {isPending && (
                  <div style={{ marginTop: 10, borderTop: `1px solid ${T.borderLight}`, paddingTop: 10 }}>
                    <input type="text" placeholder="却下理由（却下時は必須）"
                      value={rejectReasons[req.id] || ""}
                      onChange={e => setRejectReasons(prev => ({ ...prev, [req.id]: e.target.value }))}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => confirmAction(req, "approve")} disabled={processing === req.id}
                        style={{ flex: 1, padding: "10px", borderRadius: 6, border: "none", backgroundColor: T.success, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: processing === req.id ? 0.6 : 1 }}>
                        {processing === req.id ? "処理中..." : "✅ 承認"}
                      </button>
                      <button onClick={() => confirmAction(req, "reject")} disabled={processing === req.id}
                        style={{ flex: 1, padding: "10px", borderRadius: 6, border: `1px solid ${T.danger}`, backgroundColor: "#fff", color: T.danger, fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: processing === req.id ? 0.6 : 1 }}>
                        {processing === req.id ? "処理中..." : "❌ 却下"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {dialog && <Dialog message={dialog.message} mode={dialog.mode} onOk={dialog.onOk} onCancel={() => setDialog(null)} />}
    </div>
  );
}

