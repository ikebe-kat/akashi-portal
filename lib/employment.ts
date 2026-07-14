export type ExclusionTarget = 'payroll' | 'insurance' | 'paid_leave' | 'attendance';

export type PeriodCheckResult = 'active' | 'not_employed' | 'excluded';

export interface LeaveRecord {
  leave_start_date: string;
  leave_end_date: string | null;
  exclusions: ExclusionTarget[];
}

export interface EmployeeForPeriodCheck {
  resigned_at: string | null;
  hire_date: string | null;
}

/**
 * 'active'       — 在籍・対象
 * 'not_employed' — 退職/入社前で対象外（リストから消してよい）
 * 'excluded'     — 休職でこの面は除外（リストには残す）
 */
export function checkEmploymentInPeriod(
  emp: EmployeeForPeriodCheck,
  periodStart: string,
  periodEnd: string,
  target: ExclusionTarget,
  leaves: LeaveRecord[],
): PeriodCheckResult {
  if (emp.resigned_at && emp.resigned_at < periodStart) return 'not_employed';
  if (emp.hire_date && emp.hire_date > periodEnd) return 'not_employed';

  for (const lv of leaves) {
    if (!lv.exclusions.includes(target)) continue;
    const lvStart = lv.leave_start_date;
    let lvLastDay: string | null = null;
    if (lv.leave_end_date) {
      const d = new Date(lv.leave_end_date + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      lvLastDay = d.toISOString().slice(0, 10);
    }
    const overlapStart = lvStart > periodStart ? lvStart : periodStart;
    const overlapEnd = lvLastDay
      ? (lvLastDay < periodEnd ? lvLastDay : periodEnd)
      : periodEnd;
    if (overlapStart <= overlapEnd) return 'excluded';
  }
  return 'active';
}

export function isDateOnLeave(
  dateStr: string,
  leaves: LeaveRecord[],
  target?: ExclusionTarget,
): boolean {
  for (const lv of leaves) {
    if (target && !lv.exclusions.includes(target)) continue;
    if (lv.leave_start_date > dateStr) continue;
    if (lv.leave_end_date && lv.leave_end_date <= dateStr) continue;
    return true;
  }
  return false;
}
