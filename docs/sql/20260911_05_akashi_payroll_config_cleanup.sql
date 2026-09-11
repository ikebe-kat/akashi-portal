-- ============================================================
-- 明石: employee_payroll_config のクリーンアップ
--   1) shift_type カラムの既定値を 'work' に設定し、既存 NULL を埋める
--   2) employment_category カラムを DROP
--
-- 事前確認（KAT・WORLDCLUB のリポジトリで employment_category の参照が
--   0件であることを GitHub 検索で確認済み。3社の共通DB上で使われていない。）
--
-- 3社共通で使われるカラムは触らない:
--   - employees.holiday_pattern（KATの選択休が参照）
--   - hope_holiday_quotas テーブル（KATの選択休が参照）
-- ============================================================

-- 実行前の確認:
--   SELECT column_name, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'employee_payroll_config'
--     AND column_name IN ('shift_type','employment_category')
--   ORDER BY column_name;

-- 1) shift_type の既定値を 'work' に。
--    未設定行に既定値を反映するには一度 UPDATE が必要（DEFAULT は新規行にしか効かない）。
ALTER TABLE public.employee_payroll_config
  ALTER COLUMN shift_type SET DEFAULT 'work';

UPDATE public.employee_payroll_config
SET shift_type = 'work'
WHERE shift_type IS NULL;

-- 2) employment_category カラムを DROP。
--    KAT・WORLDCLUB のコードに参照がないため 3 社ともに影響なし。
ALTER TABLE public.employee_payroll_config
  DROP COLUMN IF EXISTS employment_category;

-- 実行後の確認:
--   SELECT column_name, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'employee_payroll_config'
--     AND column_name = 'shift_type';
--   → column_default が 'work'::text になっていること。
--
--   SELECT COUNT(*)
--   FROM information_schema.columns
--   WHERE table_name = 'employee_payroll_config'
--     AND column_name = 'employment_category';
--   → 0 になっていること。
