-- ============================================================================
-- 明石: attendance_daily の全期間再計算（トリガー calculate_attendance を発火）
--
-- 実行順序:
--   1. 先に 20260912_akashi_actual_hours_trigger.sql（関数の CREATE OR REPLACE）を流す
--   2. その後、本ファイルを流す
--
-- 対象: 明石の company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74' の行だけ。
--       KAT・WC の行には一切 UPDATE をかけない（別会社の値は変えない）。
--
-- 方法: BEFORE UPDATE トリガーを発火させるため、updated_at 列に自分自身を代入
--       する空打ち UPDATE を実行する。punch_in / punch_out / reason は
--       1文字も変えない。
--
-- 実行の流れ（トランザクション制御は SQL Editor で明示的に）:
--   BEGIN;
--   〔本ファイルの本体 SQL 群を流す〕
--   〔集計結果を確認〕
--   -- 問題なければ:
--   COMMIT;
--   -- 問題があれば:
--   ROLLBACK;
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1) 更新前スナップショット（明石のみ）
-- ─────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS _akashi_attendance_snap;
CREATE TEMP TABLE _akashi_attendance_snap AS
SELECT
  id,
  employee_id,
  attendance_date,
  reason,
  actual_hours     AS ah_before,
  scheduled_hours  AS sh_before,
  overtime_hours   AS oh_before,
  over_under       AS ou_before,
  break_minutes    AS brk_before,
  late_minutes     AS lm_before,
  early_leave_minutes AS em_before
FROM attendance_daily
WHERE company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74';

-- 前状態の件数
SELECT
  COUNT(*)                                             AS total_rows,
  COUNT(*) FILTER (WHERE ah_before IS NOT NULL)        AS actual_hours_not_null,
  COUNT(*) FILTER (WHERE reason LIKE '%有給（全日）%') AS full_paid_rows,
  COUNT(*) FILTER (WHERE reason LIKE '%欠勤%')         AS kekkin_rows,
  COUNT(*) FILTER (WHERE reason LIKE '%公休%')         AS kokyu_rows
FROM _akashi_attendance_snap;

-- ─────────────────────────────────────────────────────────────────
-- 2) トリガー発火（明石のみ空打ち UPDATE）
--    updated_at に自身を代入して BEFORE UPDATE を通す。
--    punch_in / punch_out / reason は触らない。
-- ─────────────────────────────────────────────────────────────────
UPDATE attendance_daily
SET updated_at = updated_at
WHERE company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74';

-- 影響行数（明石の全レコード数と一致するはず）
-- Postgres は UPDATE の後に自動で ROW_COUNT を確認できないが、上の CREATE TEMP TABLE
-- で件数を保持しているので、下の集計で確認する。

-- ─────────────────────────────────────────────────────────────────
-- 3) 更新前後の差分集計
-- ─────────────────────────────────────────────────────────────────
SELECT
  COUNT(*)                                                                              AS total_akashi_rows,
  COUNT(*) FILTER (WHERE s.ah_before  IS DISTINCT FROM ad.actual_hours)                AS actual_hours_changed,
  COUNT(*) FILTER (WHERE s.sh_before  IS DISTINCT FROM ad.scheduled_hours)             AS scheduled_hours_changed,
  COUNT(*) FILTER (WHERE s.oh_before  IS DISTINCT FROM ad.overtime_hours)              AS overtime_hours_changed,
  COUNT(*) FILTER (WHERE s.ou_before  IS DISTINCT FROM ad.over_under)                  AS over_under_changed,
  COUNT(*) FILTER (WHERE s.brk_before IS DISTINCT FROM ad.break_minutes)               AS break_minutes_changed,
  COUNT(*) FILTER (WHERE s.lm_before  IS DISTINCT FROM ad.late_minutes)                AS late_minutes_changed,
  COUNT(*) FILTER (WHERE s.em_before  IS DISTINCT FROM ad.early_leave_minutes)         AS early_leave_minutes_changed
FROM _akashi_attendance_snap s
JOIN attendance_daily ad ON ad.id = s.id;

-- ─────────────────────────────────────────────────────────────────
-- 4) actual_hours が変わった行の reason 別内訳
--    （期待: 「有給（全日）」の行のみで actual_hours が 8.00→0.00 / 所定→0.00 に変わる）
-- ─────────────────────────────────────────────────────────────────
SELECT
  ad.reason,
  COUNT(*)                              AS n_rows,
  COUNT(DISTINCT ad.employee_id)        AS n_employees,
  MIN(s.ah_before)                      AS min_ah_before,
  MAX(s.ah_before)                      AS max_ah_before,
  MIN(ad.actual_hours)                  AS min_ah_after,
  MAX(ad.actual_hours)                  AS max_ah_after
FROM _akashi_attendance_snap s
JOIN attendance_daily ad ON ad.id = s.id
WHERE s.ah_before IS DISTINCT FROM ad.actual_hours
GROUP BY ad.reason
ORDER BY n_rows DESC;

-- ─────────────────────────────────────────────────────────────────
-- 5) 変わった行のサンプル（有給日を中心に20件）
-- ─────────────────────────────────────────────────────────────────
SELECT
  e.employee_code,
  e.employment_type,
  ad.attendance_date,
  ad.reason,
  s.ah_before  AS actual_before,
  ad.actual_hours AS actual_after,
  s.sh_before  AS sched_before,
  ad.scheduled_hours AS sched_after
FROM _akashi_attendance_snap s
JOIN attendance_daily ad ON ad.id = s.id
JOIN employees e ON e.id = ad.employee_id
WHERE s.ah_before IS DISTINCT FROM ad.actual_hours
ORDER BY ad.attendance_date DESC, e.employee_code
LIMIT 20;

-- ─────────────────────────────────────────────────────────────────
-- 6) 期待外の変化がないかの検算
--    「有給（全日）以外」で actual_hours が変わった行があれば警戒（0 行のはず）
-- ─────────────────────────────────────────────────────────────────
SELECT
  ad.reason,
  COUNT(*)                       AS suspicious_rows
FROM _akashi_attendance_snap s
JOIN attendance_daily ad ON ad.id = s.id
WHERE s.ah_before IS DISTINCT FROM ad.actual_hours
  AND (ad.reason IS NULL OR ad.reason NOT LIKE '%有給（全日）%')
GROUP BY ad.reason
ORDER BY suspicious_rows DESC;

-- ─────────────────────────────────────────────────────────────────
-- 確認して問題なければ COMMIT、期待外の変化があれば ROLLBACK して原因調査:
--   COMMIT;
--   -- または
--   ROLLBACK;
-- ─────────────────────────────────────────────────────────────────
