-- 公休管理の二重管理解消: KOUKYU_PART_CODES直書き10名 + 矢野DA036 の shift_type を DB に正として設定
-- コード側の KOUKYU_PART_CODES は本migrationの適用後にデプロイで廃止する

-- 対象: 公休登録型パート全員 (既存10名 + 矢野DA036)
-- DA028, DA029 は akashi_pin_list.csv に存在しないが、employeesに行があればUPSERTされる（なければスキップ）

INSERT INTO employee_payroll_config (employee_id, shift_type, updated_at)
SELECT e.id, 'off', now()
FROM employees e
WHERE e.employee_code IN ('DA023','DA024','DA025','DA026','DA027','DA028','DA029','DA030','DA031','DA032','DA036')
  AND e.company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
ON CONFLICT (employee_id)
DO UPDATE SET shift_type = 'off', updated_at = now()
WHERE employee_payroll_config.shift_type IS DISTINCT FROM 'off';
