// lib/payroll/calculatePayroll.ts
// akashi-portal 給与計算ロジック

import { supabase } from '@/lib/supabase';
import type {
  PayrollConfig,
  AttendanceRecord,
  DailyCalc,
  PayrollResult,
  PayrollCalcParams,
} from './types';

const AKASHI_COMPANY_ID = 'e85e40ac-71f7-4918-b2fc-36d877337b74';
const OVERTIME_THRESHOLD_MINUTES = 480; // 日次8時間 = 480分
const AVERAGE_WORK_DAYS = 19.66;        // 日割計算用
const PART_COMMUTE_DIVISOR = 21;         // パート通勤手当の除数

// ============================================
// メイン: 全従業員の給与計算
// ============================================
export async function calculateAll(params: PayrollCalcParams): Promise<PayrollResult[]> {
  const { yearMonth } = params;

  const fulltimePeriod = getFulltimePeriod(yearMonth);
  const parttimePeriod = getParttimePeriod(yearMonth);

  const employees = await fetchEmployeesWithConfig();
  const holidays = await fetchHolidays(fulltimePeriod.start, fulltimePeriod.end);

  const allStart = fulltimePeriod.start < parttimePeriod.start ? fulltimePeriod.start : parttimePeriod.start;
  const allEnd = fulltimePeriod.end > parttimePeriod.end ? fulltimePeriod.end : parttimePeriod.end;
  const attendance = await fetchAttendance(allStart, allEnd);
  const existingPayroll = await fetchExistingPayroll(yearMonth);
  const leaveRequests = await fetchLeaveRequests(allStart, allEnd);

  const results: PayrollResult[] = [];

  for (const emp of employees) {
    if (!emp.requires_punch) {
      results.push(createZeroResult(emp, yearMonth, fulltimePeriod, parttimePeriod));
      continue;
    }

    const isParttime = emp.employment_type === 'パート';
    const period = isParttime ? parttimePeriod : fulltimePeriod;
    const empAttendance = attendance.filter(a => a.employee_id === emp.employee_id);
    const empLeaves = leaveRequests.filter(l => l.employee_id === emp.employee_id);
    const existingAdj = existingPayroll.find(p => p.employee_id === emp.employee_id);
    const adjustmentAmount = existingAdj?.adjustment_allowance ?? 0;

    if (isParttime) {
      results.push(calculateParttime(emp, period, empAttendance, empLeaves, yearMonth, adjustmentAmount));
    } else {
      const monthlyStandardHours = calculateMonthlyStandardHours(holidays, fulltimePeriod);
      results.push(calculateFulltime(emp, period, empAttendance, empLeaves, holidays, yearMonth, monthlyStandardHours, adjustmentAmount));
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
    } else if (hasLeave) {
      // 有給: 欠勤にしない
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
    } else {
      daily.isAbsent = true; absenceDays++;
    }
    dailyDetails.push(daily);
  }

  const scheduledWorkDays = dates.filter(d => !holidays.has(d)).length;
  const isPartialMonth = workDays < scheduledWorkDays && absenceDays === 0 && workDays > 0;

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
  const absenceDeduction = absenceDays > 0 ? Math.round((absenceBase / AVERAGE_WORK_DAYS) * absenceDays) : 0;

  const grossTotal = baseSalary + positionAllowance + qualificationAllowance
    + commuteAllowance + dependentAllowance + fixedOvertimeAmount
    + excessOvertimeAmount + adjustmentAmount - absenceDeduction;

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
    absence_deduction: absenceDeduction, gross_total: grossTotal,
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
      const mins = calcWorkMinutes(record.punch_in, record.punch_out, breakMins);
      daily.workMinutes = mins; totalWorkMinutes += mins; workDays++;
      let rate = rateWeekday;
      if (dayOfWeek === 0) { rate = rateSunday; sundayMinutes += mins; }
      else if (dayOfWeek === 6) { rate = rateSaturday; saturdayMinutes += mins; }
      else { weekdayMinutes += mins; }
      daily.appliedHourlyRate = rate;
      if (mins > OVERTIME_THRESHOLD_MINUTES) {
        daily.overtimeMinutes = mins - OVERTIME_THRESHOLD_MINUTES;
        totalOvertimeMinutes += daily.overtimeMinutes;
      }
    } else if (record?.punch_in && !record?.punch_out) {
      daily.hasWarning = true;
      daily.warningMessage = `${dateStr}: 退勤打刻漏れ`;
      warnings.push(daily.warningMessage);
    }
    dailyDetails.push(daily);
  }

  const baseSalary = Math.round(
    (weekdayMinutes / 60) * rateWeekday + (saturdayMinutes / 60) * rateSaturday + (sundayMinutes / 60) * rateSunday
  );
  const commuteAllowance = emp.commute_allowance > 0 ? Math.round((emp.commute_allowance / PART_COMMUTE_DIVISOR) * workDays) : 0;
  const grossTotal = baseSalary + commuteAllowance + adjustmentAmount;

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
  while (current <= endDate) { dates.push(current.toISOString().split('T')[0]); current.setDate(current.getDate() + 1); }
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
    .select(`id, employee_code, full_name, employment_type, store_id, is_active, requires_punch,
      employee_payroll_config ( rank, base_salary_override, position_allowance_override, qualifications, dependents_count, commute_distance_km, fixed_overtime_amount, hourly_wage_weekday, hourly_wage_saturday, hourly_wage_sunday )`)
    .eq('company_id', AKASHI_COMPANY_ID).eq('is_active', true);
  if (error) throw new Error(`従業員データ取得エラー: ${error.message}`);

  const { data: commuteMaster } = await supabase.from('payroll_commute_master')
    .select('distance_from, distance_to, monthly_amount').eq('company_id', AKASHI_COMPANY_ID).order('distance_from');
  const { data: qualMaster } = await supabase.from('payroll_qualification_master')
    .select('qualification_name, allowance').eq('company_id', AKASHI_COMPANY_ID);

  const qualMap = new Map((qualMaster || []).map((q: any) => [q.qualification_name, q.allowance]));
  const calcCommute = (km: number | null) => {
    if (!km || !commuteMaster) return 0;
    const t = commuteMaster.find((t: any) => km >= t.distance_from && (t.distance_to === null || km < t.distance_to));
    return t ? t.monthly_amount : 0;
  };
  const calcQual = (q: any) => !q || !Array.isArray(q) ? 0 : q.reduce((s: number, n: string) => s + (qualMap.get(n) || 0), 0);
  const calcDep = (c: number | null) => (c || 0) * 5000;

  return (data || []).map((e: any) => {
    const c = e.employee_payroll_config?.[0] || {};
    return {
      employee_id: e.id, employee_code: e.employee_code, employee_name: e.full_name,
      employment_type: e.employment_type, store_id: e.store_id, is_active: e.is_active,
      requires_punch: e.requires_punch ?? true,
      base_salary: c.base_salary_override || 0, position_allowance: c.position_allowance_override || 0,
      qualification_allowance: calcQual(c.qualifications), commute_allowance: calcCommute(c.commute_distance_km),
      dependent_allowance: calcDep(c.dependents_count), fixed_overtime_amount: c.fixed_overtime_amount || 0,
      fixed_overtime_hours: 25, salary_grade: c.rank || null,
      hourly_rate_weekday: c.hourly_wage_weekday || null, hourly_rate_saturday: c.hourly_wage_saturday || null,
      hourly_rate_sunday: c.hourly_wage_sunday || null, commute_allowance_daily_divisor: PART_COMMUTE_DIVISOR,
    };
  });
}

async function fetchAttendance(start: string, end: string): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase.from('attendance_daily')
    .select('id, employee_id, attendance_date, punch_in, punch_out, break_minutes, break_minutes_self_reported, reason, is_holiday')
    .eq('company_id', AKASHI_COMPANY_ID).gte('attendance_date', start).lte('attendance_date', end);
  if (error) throw new Error(`勤怠データ取得エラー: ${error.message}`);
  return data || [];
}

async function fetchHolidays(start: string, end: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('holiday_calendars')
    .select('holiday_date').eq('company_id', AKASHI_COMPANY_ID).gte('holiday_date', start).lte('holiday_date', end);
  if (error) throw new Error(`休日カレンダー取得エラー: ${error.message}`);
  return new Set((data || []).map((d: any) => d.holiday_date));
}

async function fetchLeaveRequests(start: string, end: string): Promise<LeaveRecord[]> {
  const { data, error } = await supabase.from('leave_requests')
    .select('employee_id, attendance_date, reason')
    .eq('company_id', AKASHI_COMPANY_ID).eq('status', 'approved').gte('attendance_date', start).lte('attendance_date', end);
  if (error) throw new Error(`有給データ取得エラー: ${error.message}`);
  return data || [];
}

async function fetchExistingPayroll(yearMonth: string) {
  const [y, m] = yearMonth.split('-').map(Number);
  const { data, error } = await supabase.from('payroll_monthly')
    .select('employee_id, adjustment_allowance').eq('company_id', AKASHI_COMPANY_ID).eq('target_year', y).eq('target_month', m);
  if (error) return [];
  return data || [];
}

// ============================================
// DB保存
// ============================================
export async function savePayrollResults(results: PayrollResult[], yearMonth: string): Promise<void> {
  const [y, m] = yearMonth.split('-').map(Number);
  const { error: deleteError } = await supabase.from('payroll_monthly').delete()
    .eq('company_id', AKASHI_COMPANY_ID).eq('target_year', y).eq('target_month', m);
  if (deleteError) throw new Error(`既存データ削除エラー: ${deleteError.message}`);

  const rows = results.map(r => ({
    company_id: AKASHI_COMPANY_ID, employee_id: r.employee_id, target_year: y, target_month: m,
    status: 'draft' as const, base_salary: r.base_salary, position_allowance: r.position_allowance,
    qualification_allowance: r.qualification_allowance, dependent_allowance: r.dependent_allowance,
    commute_allowance: r.commute_allowance, fixed_overtime: r.fixed_overtime_amount,
    overtime_pay: r.excess_overtime_amount, adjustment_allowance: r.adjustment_amount,
    absence_deduction: r.absence_deduction, total_payment: r.gross_total,
    work_days: r.work_days, actual_work_minutes: r.total_work_minutes,
    overtime_minutes: r.overtime_minutes, absence_days: r.absence_days, paid_leave_days: 0,
    hourly_weekday_minutes: r.weekday_minutes, hourly_saturday_minutes: r.saturday_minutes,
    hourly_sunday_minutes: r.sunday_minutes, overtime_exceeded: r.excess_overtime_amount > 0,
    calculated_at: new Date().toISOString(),
  }));

  const { error: insertError } = await supabase.from('payroll_monthly').insert(rows);
  if (insertError) throw new Error(`給与データ保存エラー: ${insertError.message}`);
}
