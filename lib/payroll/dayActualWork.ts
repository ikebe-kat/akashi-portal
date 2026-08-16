// lib/payroll/dayActualWork.ts
// akashi-portal 1日分の実労働判定・算出の共通関数。
// 給与計算(calculatePayroll)と社労士出力(SharoushiSub)は共にこの関数を使用する。
// トリガー由来の actual_hours は有給日にみなし時間(所定)が入るため、実労働の集計には使わない。

export type DayWorkCategory =
  | 'work'              // 通常出勤（実労働あり）
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
  isPart: boolean;
  isHoliday: boolean;
  isLeaveDay: boolean;
  breakMinutesSelfReported: number | null;
}

export interface DayWorkResult {
  minutes: number;
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

export function calcWorkMinutes(clockIn: string, clockOut: string, breakMinutes: number): number {
  const inTime = parseTime(clockIn), outTime = parseTime(clockOut);
  if (inTime === null || outTime === null) return 0;
  return Math.max(0, outTime - inTime - breakMinutes);
}

function parseTime(timeStr: string): number | null {
  if (!timeStr) return null;
  if (timeStr.includes('T')) { const d = new Date(timeStr); return d.getHours() * 60 + d.getMinutes(); }
  const parts = timeStr.split(':');
  return parts.length < 2 ? null : parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function calcActualMinutes(pi: string, po: string, isPart: boolean, breakSelf: number | null): number {
  const brk = isPart ? (breakSelf ?? 0) : 60;
  const raw = calcWorkMinutes(pi, po, brk);
  return isPart ? Math.floor(raw / 15) * 15 : raw;
}

// 分類の優先順位は現行 calculatePayroll(正社員 L98-160) の else-if チェーンに合わせる:
//   isHoliday → 有給全日 → 半日有給 → [公休/選択休/代休(新設)] → 打刻揃い → 打刻漏れ → 欠勤/休職
// 公休/選択休/代休 は新設の除外分岐。DB上「打刻あり×これら事由」は事前SQL確認で0件のため
// 現行給与計算と結果は完全一致する。
export function classifyDayWork(input: DayWorkInput): DayWorkResult {
  const { punchIn, punchOut, reason, isPart, isHoliday, isLeaveDay, breakMinutesSelfReported } = input;

  if (isHoliday) {
    if (punchIn && punchOut) {
      const mins = calcActualMinutes(punchIn, punchOut, isPart, breakMinutesSelfReported);
      return { minutes: mins, category: 'holiday_work', hasWarning: false };
    }
    return { minutes: 0, category: 'no_work', hasWarning: false };
  }

  if (isFullPaidLeave(reason))  return { minutes: 0, category: 'paid_leave_full', hasWarning: false };
  if (isHalfPaidLeave(reason))  return { minutes: 0, category: 'paid_leave_half', hasWarning: false };
  if (isKokyu(reason))          return { minutes: 0, category: 'kokyu',          hasWarning: false };
  if (isSentakukyuFull(reason)) return { minutes: 0, category: 'sentakukyu',     hasWarning: false };
  if (isDaikyu(reason))         return { minutes: 0, category: 'daikyu',         hasWarning: false };

  if (punchIn && punchOut) {
    const mins = calcActualMinutes(punchIn, punchOut, isPart, breakMinutesSelfReported);
    return { minutes: mins, category: 'work', hasWarning: false };
  }

  if (punchIn && !punchOut) {
    return { minutes: 0, category: 'no_work', hasWarning: true, warningMessage: '退勤打刻漏れ' };
  }

  if (isAbsenceReason(reason) || isLeaveDay) {
    return { minutes: 0, category: 'absence', hasWarning: false };
  }

  return { minutes: 0, category: 'no_work', hasWarning: false };
}
