-- 調整手当・通勤手当・資格手当の実額オーバーライドを employee_payroll_config に追加
-- null = 従来通りマスタ計算、値あり = 実額優先

ALTER TABLE employee_payroll_config
  ADD COLUMN IF NOT EXISTS adjustment_allowance numeric,
  ADD COLUMN IF NOT EXISTS commute_allowance_override numeric,
  ADD COLUMN IF NOT EXISTS qualification_allowance_override numeric;

-- 正社員24名に賃金台帳 R8.4/R8.5 の実額を投入
UPDATE employee_payroll_config epc
SET
  commute_allowance_override  = v.commute,
  qualification_allowance_override = v.qualification,
  adjustment_allowance        = v.adjustment
FROM employees e,
(VALUES
  ('DA001',  4000,     0, 26000),
  ('DA002', 11000,     0,     0),
  ('DA003',  4000,     0, 12000),
  ('DA004', 10000,     0,     0),
  ('DA005', 12000, 17000,     0),
  ('DA006',  8000, 14000,     0),
  ('DA007',  4000,  2000,     0),
  ('DA008',  4000,     0,     0),
  ('DA009', 14000,  2000,     0),
  ('DA010',  5000,     0,     0),
  ('DA011',  4000, 17000, 10000),
  ('DA012',  4000,     0, 50000),
  ('DA013',  6000, 18000, 15000),
  ('DA014',  8000, 17000, 33900),
  ('DA016',  4000,  2000,     0),
  ('DA017',  4000,     0, 40000),
  ('DA018',     0,     0,     0),
  ('DA019',  6000,     0, 38000),
  ('DA020',  4000,     0,     0),
  ('DA021',  4000,     0, 25000),
  ('DA022',  6000,     0,     0),
  ('DA033',  5000, 14000,     0),
  ('DA034',  6000,  2000,     0),
  ('DA035',  4000,     0, 55000)
) AS v(code, commute, qualification, adjustment)
WHERE e.employee_code = v.code
  AND epc.employee_id = e.id;
