-- ============================================================
-- 明石西 有給自動付与 dry-run（確認用）
-- 作成日: 2026-05-11
-- 目的: 自動付与が動いた場合の対象者・付与日数を事前確認
-- ============================================================
-- ※ このSQLはデータを一切変更しません（SELECTのみ）
-- ※ akashi_auto_grant.sql の PART 1（ヘルパー関数）を
--    先に実行してからこちらを実行してください
-- ============================================================

-- ■■■ DRY-RUN 1: 初回付与対象者 ■■■
-- paid_leave_grantsにレコードが1件もない社員のみ対象
-- （既にExcel等で管理済みの社員は除外）
SELECT
  e.employee_code,
  e.full_name,
  e.employment_type,
  COALESCE(e.weekly_work_days, 5) AS weekly_work_days,
  e.hire_date,
  (e.hire_date + INTERVAL '6 months')::DATE AS grant_date,
  akashi_get_grant_days(COALESCE(e.weekly_work_days, 5), 0) AS grant_days,
  ((e.hire_date + INTERVAL '6 months') + INTERVAL '2 years')::DATE AS expiry_date,
  e.paid_leave_grant_date AS current_paid_leave_grant_date
FROM employees e
WHERE e.company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
  AND e.is_active = true
  AND e.employee_code LIKE 'DA%'
  AND e.employment_type != '代表取締役'
  AND e.hire_date IS NOT NULL
  AND (e.hire_date + INTERVAL '6 months')::DATE <= (now() AT TIME ZONE 'Asia/Tokyo')::DATE
  AND NOT EXISTS (
    SELECT 1 FROM paid_leave_grants g
    WHERE g.employee_id = e.id
  )
ORDER BY e.employee_code;


-- ■■■ DRY-RUN 2: 年次付与対象者（次の4/1で付与される社員） ■■■
-- ※ 直近の4/1を基準に計算
SELECT
  e.employee_code,
  e.full_name,
  e.employment_type,
  COALESCE(e.weekly_work_days, 5) AS weekly_work_days,
  e.hire_date,
  make_date(
    CASE WHEN EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Tokyo')::DATE) >= 4
         THEN EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Tokyo')::DATE)::INT
         ELSE EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Tokyo')::DATE)::INT - 1
    END, 4, 1
  ) AS this_april,
  (CASE WHEN EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Tokyo')::DATE) >= 4
        THEN EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Tokyo')::DATE)
        ELSE EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Tokyo')::DATE) - 1
   END - EXTRACT(YEAR FROM e.hire_date)) * 12
  + (4 - EXTRACT(MONTH FROM e.hire_date)) AS months_from_hire,
  akashi_get_grant_index(
    ((CASE WHEN EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Tokyo')::DATE) >= 4
           THEN EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Tokyo')::DATE)
           ELSE EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Tokyo')::DATE) - 1
      END - EXTRACT(YEAR FROM e.hire_date)) * 12
    + (4 - EXTRACT(MONTH FROM e.hire_date)))::INT
  ) AS grant_index,
  akashi_get_grant_days(
    COALESCE(e.weekly_work_days, 5),
    akashi_get_grant_index(
      ((CASE WHEN EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Tokyo')::DATE) >= 4
             THEN EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Tokyo')::DATE)
             ELSE EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Tokyo')::DATE) - 1
        END - EXTRACT(YEAR FROM e.hire_date)) * 12
      + (4 - EXTRACT(MONTH FROM e.hire_date)))::INT
    )
  ) AS grant_days,
  make_date(
    CASE WHEN EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Tokyo')::DATE) >= 4
         THEN EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Tokyo')::DATE)::INT + 2
         ELSE EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Tokyo')::DATE)::INT + 1
    END, 3, 31
  ) AS expiry_date
FROM employees e
WHERE e.company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
  AND e.is_active = true
  AND e.employee_code LIKE 'DA%'
  AND e.employment_type != '代表取締役'
  AND e.hire_date IS NOT NULL
  AND (e.hire_date + INTERVAL '6 months')::DATE <=
      make_date(
        CASE WHEN EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Tokyo')::DATE) >= 4
             THEN EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Tokyo')::DATE)::INT
             ELSE EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Tokyo')::DATE)::INT - 1
        END, 4, 1
      )
ORDER BY e.employee_code;


-- ■■■ DRY-RUN 3: 失効対象レコード（expiry_date < 今日） ■■■
SELECT
  e.employee_code,
  e.full_name,
  g.grant_date,
  g.grant_days,
  g.remaining_days,
  g.expiry_date
FROM paid_leave_grants g
JOIN employees e ON e.id = g.employee_id
WHERE g.company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
  AND g.is_expired = false
  AND g.expiry_date < (now() AT TIME ZONE 'Asia/Tokyo')::DATE
ORDER BY e.employee_code, g.grant_date;


-- ■■■ DRY-RUN 4: 現在の全有給レコード一覧（参考） ■■■
SELECT
  e.employee_code,
  e.full_name,
  e.employment_type,
  COALESCE(e.weekly_work_days, 5) AS weekly_work_days,
  e.hire_date,
  g.grant_date,
  g.grant_days,
  g.remaining_days,
  g.expiry_date,
  g.is_expired,
  CASE
    WHEN g.grant_date = '2026-04-01' THEN 'R8付与'
    WHEN g.grant_date < '2026-04-01' THEN 'R7繰越'
    ELSE 'その他'
  END AS slot_label
FROM paid_leave_grants g
JOIN employees e ON e.id = g.employee_id
WHERE g.company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
  AND e.employee_code LIKE 'DA%'
ORDER BY e.employee_code, g.grant_date;
