-- ============================================================================
-- 明石: attendance_daily の全期間再計算（トリガー calculate_attendance を発火）
--
-- 実行順序:
--   1. 先に 20260912_akashi_actual_hours_trigger.sql（関数の CREATE OR REPLACE）を流す
--   2. その後、本ファイルを流す
--
-- 対象: 明石の company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74' の行だけ。
--       KAT・WC の行には一切 UPDATE をかけない。
--
-- 方法: BEFORE UPDATE トリガーを発火させるため updated_at 列に自分自身を
--       代入する空打ち UPDATE を実行する。punch_in / punch_out / reason は
--       1文字も触らない。TEMP TABLE を使わず、CTE 1本で更新前値の保存・
--       UPDATE 実行・集計・reason 別内訳・サンプル・検算をまとめて返す。
--
-- 実行:
--   BEGIN;
--   〔本ファイルの単一ステートメントを流す〕
--   -- 返ってきた JSON の 'summary' / 'reason_breakdown' / 'samples' /
--   -- 'suspicious' を確認し、問題なければ:
--   COMMIT;
--   -- 期待外の変化があれば:
--   ROLLBACK;
-- ============================================================================

WITH
-- 更新前の状態を保持（CTE のスコープ内でだけ生きるので TEMP TABLE 不要）
before_state AS (
  SELECT id,
         employee_id,
         attendance_date,
         reason,
         actual_hours        AS ah_before,
         scheduled_hours     AS sh_before,
         overtime_hours      AS oh_before,
         over_under          AS ou_before,
         break_minutes       AS brk_before,
         late_minutes        AS lm_before,
         early_leave_minutes AS em_before
  FROM attendance_daily
  WHERE company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
),
-- 明石のみ空打ち UPDATE。BEFORE UPDATE トリガーが走り、
-- RETURNING で更新後の各値を回収する
after_update AS (
  UPDATE attendance_daily ad
  SET updated_at = updated_at
  WHERE ad.company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
  RETURNING ad.id,
            ad.actual_hours        AS ah_after,
            ad.scheduled_hours     AS sh_after,
            ad.overtime_hours      AS oh_after,
            ad.over_under          AS ou_after,
            ad.break_minutes       AS brk_after,
            ad.late_minutes        AS lm_after,
            ad.early_leave_minutes AS em_after
),
-- 前後を id で結合したビュー
joined AS (
  SELECT b.id, b.employee_id, b.attendance_date, b.reason,
         b.ah_before, u.ah_after,
         b.sh_before, u.sh_after,
         b.oh_before, u.oh_after,
         b.ou_before, u.ou_after,
         b.brk_before, u.brk_after,
         b.lm_before, u.lm_after,
         b.em_before, u.em_after
  FROM before_state b
  JOIN after_update u USING (id)
),
-- (A) サマリ件数
r_summary AS (
  SELECT jsonb_build_object(
    'total_akashi_rows',            COUNT(*),
    'actual_hours_changed',         COUNT(*) FILTER (WHERE ah_before  IS DISTINCT FROM ah_after),
    'scheduled_hours_changed',      COUNT(*) FILTER (WHERE sh_before  IS DISTINCT FROM sh_after),
    'overtime_hours_changed',       COUNT(*) FILTER (WHERE oh_before  IS DISTINCT FROM oh_after),
    'over_under_changed',           COUNT(*) FILTER (WHERE ou_before  IS DISTINCT FROM ou_after),
    'break_minutes_changed',        COUNT(*) FILTER (WHERE brk_before IS DISTINCT FROM brk_after),
    'late_minutes_changed',         COUNT(*) FILTER (WHERE lm_before  IS DISTINCT FROM lm_after),
    'early_leave_minutes_changed',  COUNT(*) FILTER (WHERE em_before  IS DISTINCT FROM em_after),
    'full_paid_rows',               COUNT(*) FILTER (WHERE reason LIKE '%有給（全日）%'),
    'kekkin_rows',                  COUNT(*) FILTER (WHERE reason LIKE '%欠勤%'),
    'kokyu_rows',                   COUNT(*) FILTER (WHERE reason LIKE '%公休%')
  ) AS summary
  FROM joined
),
-- (B) actual_hours が変わった行の reason 別内訳
r_reason AS (
  SELECT jsonb_agg(t) AS reason_breakdown
  FROM (
    SELECT reason,
           COUNT(*)                       AS n_rows,
           COUNT(DISTINCT employee_id)    AS n_employees,
           MIN(ah_before)                 AS min_ah_before,
           MAX(ah_before)                 AS max_ah_before,
           MIN(ah_after)                  AS min_ah_after,
           MAX(ah_after)                  AS max_ah_after
    FROM joined
    WHERE ah_before IS DISTINCT FROM ah_after
    GROUP BY reason
    ORDER BY COUNT(*) DESC
  ) t
),
-- (C) 変わった行のサンプル 20 件
r_samples AS (
  SELECT jsonb_agg(t ORDER BY t.attendance_date DESC, t.employee_code) AS samples
  FROM (
    SELECT j.attendance_date,
           j.reason,
           e.employee_code,
           e.employment_type,
           j.ah_before AS actual_before,
           j.ah_after  AS actual_after,
           j.sh_before AS sched_before,
           j.sh_after  AS sched_after
    FROM joined j
    JOIN employees e ON e.id = j.employee_id
    WHERE j.ah_before IS DISTINCT FROM j.ah_after
    ORDER BY j.attendance_date DESC, e.employee_code
    LIMIT 20
  ) t
),
-- (D) 期待外の変化: 「有給（全日）」以外で actual_hours が変わった行
--     → 期待は 0 件。1 件でも返れば ROLLBACK
r_suspicious AS (
  SELECT jsonb_agg(t) AS suspicious
  FROM (
    SELECT reason, COUNT(*) AS suspicious_rows
    FROM joined
    WHERE ah_before IS DISTINCT FROM ah_after
      AND (reason IS NULL OR reason NOT LIKE '%有給（全日）%')
    GROUP BY reason
    ORDER BY COUNT(*) DESC
  ) t
)
SELECT jsonb_pretty(jsonb_build_object(
  'summary',          (SELECT summary          FROM r_summary),
  'reason_breakdown', (SELECT reason_breakdown FROM r_reason),
  'samples',          (SELECT samples          FROM r_samples),
  'suspicious',       (SELECT suspicious       FROM r_suspicious)
)) AS report;
