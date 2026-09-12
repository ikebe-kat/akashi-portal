-- ============================================================
-- 【調査SQL】KAT本部4名（D02/D18/D49/D67）と、産休中で
--   requires_punch=false の DA037 松江を、employees の1つの
--   列で区別できるかを確認する SELECT のみ。何も書き換えない。
--
-- 目的: calculatePayroll の「対象外」判定を、社員コード直書きから
--        DB上のフラグに置き換えたい。区別に使える列を人間が選ぶ。
-- ============================================================

-- 1) 対象5名 + 明石の requires_punch=false 全員を確認
SELECT
  e.employee_code, e.full_name, e.employment_type,
  e.requires_punch, e.is_active,
  e.store_id, s.store_code, s.store_name,
  e.department, e.position, e.role, e.grade,
  e.portal_group_id, e.holiday_calendar, e.work_pattern_code,
  e.hire_date, e.resigned_at
FROM employees e
LEFT JOIN stores s ON s.id = e.store_id
WHERE e.company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
  AND (e.employee_code IN ('D02','D18','D49','D67','DA037')
       OR e.requires_punch = false)
ORDER BY e.employee_code;

-- 2) 明石の全 store（本部という店舗があるか）
SELECT id, store_code, store_name
FROM stores
WHERE company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
ORDER BY store_code;

-- 3) portal_groups があれば、本部専用のグループがあるか
SELECT id, group_name, group_code
FROM portal_groups
WHERE company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
ORDER BY group_code;

-- 判定の観点:
--   ・4名の store が特定の1店舗（例: 本部）に寄り、DA037 だけ違うか
--   ・4名の portal_group_id が特定値で、DA037 は違うか
--   ・4名の department / position / role のいずれかが 4名だけで共通の値か
--   ・4名の employment_type が全員 'パート' や '役員' などになっているか
-- どの列が使えるか判断できたら calculatePayroll の EXCLUDE_EMPLOYEE_CODES
-- を、その列の判定に置き換える。
