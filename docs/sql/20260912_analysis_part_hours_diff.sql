-- ============================================================
-- 【調査SQL】明石のパート全員（requires_punch=true）について、
-- 2026年 6・7・8・9月支給分の各対象期間で、
-- 旧式（実労働分を15分切り捨て）と新式（DBトリガー方式 = 出勤時刻を
-- 15分切り上げ・退勤時刻を15分切り捨て、そこから休憩を引く）で
-- 日別実労働が変わる日を洗い出す。SELECT のみ。
--
-- 対象期間（パートは前月11日〜当月10日）:
--   2026-06 支給 ← 2026-05-11〜2026-06-10
--   2026-07 支給 ← 2026-06-11〜2026-07-10
--   2026-08 支給 ← 2026-07-11〜2026-08-10
--   2026-09 支給 ← 2026-08-11〜2026-09-10
--
-- 出力列:
--   支給年月・社員コード・氏名・日付・出勤・退勤・休憩・
--   旧式の分・新式の分・差（新 − 旧、負なら新の方が少ない）
-- ============================================================
WITH params(y, m, ps, pe) AS (VALUES
  (2026, 6, DATE '2026-05-11', DATE '2026-06-10'),
  (2026, 7, DATE '2026-06-11', DATE '2026-07-10'),
  (2026, 8, DATE '2026-07-11', DATE '2026-08-10'),
  (2026, 9, DATE '2026-08-11', DATE '2026-09-10')
),
part_emps AS (
  SELECT id, employee_code, full_name
  FROM employees
  WHERE company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
    AND employment_type = 'パート'
    AND COALESCE(requires_punch, true) = true
),
day_calc AS (
  SELECT p.y, p.m,
         e.employee_code, e.full_name,
         ad.attendance_date,
         ad.punch_in, ad.punch_out,
         COALESCE(ad.break_minutes_self_reported, 0) AS brk,
         (EXTRACT(HOUR FROM ad.punch_in)::int  * 60 + EXTRACT(MINUTE FROM ad.punch_in)::int)  AS in_min,
         (EXTRACT(HOUR FROM ad.punch_out)::int * 60 + EXTRACT(MINUTE FROM ad.punch_out)::int) AS out_min
  FROM part_emps e
  CROSS JOIN params p
  JOIN attendance_daily ad
    ON ad.employee_id = e.id
   AND ad.attendance_date BETWEEN p.ps AND p.pe
   AND ad.punch_in  IS NOT NULL
   AND ad.punch_out IS NOT NULL
   AND (ad.is_holiday IS NOT TRUE)
),
calc AS (
  SELECT y, m, employee_code, full_name,
         attendance_date, punch_in, punch_out, brk,
         -- 旧式: FLOOR( max(0, out − in − break) / 15 ) * 15
         (FLOOR(GREATEST(0, out_min - in_min - brk)::numeric / 15) * 15)::int AS old_min,
         -- 新式（DBトリガーと同じ）:
         --   FLOOR(out/15)*15 − CEIL(in/15)*15 − break、負なら0
         GREATEST(0,
           (FLOOR(out_min::numeric  / 15) * 15)::int
         - (CEIL (in_min::numeric   / 15) * 15)::int
         - brk
         ) AS new_min
  FROM day_calc
)
SELECT
  y  AS 支給年,
  m  AS 支給月,
  employee_code  AS 社員コード,
  full_name      AS 氏名,
  attendance_date AS 日付,
  punch_in       AS 出勤,
  punch_out      AS 退勤,
  brk            AS 休憩分,
  old_min        AS 旧式_分,
  new_min        AS 新式_分,
  new_min - old_min AS 差_分
FROM calc
WHERE new_min <> old_min
ORDER BY y, m, employee_code, attendance_date;
