-- ============================================================
-- 【調査SQL】明石の本部店舗の stores.id を取得する。
-- 得られた id を lib/payroll/akashiEmployeeFilter.ts の AKASHI_HONBU_STORE_ID に貼る。
-- 現行値: 'e43bd745-b8f2-4705-9fd8-43517dc47701' (store_code=000, store_name=本部)
-- ============================================================
SELECT id, store_code, store_name
FROM stores
WHERE company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
  AND store_name = '本部';
-- 期待: ちょうど1行。id を akashiEmployeeFilter.ts に貼り付ける。
