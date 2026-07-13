// lib/payroll/calculatePayroll.ts
// akashi-portal 給与計算ロジック

import { supabase } from '@/lib/supabase';
import { AKASHI_COMPANY_ID } from '@/lib/constants';
import type {
  PayrollConfig,
  AttendanceRecord,
  DailyCalc,
  PayrollResult,
  PayrollCalcParams,
} from './types';

// AKASHI_COMPANY_ID は lib/constants.ts からimport済み
const OVERTIME_THRESHOLD_MINUTES = 480; // 日次8時間 = 480分
const AVERAGE_WORK_DAYS = 19.66;        // 日割計算用（月平均所定労働日数）
const PART_COMMUTE_DIVISOR = 21;         // パート通勤手当の除数
const DEPENDENT_ALLOWANCE_PER_PERSON = 5000; // 扶養手当（1人あたり/月）
const EXCLUDE_CODES = ['D02', 'D18', 'D49', 'D67']; // KAT WORLD側で給与処理

// ============================================
// メイン: 全従業員の給与計算
// ============================================
export async function calculateAll(params: PayrollCalcParams & { mode?: 'preserve' | 'full' }): Promise<PayrollResult[]> {
  const { yearMonth, mode = 'preserve' } = params;

  const fulltimePeriod = getFulltimePeriod(yearMonth);
  const parttimePeriod = getParttimePeriod(yearMonth);

  const employees = await fetchEmployeesWithConfig();
  const holidaysByType = await fetchHolidays(fulltimePeriod.start, fulltimePeriod.end);

  const allStart = fulltimePeriod.start < parttimePeriod.start ? fulltimePeriod.start : parttimePeriod.start;
  const allEnd = fulltimePeriod.end > parttimePeriod.end ? fulltimePeriod.end : parttimePeriod.end;
  const attendance = await fetchAttendance(allStart, allEnd);
  const existingPayroll = await fetchExistingPayroll(yearMonth);
  const leaveRequests = await fetchLeaveRequests(allStart, allEnd);

  const results: PayrollResult[] = [];

  for (const emp of employees) {
    if (EXCLUDE_CODES.includes(emp.employee_code)) continue;

    const isParttime = emp.employment_type === 'パート';
    const period = isParttime ? parttimePeriod : fulltimePeriod;

    // 対象期間末日より後の入社者は出力・計算の対象から外す（千野DA039のような未来入社の幽霊レコード防止）
    if (emp.hire_date && emp.hire_date > period.end) continue;

    if (!emp.requires_punch) {
      results.push(createZeroResult(emp, yearMonth, fulltimePeriod, parttimePeriod));
      continue;
    }
    const empAttendance = attendance.filter(a => a.employee_id === emp.employee_id);
    const empLeaves = leaveRequests.filter(l => l.employee_id === emp.employee_id);
    const existingAdj = existingPayroll.find(p => p.employee_id === emp.employee_id);
    const adjustmentAmount = mode === 'full' ? 0 : (existingAdj?.adjustment_allowance ?? 0);

    if (isParttime) {
      results.push(calculateParttime(emp, period, empAttendance, empLeaves, yearMonth, adjustmentAmount));
    } else {
      const empHolidays = holidaysByType.get(emp.holiday_calendar || '') || new Set<string>();
      const monthlyStandardHours = calculateMonthlyStandardHours(empHolidays, fulltimePeriod);
      results.push(calculateFulltime(emp, period, empAttendance, empLeaves, empHolidays, yearMonth, monthlyStandardHours, adjustmentAmount));
    }
  }

  return results;
}

// ============================================
// 正社員 1人分の計算
// ============================================
function calculateFulltime(
  emp: PayrollConfig, period: { start: string; end: string },
  attendance: AttendanceRecord[], leaves: LeaveRecord[],
  holidays: Set<string>, yearMonth: string,
  monthlyStandardHours: number, adjustmentAmount: number,
): PayrollResult {
  const dailyDetails: DailyCalc[] = [];
  let totalWorkMinutes = 0, totalOvertimeMinutes = 0, absenceDays = 0, workDays = 0;
  let paidLeaveDays = 0, totalLateEarlyMinutes = 0;
  const warnings: string[] = [];
  const dates = getDateRange(period.start, period.end);

  for (const dateStr of dates) {
    const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
    const isHoliday = holidays.has(dateStr);
    const record = attendance.find(a => a.attendance_date === dateStr);
    const leave = leaves.find(l => l.attendance_date === dateStr);
    const hasLeave = !!leave;

    const daily: DailyCalc = {
      date: dateStr, dayOfWeek,
      clockIn: record?.punch_in ?? null, clockOut: record?.punch_out ?? null,
      workMinutes: 0, overtimeMinutes: 0, breakMinutes: 60,
      isHoliday, isAbsent: false, hasLeave,
      leaveType: leave?.reason ?? null,
      hasWarning: false, warningMessage: null, appliedHourlyRate: null,
    };

    if (isHoliday) {
      if (record?.punch_in && record?.punch_out) {
        const mins = calcWorkMinutes(record.punch_in, record.punch_out, 60);
        daily.workMinutes = mins; totalWorkMinutes += mins; workDays++;
        if (mins > OVERTIME_THRESHOLD_MINUTES) {
          daily.overtimeMinutes = mins - OVERTIME_THRESHOLD_MINUTES;
          totalOvertimeMinutes += daily.overtimeMinutes;
        }
      }
    } else if (record?.reason?.includes('有給（全日）')) {
      // 有給日数は attendance_daily.reason 基準で集計（leave_requests の有無に依存しない）
      paidLeaveDays += 1;
    } else if (record?.reason?.includes('午前有給') || record?.reason?.includes('午後有給')) {
      paidLeaveDays += 0.5;
    } else if (record?.punch_in && record?.punch_out) {
      const mins = calcWorkMinutes(record.punch_in, record.punch_out, 60);
      daily.workMinutes = mins; totalWorkMinutes += mins; workDays++;
      if (mins > OVERTIME_THRESHOLD_MINUTES) {
        daily.overtimeMinutes = mins - OVERTIME_THRESHOLD_MINUTES;
        totalOvertimeMinutes += daily.overtimeMinutes;
      }
    } else if (record?.punch_in && !record?.punch_out) {
      daily.hasWarning = true;
      daily.warningMessage = `${dateStr}: 退勤打刻漏れ`;
      warnings.push(daily.warningMessage);
    } else if (record?.reason?.includes('欠勤')) {
      // 欠勤は reason に「欠勤」が入っている日のみ。空白日・事由なしの日は欠勤にしない
      daily.isAbsent = true; absenceDays++;
    }
    if (!isHoliday && record) {
      totalLateEarlyMinutes += (record.late_minutes || 0) + (record.early_leave_minutes || 0);
    }
    dailyDetails.push(daily);
  }

  // 正社員は月給制のため日割りしない（出勤日数が所定未満でも常に満額支給）
  const isPartialMonth = false;

  let baseSalary = emp.base_salary, positionAllowance = emp.position_allowance;
  let qualificationAllowance = emp.qualification_allowance;
  let commuteAllowance = emp.commute_allowance, dependentAllowance = emp.dependent_allowance;
  let fixedOvertimeAmount = emp.fixed_overtime_amount;

  if (isPartialMonth) {
    const ratio = workDays / AVERAGE_WORK_DAYS;
    baseSalary = Math.round(emp.base_salary * ratio);
    positionAllowance = Math.round(emp.position_allowance * ratio);
    qualificationAllowance = Math.round(emp.qualification_allowance * ratio);
    dependentAllowance = Math.round(emp.dependent_allowance * ratio);
    fixedOvertimeAmount = Math.round(emp.fixed_overtime_amount * ratio);
    commuteAllowance = Math.round(emp.commute_allowance / AVERAGE_WORK_DAYS * workDays);
  }

  const overtimeBase = emp.base_salary + emp.position_allowance + emp.qualification_allowance;
  const overtimeUnitPrice = monthlyStandardHours > 0
    ? Math.round((overtimeBase / monthlyStandardHours) * 1.25 * 100) / 100 : 0;

  const fixedOvertimeMinutes = (emp.fixed_overtime_hours || 25) * 60;
  const excessOvertimeMinutes = Math.max(0, totalOvertimeMinutes - fixedOvertimeMinutes);
  const excessOvertimeAmount = Math.round(overtimeUnitPrice * (excessOvertimeMinutes / 60));

  const absenceBase = emp.base_salary + emp.position_allowance + emp.qualification_allowance
    + emp.fixed_overtime_amount + emp.dependent_allowance;
  const absenceDeduction = absenceDays > 0 && monthlyStandardHours > 0
    ? Math.round(absenceBase / monthlyStandardHours * absenceDays * 8) : 0;

  const lateEarlyDeduction = totalLateEarlyMinutes > 0 && monthlyStandardHours > 0
    ? Math.round(absenceBase / monthlyStandardHours / 60 * totalLateEarlyMinutes) : 0;

  const grossTotal = baseSalary + positionAllowance + qualificationAllowance
    + commuteAllowance + dependentAllowance + fixedOvertimeAmount
    + excessOvertimeAmount + adjustmentAmount - absenceDeduction - lateEarlyDeduction;

  return {
    employee_id: emp.employee_id, employee_code: emp.employee_code,
    employee_name: emp.employee_name, payroll_year_month: yearMonth,
    employment_type: emp.employment_type, period_start: period.start, period_end: period.end,
    work_days: workDays, total_work_minutes: totalWorkMinutes,
    overtime_minutes: totalOvertimeMinutes, absence_days: absenceDays,
    weekday_minutes: 0, saturday_minutes: 0, sunday_minutes: 0,
    hourly_rate_weekday: null, hourly_rate_saturday: null, hourly_rate_sunday: null,
    overtime_unit_price: overtimeUnitPrice, monthly_standard_hours: monthlyStandardHours,
    fixed_overtime_hours: emp.fixed_overtime_hours || 25,
    base_salary: baseSalary, position_allowance: positionAllowance,
    qualification_allowance: qualificationAllowance, commute_allowance: commuteAllowance,
    dependent_allowance: dependentAllowance, fixed_overtime_amount: fixedOvertimeAmount,
    excess_overtime_amount: excessOvertimeAmount, adjustment_amount: adjustmentAmount,
    absence_deduction: absenceDeduction + lateEarlyDeduction, paid_leave_days: paidLeaveDays, paid_leave_amount: 0,
    gross_total: grossTotal,
    has_warning: warnings.length > 0, warning_details: warnings,
    is_manual_adjusted: false, daily_details: dailyDetails,
  };
}

// ============================================
// パート 1人分の計算
// ============================================
function calculateParttime(
  emp: PayrollConfig, period: { start: string; end: string },
  attendance: AttendanceRecord[], leaves: LeaveRecord[],
  yearMonth: string, adjustmentAmount: number,
): PayrollResult {
  const dailyDetails: DailyCalc[] = [];
  let weekdayMinutes = 0, saturdayMinutes = 0, sundayMinutes = 0;
  let totalWorkMinutes = 0, totalOvertimeMinutes = 0, workDays = 0;
  let paidLeaveDays = 0, paidLeaveAmount = 0;
  const warnings: string[] = [];
  const rateWeekday = emp.hourly_rate_weekday || 0;
  const rateSaturday = emp.hourly_rate_saturday || rateWeekday;
  const rateSunday = emp.hourly_rate_sunday || rateWeekday;
  const dates = getDateRange(period.start, period.end);

  for (const dateStr of dates) {
    const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
    const record = attendance.find(a => a.attendance_date === dateStr);
    const leave = leaves.find(l => l.attendance_date === dateStr);

    const daily: DailyCalc = {
      date: dateStr, dayOfWeek,
      clockIn: record?.punch_in ?? null, clockOut: record?.punch_out ?? null,
      workMinutes: 0, overtimeMinutes: 0,
      breakMinutes: record?.break_minutes_self_reported ?? 0,
      isHoliday: false, isAbsent: false, hasLeave: !!leave,
      leaveType: leave?.reason ?? null,
      hasWarning: false, warningMessage: null, appliedHourlyRate: null,
    };

    if (record?.punch_in && record?.punch_out) {
      const breakMins = record.break_minutes_self_reported ?? 0;
      const rawMins = calcWorkMinutes(record.punch_in, record.punch_out, breakMins);
      const mins = Math.floor(rawMins / 15) * 15;
      daily.workMinutes = mins; totalWorkMinutes += mins; workDays++;
      const hasSplitRates = rateSaturday !== rateWeekday || rateSunday !== rateWeekday;
      if (hasSplitRates) {
        let rate = rateWeekday;
        if (dayOfWeek === 0) { rate = rateSunday; sundayMinutes += mins; }
        else if (dayOfWeek === 6) { rate = rateSaturday; saturdayMinutes += mins; }
        else { weekdayMinutes += mins; }
        daily.appliedHourlyRate = rate;
      } else {
        weekdayMinutes += mins;
        daily.appliedHourlyRate = rateWeekday;
      }
      if (mins > OVERTIME_THRESHOLD_MINUTES) {
        daily.overtimeMinutes = mins - OVERTIME_THRESHOLD_MINUTES;
        totalOvertimeMinutes += daily.overtimeMinutes;
      }
    } else if (record?.punch_in && !record?.punch_out) {
      daily.hasWarning = true;
      daily.warningMessage = `${dateStr}: 退勤打刻漏れ`;
      warnings.push(daily.warningMessage);
    }
    if (record?.reason?.includes('有給（全日）')) {
      paidLeaveDays += 1;
      paidLeaveAmount += Math.round((record.scheduled_hours || 0) * rateWeekday);
    } else if (record?.reason?.includes('午前有給') || record?.reason?.includes('午後有給')) {
      paidLeaveDays += 0.5;
      paidLeaveAmount += Math.round(((record.scheduled_hours || 0) / 2) * rateWeekday);
    }
    dailyDetails.push(daily);
  }

  const baseSalary = Math.round(
    (weekdayMinutes / 60) * rateWeekday + (saturdayMinutes / 60) * rateSaturday + (sundayMinutes / 60) * rateSunday
  );
  let commuteAllowance = 0;
  if (emp.commute_daily_amount != null) {
    commuteAllowance = emp.commute_daily_amount * workDays;
  } else if (emp.commute_distance_km == null && emp.commute_allowance > 0) {
    warnings.push(`⚠要確認: ${emp.employee_name} 通勤距離が未設定のため通勤手当を算出できません`);
  } else if (emp.commute_distance_km != null && emp.commute_daily_amount == null) {
    warnings.push(`⚠要確認: ${emp.employee_name} 通勤距離${emp.commute_distance_km}kmに対応する日割単価がマスタに未設定です`);
  }
  const grossTotal = baseSalary + commuteAllowance + adjustmentAmount + paidLeaveAmount;

  return {
    employee_id: emp.employee_id, employee_code: emp.employee_code,
    employee_name: emp.employee_name, payroll_year_month: yearMonth,
    employment_type: 'パート', period_start: period.start, period_end: period.end,
    work_days: workDays, total_work_minutes: totalWorkMinutes,
    overtime_minutes: totalOvertimeMinutes, absence_days: 0,
    weekday_minutes: weekdayMinutes, saturday_minutes: saturdayMinutes, sunday_minutes: sundayMinutes,
    hourly_rate_weekday: rateWeekday, hourly_rate_saturday: rateSaturday, hourly_rate_sunday: rateSunday,
    overtime_unit_price: 0, monthly_standard_hours: 0, fixed_overtime_hours: 0,
    base_salary: baseSalary, position_allowance: 0, qualification_allowance: 0,
    commute_allowance: commuteAllowance, dependent_allowance: 0, fixed_overtime_amount: 0,
    excess_overtime_amount: 0, adjustment_amount: adjustmentAmount, absence_deduction: 0,
    paid_leave_days: paidLeaveDays, paid_leave_amount: paidLeaveAmount,
    gross_total: grossTotal, has_warning: warnings.length > 0, warning_details: warnings,
    is_manual_adjusted: false, daily_details: dailyDetails,
  };
}

// ============================================
// ユーティリティ
// ============================================
function getFulltimePeriod(yearMonth: string) {
  const [y, m] = yearMonth.split('-').map(Number);
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  const lastDay = new Date(prevYear, prevMonth, 0).getDate();
  return { start: `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`, end: `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}` };
}

function getParttimePeriod(yearMonth: string) {
  const [y, m] = yearMonth.split('-').map(Number);
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  return { start: `${prevYear}-${String(prevMonth).padStart(2, '0')}-11`, end: `${y}-${String(m).padStart(2, '0')}-10` };
}

function calculateMonthlyStandardHours(holidays: Set<string>, period: { start: string; end: string }): number {
  return getDateRange(period.start, period.end).filter(d => !holidays.has(d)).length * 8;
}

function getDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  while (current <= endDate) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function calcWorkMinutes(clockIn: string, clockOut: string, breakMinutes: number): number {
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

function createZeroResult(emp: PayrollConfig, yearMonth: string, fp: { start: string; end: string }, pp: { start: string; end: string }): PayrollResult {
  const period = emp.employment_type === 'パート' ? pp : fp;
  return {
    employee_id: emp.employee_id, employee_code: emp.employee_code, employee_name: emp.employee_name,
    payroll_year_month: yearMonth, employment_type: emp.employment_type,
    period_start: period.start, period_end: period.end,
    work_days: 0, total_work_minutes: 0, overtime_minutes: 0, absence_days: 0,
    weekday_minutes: 0, saturday_minutes: 0, sunday_minutes: 0,
    hourly_rate_weekday: null, hourly_rate_saturday: null, hourly_rate_sunday: null,
    overtime_unit_price: 0, monthly_standard_hours: 0, fixed_overtime_hours: 0,
    base_salary: 0, position_allowance: 0, qualification_allowance: 0,
    commute_allowance: 0, dependent_allowance: 0, fixed_overtime_amount: 0,
    excess_overtime_amount: 0, adjustment_amount: 0, absence_deduction: 0,
    paid_leave_days: 0, paid_leave_amount: 0,
    gross_total: 0, has_warning: false, warning_details: [],
    is_manual_adjusted: false, daily_details: [],
  };
}

// ============================================
// データ取得
// ============================================
interface LeaveRecord { employee_id: string; attendance_date: string; reason: string; }

async function fetchEmployeesWithConfig(): Promise<PayrollConfig[]> {
  const { data, error } = await supabase
    .from('employees')
    .select(`id, employee_code, full_name, employment_type, store_id, is_active, requires_punch, holiday_calendar, hire_date,
      employee_payroll_config ( rank, base_salary_override, position_allowance_override, qualifications, dependents_count, commute_distance_km, fixed_overtime_amount, hourly_wage_weekday, hourly_wage_saturday, hourly_wage_sunday )`)
    .eq('company_id', AKASHI_COMPANY_ID).eq('is_active', true);
  if (error) throw new Error(`従業員データ取得エラー: ${error.message}`);

  const { data: commuteMaster } = await supabase.from('payroll_commute_master')
    .select('distance_from, distance_to, monthly_amount, daily_amount').eq('company_id', AKASHI_COMPANY_ID).order('distance_from');
  const { data: qualMaster } = await supabase.from('payroll_qualification_master')
    .select('qualification_name, allowance').eq('company_id', AKASHI_COMPANY_ID);

  const qualMap = new Map((qualMaster || []).map((q: any) => [q.qualification_name, q.allowance]));
  const calcCommute = (km: number | null) => {
    if (!km || !commuteMaster) return 0;
    const t = commuteMaster.find((t: any) => km >= t.distance_from && (t.distance_to === null || km < t.distance_to));
    return t ? t.monthly_amount : 0;
  };
  const calcCommuteDailyRate = (km: number | null): number | null => {
    if (km == null || !commuteMaster) return null;
    const t = commuteMaster.find((t: any) => Number(km) >= Number(t.distance_from) && (t.distance_to === null || Number(km) < Number(t.distance_to)));
    return t?.daily_amount != null ? Number(t.daily_amount) : null;
  };
  const calcQual = (q: any) => !q || !Array.isArray(q) ? 0 : q.reduce((s: number, n: string) => s + (qualMap.get(n) || 0), 0);
  const calcDep = (c: number | null) => (c || 0) * DEPENDENT_ALLOWANCE_PER_PERSON;

  return (data || []).map((e: any) => {
    const c = e.employee_payroll_config?.[0] || {};
    return {
      employee_id: e.id, employee_code: e.employee_code, employee_name: e.full_name,
      employment_type: e.employment_type, store_id: e.store_id, is_active: e.is_active,
      requires_punch: e.requires_punch ?? true, holiday_calendar: e.holiday_calendar || null,
      hire_date: e.hire_date ? String(e.hire_date).slice(0, 10) : null,
      base_salary: c.base_salary_override || 0, position_allowance: c.position_allowance_override || 0,
      qualification_allowance: calcQual(c.qualifications), commute_allowance: calcCommute(c.commute_distance_km),
      dependent_allowance: calcDep(c.dependents_count), fixed_overtime_amount: c.fixed_overtime_amount || 0,
      fixed_overtime_hours: 25, salary_grade: c.rank || null,
      hourly_rate_weekday: c.hourly_wage_weekday || null, hourly_rate_saturday: c.hourly_wage_saturday || null,
      hourly_rate_sunday: c.hourly_wage_sunday || null, commute_allowance_daily_divisor: PART_COMMUTE_DIVISOR,
      commute_daily_amount: calcCommuteDailyRate(c.commute_distance_km),
      commute_distance_km: c.commute_distance_km != null ? Number(c.commute_distance_km) : null,
    };
  });
}

async function fetchAttendance(start: string, end: string): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase.from('attendance_daily')
    .select('id, employee_id, attendance_date, punch_in, punch_out, break_minutes, break_minutes_self_reported, reason, is_holiday, scheduled_hours, late_minutes, early_leave_minutes')
    .eq('company_id', AKASHI_COMPANY_ID).gte('attendance_date', start).lte('attendance_date', end)
    .range(0, 99999);
  if (error) throw new Error(`勤怠データ取得エラー: ${error.message}`);
  return data || [];
}

async function fetchHolidays(start: string, end: string): Promise<Map<string, Set<string>>> {
  const { data, error } = await supabase.from('holiday_calendars')
    .select('holiday_date, calendar_type').eq('company_id', AKASHI_COMPANY_ID).gte('holiday_date', start).lte('holiday_date', end);
  if (error) throw new Error(`休日カレンダー取得エラー: ${error.message}`);
  const byType = new Map<string, Set<string>>();
  for (const d of (data || [])) {
    if (!byType.has(d.calendar_type)) byType.set(d.calendar_type, new Set());
    byType.get(d.calendar_type)!.add(d.holiday_date);
  }
  return byType;
}

async function fetchLeaveRequests(start: string, end: string): Promise<LeaveRecord[]> {
  const { data, error } = await supabase.from('leave_requests')
    .select('employee_id, attendance_date, reason')
    .eq('company_id', AKASHI_COMPANY_ID).eq('status', '承認').gte('attendance_date', start).lte('attendance_date', end);
  if (error) throw new Error(`有給データ取得エラー: ${error.message}`);
  return data || [];
}

async function fetchExistingPayroll(yearMonth: string) {
  const [y, m] = yearMonth.split('-').map(Number);
  const { data, error } = await supabase.from('payroll_monthly')
    .select('employee_id, adjustment_allowance').eq('company_id', AKASHI_COMPANY_ID).eq('target_year', y).eq('target_month', m);
  if (error) throw new Error(`既存給与データ取得エラー: ${error.message}`);
  return data || [];
}

// ============================================
// DB保存
// ============================================

async function fetchExistingPayrollFull(yearMonth: string) {
  const [y, m] = yearMonth.split('-').map(Number);
  const { data, error } = await supabase.from('payroll_monthly')
    .select('id, employee_id, base_salary, position_allowance, qualification_allowance, dependent_allowance, commute_allowance, fixed_overtime, overtime_pay, adjustment_allowance, absence_deduction, paid_leave_amount, hourly_weekday_minutes, hourly_saturday_minutes, hourly_sunday_minutes')
    .eq('company_id', AKASHI_COMPANY_ID).eq('target_year', y).eq('target_month', m);
  if (error) throw new Error(`既存給与データ(full)取得エラー: ${error.message}`);
  return data || [];
}

async function fetchChangeLogsForMonth(pmIds: string[]) {
  if (pmIds.length === 0) return [];
  const { data, error } = await supabase.from('payroll_change_logs')
    .select('employee_id, field_name, changed_by, changed_at, old_value, new_value')
    .in('payroll_monthly_id', pmIds);
  if (error) throw new Error(`変更ログ取得エラー: ${error.message}`);
  return data || [];
}

export async function getChangeLogCount(yearMonth: string): Promise<number> {
  const [y, m] = yearMonth.split('-').map(Number);
  const { data: pmData } = await supabase.from('payroll_monthly')
    .select('id')
    .eq('company_id', AKASHI_COMPANY_ID).eq('target_year', y).eq('target_month', m);
  if (!pmData || pmData.length === 0) return 0;
  const { data } = await supabase.from('payroll_change_logs')
    .select('id')
    .in('payroll_monthly_id', pmData.map((r: any) => r.id));
  return data?.length || 0;
}

export async function savePayrollResults(results: PayrollResult[], yearMonth: string, mode: 'preserve' | 'full' = 'full'): Promise<void> {
  const [y, m] = yearMonth.split('-').map(Number);

  const existing = await fetchExistingPayrollFull(yearMonth);
  const pmIds = existing.map((r: any) => r.id);

  let preserveMap: Map<string, Map<string, number>> | null = null;
  let savedChangeLogs: any[] = [];

  if (mode === 'preserve' && pmIds.length > 0) {
    const changeLogs = await fetchChangeLogsForMonth(pmIds);
    if (changeLogs.length > 0) {
      savedChangeLogs = changeLogs;
      preserveMap = new Map();
      for (const log of changeLogs) {
        const empRow = existing.find((r: any) => r.employee_id === log.employee_id);
        if (!empRow) continue;
        if (!preserveMap.has(log.employee_id)) preserveMap.set(log.employee_id, new Map());
        preserveMap.get(log.employee_id)!.set(log.field_name, (empRow as any)[log.field_name] ?? 0);
      }
    }
  }

  if (pmIds.length > 0) {
    const { error: clDeleteError } = await supabase.from('payroll_change_logs').delete()
      .in('payroll_monthly_id', pmIds);
    if (clDeleteError) throw new Error(`変更ログ削除エラー: ${clDeleteError.message}`);
  }

  const { data: deleted, error: deleteError } = await supabase.from('payroll_monthly').delete()
    .eq('company_id', AKASHI_COMPANY_ID).eq('target_year', y).eq('target_month', m).select('id');
  if (deleteError) throw new Error(`既存データ削除エラー: ${deleteError.message}`);
  if (existing.length > 0 && (!deleted || deleted.length === 0)) {
    throw new Error(`既存データ${existing.length}件の削除が反映されませんでした（権限設定の可能性）`);
  }

  const rows = results.map(r => {
    const row: any = {
      company_id: AKASHI_COMPANY_ID, employee_id: r.employee_id, target_year: y, target_month: m,
      status: 'draft', base_salary: r.base_salary, position_allowance: r.position_allowance,
      qualification_allowance: r.qualification_allowance, dependent_allowance: r.dependent_allowance,
      commute_allowance: r.commute_allowance, fixed_overtime: r.fixed_overtime_amount,
      overtime_pay: r.excess_overtime_amount, adjustment_allowance: r.adjustment_amount,
      absence_deduction: r.absence_deduction, total_payment: r.gross_total,
      work_days: r.work_days, actual_work_minutes: r.total_work_minutes,
      overtime_minutes: r.overtime_minutes, absence_days: r.absence_days,
      paid_leave_days: r.paid_leave_days, paid_leave_amount: r.paid_leave_amount || 0,
      hourly_weekday_minutes: r.weekday_minutes, hourly_saturday_minutes: r.saturday_minutes,
      hourly_sunday_minutes: r.sunday_minutes, overtime_exceeded: r.excess_overtime_amount > 0,
      calculated_at: new Date().toISOString(),
    };

    if (preserveMap?.has(r.employee_id)) {
      const fields = preserveMap.get(r.employee_id)!;
      for (const [field, value] of fields) {
        if (field in row) row[field] = value;
      }
      if (r.employment_type === 'パート') {
        row.total_payment = (row.base_salary || 0) + (row.commute_allowance || 0)
          + (row.adjustment_allowance || 0) + (row.paid_leave_amount || 0);
      } else {
        row.total_payment = (row.base_salary || 0) + (row.position_allowance || 0)
          + (row.qualification_allowance || 0) + (row.commute_allowance || 0)
          + (row.dependent_allowance || 0) + (row.fixed_overtime || 0)
          + (row.overtime_pay || 0) + (row.adjustment_allowance || 0) - (row.absence_deduction || 0);
      }
    }

    return row;
  });

  if (rows.length === 0) throw new Error('計算結果が0件です（従業員データまたは計算ロジックの異常）');
  const { data: ins, error: insertError } = await supabase.from('payroll_monthly').insert(rows).select('id, employee_id');
  if (insertError) throw new Error(`給与データ保存エラー: ${insertError.message}`);
  if (!ins || ins.length === 0) throw new Error('給与データを保存できませんでした（権限設定の可能性）');
  if (ins.length !== rows.length) throw new Error(`給与データ保存: ${rows.length}件中${ins.length}件のみ反映（${rows.length - ins.length}件が未保存、権限設定の可能性）`);

  if (mode === 'preserve' && savedChangeLogs.length > 0) {
    const empToPmId = new Map(ins.map((r: any) => [r.employee_id, r.id]));
    const newLogs = savedChangeLogs
      .map(log => {
        const newPmId = empToPmId.get(log.employee_id);
        if (!newPmId) return null;
        return {
          payroll_monthly_id: newPmId,
          employee_id: log.employee_id,
          changed_by: log.changed_by,
          changed_at: log.changed_at,
          field_name: log.field_name,
          old_value: log.old_value,
          new_value: log.new_value,
        };
      })
      .filter(Boolean);
    if (newLogs.length > 0) {
      const { data: clIns, error: clInsertError } = await supabase.from('payroll_change_logs').insert(newLogs).select('id');
      if (clInsertError) throw new Error(`変更ログ再保存エラー: ${clInsertError.message}`);
      if (!clIns || clIns.length !== newLogs.length) throw new Error(`変更ログ再保存: ${newLogs.length}件中${clIns?.length ?? 0}件のみ反映`);
    }
  }
}
