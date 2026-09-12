-- ============================================================
-- 【調査SQL】明石の本部店舗の stores.id を取得する。
-- 結果の id を lib/payroll/akashiEmployeeFilter.ts の
-- AKASHI_HONBU_STORE_ID 定数に入れて、HONBU_EMPLOYEE_CODES 定数と
-- そのフォールバック分岐（isExcludedFromAkashiPayroll 内2行）を削除する。
-- ============================================================
SELECT id, store_code, store_name
FROM stores
WHERE company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
  AND store_name = '本部';
-- 期待: ちょうど1行。id を akashiEmployeeFilter.ts に貼り付ける。
