-- ============================================================
-- 【調査SQL】2026年 6・7・8月支給分（正社員）を、当時の就業規則どおりに
-- 計算し直し、payroll_monthly に保存済みの控除額との差を全員分出す。
--
-- 当時の就業規則（＝改訂前規定）:
--   分子 = 基本給 + 役職手当 + 資格手当 + 固定残業手当 + 扶養手当 + 調整手当
--   分母 = 157.28 時間（19.66 × 8、毎月同じ）
--   欠勤日数が3日以上なら (欠勤日数 − 2)日、2日以下なら 0日を控除対象
--   遅刻・早退は1回目から全部控除（1回目免除の穴を修正）
--   控除額 = floor(分子 / 157.28 × 控除対象時間)
--
-- 対象期間（正社員：前月1日〜末日）:
--   2026-06 支給 ← 2026-05-01〜2026-05-31
--   2026-07 支給 ← 2026-06-01〜2026-06-30
--   2026-08 支給 ← 2026-07-01〜2026-07-31
--
-- 出力:
--   支給月・社員コード・氏名・欠勤日数・遅刻早退分・保存済み控除額・
--   就業規則どおりの控除額・差額（プラス=追加控除／マイナス=返金）
-- ============================================================
WITH months(y, m, period_start, period_end) AS (VALUES
  (2026, 6, DATE '2026-05-01', DATE '2026-05-31'),
  (2026, 7, DATE '2026-06-01', DATE '2026-06-30'),
  (2026, 8, DATE '2026-07-01', DATE '2026-07-31')
),
kins AS (
  SELECT m.y, m.m, ad.employee_id,
    SUM(CASE WHEN ad.reason = '欠勤' THEN 1 ELSE 0 END) AS absent_days,
    SUM(COALESCE(ad.late_minutes,0) + COALESCE(ad.early_leave_minutes,0)) AS late_early_min
  FROM attendance_daily ad
  JOIN months m ON ad.attendance_date BETWEEN m.period_start AND m.period_end
  WHERE ad.company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
    AND (ad.is_holiday IS NOT TRUE)
  GROUP BY m.y, m.m, ad.employee_id
)
SELECT
  m.y AS 支給年,
  m.m AS 支給月,
  e.employee_code,
  e.full_name,
  COALESCE(k.absent_days, 0)    AS 欠勤日数,
  COALESCE(k.late_early_min, 0) AS 遅刻早退分,
  COALESCE(pm.absence_deduction, 0) AS 保存済_控除額,
  FLOOR(
    (COALESCE(pm.base_salary,0) + COALESCE(pm.position_allowance,0)
     + COALESCE(pm.qualification_allowance,0) + COALESCE(pm.fixed_overtime,0)
     + COALESCE(pm.dependent_allowance,0) + COALESCE(pm.adjustment_allowance,0))::numeric
    / 157.28
    * (GREATEST(COALESCE(k.absent_days, 0) - 2, 0) * 8
       + COALESCE(k.late_early_min, 0) / 60.0)
  ) AS 就業規則どおり_控除額,
  FLOOR(
    (COALESCE(pm.base_salary,0) + COALESCE(pm.position_allowance,0)
     + COALESCE(pm.qualification_allowance,0) + COALESCE(pm.fixed_overtime,0)
     + COALESCE(pm.dependent_allowance,0) + COALESCE(pm.adjustment_allowance,0))::numeric
    / 157.28
    * (GREATEST(COALESCE(k.absent_days, 0) - 2, 0) * 8
       + COALESCE(k.late_early_min, 0) / 60.0)
  ) - COALESCE(pm.absence_deduction, 0) AS 差額
FROM months m
CROSS JOIN employees e
LEFT JOIN kins k
  ON k.y = m.y AND k.m = m.m AND k.employee_id = e.id
LEFT JOIN payroll_monthly pm
  ON pm.employee_id = e.id
 AND pm.company_id = e.company_id
 AND pm.target_year = m.y AND pm.target_month = m.m
WHERE e.company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
  AND e.employment_type <> 'パート'
  AND e.requires_punch = true
  AND pm.id IS NOT NULL
  -- 差が出る人だけ（controle なしの人は 0 − 0 = 0 で 0 差）
  AND (COALESCE(k.absent_days, 0) > 0 OR COALESCE(k.late_early_min, 0) > 0
       OR COALESCE(pm.absence_deduction, 0) <> 0)
ORDER BY m.y, m.m, e.employee_code;
