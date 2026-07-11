// lib/payroll/types.ts
// akashi-portal 給与計算用の型定義

export interface PayrollConfig {
  employee_id: string;
  employee_code: string;
  employee_name: string;
  employment_type: string; // '正社員' | 'パート' | '特定技能' | '技能実習' | '代表取締役'
  store_id: string;
  is_active: boolean;
  requires_punch: boolean;
  hire_date: string | null; // 'YYYY-MM-DD' — 対象期間末日より後ならスキップ判定に使う

  // 正社員用
  base_salary: number;
  position_allowance: number;
  qualification_allowance: number;
  commute_allowance: number;
  dependent_allowance: number;
  fixed_overtime_amount: number;
  fixed_overtime_hours: number;
  salary_grade: string | null; // S/A/B/C/D

  // 休日カレンダー種別
  holiday_calendar: string | null;

  // パート用（曜日別時給）
  hourly_rate_weekday: number | null;
  hourly_rate_saturday: number | null;
  hourly_rate_sunday: number | null;

  // 通勤手当（パート日割用）
  commute_allowance_daily_divisor: number; // 21固定
  commute_daily_amount: number | null; // payroll_commute_master.daily_amount（パート日割）
  commute_distance_km: number | null;
}

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  attendance_date: string; // 'YYYY-MM-DD'
  punch_in: string | null;
  punch_out: string | null;
  break_minutes: number | null;              // 既存（正社員用、トリガー管理）
  break_minutes_self_reported: number | null; // パート申告
  reason: string | null;                     // 事由（有給/代休/欠勤等）
  is_holiday: boolean | null;
  scheduled_hours: number | null;            // 所定労働時間（トリガー算出）
  late_minutes: number | null;               // 遅刻分（トリガー算出）
  early_leave_minutes: number | null;        // 早退分（トリガー算出）
}

export interface DailyCalc {
  date: string;
  dayOfWeek: number; // 0=日, 1=月, ..., 6=土
  clockIn: string | null;
  clockOut: string | null;
  workMinutes: number;       // 実労働時間（分）
  overtimeMinutes: number;   // 残業時間（分）
  breakMinutes: number;
  isHoliday: boolean;        // 休日カレンダー上の休日か
  isAbsent: boolean;         // 欠勤か
  hasLeave: boolean;         // 有給か
  leaveType: string | null;
  hasWarning: boolean;
  warningMessage: string | null;
  // パート用
  appliedHourlyRate: number | null;
}

export interface PayrollResult {
  employee_id: string;
  payroll_year_month: string;
  employment_type: string;
  period_start: string;
  period_end: string;

  // 勤怠集計
  work_days: number;
  total_work_minutes: number;
  overtime_minutes: number;
  absence_days: number;

  // パート曜日別
  weekday_minutes: number;
  saturday_minutes: number;
  sunday_minutes: number;
  hourly_rate_weekday: number | null;
  hourly_rate_saturday: number | null;
  hourly_rate_sunday: number | null;

  // 正社員計算過程
  overtime_unit_price: number;
  monthly_standard_hours: number;
  fixed_overtime_hours: number;

  // 支給
  base_salary: number;
  position_allowance: number;
  qualification_allowance: number;
  commute_allowance: number;
  dependent_allowance: number;
  fixed_overtime_amount: number;
  excess_overtime_amount: number;
  adjustment_amount: number;

  // 控除
  absence_deduction: number;

  // 有給
  paid_leave_days: number;
  paid_leave_amount: number;

  // 合計
  gross_total: number;

  // フラグ
  has_warning: boolean;
  warning_details: string[];
  is_manual_adjusted: boolean;

  // 表示用
  employee_code: string;
  employee_name: string;
  daily_details: DailyCalc[];
}

// 計算実行時のパラメータ
export interface PayrollCalcParams {
  yearMonth: string; // 支給年月 '2026-04'
}

// payroll_monthly のDB保存用（daily_details, employee_code, employee_name除外）
export type PayrollMonthlyRow = Omit<PayrollResult, 'employee_code' | 'employee_name' | 'daily_details'> & {
  company_id: string;
  calculated_at: string;
  warning_details: string[]; // jsonb
};
