-- employee_payroll_config の NOT NULL 制約を確認するクエリ
-- Supabase SQL Editor で実行する

SELECT column_name, is_nullable, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'employee_payroll_config'
  AND table_schema = 'public'
ORDER BY ordinal_position;
