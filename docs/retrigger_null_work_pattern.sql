-- ============================================================
-- 既存 work_pattern_code IS NULL 行の再計算
-- ============================================================
-- 前提: fix_trigger_work_pattern_fallback.sql を先に実行済みであること
--
-- 対象: work_pattern_code IS NULL かつ punch_in IS NOT NULL の行
--       3社合計 288件（KAT 221件 / 明石 65件 / WC 2件）
--
-- 仕組み: break_minutes を自身の値で UPDATE（実質no-op）して
--         BEFORE UPDATE トリガーを再発火させ、修正後の fallback で
--         actual_hours / scheduled_hours / late_minutes 等を再計算する
-- ============================================================

-- ① 事前確認（件数チェック）
SELECT
  CASE company_id
    WHEN 'a653846d-3add-47ab-beb8-230a97f2c53e' THEN 'KAT'
    WHEN 'e85e40ac-71f7-4918-b2fc-36d877337b74' THEN '明石'
    WHEN 'c2d368f0-aa9b-4f70-b082-43ec07723d6c' THEN 'WC'
    ELSE 'other'
  END AS company_name,
  COUNT(*) AS cnt
FROM attendance_daily
WHERE work_pattern_code IS NULL
  AND punch_in IS NOT NULL
GROUP BY company_id
ORDER BY cnt DESC;

-- ② 再トリガー実行（トリガー修正後に実行すること）
UPDATE attendance_daily
SET break_minutes = break_minutes
WHERE work_pattern_code IS NULL
  AND punch_in IS NOT NULL;
