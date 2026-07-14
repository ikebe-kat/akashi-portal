-- employee_leaves.leave_type CHECK制約に「その他」を追加
ALTER TABLE employee_leaves DROP CONSTRAINT chk_leave_type;
ALTER TABLE employee_leaves ADD CONSTRAINT chk_leave_type CHECK (leave_type IN ('産休','育休','傷病','介護休職','その他'));
