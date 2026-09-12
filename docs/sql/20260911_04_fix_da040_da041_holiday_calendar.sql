-- ============================================================
-- 【F】DA040 / DA041 の休日カレンダー欠落を修正
--   両名とも正社員Aで確定（akashi_seishain_a）。
--   会社ID・現在NULLの条件を必ず入れ、1件ずつUPDATE。
-- ============================================================

-- 実行前の確認（0件でなければ意図と違うので流さないでください）:
--   SELECT employee_code, full_name, holiday_calendar
--   FROM employees
--   WHERE company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
--     AND employee_code IN ('DA040','DA041');

UPDATE public.employees
SET holiday_calendar = 'akashi_seishain_a',
    updated_at = now()
WHERE company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
  AND employee_code = 'DA040'
  AND holiday_calendar IS NULL;

UPDATE public.employees
SET holiday_calendar = 'akashi_seishain_a',
    updated_at = now()
WHERE company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
  AND employee_code = 'DA041'
  AND holiday_calendar IS NULL;

-- 実行後の確認:
--   SELECT employee_code, full_name, holiday_calendar
--   FROM employees
--   WHERE company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
--     AND employee_code IN ('DA040','DA041');
--   → 両行とも akashi_seishain_a になっていること。
