// lib/holidayFetch.ts
// 社員の休日（employees.holiday_calendar → holiday_calendars.holiday_date）を取得する共通関数。
// AttendanceTab / AdminTab（3箇所）/ calculatePayroll / SharoushiSub は全てここを使う。
// 判定条件（company_id 一致 + calendar_type 一致 + holiday_date が期間内）は現状踏襲。取得処理を集めるだけ。

import { supabase } from '@/lib/supabase';

/** カレンダー種別 → その期間内の休日日付Set */
export type HolidaysByCalendarType = Map<string, Set<string>>;

/**
 * 指定会社の指定期間の休日を、カレンダー種別ごとの日付Setで返す。
 * カレンダー種別を絞りたい場合は calendarTypes を渡す（省略なら全種別）。
 * 呼び出し側はこの Map から `emp.holiday_calendar` をキーに引く。
 */
export async function fetchHolidaysByCalendarType(
  companyId: string,
  startDate: string,
  endDate: string,
  calendarTypes?: string[],
): Promise<HolidaysByCalendarType> {
  let q = supabase.from('holiday_calendars')
    .select('holiday_date, calendar_type')
    .eq('company_id', companyId)
    .gte('holiday_date', startDate)
    .lte('holiday_date', endDate);
  if (calendarTypes && calendarTypes.length > 0) {
    q = q.in('calendar_type', calendarTypes);
  }
  const { data, error } = await q;
  if (error) throw new Error(`休日カレンダー取得エラー: ${error.message}`);
  const byType: HolidaysByCalendarType = new Map();
  for (const r of (data || [])) {
    if (!byType.has(r.calendar_type)) byType.set(r.calendar_type, new Set());
    byType.get(r.calendar_type)!.add(r.holiday_date);
  }
  return byType;
}

/**
 * 1社員ぶんの休日日付Setを取得（holiday_calendar が null なら空Set）。
 */
export async function fetchHolidaysForEmployee(
  companyId: string,
  holidayCalendar: string | null,
  startDate: string,
  endDate: string,
): Promise<Set<string>> {
  if (!holidayCalendar) return new Set<string>();
  const byType = await fetchHolidaysByCalendarType(companyId, startDate, endDate, [holidayCalendar]);
  return byType.get(holidayCalendar) || new Set<string>();
}

/**
 * 1社員ぶんの、特定日の休日判定（AdminTab 日次一覧などのピンポイント判定用）。
 * 内部的には calendar_type だけを絞り込む軽量クエリ。
 */
export async function fetchHolidayCalendarTypesOnDate(
  companyId: string,
  date: string,
  calendarTypes: string[],
): Promise<Set<string>> {
  if (calendarTypes.length === 0) return new Set<string>();
  const { data, error } = await supabase.from('holiday_calendars')
    .select('calendar_type')
    .eq('company_id', companyId)
    .eq('holiday_date', date)
    .in('calendar_type', calendarTypes);
  if (error) throw new Error(`休日カレンダー取得エラー: ${error.message}`);
  return new Set((data || []).map((r: any) => r.calendar_type));
}
