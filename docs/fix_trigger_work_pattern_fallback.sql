-- ============================================================
-- calculate_attendance トリガー修正: work_pattern_code fallback改善
-- ============================================================
-- 変更点:
--   1. pat_str 取得を3段階fallbackに変更:
--      (a) NEW.work_pattern_code
--      (b) employees.work_pattern_code
--      (c) 会社別デフォルト: 明石→0900-1800 / WC→1000-1900 / KAT→0930-1800
--   2. v_emp_pattern(punch_in丸め用)の最終fallbackも同様に会社別デフォルト化
--   3. STANDARD_WORK分岐・パート後処理は一切変更なし
--
-- 実行順序: このSQLを先に実行 → 次に retrigger SQL を実行
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculate_attendance()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  pat_start_min INT;
  pat_end_min INT;
  am_work INT;
  pm_work INT;
  pat_work_min INT;
  midday INT := 780;
  in_min INT;
  out_min INT;
  has_in BOOLEAN;
  has_out BOOLEAN;
  has_punch BOOLEAN;
  v_reason TEXT;
  parts TEXT[];
  part TEXT;
  has_full_paid BOOLEAN := FALSE;
  has_full_kibou BOOLEAN := FALSE;
  has_kyujitsu_day BOOLEAN := FALSE;
  has_am_paid BOOLEAN := FALSE;
  has_am_kibou BOOLEAN := FALSE;
  has_pm_paid BOOLEAN := FALSE;
  has_pm_kibou BOOLEAN := FALSE;
  has_shutcho BOOLEAN := FALSE;
  has_kekkin BOOLEAN := FALSE;
  has_kyujitsu BOOLEAN := FALSE;
  has_full_daikyu BOOLEAN := FALSE;
  has_am_daikyu BOOLEAN := FALSE;
  has_pm_daikyu BOOLEAN := FALSE;
  has_am_leave BOOLEAN;
  has_pm_leave BOOLEAN;
  v_brk INT := 0;
  v_late INT := 0;
  v_early INT := 0;
  v_work INT := 0;
  v_contract INT := 0;
  v_ot INT := 0;
  v_done BOOLEAN := FALSE;
  eff_in INT;
  actual_min INT;
  w INT;
  am_cr INT;
  pm_cr INT;
  pat_str TEXT;
  pat_parts TEXT[];
  STANDARD_WORK INT;
  v_round_min INT;
  v_jst_time TIME;
  v_emp_pattern TEXT;
  -- ★ パート後処理用（追加）
  v_pt_emp_type TEXT;
  v_pt_eff_pattern TEXT;
  v_pt_sched_hours NUMERIC;
  v_pt_sched_min INT;
  v_pt_pat_brk INT;
  v_pt_brk INT;
  v_pt_actual INT;
  v_pt_in_min INT;
  v_pt_out_min INT;
BEGIN
  IF NEW.company_id = 'a653846d-3add-47ab-beb8-230a97f2c53e' THEN
    STANDARD_WORK := 450;
  ELSIF NEW.company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74' THEN
    STANDARD_WORK := 480;
  ELSIF NEW.company_id = 'c2d368f0-aa9b-4f70-b082-43ec07723d6c' THEN
    STANDARD_WORK := 480;
  ELSE
    STANDARD_WORK := 450;
  END IF;

  -- ★★ 修正: pat_str を3段階fallbackで取得 ★★
  -- (1) attendance_daily.work_pattern_code
  pat_str := NEW.work_pattern_code;
  -- (2) employees.work_pattern_code
  IF pat_str IS NULL THEN
    SELECT e.work_pattern_code INTO pat_str
    FROM employees e WHERE e.id = NEW.employee_id;
  END IF;
  -- (3) 会社別デフォルト
  IF pat_str IS NULL THEN
    IF NEW.company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74' THEN
      pat_str := '0900-1800';
    ELSIF NEW.company_id = 'c2d368f0-aa9b-4f70-b082-43ec07723d6c' THEN
      pat_str := '1000-1900';
    ELSE
      pat_str := '0930-1800';
    END IF;
  END IF;

  IF pat_str LIKE '%:%' THEN
    pat_str := REPLACE(pat_str, ':', '');
  END IF;
  IF pat_str LIKE '%-%' THEN
    pat_parts := string_to_array(pat_str, '-');
    pat_start_min := (LEFT(pat_parts[1], 2)::INT) * 60 + (RIGHT(pat_parts[1], 2)::INT);
    pat_end_min := (LEFT(pat_parts[2], 2)::INT) * 60 + (RIGHT(pat_parts[2], 2)::INT);
  ELSE
    pat_start_min := 570;
    pat_end_min := 1080;
  END IF;

  IF NEW.punch_in_raw IS NOT NULL THEN
    v_jst_time := (NEW.punch_in_raw AT TIME ZONE 'Asia/Tokyo')::TIME;
    v_emp_pattern := NEW.work_pattern_code;
    IF v_emp_pattern IS NULL THEN
      SELECT e.work_pattern_code INTO v_emp_pattern
      FROM employees e WHERE e.id = NEW.employee_id;
    END IF;
    -- ★★ 修正: v_emp_pattern の最終fallbackも会社別デフォルト ★★
    IF v_emp_pattern IS NULL THEN
      IF NEW.company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74' THEN
        v_emp_pattern := '0900-1800';
      ELSIF NEW.company_id = 'c2d368f0-aa9b-4f70-b082-43ec07723d6c' THEN
        v_emp_pattern := '1000-1900';
      ELSE
        v_emp_pattern := '0930-1800';
      END IF;
    END IF;
    IF v_emp_pattern LIKE '%:%' THEN
      v_emp_pattern := REPLACE(v_emp_pattern, ':', '');
    END IF;
    v_round_min := (LEFT(v_emp_pattern, 2)::INT) * 60 + (SUBSTR(v_emp_pattern, 3, 2)::INT);
    IF NEW.reason IS NOT NULL AND (NEW.reason LIKE '%午前有給%' OR NEW.reason LIKE '%午前希望休%') THEN
      v_round_min := 780;
    END IF;
    IF (EXTRACT(HOUR FROM v_jst_time)::INT * 60 + EXTRACT(MINUTE FROM v_jst_time)::INT) < v_round_min THEN
      NEW.punch_in := (v_round_min / 60)::TEXT || ':' || LPAD((v_round_min % 60)::TEXT, 2, '0');
    ELSE
      NEW.punch_in := DATE_TRUNC('minute', NEW.punch_in_raw AT TIME ZONE 'Asia/Tokyo')::TIME;
    END IF;
  END IF;

  am_work := midday - pat_start_min;
  pm_work := pat_end_min - midday;
  pat_work_min := am_work + pm_work - 60;

  IF NEW.punch_in IS NOT NULL THEN
    in_min := EXTRACT(HOUR FROM NEW.punch_in)::INT * 60 + EXTRACT(MINUTE FROM NEW.punch_in)::INT;
    IF in_min < pat_start_min THEN in_min := pat_start_min; END IF;
    has_in := TRUE;
  ELSE
    in_min := 0;
    has_in := FALSE;
  END IF;

  IF NEW.punch_out IS NOT NULL THEN
    out_min := EXTRACT(HOUR FROM NEW.punch_out)::INT * 60 + EXTRACT(MINUTE FROM NEW.punch_out)::INT;
    has_out := TRUE;
  ELSE
    out_min := 0;
    has_out := FALSE;
  END IF;

  has_punch := has_in AND has_out;

  v_reason := COALESCE(NEW.reason, '');
  IF v_reason != '' THEN
    v_reason := REPLACE(v_reason, '＋', '+');
    parts := string_to_array(v_reason, '+');
    FOR i IN 1..array_length(parts, 1) LOOP
      part := TRIM(parts[i]);
      IF part = '有給（全日）' THEN has_full_paid := TRUE;
      ELSIF part = '希望休（全日）' THEN has_full_kibou := TRUE;
      ELSIF part = '休日' THEN has_kyujitsu_day := TRUE;
      ELSIF part = '午前有給' THEN has_am_paid := TRUE;
      ELSIF part = '午前希望休' THEN has_am_kibou := TRUE;
      ELSIF part = '午後有給' THEN has_pm_paid := TRUE;
      ELSIF part = '午後希望休' THEN has_pm_kibou := TRUE;
      ELSIF part LIKE '出張%' THEN has_shutcho := TRUE;
      ELSIF part = '欠勤' THEN has_kekkin := TRUE;
      ELSIF part = '休日出勤' THEN has_kyujitsu := TRUE;
      ELSIF part LIKE '午前代休%' THEN has_am_daikyu := TRUE;
      ELSIF part LIKE '午後代休%' THEN has_pm_daikyu := TRUE;
      ELSIF part LIKE '代休%' OR part = '代休' THEN has_full_daikyu := TRUE;
      END IF;
    END LOOP;
  END IF;

  has_am_leave := has_am_paid OR has_am_kibou OR has_am_daikyu;
  has_pm_leave := has_pm_paid OR has_pm_kibou OR has_pm_daikyu;

  IF has_full_paid THEN
    v_brk := 0; v_work := STANDARD_WORK; v_contract := STANDARD_WORK;
    v_ot := 0; v_late := 0; v_early := 0;
    v_done := TRUE;
  ELSIF has_full_kibou THEN
    v_brk := 0; v_work := 0; v_contract := 0;
    v_ot := 0; v_late := 0; v_early := 0;
    v_done := TRUE;
  ELSIF has_kyujitsu_day AND NOT has_kyujitsu THEN
    v_brk := 0; v_work := 0; v_contract := 0;
    v_ot := 0; v_late := 0; v_early := 0;
    v_done := TRUE;
  ELSIF has_full_daikyu THEN
    v_brk := 0; v_work := 0; v_contract := 0;
    v_ot := 0; v_late := 0; v_early := 0;
    v_done := TRUE;
  ELSIF has_am_leave AND has_pm_leave AND NOT has_punch THEN
    v_brk := 0;
    IF has_am_paid THEN am_cr := am_work; ELSE am_cr := 0; END IF;
    IF has_pm_paid THEN pm_cr := pm_work; ELSE pm_cr := 0; END IF;
    v_work := am_cr + pm_cr;
    v_contract := STANDARD_WORK;
    v_ot := GREATEST(0, v_work - STANDARD_WORK);
    v_late := 0; v_early := 0;
    v_done := TRUE;
  ELSIF has_kekkin AND NOT has_am_leave AND NOT has_pm_leave THEN
    v_brk := 0; v_work := 0; v_contract := STANDARD_WORK;
    v_ot := 0; v_late := 0; v_early := 0;
    v_done := TRUE;
  ELSIF has_shutcho AND NOT has_am_leave AND NOT has_pm_leave THEN
    v_brk := 60; v_work := STANDARD_WORK; v_contract := STANDARD_WORK;
    v_ot := 0; v_late := 0; v_early := 0;
    NEW.punch_in := (pat_start_min / 60)::TEXT || ':' || LPAD((pat_start_min % 60)::TEXT, 2, '0');
    NEW.punch_out := (pat_end_min / 60)::TEXT || ':' || LPAD((pat_end_min % 60)::TEXT, 2, '0');
    v_done := TRUE;
  ELSIF has_am_leave AND has_shutcho AND NOT has_punch THEN
    v_brk := 0;
    IF has_am_paid THEN
      v_work := STANDARD_WORK;
    ELSE
      v_work := pm_work;
    END IF;
    v_contract := STANDARD_WORK;
    v_ot := GREATEST(0, v_work - STANDARD_WORK);
    v_late := 0; v_early := 0;
    v_done := TRUE;
  ELSIF has_pm_leave AND has_shutcho AND NOT has_punch THEN
    v_brk := 0;
    IF has_pm_paid THEN
      v_work := STANDARD_WORK;
    ELSE
      v_work := am_work;
    END IF;
    v_contract := STANDARD_WORK;
    v_ot := GREATEST(0, v_work - STANDARD_WORK);
    v_late := 0; v_early := 0;
    v_done := TRUE;
  ELSIF has_kyujitsu AND has_punch THEN
    v_brk := 60;
    w := out_min - in_min - 60;
    IF w < 0 THEN w := 0; END IF;
    v_work := w; v_contract := 0; v_ot := w;
    v_late := 0; v_early := 0;
    v_done := TRUE;
  ELSIF has_am_leave AND has_punch THEN
    v_brk := 0;
    IF in_min < midday THEN eff_in := midday; ELSE eff_in := in_min; END IF;
    actual_min := out_min - eff_in;
    IF actual_min < 0 THEN actual_min := 0; END IF;
    v_work := actual_min;
    v_contract := STANDARD_WORK;
    v_late := GREATEST(0, eff_in - midday);
    v_early := GREATEST(0, pat_end_min - out_min);
    v_ot := GREATEST(0, actual_min - STANDARD_WORK);
    v_done := TRUE;
  ELSIF has_pm_leave AND has_punch THEN
    v_brk := 0;
    actual_min := out_min - in_min;
    IF actual_min < 0 THEN actual_min := 0; END IF;
    v_work := actual_min;
    v_contract := STANDARD_WORK;
    v_late := GREATEST(0, in_min - pat_start_min);
    v_early := GREATEST(0, midday - out_min);
    v_ot := GREATEST(0, actual_min - STANDARD_WORK);
    v_done := TRUE;
  ELSIF has_punch THEN
    v_brk := 60;
    w := out_min - in_min - 60;
    IF w < 0 THEN w := 0; END IF;
    v_work := w;
    v_contract := STANDARD_WORK;
    v_late := GREATEST(0, in_min - pat_start_min);
    v_early := GREATEST(0, pat_end_min - out_min);
    v_ot := GREATEST(0, w - STANDARD_WORK);
    v_done := TRUE;
  ELSIF COALESCE(NEW.reason, '') = '' AND NOT has_in AND NOT has_out AND COALESCE(NEW.is_holiday, FALSE) THEN
    v_brk := 0; v_work := 0; v_contract := 0;
    v_ot := 0; v_late := 0; v_early := 0;
    v_done := TRUE;
  END IF;

  -- ================================================================
  -- ★★★ パート後処理（明石のみ）— ここから追加 ★★★
  -- 既存ロジックの結果をパート用に上書きする。
  -- 対象: 明石 company_id かつ employment_type = 'パート' のみ。
  -- KAT・WC・正社員には一切影響しない。
  --
  -- 注意: v_done チェックなし。理由='公休'は既存パーサーが認識しないため
  --       v_done=FALSE のまま到達する。パート後処理側で v_done=TRUE にする。
  -- ================================================================
  IF NEW.company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74' THEN
    SELECT e.employment_type INTO v_pt_emp_type
    FROM employees e WHERE e.id = NEW.employee_id;

    IF v_pt_emp_type = 'パート' THEN
      -- 1) 曜日別オーバーライド確認（例: 岸本の日曜）
      SELECT o.work_pattern_code INTO v_pt_eff_pattern
      FROM employee_work_pattern_overrides o
      WHERE o.employee_id = NEW.employee_id
        AND o.day_of_week = EXTRACT(DOW FROM NEW.attendance_date)::INT;

      -- 2) オーバーライドなければ employees のデフォルト
      IF v_pt_eff_pattern IS NULL THEN
        SELECT e.work_pattern_code INTO v_pt_eff_pattern
        FROM employees e WHERE e.id = NEW.employee_id;
      END IF;

      -- 3) work_patterns から所定時間と休憩時間を取得
      SELECT wp.scheduled_hours, wp.break_minutes
      INTO v_pt_sched_hours, v_pt_pat_brk
      FROM work_patterns wp
      WHERE wp.company_id = NEW.company_id
        AND wp.pattern_code = v_pt_eff_pattern;

      -- work_patterns にマッチするレコードがある場合のみ上書き
      IF v_pt_sched_hours IS NOT NULL THEN
        v_pt_sched_min := (v_pt_sched_hours * 60)::INT;

        IF has_full_paid THEN
          -- 有給（全日）: 休憩=パターンの休憩時間、実勤務=所定
          v_brk := COALESCE(v_pt_pat_brk, 0);
          v_work := v_pt_sched_min; v_contract := v_pt_sched_min;
          v_ot := 0; v_late := 0; v_early := 0;
          v_done := TRUE;

        ELSIF COALESCE(NEW.reason, '') = '公休' OR (has_kyujitsu_day AND NOT has_kyujitsu) THEN
          -- 公休: 全0
          v_brk := 0; v_work := 0; v_contract := 0;
          v_ot := 0; v_late := 0; v_early := 0;
          v_done := TRUE;

        ELSIF has_punch THEN
          -- 通常出勤＋打刻あり（15分丸め: 出勤切り上げ・退勤切り捨て）
          v_pt_in_min := (CEIL(in_min::NUMERIC / 15) * 15)::INT;
          v_pt_out_min := (FLOOR(out_min::NUMERIC / 15) * 15)::INT;
          v_pt_brk := COALESCE(NEW.break_minutes_self_reported, 0);
          v_pt_actual := v_pt_out_min - v_pt_in_min - v_pt_brk;
          IF v_pt_actual < 0 THEN v_pt_actual := 0; END IF;
          v_brk := v_pt_brk; v_work := v_pt_actual; v_contract := v_pt_sched_min;
          v_ot := GREATEST(0, v_pt_actual - 480); v_late := 0; v_early := 0;
          v_done := TRUE;
        END IF;
      END IF;
    END IF;
  END IF;
  -- ★★★ パート後処理 ここまで ★★★

  IF v_done THEN
    NEW.break_minutes := v_brk;
    NEW.late_minutes := v_late;
    NEW.early_leave_minutes := v_early;
    NEW.actual_hours := ROUND(v_work::NUMERIC / 60.0, 2);
    NEW.scheduled_hours := ROUND(v_contract::NUMERIC / 60.0, 2);
    NEW.overtime_hours := ROUND(v_ot::NUMERIC / 60.0, 2);
    NEW.over_under := ROUND(v_ot::NUMERIC / 60.0, 2);
  ELSE
    NEW.break_minutes := NULL;
    NEW.late_minutes := NULL;
    NEW.early_leave_minutes := NULL;
    NEW.actual_hours := NULL;
    NEW.scheduled_hours := NULL;
    NEW.overtime_hours := NULL;
    NEW.over_under := NULL;
  END IF;

  RETURN NEW;
END;
$function$;
