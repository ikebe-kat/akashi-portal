-- ============================================================
-- 休職期間管理テーブル（新設のみ・既存オブジェクトへの変更なし）
-- ============================================================

-- 1. employee_leaves（休職期間・親テーブル）
CREATE TABLE public.employee_leaves (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid        NOT NULL REFERENCES public.employees(id),
  leave_start_date date       NOT NULL,
  leave_end_date   date,
  leave_type      text        NOT NULL
                    CONSTRAINT chk_leave_type
                    CHECK (leave_type IN ('産休','育休','傷病','介護休職')),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_employee_leaves_employee_id ON public.employee_leaves (employee_id);

-- 2. employee_leave_exclusions（除外面・子テーブル）
CREATE TABLE public.employee_leave_exclusions (
  id               uuid       PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_id         uuid       NOT NULL REFERENCES public.employee_leaves(id) ON DELETE CASCADE,
  exclusion_target text       NOT NULL
                    CONSTRAINT chk_exclusion_target
                    CHECK (exclusion_target IN ('payroll','insurance','paid_leave','attendance')),
  created_at       timestamptz DEFAULT now(),
  CONSTRAINT uq_leave_exclusion UNIQUE (leave_id, exclusion_target)
);

CREATE INDEX idx_employee_leave_exclusions_leave_id ON public.employee_leave_exclusions (leave_id);

-- 3. RLS（既存テーブルと同じ allow_all 作法）
ALTER TABLE public.employee_leaves ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_employee_leaves
  ON public.employee_leaves
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.employee_leave_exclusions ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_employee_leave_exclusions
  ON public.employee_leave_exclusions
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
