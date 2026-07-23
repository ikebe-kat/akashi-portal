-- 矢野絵夢 DA036 を公休登録型(shift_type='off')に設定
--
-- 公休登録型(off): 平松DA023・田村DA027・安福DA030・矢野DA036 の4名のみ
-- 他のパート(東DA024・黒田DA025・藤田DA026・白石DA031・岸本DA032等)は work が正しい
-- コードの KOUKYU_PART_CODES 直書きは廃止済みで DB の shift_type が唯一の正
--
-- 冪等: 既にoff設定済みでも二重実行で壊れない

INSERT INTO employee_payroll_config (employee_id, shift_type, updated_at)
SELECT e.id, 'off', now()
FROM employees e
WHERE e.employee_code = 'DA036'
  AND e.company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'
ON CONFLICT (employee_id)
DO UPDATE SET shift_type = 'off', updated_at = now()
WHERE employee_payroll_config.shift_type IS DISTINCT FROM 'off';
