-- employee_payroll_config の RLS ポリシー確認・追加
-- 既存ポリシーが無い場合に実行する

-- 確認クエリ:
-- SELECT * FROM pg_policies WHERE tablename = 'employee_payroll_config';

-- ポリシーが無い場合の追加（既存作法 = allow_all に合わせる）:
-- ALTER TABLE employee_payroll_config ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "allow_all" ON employee_payroll_config FOR ALL USING (true) WITH CHECK (true);
