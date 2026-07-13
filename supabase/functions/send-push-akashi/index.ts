import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = "BBIYaJqhRjCkTBbDL_90GDdJ_WTo7n4GDS9-7wOcTShpqjw5ym6rMt1rYMDCDilFidTHuv2y1WSBwiEIPZAq99Q";
const VAPID_PRIVATE_KEY = "j1AwpozwrDRE3F9_duLST5ve6yfQ6-q_s6j0vBQBYak";
const VAPID_SUBJECT = "mailto:jinji@katworld-hd.com";

import webpush from "https://esm.sh/web-push@3.6.7";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/* ── ユーティリティ ── */
const lastName = (fullName: string, displayOverride?: string | null, allNames?: string[]) => {
  if (displayOverride) return displayOverride;
  const parts = (fullName || "").split(/\s+/);
  const surname = parts[0] || fullName;
  if (allNames) {
    const given = parts[1] || "";
    const unique = [...new Set(allNames)];
    if (given && unique.filter(n => (n || "").split(/\s+/)[0] === surname).length >= 2) {
      return surname + given.charAt(0);
    }
  }
  return surname;
};

// 全カレンダー受信者（D02は除外）
const ALL_CALENDAR_CODES = ["D18", "D49", "D67", "DA001", "DA002"];

// D02は全通知除外
const NO_NOTIFY_CODES = ["D02"];

// D49はカレンダー通知のみ（事由登録・打刻漏れは除外）
const CALENDAR_ONLY_CODES = ["D49"];

const calMap: Record<string, string> = {
  "all": "全店舗", "okubo": "大久保店", "uozumi": "魚住店",
  "全店舗": "全店舗", "大久保店": "大久保店", "魚住店": "魚住店",
};

function resolveStoreShort(storeName: string): string {
  if (!storeName) return "—";
  if (storeName.includes("大久保")) return "大久保店";
  if (storeName.includes("魚住")) return "魚住店";
  if (storeName.includes("本部")) return "本部";
  return storeName;
}

function resolveCalendarGroup(empCode: string, department: string, storeName: string): string {
  if (storeName.includes("大久保")) return "大久保店";
  if (storeName.includes("魚住")) return "魚住店";
  return "全店舗";
}

function matchCalendar(empCode: string, storeName: string, department: string, targetCal: string): boolean {
  if (NO_NOTIFY_CODES.includes(empCode)) return false;
  if (ALL_CALENDAR_CODES.includes(empCode)) return true;
  if (targetCal === "全店舗" || targetCal === "all") return true;
  const myGroup = resolveCalendarGroup(empCode, department, storeName);
  return myGroup === targetCal;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const dow = ["日","月","火","水","木","金","土"][d.getDay()];
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日(${dow})`;
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth()+1}/${d.getDate()}`;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const { type, payload } = await req.json();
    const sb = createClient(supabaseUrl, supabaseKey);

    let targets: { employee_id: string; title: string; body: string; tag: string; url: string }[] = [];

    async function getEmpsAndStores(companyId: string) {
      const { data: allEmps } = await sb.from("employees")
        .select("id, employee_code, full_name, store_id, department, employment_type, holiday_calendar, requires_punch, calendar_display_name")
        .eq("company_id", companyId)
        .eq("is_active", true);
      const { data: stores } = await sb.from("stores")
        .select("id, store_name")
        .eq("company_id", companyId);
      const storeMap: Record<string, string> = {};
      (stores || []).forEach((s: any) => { storeMap[s.id] = s.store_name || ""; });
      return { allEmps: allEmps || [], storeMap };
    }

    // ============================
    // 2. 予定登録時（即時通知）
    // ============================
    if (type === "calendar_event") {
      const { action, event } = payload;
      const creatorName = event.creator_name || "不明";
      const calLabel = calMap[event.target_calendar] || event.target_calendar;
      const title = action === "created"
        ? `${creatorName}が予定を登録しました`
        : action === "updated"
        ? `${creatorName}が予定を編集しました`
        : `${creatorName}が予定を削除しました`;
      const { allEmps, storeMap } = await getEmpsAndStores(event.company_id);
      const allNames = allEmps.map((e: any) => e.full_name);
      const creatorEmp = allEmps.find((e: any) => e.id === (event.creator_employee_id || null));
      const body = `${calLabel}：${lastName(creatorName, creatorEmp?.calendar_display_name, allNames)} ${event.title} ${shortDate(event.start_date)}`;

      const creatorId = event.creator_employee_id || null;
      for (const emp of allEmps) {
        if (creatorId && emp.id === creatorId) continue; // 本人除外
        const storeName = storeMap[emp.store_id] || "";
        if (matchCalendar(emp.employee_code, storeName, emp.department || "", event.target_calendar)) {
          targets.push({ employee_id: emp.id, title, body, tag: "calendar", url: "/home" });
        }
      }
    }

    // ============================
    // 6. 書類配布（即時通知）
    // ============================
    if (type === "document_delivered") {
      const { employee_id, document_name } = payload;
      targets.push({
        employee_id,
        title: "書類が届きました",
        body: document_name,
        tag: "document",
        url: "/home",
      });
    }

    // ============================
    // 7. 申請処理完了（即時通知）
    // ============================
    if (type === "request_processed") {
      const { employee_id, category, status } = payload;
      targets.push({
        employee_id,
        title: `申請が${status}されました`,
        body: category,
        tag: "request",
        url: "/home",
      });
    }

    // ============================
    // 9. 勤怠事由登録時（即時通知）
    // ============================
    if (type === "attendance_reason_set") {
      const { company_id, employee_id, employee_name, reason, attendance_date } = payload;
      const { allEmps: _emps1, storeMap: _sm1 } = await getEmpsAndStores(company_id);
      const _emp1 = _emps1.find((e: any) => e.id === employee_id);
      const storeShort = resolveStoreShort(_emp1 ? (_sm1[_emp1.store_id] || "") : "");
      const dateShort = shortDate(attendance_date);

      let reasonLabel = "";
      if (reason.includes("出張")) {
        const wm = reason.match(/出張（(.+)）/);
        reasonLabel = wm ? `出張（${wm[1]}）` : "出張";
      } else if (reason.includes("有給（全日）")) reasonLabel = "有給";
      else if (reason.includes("午前有給")) reasonLabel = "有給（午前）";
      else if (reason.includes("午後有給")) reasonLabel = "有給（午後）";
      else if (reason.includes("選択休（全日）")) reasonLabel = "選択休";
      else if (reason.includes("午前選択休")) reasonLabel = "選択休（午前）";
      else if (reason.includes("午後選択休")) reasonLabel = "選択休（午後）";
      else if (reason.match(/^代休/) && !reason.includes("午前") && !reason.includes("午後")) reasonLabel = "代休";
      else if (reason.includes("午前代休")) reasonLabel = "代休（午前）";
      else if (reason.includes("午後代休")) reasonLabel = "代休（午後）";
      else return new Response(JSON.stringify({ sent: 0, reason: "not a notifiable reason" }), { headers: { ...corsHeaders } });

      const title = `${employee_name}が${reasonLabel}を登録しました`;

      let bodyDate = dateShort;
      if (payload.end_date && payload.end_date !== attendance_date) {
        bodyDate = `${dateShort}〜${shortDate(payload.end_date)}`;
      }
      const allNames1 = _emps1.map((e: any) => e.full_name);
      const body = `${storeShort}：${lastName(employee_name, _emp1?.calendar_display_name, allNames1)} ${bodyDate}`;

      const { allEmps, storeMap } = await getEmpsAndStores(company_id);

      for (const emp of allEmps) {
        // D02は全通知除外、D49はカレンダーのみ（事由登録は除外）
        if (NO_NOTIFY_CODES.includes(emp.employee_code)) continue;
        if (CALENDAR_ONLY_CODES.includes(emp.employee_code)) continue;

        const sn = storeMap[emp.store_id] || "";
        // 管理者（D18, D67, DA01, DA02）は全員分受信、一般社員は自店舗分のみ
        if (ALL_CALENDAR_CODES.includes(emp.employee_code) && !CALENDAR_ONLY_CODES.includes(emp.employee_code)) {
          targets.push({ employee_id: emp.id, title, body, tag: "attendance-reason", url: "/home" });
        }
      }
    }

    // ============================
    // 10. 勤怠事由削除時（即時通知）
    // ============================
    if (type === "attendance_reason_cleared") {
      const { company_id, employee_id, employee_name, old_reason, attendance_date } = payload;
      const { allEmps: _emps2, storeMap: _sm2 } = await getEmpsAndStores(company_id);
      const _emp2 = _emps2.find((e: any) => e.id === employee_id);
      const storeShort = resolveStoreShort(_emp2 ? (_sm2[_emp2.store_id] || "") : "");
      const dateShort = shortDate(attendance_date);

      let reasonLabel = "";
      if (old_reason.includes("出張")) reasonLabel = "出張";
      else if (old_reason.includes("有給（全日）")) reasonLabel = "有給";
      else if (old_reason.includes("午前有給")) reasonLabel = "有給（午前）";
      else if (old_reason.includes("午後有給")) reasonLabel = "有給（午後）";
      else if (old_reason.includes("選択休（全日）")) reasonLabel = "選択休";
      else if (old_reason.includes("午前選択休")) reasonLabel = "選択休（午前）";
      else if (old_reason.includes("午後選択休")) reasonLabel = "選択休（午後）";
      else if (old_reason.match(/^代休/) && !old_reason.includes("午前") && !old_reason.includes("午後")) reasonLabel = "代休";
      else if (old_reason.includes("午前代休")) reasonLabel = "代休（午前）";
      else if (old_reason.includes("午後代休")) reasonLabel = "代休（午後）";
      else return new Response(JSON.stringify({ sent: 0, reason: "not a notifiable reason" }), { headers: { ...corsHeaders } });

      const title = `${employee_name}が${reasonLabel}を取り消しました`;
      const allNames2 = _emps2.map((e: any) => e.full_name);
      const body = `${storeShort}：${lastName(employee_name, _emp2?.calendar_display_name, allNames2)} ${dateShort}`;

      const { allEmps, storeMap } = await getEmpsAndStores(company_id);

      for (const emp of allEmps) {
        if (NO_NOTIFY_CODES.includes(emp.employee_code)) continue;
        if (CALENDAR_ONLY_CODES.includes(emp.employee_code)) continue;

        if (ALL_CALENDAR_CODES.includes(emp.employee_code)) {
          const sn = storeMap[emp.store_id] || "";
          targets.push({ employee_id: emp.id, title, body, tag: "attendance-reason", url: "/home" });
        }
      }
    }

    // ============================
    // 5. 打刻アラート（バッチ: 毎朝9:10）
    //   種別判定: employee_payroll_config.shift_type（off=公休登録型/work=出勤登録型）
    //            ＋ employment_type（正社員/パート）。対象日＝前日(JST)。
    // ============================
    if (type === "attendance_alert") {
      const { company_id, target_date } = payload;

      const { allEmps, storeMap } = await getEmpsAndStores(company_id);
      const empIds = allEmps.map((e: any) => e.id);

      // 打刻データ
      const { data: attData } = await sb.from("attendance_daily")
        .select("employee_id, punch_in, punch_out, reason, is_holiday")
        .eq("attendance_date", target_date)
        .in("employee_id", empIds);
      const attMap: Record<string, any> = {};
      (attData || []).forEach((r: any) => { attMap[r.employee_id] = r; });

      // パート種別（shift_type: off=公休登録型 / work=出勤登録型）
      const { data: pcData } = await sb.from("employee_payroll_config")
        .select("employee_id, shift_type")
        .in("employee_id", empIds);
      const shiftTypeMap: Record<string, string> = {};
      (pcData || []).forEach((p: any) => { shiftTypeMap[p.employee_id] = p.shift_type; });

      // 会社カレンダー（定休日）
      const empCalMap: Record<string, string> = {};
      allEmps.forEach((e: any) => { if (e.holiday_calendar) empCalMap[e.id] = e.holiday_calendar; });
      const calTypes = [...new Set(Object.values(empCalMap))];
      const holidayCalSet = new Set<string>();
      if (calTypes.length > 0) {
        const { data: hcData } = await sb.from("holiday_calendars")
          .select("calendar_type")
          .eq("holiday_date", target_date)
          .in("calendar_type", calTypes);
        (hcData || []).forEach((h: any) => { holidayCalSet.add(h.calendar_type); });
      }

      const dateShort = shortDate(target_date);

      // 出勤すべき日から除外する「休み事由」
      const isLeaveReason = (rs: string | null) =>
        !!rs && (rs.includes("有給") || rs.includes("選択休") || rs.includes("代休") ||
                 rs === "欠勤" || rs === "公休" || rs === "休職" || rs === "休日");

      const unpunched: { id: string; code: string; name: string; storeId: string; calDisplayName: string | null }[] = [];

      for (const emp of allEmps) {
        if (emp.employee_code?.startsWith("test")) continue; // テスト社員除外
        if (emp.employee_code === "D02") continue;            // 代表除外
        if (!emp.requires_punch) continue;                    // 打刻不要者（本部役員等）除外

        const att = attMap[emp.id];
        const hasIn = !!att?.punch_in;
        const hasOut = !!att?.punch_out;

        let miss = false;
        if (hasIn !== hasOut) {
          // ① 片方だけ打刻 → 種別・定休・事由に関係なく漏れ
          miss = true;
        } else if (!hasIn && !hasOut) {
          // ② 両方とも無い → 「出勤すべき日」の人だけ漏れ
          if (att?.is_holiday) {
            miss = false;
          } else {
            const isPart = (emp.employment_type || "").includes("パート");
            const shiftType = shiftTypeMap[emp.id];
            const isHolidayCal = empCalMap[emp.id] ? holidayCalSet.has(empCalMap[emp.id]) : false;
            if (isPart && shiftType === "work") {
              // 出勤登録型パート：本人が登録した出勤日(reason=出勤)のみ
              miss = att?.reason === "出勤";
            } else {
              // 正社員 ＆ 公休登録型パート：定休日でなく休み事由が無い日
              miss = !isHolidayCal && !isLeaveReason(att?.reason ?? null);
            }
          }
        }

        if (miss) {
          unpunched.push({
            id: emp.id,
            code: emp.employee_code,
            name: emp.full_name,
            storeId: emp.store_id,
            calDisplayName: emp.calendar_display_name || null,
          });
        }
      }

      // 本人への通知
      for (const u of unpunched) {
        targets.push({
          employee_id: u.id,
          title: `${dateShort}分 打刻漏れ`,
          body: `${dateShort}の打刻漏れを店長に修正依頼してください。`,
          tag: "attendance-alert",
          url: "/home",
        });
      }

      // 管理者への通知（自店の未打刻者ぶん／専務・池邉は全員ぶん）
      const STORE_UOZUMI = "0141e0fe-9014-4df5-8229-f2a85dc481bc";
      const STORE_OKUBO = "7336dda2-b23d-484c-a3fd-e79297832828";
      const managers: { code: string; filter: (u: any) => boolean }[] = [
        { code: "DA001", filter: (u) => u.storeId === STORE_UOZUMI }, // 魚住店長 雨宮
        { code: "DA002", filter: (u) => u.storeId === STORE_OKUBO },  // 大久保店長 押谷
        { code: "D18", filter: () => true },                          // 専務
        { code: "D67", filter: () => true },                          // 池邉
      ];

      for (const mgr of managers) {
        const mgrEmp = allEmps.find((e: any) => e.employee_code === mgr.code);
        if (!mgrEmp) continue;
        const list = unpunched.filter(mgr.filter);
        if (list.length === 0) continue;
        const alertAllNames = allEmps.map((e: any) => e.full_name);
        const names = list.slice(0, 5).map((u) => lastName(u.name, u.calDisplayName, alertAllNames)).join("、");
        const suffix = list.length > 5 ? `、他${list.length - 5}名` : "";
        targets.push({
          employee_id: mgrEmp.id,
          title: `未打刻 ${list.length}名（${dateShort}）`,
          body: `${names}${suffix}`,
          tag: "attendance-alert-mgr",
          url: "/home",
        });
      }
    }

    // ============================
    // 1. 朝のカレンダー通知（バッチ: 毎朝9:00）
    // ============================
    if (type === "morning_calendar") {
      const { company_id, target_date } = payload;

      const { data: events } = await sb.from("custom_events")
        .select("title, start_date, end_date, target_calendar")
        .eq("company_id", company_id)
        .lte("start_date", target_date)
        .gte("end_date", target_date);

      const { data: attData } = await sb.from("attendance_daily")
        .select("employee_id, reason")
        .eq("attendance_date", target_date)
        .not("reason", "is", null);

      const { allEmps, storeMap } = await getEmpsAndStores(company_id);

      const allNames = allEmps.map((e: any) => e.full_name);
      const empMap: Record<string, { name: string; storeName: string; department: string; code: string; calDisplayName: string | null }> = {};
      allEmps.forEach((e: any) => {
        empMap[e.id] = { name: e.full_name, storeName: storeMap[e.store_id] || "", department: e.department || "", code: e.employee_code, calDisplayName: e.calendar_display_name || null };
      });

      const leaveItems: { label: string; targetCal: string }[] = [];
      for (const att of (attData || [])) {
        const emp = empMap[att.employee_id];
        if (!emp) continue;
        const r = att.reason;
        const dn = lastName(emp.name, emp.calDisplayName, allNames);
        let label = "";
        if (r.includes("有給（全日）")) label = `${dn}:有給`;
        else if (r.includes("午前有給")) label = `${dn}:午前有給`;
        else if (r.includes("午後有給")) label = `${dn}:午後有給`;
        else if (r.includes("選択休（全日）")) label = `${dn}:選択休`;
        else if (r.includes("午前選択休")) label = `${dn}:午前選択休`;
        else if (r.includes("午後選択休")) label = `${dn}:午後選択休`;
        else if (r.includes("代休")) label = `${dn}:代休`;
        else if (r.includes("出張")) label = `${dn}:出張`;
        else if (r === "欠勤") label = `${dn}:欠勤`;
        else continue;

        const tc = resolveCalendarGroup(emp.code, emp.department, emp.storeName);
        leaveItems.push({ label, targetCal: tc });
      }

      const empItems: Record<string, string[]> = {};

      for (const evt of (events || [])) {
        for (const emp of allEmps) {
          if (NO_NOTIFY_CODES.includes(emp.employee_code)) continue;
          const sn = storeMap[emp.store_id] || "";
          if (matchCalendar(emp.employee_code, sn, emp.department || "", evt.target_calendar)) {
            if (!empItems[emp.id]) empItems[emp.id] = [];
            empItems[emp.id].push(evt.title);
          }
        }
      }

      for (const li of leaveItems) {
        for (const emp of allEmps) {
          if (NO_NOTIFY_CODES.includes(emp.employee_code)) continue;
          const sn = storeMap[emp.store_id] || "";
          if (matchCalendar(emp.employee_code, sn, emp.department || "", li.targetCal)) {
            if (!empItems[emp.id]) empItems[emp.id] = [];
            if (!empItems[emp.id].includes(li.label)) empItems[emp.id].push(li.label);
          }
        }
      }

      for (const emp of allEmps) {
        if (NO_NOTIFY_CODES.includes(emp.employee_code)) continue;
        const items = empItems[emp.id] || [];
        if (items.length === 0) {
          targets.push({
            employee_id: emp.id,
            title: "本日の予定はありません",
            body: "",
            tag: "morning-calendar",
            url: "/home",
          });
        } else {
          const display = items.length <= 3
            ? items.map(i => `・${i}`).join("\n")
            : items.slice(0, 3).map(i => `・${i}`).join("\n") + `、他${items.length - 3}件`;
          targets.push({
            employee_id: emp.id,
            title: `本日の予定は${items.length}件です`,
            body: display,
            tag: "morning-calendar",
            url: "/home",
          });
        }
      }
    }

    // ============================
    // 4. 予定10分前アラート（バッチ）
    // ============================
    if (type === "event_reminder") {
      const { company_id, target_date, target_time } = payload;

      const targetDate = target_date;
      const targetTime = target_time + ":00";

      const { data: events } = await sb.from("custom_events")
        .select("title, start_date, start_time, target_calendar")
        .eq("company_id", company_id)
        .eq("start_date", targetDate)
        .eq("start_time", targetTime);

      if (!events || events.length === 0) {
        return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders } });
      }

      const { allEmps, storeMap } = await getEmpsAndStores(company_id);

      for (const evt of events) {
        const calLabel = calMap[evt.target_calendar] || evt.target_calendar;
        const dow = ["日","月","火","水","木","金","土"][new Date(evt.start_date).getDay()];
        const d = new Date(evt.start_date);
        const dateDisplay = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日(${dow})`;

        const title = "予定の10分前です";
        const body = `${calLabel}：${evt.title}\n${dateDisplay} ${evt.start_time?.slice(0,5)}`;

        for (const emp of allEmps) {
          if (NO_NOTIFY_CODES.includes(emp.employee_code)) continue;
          const sn = storeMap[emp.store_id] || "";
          if (matchCalendar(emp.employee_code, sn, emp.department || "", evt.target_calendar)) {
            targets.push({ employee_id: emp.id, title, body, tag: "event-reminder", url: "/home" });
          }
        }
      }
    }

    // ============================

    // ============================
    // 11. 有給申請 新規（従業員→承認者+D18+D67）
    // ============================
    if (type === "leave_request_new") {
      const { company_id, employee_name, reason, attendance_date, store_name, notify_codes } = payload;
      const { allEmps } = await getEmpsAndStores(company_id);
      const storeShort = resolveStoreShort(store_name || "");
      const dateShort = shortDate(attendance_date);
      const allNamesLeave = allEmps.map((e: any) => e.full_name);
      const leaveEmp = allEmps.find((e: any) => e.full_name === employee_name);
      const title = `${employee_name}が有給を申請しました`;
      const body = `${storeShort}・${lastName(employee_name, leaveEmp?.calendar_display_name, allNamesLeave)} ${dateShort}`;
      for (const code of (notify_codes || [])) {
        const emp = allEmps.find((e: any) => e.employee_code === code);
        if (emp) targets.push({ employee_id: emp.id, title, body, tag: "leave-request", url: "/home" });
      }
    }

    // ============================
    // 12. 有給承認（承認者→申請者）
    // ============================
    if (type === "leave_request_approved") {
      const { employee_id, employee_name, reason, attendance_date, approved_by_name } = payload;
      const dateShort = shortDate(attendance_date);
      let approverDisplay = lastName(approved_by_name);
      if (payload.company_id) {
        const { allEmps: approvedEmps } = await getEmpsAndStores(payload.company_id);
        const approvedAllNames = approvedEmps.map((e: any) => e.full_name);
        const approverEmp = approvedEmps.find((e: any) => e.full_name === approved_by_name);
        approverDisplay = lastName(approved_by_name, approverEmp?.calendar_display_name, approvedAllNames);
      }
      targets.push({
        employee_id,
        title: "有給申請が承認されました",
        body: `${dateShort} ${reason}（承認: ${approverDisplay}）`,
        tag: "leave-approved",
        url: "/home",
      });
    }

    // ============================
    // 13. 有給却下（承認者→申請者）
    // ============================
    if (type === "leave_request_rejected") {
      const { employee_id, employee_name, reason, attendance_date, reject_reason, rejected_by_name } = payload;
      const dateShort = shortDate(attendance_date);
      targets.push({
        employee_id,
        title: "有給申請が却下されました",
        body: `${dateShort} ${reason}（理由: ${reject_reason}）`,
        tag: "leave-rejected",
        url: "/home",
      });
    }

    // 送信直前: 退職者を除外（全タイプ共通の最終防衛線）
    if (targets.length > 0) {
      const empIds = [...new Set(targets.map(t => t.employee_id))];
      const { data: activeEmps } = await sb.from("employees")
        .select("id")
        .in("id", empIds)
        .or("is_active.is.null,is_active.eq.true")
        .is("resigned_at", null);
      const activeSet = new Set((activeEmps || []).map(e => e.id));
      targets = targets.filter(t => activeSet.has(t.employee_id));
    }

    // 通知送信
    // ============================
    let sent = 0;
    let failed = 0;

    for (const t of targets) {
      const { data: subs } = await sb.from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("employee_id", t.employee_id);

      for (const sub of (subs || [])) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title: t.title, body: t.body, tag: t.tag, url: t.url })
          );
          sent++;
        } catch (err: any) {
          if (err.statusCode === 410) {
            await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          }
          failed++;
        }
      }
    }

    return new Response(JSON.stringify({ sent, failed, targets: targets.length }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
});

