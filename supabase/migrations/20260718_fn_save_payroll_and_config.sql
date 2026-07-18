-- 給与保存RPC: payroll_monthly UPDATE + change_logs INSERT + config 履歴管理を1トランザクションで行う
CREATE OR REPLACE FUNCTION fn_save_payroll_and_config(
  p_year_month text,
  p_changed_by text,
  p_rows jsonb
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  r jsonb;
  v_employee_id uuid;
  v_pm_id uuid;
  v_employment_type text;
  v_payroll_fields jsonb;
  v_config_changes jsonb;
  v_change_logs jsonb;
  v_y int;
  v_m int;
  v_prev_month int;
  v_prev_year int;
  v_effective_from date;
  v_effective_to_prev date;
  v_existing_id uuid;
  v_old_row record;
  v_new_row jsonb;
  v_key text;
  v_log jsonb;
  v_updated_count int;
BEGIN
  v_y := (split_part(p_year_month, '-', 1))::int;
  v_m := (split_part(p_year_month, '-', 2))::int;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_employee_id := (r->>'employee_id')::uuid;
    v_pm_id := (r->>'payroll_monthly_id')::uuid;
    v_employment_type := r->>'employment_type';
    v_payroll_fields := r->'payroll_fields';
    v_config_changes := r->'config_changes';
    v_change_logs := r->'change_logs';

    -- (a) payroll_monthly を UPDATE
    IF jsonb_typeof(v_payroll_fields) != 'object' THEN
      RAISE EXCEPTION 'payroll_fields must be an object (employee_id=%)', v_employee_id;
    END IF;
    UPDATE payroll_monthly
    SET base_salary = COALESCE((v_payroll_fields->>'base_salary')::numeric, base_salary),
        position_allowance = COALESCE((v_payroll_fields->>'position_allowance')::numeric, position_allowance),
        qualification_allowance = COALESCE((v_payroll_fields->>'qualification_allowance')::numeric, qualification_allowance),
        commute_allowance = COALESCE((v_payroll_fields->>'commute_allowance')::numeric, commute_allowance),
        dependent_allowance = COALESCE((v_payroll_fields->>'dependent_allowance')::numeric, dependent_allowance),
        fixed_overtime = COALESCE((v_payroll_fields->>'fixed_overtime')::numeric, fixed_overtime),
        overtime_pay = COALESCE((v_payroll_fields->>'overtime_pay')::numeric, overtime_pay),
        adjustment_allowance = COALESCE((v_payroll_fields->>'adjustment_allowance')::numeric, adjustment_allowance),
        absence_deduction = COALESCE((v_payroll_fields->>'absence_deduction')::numeric, absence_deduction),
        total_payment = COALESCE((v_payroll_fields->>'total_payment')::numeric, total_payment),
        hourly_weekday_minutes = COALESCE((v_payroll_fields->>'hourly_weekday_minutes')::numeric, hourly_weekday_minutes),
        hourly_saturday_minutes = COALESCE((v_payroll_fields->>'hourly_saturday_minutes')::numeric, hourly_saturday_minutes),
        hourly_sunday_minutes = COALESCE((v_payroll_fields->>'hourly_sunday_minutes')::numeric, hourly_sunday_minutes),
        paid_leave_amount = COALESCE((v_payroll_fields->>'paid_leave_amount')::numeric, paid_leave_amount),
        calculated_at = now()
    WHERE id = v_pm_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count = 0 THEN
      RAISE EXCEPTION 'payroll_monthly更新失敗(id=%)', v_pm_id;
    END IF;

    -- (b) change_logs INSERT
    IF jsonb_typeof(v_change_logs) = 'array' AND jsonb_array_length(v_change_logs) > 0 THEN
      FOR v_log IN SELECT * FROM jsonb_array_elements(v_change_logs)
      LOOP
        INSERT INTO payroll_change_logs (payroll_monthly_id, employee_id, changed_by, field_name, old_value, new_value)
        VALUES (v_pm_id, v_employee_id, p_changed_by, v_log->>'field_name',
                (v_log->>'old_value')::numeric, (v_log->>'new_value')::numeric);
      END LOOP;
    END IF;

    -- (c) config 履歴管理（変更がある場合のみ）
    IF jsonb_typeof(v_config_changes) = 'object' AND v_config_changes != '{}'::jsonb THEN
      -- effective_from を算出（雇用区分別）
      v_prev_month := CASE WHEN v_m = 1 THEN 12 ELSE v_m - 1 END;
      v_prev_year := CASE WHEN v_m = 1 THEN v_y - 1 ELSE v_y END;
      IF v_employment_type = 'パート' THEN
        v_effective_from := make_date(v_prev_year, v_prev_month, 11);
      ELSE
        v_effective_from := make_date(v_prev_year, v_prev_month, 1);
      END IF;
      v_effective_to_prev := v_effective_from - interval '1 day';

      -- 同じ effective_from の行を探す
      SELECT id INTO v_existing_id
      FROM employee_payroll_config
      WHERE employee_id = v_employee_id AND effective_from = v_effective_from
      LIMIT 1;

      IF v_existing_id IS NOT NULL THEN
        -- 同月の行が既にある → UPDATE（変更分のみ）
        UPDATE employee_payroll_config
        SET updated_at = now()
        WHERE id = v_existing_id;

        -- 各変更カラムを動的に更新
        FOR v_key IN SELECT * FROM jsonb_object_keys(v_config_changes)
        LOOP
          EXECUTE format(
            'UPDATE employee_payroll_config SET %I = $1 WHERE id = $2',
            v_key
          ) USING (v_config_changes->>v_key)::numeric, v_existing_id;
        END LOOP;
      ELSE
        -- 旧行を探す（effective_to が null で effective_from < 新しい effective_from）
        SELECT * INTO v_old_row
        FROM employee_payroll_config
        WHERE employee_id = v_employee_id AND effective_to IS NULL AND effective_from < v_effective_from
        ORDER BY effective_from DESC
        LIMIT 1;

        IF FOUND THEN
          -- 旧行の effective_to を更新
          UPDATE employee_payroll_config
          SET effective_to = v_effective_to_prev, updated_at = now()
          WHERE id = v_old_row.id;

          -- 旧行の全カラムをコピーして新行を作成（動的に）
          SELECT to_jsonb(v_old_row) - 'id' - 'created_at' - 'updated_at' - 'effective_from' - 'effective_to'
          INTO v_new_row;

          -- 変更分を上書き
          v_new_row := v_new_row || v_config_changes;
          v_new_row := v_new_row || jsonb_build_object(
            'id', gen_random_uuid(),
            'effective_from', v_effective_from,
            'effective_to', null,
            'created_at', now(),
            'updated_at', now()
          );

          INSERT INTO employee_payroll_config
          SELECT * FROM jsonb_populate_record(null::employee_payroll_config, v_new_row);
        ELSE
          -- 旧行なし（新入社員）→ 変更分だけで INSERT
          v_new_row := v_config_changes || jsonb_build_object(
            'id', gen_random_uuid(),
            'employee_id', v_employee_id,
            'employment_category', CASE WHEN v_employment_type = 'パート' THEN 'hourly' ELSE 'monthly' END,
            'effective_from', v_effective_from,
            'effective_to', null,
            'created_at', now(),
            'updated_at', now()
          );

          INSERT INTO employee_payroll_config
          SELECT * FROM jsonb_populate_record(null::employee_payroll_config, v_new_row);
        END IF;
      END IF;
    END IF;
  END LOOP;
END;
$$;
