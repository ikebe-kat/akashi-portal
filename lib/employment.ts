export type ExclusionTarget = 'payroll' | 'insurance' | 'paid_leave' | 'attendance';

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
 * 従業員がある締め期間・ある面(target)で対象に含まれるか判定。
 *
 * 判定順:
 *  1. 退職: resigned_at < periodStart → false
 *  2. 入社: hire_date > periodEnd → false
 *  3. 休職: leave_start_date〜(leave_end_date-1日) が期間と重なり、かつ exclusions に target → false
 *  4. いずれにも当たらなければ true
 */
export function isTargetInPeriod(
  emp: EmployeeForPeriodCheck,
  periodStart: string,
  periodEnd: string,
  target: ExclusionTarget,
  leaves: LeaveRecord[],
): boolean {
  if (emp.resigned_at && emp.resigned_at < periodStart) return false;
  if (emp.hire_date && emp.hire_date > periodEnd) return false;

  for (const lv of leaves) {
    if (!lv.exclusions.includes(target)) continue;
    const lvStart = lv.leave_start_date;
    // 復帰日当日は勤務側 → 休職最終日 = leave_end_date - 1日
    // leave_end_date が null なら無限大（復帰未定）
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
    if (overlapStart <= overlapEnd) return false;
  }
  return true;
}
