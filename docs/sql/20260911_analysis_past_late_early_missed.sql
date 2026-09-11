-- ============================================================
-- 【調査SQL】過去の締め（2026年6月・7月・8月支給分）で
-- 旧ロジック（イベント1回目免除）により漏れていた遅刻早退控除の一覧。
--
-- 支給月と対象勤怠期間（正社員は前月1日〜末日）:
--   2026-06 支給 ← 2026-05-01〜2026-05-31
--   2026-07 支給 ← 2026-06-01〜2026-06-30
--   2026-08 支給 ← 2026-07-01〜2026-07-31
--
-- 旧ロジックの穴:
--   ・イベント（同日の「遅刻」「早退」を別カウント）が1回だけの人 → 全額漏れ
--   ・イベントが2回以上でも「最初の1回分」は免除されていた → 部分漏れ
--
-- このSQLは SELECT のみ。精算するかは別途判断してください。
-- ============================================================
WITH months(y, m, period_start, period_end) AS (VALUES
  (2026, 6, DATE '2026-05-01', DATE '2026-05-31'),
  (2026, 7, DATE '2026-06-01', DATE '2026-06-30'),
  (2026, 8, DATE '2026-07-01', DATE '2026-07-31')
),
day_events AS (
  SELECT m.y, m.m, m.period_start, m.period_end,
         ad.employee_id, ad.attendance_date,
         'late'::text AS kind, COALESCE(ad.late_minutes,0) AS mins
  FROM attendance_daily ad
  JOIN months m ON ad.attendance_date BETWEEN m.period_start AND m.period_end
  WHERE ad.company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
    AND (ad.is_holiday IS NOT TRUE)
    AND COALESCE(ad.late_minutes,0) > 0
  UNION ALL
  SELECT m.y, m.m, m.period_start, m.period_end,
         ad.employee_id, ad.attendance_date,
         'early'::text AS kind, COALESCE(ad.early_leave_minutes,0) AS mins
  FROM attendance_daily ad
  JOIN months m ON ad.attendance_date BETWEEN m.period_start AND m.period_end
  WHERE ad.company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
    AND (ad.is_holiday IS NOT TRUE)
    AND COALESCE(ad.early_leave_minutes,0) > 0
),
numbered AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY y, m, employee_id ORDER BY attendance_date, kind) AS rn,
    COUNT(*)     OVER (PARTITION BY y, m, employee_id)                                AS ev_cnt,
    SUM(mins)    OVER (PARTITION BY y, m, employee_id)                                AS total_min
  FROM day_events
),
first_mins AS (
  SELECT y, m, employee_id, mins AS first_mins
  FROM numbered WHERE rn = 1
),
per_emp AS (
  SELECT n.y, n.m, n.period_start, n.period_end, n.employee_id,
         MAX(n.ev_cnt) AS ev_cnt,
         MAX(n.total_min) AS total_min,
         MAX(f.first_mins) AS first_mins
  FROM numbered n
  JOIN first_mins f ON f.y = n.y AND f.m = n.m AND f.employee_id = n.employee_id
  GROUP BY n.y, n.m, n.period_start, n.period_end, n.employee_id
),
sched_days AS (
  SELECT p.y, p.m, e.id AS employee_id,
    (SELECT COUNT(*)::int FROM generate_series(p.period_start, p.period_end, '1 day') d
      WHERE d::date NOT IN (
        SELECT holiday_date FROM holiday_calendars
          WHERE company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
            AND calendar_type = e.holiday_calendar
            AND holiday_date BETWEEN p.period_start AND p.period_end
      )
    ) AS sched_days
  FROM per_emp p
  JOIN employees e ON e.id = p.employee_id
)
SELECT
  p.y AS 支給年, p.m AS 支給月,
  e.employee_code, e.full_name,
  p.ev_cnt AS 遅刻早退回数,
  p.total_min AS 遅刻早退合計分,
  p.first_mins AS 旧_免除された1回目分,
  CASE WHEN p.ev_cnt <= 1 THEN p.total_min
       ELSE p.first_mins END AS 漏れていた分,
  sd.sched_days AS 所定日数,
  ROUND(
    (COALESCE(pm.base_salary,0) + COALESCE(pm.position_allowance,0)
     + COALESCE(pm.qualification_allowance,0) + COALESCE(pm.dependent_allowance,0))
    * (CASE WHEN p.ev_cnt <= 1 THEN p.total_min ELSE p.first_mins END)::numeric
    / NULLIF(sd.sched_days * 8 * 60, 0), 0
  ) AS 追加控除見込
FROM per_emp p
JOIN employees e ON e.id = p.employee_id
JOIN sched_days sd ON sd.y = p.y AND sd.m = p.m AND sd.employee_id = p.employee_id
LEFT JOIN payroll_monthly pm
  ON pm.employee_id = e.id
 AND pm.company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
 AND pm.target_year = p.y AND pm.target_month = p.m
WHERE e.company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
  AND e.employment_type <> 'パート'
  AND e.requires_punch = true
  AND (p.ev_cnt <= 1 OR (p.ev_cnt > 1 AND p.first_mins > 0))
ORDER BY p.y, p.m, e.employee_code;
