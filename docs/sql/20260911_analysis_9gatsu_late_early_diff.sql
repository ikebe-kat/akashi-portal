-- ============================================================
-- 【調査SQL】9月支給分（正社員のみ・8/1〜8/31）で
-- 遅刻早退控除・欠勤控除の修正前後の差分を確認する。
--
-- 修正前は payroll_monthly.absence_deduction に「欠勤控除+遅刻早退控除」が
-- 合算保存されている。修正後の想定額をここで計算して並べる。
-- （このSQLは SELECT のみ。何も書き換えません。実際の再計算は Preview 側で行うこと。）
--
-- 用語:
--   分母 = その月の所定労働日数 × 8時間
--   分子 = 基本給 + 役職 + 資格 + 扶養（固定残業代・調整手当は含めない）
-- ============================================================
WITH params AS (
  SELECT 2026 AS y, 9 AS m,
         DATE '2026-08-01' AS ps, DATE '2026-08-31' AS pe,
         'e85e40ac-71f7-4918-b2fc-36d877337b74'::uuid AS cid
),
-- 社員ごとの所定日数（休日カレンダーの休日を引く）
sched AS (
  SELECT e.id AS employee_id,
    (SELECT COUNT(*)::int FROM generate_series(p.ps, p.pe, '1 day') d
      WHERE d::date NOT IN (
        SELECT holiday_date FROM holiday_calendars
          WHERE company_id = p.cid
            AND calendar_type = e.holiday_calendar
            AND holiday_date BETWEEN p.ps AND p.pe
      )
    ) AS sched_days
  FROM employees e, params p
  WHERE e.company_id = p.cid AND e.employment_type <> 'パート' AND e.requires_punch = true
),
-- 遅刻・早退・欠勤の集計
kins AS (
  SELECT ad.employee_id,
         SUM(COALESCE(ad.late_minutes,0) + COALESCE(ad.early_leave_minutes,0)) AS late_early_min,
         SUM(CASE WHEN ad.reason = '欠勤' THEN 1 ELSE 0 END) AS absent_days
  FROM attendance_daily ad, params p
  WHERE ad.company_id = p.cid
    AND ad.attendance_date BETWEEN p.ps AND p.pe
    AND (ad.is_holiday IS NOT TRUE)
  GROUP BY ad.employee_id
)
SELECT
  e.employee_code, e.full_name,
  s.sched_days AS 所定日数,
  COALESCE(k.absent_days, 0) AS 欠勤日,
  COALESCE(k.late_early_min, 0) AS 遅刻早退合計分,
  -- 修正前の payroll_monthly に保存されている「欠勤+遅刻早退」合算控除
  pm.absence_deduction AS 現_控除合計,
  pm.total_payment AS 現_支給合計,
  -- 修正後の分子（4項目）
  (COALESCE(pm.base_salary,0) + COALESCE(pm.position_allowance,0)
   + COALESCE(pm.qualification_allowance,0) + COALESCE(pm.dependent_allowance,0)) AS 新_分子_4項目,
  -- 修正後の欠勤控除
  ROUND(
    (COALESCE(pm.base_salary,0) + COALESCE(pm.position_allowance,0)
     + COALESCE(pm.qualification_allowance,0) + COALESCE(pm.dependent_allowance,0))
    * COALESCE(k.absent_days, 0)::numeric
    / NULLIF(s.sched_days, 0), 0) AS 新_欠勤控除,
  -- 修正後の遅刻早退控除
  ROUND(
    (COALESCE(pm.base_salary,0) + COALESCE(pm.position_allowance,0)
     + COALESCE(pm.qualification_allowance,0) + COALESCE(pm.dependent_allowance,0))
    * COALESCE(k.late_early_min, 0)::numeric
    / NULLIF(s.sched_days * 8 * 60, 0), 0) AS 新_遅刻早退控除,
  -- 修正後の合算控除
  ROUND(
    (COALESCE(pm.base_salary,0) + COALESCE(pm.position_allowance,0)
     + COALESCE(pm.qualification_allowance,0) + COALESCE(pm.dependent_allowance,0))
    * (COALESCE(k.absent_days,0)::numeric / NULLIF(s.sched_days, 0)
      + COALESCE(k.late_early_min,0)::numeric / NULLIF(s.sched_days * 8 * 60, 0)), 0
  ) AS 新_控除合計,
  -- 差分（プラス = 追加控除、マイナス = 控除減）
  ROUND(
    (COALESCE(pm.base_salary,0) + COALESCE(pm.position_allowance,0)
     + COALESCE(pm.qualification_allowance,0) + COALESCE(pm.dependent_allowance,0))
    * (COALESCE(k.absent_days,0)::numeric / NULLIF(s.sched_days, 0)
      + COALESCE(k.late_early_min,0)::numeric / NULLIF(s.sched_days * 8 * 60, 0)), 0
  ) - COALESCE(pm.absence_deduction, 0) AS 控除差分
FROM employees e
JOIN sched s ON s.employee_id = e.id
LEFT JOIN kins k ON k.employee_id = e.id
LEFT JOIN payroll_monthly pm
  ON pm.employee_id = e.id AND pm.company_id = e.company_id
 AND pm.target_year = (SELECT y FROM params) AND pm.target_month = (SELECT m FROM params)
WHERE e.company_id = (SELECT cid FROM params)
  AND e.employment_type <> 'パート'
  AND e.requires_punch = true
  AND (COALESCE(k.absent_days,0) > 0 OR COALESCE(k.late_early_min,0) > 0)
ORDER BY e.employee_code;
