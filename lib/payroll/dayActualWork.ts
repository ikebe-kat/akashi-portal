// lib/payroll/dayActualWork.ts
// akashi-portal 1日分の勤務区分（reason ベースの分類）を返す共通関数。
// 実労働の「分」は返さない。実労働は attendance_daily.actual_hours（NUMERIC 時間）を
// hoursToMinutes で分に直して呼び出し側が使う。
// DBトリガー calculate_attendance が有給（全日）で actual_hours=0 を格納するため、
// 有給日は自動的に総労働から抜ける。

export type DayWorkCategory =
  | 'work'              // 通常出勤（打刻あり・平日）
  | 'holiday_work'      // 休日出勤（公休カレンダー日 + 打刻揃い）
  | 'paid_leave_full'   // 有給（全日）
  | 'paid_leave_half'   // 午前有給 or 午後有給
  | 'absence'           // 欠勤 or 休職 (leaveDaysSet)
  | 'kokyu'             // 公休
  | 'sentakukyu'        // 選択休（全日）
  | 'daikyu'            // 代休（全パターン）
  | 'no_work';          // その他（打刻なし・警告等）

export interface DayWorkInput {
  punchIn: string | null;
  punchOut: string | null;
  reason: string | null;
  isHoliday: boolean;
  isLeaveDay: boolean;
}

export interface DayWorkResult {
  category: DayWorkCategory;
  hasWarning: boolean;
  warningMessage?: string;
}

function isFullPaidLeave(r: string | null) { return !!r && r.includes('有給（全日）'); }
function isHalfPaidLeave(r: string | null) { return !!r && (r.includes('午前有給') || r.includes('午後有給')); }
function isAbsenceReason(r: string | null) { return !!r && r.includes('欠勤'); }
function isKokyu(r: string | null)         { return !!r && r.includes('公休'); }
function isSentakukyuFull(r: string | null){ return !!r && r.includes('選択休（全日）'); }
function isDaikyu(r: string | null)        { return !!r && r.includes('代休'); }

// 分類の優先順位は現行 calculatePayroll(正社員 L98-160) の else-if チェーンに合わせる:
//   isHoliday → 有給全日 → 半日有給 → [公休/選択休/代休] → 打刻揃い → 打刻漏れ → 欠勤/休職
export function classifyDayWork(input: DayWorkInput): DayWorkResult {
  const { punchIn, punchOut, reason, isHoliday, isLeaveDay } = input;

  if (isHoliday) {
    if (punchIn && punchOut) return { category: 'holiday_work', hasWarning: false };
    return { category: 'no_work', hasWarning: false };
  }

  if (isFullPaidLeave(reason))  return { category: 'paid_leave_full', hasWarning: false };
  if (isHalfPaidLeave(reason))  return { category: 'paid_leave_half', hasWarning: false };
  if (isKokyu(reason))          return { category: 'kokyu',          hasWarning: false };
  if (isSentakukyuFull(reason)) return { category: 'sentakukyu',     hasWarning: false };
  if (isDaikyu(reason))         return { category: 'daikyu',         hasWarning: false };

  if (punchIn && punchOut) return { category: 'work', hasWarning: false };

  if (punchIn && !punchOut) {
    return { category: 'no_work', hasWarning: true, warningMessage: '退勤打刻漏れ' };
  }

  if (isAbsenceReason(reason) || isLeaveDay) return { category: 'absence', hasWarning: false };

  return { category: 'no_work', hasWarning: false };
}
