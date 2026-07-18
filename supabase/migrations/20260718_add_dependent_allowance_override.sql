-- 扶養手当の実額オーバーライドを employee_payroll_config に追加
-- null = 従来通り dependents_count × 5000 にフォールバック

ALTER TABLE employee_payroll_config
  ADD COLUMN IF NOT EXISTS dependent_allowance_override numeric;
