// lib/akashiOptions.ts
// 明石ポータルの「休日カレンダー」「勤務パターン」選択肢の唯一の出どころ。
// SettingsSub・EmployeeManageSub・EntryApplicationsSub が全てここを参照する。
// DBに登録されている calendar_type / work_patterns.pattern_code を正としており、
// 過去のようにハードコードで DB と食い違わせない。

import { supabase } from '@/lib/supabase';

/** 明石で使う休日カレンダー（コード=DB値, label=画面表示） */
export const AKASHI_HOLIDAY_CALENDARS: { code: string; label: string }[] = [
  { code: 'akashi_seishain_a', label: '正社員A' },
  { code: 'akashi_lab',        label: 'ラボ' },
];

/** コード→表示名。null なら未設定として "—" を返す */
export function labelOfHolidayCalendar(code: string | null | undefined): string {
  if (!code) return '—';
  const hit = AKASHI_HOLIDAY_CALENDARS.find(c => c.code === code);
  return hit ? hit.label : code;
}

export interface WorkPatternOption {
  code: string;             // work_patterns.pattern_code（例: 0900-1800-akashi-seishain）
  scheduled_hours: number;  // 所定労働時間（h）
}

/** 会社IDで work_patterns から動的取得。UIの選択肢は必ずこの結果を使う。 */
export async function fetchWorkPatterns(companyId: string): Promise<WorkPatternOption[]> {
  const { data, error } = await supabase
    .from('work_patterns')
    .select('pattern_code, scheduled_hours')
    .eq('company_id', companyId)
    .order('pattern_code');
  if (error) throw new Error(`work_patterns取得エラー: ${error.message}`);
  return (data || []).map((r: any) => ({
    code: r.pattern_code,
    scheduled_hours: Number(r.scheduled_hours) || 0,
  }));
}
