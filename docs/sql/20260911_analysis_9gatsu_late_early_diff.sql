-- ============================================================
-- 【調査SQL】9月支給分（正社員・対象期間 2026-08-01〜08-31）で
-- payroll_monthly に保存済みの控除額と、就業規則第30条どおりの新仕様控除額を全員並べる。
--
-- 新仕様（就業規則第30条・改訂前規定＝欠勤3日目から控除）:
--   分子 = 基本給 + 役職手当 + 資格手当 + 固定残業手当 + 扶養手当 + 調整手当
--         （通勤手当・歩合給は含めない）
--   分母 = 1か月平均所定労働時間 = 157.28h（19.66 × 8）
--   控除対象時間 = max(0, 欠勤日数 − 2) × 8 + 遅刻早退の分 / 60
--   控除額 = floor(分子 / 157.28 × 控除対象時間)   -- 単価は丸めず、最終だけ切り捨て
--
-- 対象期間の開始日 (2026-08-01) は 2026-09-01 より前 → 3日目からルール適用。
-- 休職日は絶対控除に含めない（DB の attendance_daily.reason='休職' はデータ側で
-- 別扱い。本SQLでは「reason='欠勤' の日」を欠勤日として数える）。
-- ============================================================
WITH params AS (
  SELECT 2026 AS y, 9 AS m,
         DATE '2026-08-01' AS ps, DATE '2026-08-31' AS pe,
         'e85e40ac-71f7-4918-b2fc-36d877337b74'::uuid AS cid,
         DATE '2026-09-01' AS rev_date,   -- 就業規則第30条改訂日
         157.28::numeric AS unit_hours
),
kins AS (
  SELECT ad.employee_id,
    SUM(CASE WHEN ad.reason = '欠勤' THEN 1 ELSE 0 END) AS absent_days,
    SUM(COALESCE(ad.late_minutes,0) + COALESCE(ad.early_leave_minutes,0)) AS late_early_min
  FROM attendance_daily ad, params p
  WHERE ad.company_id = p.cid
    AND ad.attendance_date BETWEEN p.ps AND p.pe
    AND (ad.is_holiday IS NOT TRUE)
  GROUP BY ad.employee_id
)
SELECT
  e.employee_code,
  e.full_name,
  COALESCE(k.absent_days, 0)     AS 欠勤日数,
  COALESCE(k.late_early_min, 0)  AS 遅刻早退分,
  -- 保存済み（本番）の合算控除額
  COALESCE(pm.absence_deduction, 0) AS 保存済_控除額,
  COALESCE(pm.total_payment, 0)     AS 保存済_支給合計,
  -- 新仕様の分子（6項目）
  (COALESCE(pm.base_salary,0) + COALESCE(pm.position_allowance,0)
   + COALESCE(pm.qualification_allowance,0) + COALESCE(pm.fixed_overtime,0)
   + COALESCE(pm.dependent_allowance,0) + COALESCE(pm.adjustment_allowance,0)) AS 新_分子_6項目,
  -- 新仕様の控除対象時間
  (GREATEST(COALESCE(k.absent_days, 0) - 2, 0) * 8
   + COALESCE(k.late_early_min, 0) / 60.0)::numeric AS 新_控除対象時間,
  -- 新仕様の控除額（floor）
  FLOOR(
    (COALESCE(pm.base_salary,0) + COALESCE(pm.position_allowance,0)
     + COALESCE(pm.qualification_allowance,0) + COALESCE(pm.fixed_overtime,0)
     + COALESCE(pm.dependent_allowance,0) + COALESCE(pm.adjustment_allowance,0))::numeric
    / (SELECT unit_hours FROM params)
    * (GREATEST(COALESCE(k.absent_days, 0) - 2, 0) * 8
       + COALESCE(k.late_early_min, 0) / 60.0)
  ) AS 新_控除額,
  -- 差額（プラス=追加控除、マイナス=返金）
  FLOOR(
    (COALESCE(pm.base_salary,0) + COALESCE(pm.position_allowance,0)
     + COALESCE(pm.qualification_allowance,0) + COALESCE(pm.fixed_overtime,0)
     + COALESCE(pm.dependent_allowance,0) + COALESCE(pm.adjustment_allowance,0))::numeric
    / (SELECT unit_hours FROM params)
    * (GREATEST(COALESCE(k.absent_days, 0) - 2, 0) * 8
       + COALESCE(k.late_early_min, 0) / 60.0)
  ) - COALESCE(pm.absence_deduction, 0) AS 控除差額
FROM employees e
LEFT JOIN kins k ON k.employee_id = e.id
LEFT JOIN payroll_monthly pm
  ON pm.employee_id = e.id
 AND pm.company_id = e.company_id
 AND pm.target_year = (SELECT y FROM params)
 AND pm.target_month = (SELECT m FROM params)
WHERE e.company_id = (SELECT cid FROM params)
  AND e.employment_type <> 'パート'
  AND e.requires_punch = true
ORDER BY e.employee_code;
