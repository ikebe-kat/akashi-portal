// lib/payroll/configFields.ts
// 「画面の列名 ⇔ employee_payroll_config のカラム名」対応表
// PayrollSub.tsx と calculatePayroll.ts の両方がここを参照する。
// 項目を1つ足すときここだけ直せば両方に効く。

export interface ConfigFieldDef {
  uiField: string;
  configColumn: string;
  fallback?: 'qualifications' | 'commute_distance' | 'dependents_count';
}

export const FT_CONFIG_FIELDS: ConfigFieldDef[] = [
  { uiField: 'base_salary', configColumn: 'base_salary_override' },
  { uiField: 'position_allowance', configColumn: 'position_allowance_override' },
  { uiField: 'qualification_allowance', configColumn: 'qualification_allowance_override', fallback: 'qualifications' },
  { uiField: 'commute_allowance', configColumn: 'commute_allowance_override', fallback: 'commute_distance' },
  { uiField: 'dependent_allowance', configColumn: 'dependent_allowance_override', fallback: 'dependents_count' },
  { uiField: 'fixed_overtime', configColumn: 'fixed_overtime_amount' },
  { uiField: 'adjustment_allowance', configColumn: 'adjustment_allowance' },
];

export const PT_CONFIG_FIELDS: ConfigFieldDef[] = [
  { uiField: 'hourly_rate_weekday', configColumn: 'hourly_wage_weekday' },
  { uiField: 'hourly_rate_saturday', configColumn: 'hourly_wage_saturday' },
  { uiField: 'hourly_rate_sunday', configColumn: 'hourly_wage_sunday' },
];

export function buildUiToConfigMap(fields: ConfigFieldDef[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of fields) map[f.uiField] = f.configColumn;
  return map;
}

export function buildConfigToUiMap(fields: ConfigFieldDef[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of fields) map[f.configColumn] = f.uiField;
  return map;
}
