-- ============================================================================
-- 明石: 有給（全日）の actual_hours を「実労働のみ」に統一するトリガー修正
--
-- 目的: 明石 attendance_daily.actual_hours の意味を KAT と揃える。
--   ・従来: 明石で有給（全日）の日は actual_hours = STANDARD_WORK(=8.00)/
--          パートは所定時間（みなし所定）が入っていた。
--   ・修正後: 有給（全日）の日は actual_hours = 0.00（実労働なし）に統一。
--             scheduled_hours（所定）は STANDARD_WORK / パート所定のまま変えない。
--
-- 変更範囲: has_full_paid ブロック 2 か所のみ。それ以外は 1 文字も変えていない。
--   (a) L229-239 の has_full_paid 分岐:
--         変更前: IF v_is_kat THEN v_work := 0; ELSE v_work := STANDARD_WORK; END IF;
--         変更後: v_work := 0;   （会社を問わず 0）
--   (b) L410-414 の 明石パート後処理 has_full_paid 分岐:
--         変更前: v_work := v_pt_sched_min; v_contract := v_pt_sched_min;
--         変更後: v_work := 0;               v_contract := v_pt_sched_min;
--
-- KAT (a653846d) への影響:
--   (a) 変更前は v_is_kat=TRUE で v_work:=0 が実行されていた。変更後は
--       v_is_kat 分岐が消えたが、代入値は同じ 0 なので **KAT の挙動は
--       完全に不変**。
--   (b) は `IF NEW.company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74'`
--       の内側のブロックなので KAT 行では発火しない。KAT には影響なし。
--
-- WC (c2d368f0) への影響:
--   WC は本関数の呼び出し順の後で wc_fn_calc_attendance_daily (wc_trg_99_*)
--   が actual_hours を上書きする（有給・公休・欠勤は NULL 化）。
--   よって本関数の (a) 変更が WC の attendance_daily.actual_hours 保存値に
--   与える影響はなし。
--
-- 出張 (has_shutcho)、午前・午後の休暇、欠勤 (has_kekkin)、代休、休日出勤、
-- 公休、通常打刻、KAT の各分岐、WC 関数は一切変更していない。
--
-- 適用手順:
--   1. 本 SQL を SQL Editor で流す
--   2. 20260912_akashi_actual_hours_retrigger.sql で明石全期間を再計算
-- ============================================================================

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
  v_pt_emp_type TEXT;
  v_pt_eff_pattern TEXT;
  v_pt_sched_hours NUMERIC;
  v_pt_sched_min INT;
  v_pt_pat_brk INT;
  v_pt_brk INT;
  v_pt_actual INT;
  v_pt_in_min INT;
  v_pt_out_min INT;
  v_is_rentacar BOOLEAN := FALSE;
  v_is_kat BOOLEAN := FALSE;        -- ★KAT判定フラグ (修正2/3/4/6 で使用)
  v_is_kat_part BOOLEAN := FALSE;   -- ★KATパート判定フラグ (修正1/6 で使用)
BEGIN
  IF NEW.company_id = 'a653846d-3add-47ab-beb8-230a97f2c53e' THEN
    STANDARD_WORK := 450;
    v_is_kat := TRUE;
  ELSIF NEW.company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74' THEN
    STANDARD_WORK := 480;
  ELSIF NEW.company_id = 'c2d368f0-aa9b-4f70-b082-43ec07723d6c' THEN
    STANDARD_WORK := 480;
  ELSE
    STANDARD_WORK := 450;
  END IF;

  SELECT (e.department = 'レンタカー部門') INTO v_is_rentacar
  FROM employees e WHERE e.id = NEW.employee_id;
  IF v_is_rentacar IS NULL THEN v_is_rentacar := FALSE; END IF;

  pat_str := NEW.work_pattern_code;
  IF pat_str IS NULL THEN
    SELECT e.work_pattern_code INTO pat_str
    FROM employees e WHERE e.id = NEW.employee_id;
  END IF;
  IF pat_str IS NULL THEN
    IF NEW.company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74' THEN
      pat_str := '0900-1800';
    ELSIF NEW.company_id = 'c2d368f0-aa9b-4f70-b082-43ec07723d6c' THEN
      pat_str := '1000-1900';
    ELSE
      pat_str := '0930-1800';
    END IF;
  END IF;

  IF v_is_rentacar THEN
    pat_start_min := 570;
    pat_end_min := 1080;
  ELSE
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
  END IF;

  IF NEW.punch_in_raw IS NOT NULL THEN
    IF v_is_rentacar THEN
      NEW.punch_in := DATE_TRUNC('minute', NEW.punch_in_raw AT TIME ZONE 'Asia/Tokyo')::TIME;
    ELSE
      v_jst_time := (NEW.punch_in_raw AT TIME ZONE 'Asia/Tokyo')::TIME;
      v_emp_pattern := NEW.work_pattern_code;
      IF v_emp_pattern IS NULL THEN
        SELECT e.work_pattern_code INTO v_emp_pattern
        FROM employees e WHERE e.id = NEW.employee_id;
      END IF;
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
  END IF;

  am_work := midday - pat_start_min;
  pm_work := pat_end_min - midday;
  pat_work_min := am_work + pm_work - 60;

  IF NEW.punch_in IS NOT NULL THEN
    in_min := EXTRACT(HOUR FROM NEW.punch_in)::INT * 60 + EXTRACT(MINUTE FROM NEW.punch_in)::INT;
    IF NOT v_is_rentacar AND in_min < pat_start_min THEN in_min := pat_start_min; END IF;
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
    v_brk := 0;
    -- ★変更(a): 有給（全日）は会社を問わず実労働として計上しない。
    -- 変更前: IF v_is_kat THEN v_work := 0; ELSE v_work := STANDARD_WORK; END IF;
    -- KAT はもとから v_work:=0 だったため代入値は同じ（挙動不変）。
    -- 明石は v_work=STANDARD_WORK(480) から 0 に変わる。
    -- WC は wc_trg_99 で actual_hours を NULL 上書きするため保存値は不変。
    v_work := 0;
    v_contract := STANDARD_WORK;
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
    -- ★修正B (KATのみ): 半日有給は実労働として計上しない。所定は有給側の時間のまま。
    -- 090山本弥佳 8/22 (午前有給+午後希望休): v_work=0, v_contract=am_cr(210)+pm_cr(0)=210
    IF v_is_kat THEN
      v_work := 0;
    ELSE
      v_work := am_cr + pm_cr;
    END IF;
    -- ★修正4 (KATのみ): 有給側の時間だけを所定に (090山本弥佳 8/22 対応)
    IF v_is_kat THEN
      v_contract := am_cr + pm_cr;
    ELSE
      v_contract := STANDARD_WORK;
    END IF;
    v_ot := GREATEST(0, v_work - v_contract);
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
  ELSIF v_is_rentacar AND has_punch AND NEW.reason IS NOT NULL AND NEW.reason LIKE '%半日希望休%' THEN
    -- ★修正5 (新分岐): レンタカー半日希望休は休憩控除せず所定3:30
    v_brk := 0;
    actual_min := out_min - in_min;
    IF actual_min < 0 THEN actual_min := 0; END IF;
    v_work := actual_min;
    v_contract := 210;
    v_late := 0; v_early := 0;
    v_ot := GREATEST(0, actual_min - v_contract);
    v_done := TRUE;
  ELSIF v_is_rentacar AND has_punch THEN
    v_brk := 60;
    w := out_min - in_min - 60;
    IF w < 0 THEN w := 0; END IF;
    v_work := w;
    v_contract := STANDARD_WORK;
    v_late := 0; v_early := 0;
    v_ot := GREATEST(0, w - STANDARD_WORK);
    v_done := TRUE;
  ELSIF has_am_leave AND has_punch THEN
    v_brk := 0;
    IF in_min < midday THEN eff_in := midday; ELSE eff_in := in_min; END IF;
    -- ★修正A (KATのみ): 実勤務は打刻どおり (out - in) を採用する。
    -- 有給時間帯 (午前) と実労働時間帯 (午後) を合算するため。
    -- KAT以外は現行の eff_in (13:00起点にクランプ) ベースを維持。
    -- 遅刻 v_late は eff_in-midday のまま (13:00を過ぎたら遅刻)。
    IF v_is_kat THEN
      actual_min := out_min - in_min;
    ELSE
      actual_min := out_min - eff_in;
    END IF;
    IF actual_min < 0 THEN actual_min := 0; END IF;
    v_work := actual_min;
    -- ★修正3 (KATのみ): 午前休の所定は 13:00〜終業 (pm_work)。KAT以外は現行の STANDARD_WORK のまま。
    IF v_is_kat THEN
      v_contract := pm_work;
    ELSE
      v_contract := STANDARD_WORK;
    END IF;
    v_late := GREATEST(0, eff_in - midday);
    v_early := GREATEST(0, pat_end_min - out_min);
    v_ot := GREATEST(0, actual_min - v_contract);
    v_done := TRUE;
  ELSIF has_pm_leave AND has_punch THEN
    v_brk := 0;
    actual_min := out_min - in_min;
    IF actual_min < 0 THEN actual_min := 0; END IF;
    v_work := actual_min;
    -- ★修正3 (KATのみ): 午後休の所定は 始業〜13:00 (am_work)。KAT以外は現行の STANDARD_WORK のまま。
    IF v_is_kat THEN
      v_contract := am_work;
    ELSE
      v_contract := STANDARD_WORK;
    END IF;
    v_late := GREATEST(0, in_min - pat_start_min);
    v_early := GREATEST(0, midday - out_min);
    v_ot := GREATEST(0, actual_min - v_contract);
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

  -- 明石西パート処理（★変更(b) の 1 行のみ）
  IF NEW.company_id = 'e85e40ac-71f7-4918-b2fc-36d877337b74' THEN
    SELECT e.employment_type INTO v_pt_emp_type
    FROM employees e WHERE e.id = NEW.employee_id;

    IF v_pt_emp_type = 'パート' THEN
      SELECT o.work_pattern_code INTO v_pt_eff_pattern
      FROM employee_work_pattern_overrides o
      WHERE o.employee_id = NEW.employee_id
        AND o.day_of_week = EXTRACT(DOW FROM NEW.attendance_date)::INT;

      IF v_pt_eff_pattern IS NULL THEN
        SELECT e.work_pattern_code INTO v_pt_eff_pattern
        FROM employees e WHERE e.id = NEW.employee_id;
      END IF;

      SELECT wp.scheduled_hours, wp.break_minutes
      INTO v_pt_sched_hours, v_pt_pat_brk
      FROM work_patterns wp
      WHERE wp.company_id = NEW.company_id
        AND wp.pattern_code = v_pt_eff_pattern;

      IF v_pt_sched_hours IS NOT NULL THEN
        v_pt_sched_min := (v_pt_sched_hours * 60)::INT;

        IF has_full_paid THEN
          -- ★変更(b): 有給（全日）は実労働として計上しない。v_contract（所定）は変えない。
          -- 変更前: v_work := v_pt_sched_min; v_contract := v_pt_sched_min;
          -- 変更後: v_work := 0;               v_contract := v_pt_sched_min;
          v_brk := COALESCE(v_pt_pat_brk, 0);
          v_work := 0; v_contract := v_pt_sched_min;
          v_ot := 0; v_late := 0; v_early := 0;
          v_done := TRUE;

        ELSIF COALESCE(NEW.reason, '') = '公休' OR (has_kyujitsu_day AND NOT has_kyujitsu) THEN
          v_brk := 0; v_work := 0; v_contract := 0;
          v_ot := 0; v_late := 0; v_early := 0;
          v_done := TRUE;

        ELSIF has_punch THEN
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

  -- ★KATパート処理 (修正1): 所定は work_patterns から。休みの日は上書きしない。
  -- パートは遅刻・早退・超過不足を出さない。
  IF v_is_kat THEN
    SELECT e.employment_type INTO v_pt_emp_type
    FROM employees e WHERE e.id = NEW.employee_id;

    IF v_pt_emp_type = 'パート' THEN
      v_is_kat_part := TRUE;

      SELECT o.work_pattern_code INTO v_pt_eff_pattern
      FROM employee_work_pattern_overrides o
      WHERE o.employee_id = NEW.employee_id
        AND o.day_of_week = EXTRACT(DOW FROM NEW.attendance_date)::INT;

      IF v_pt_eff_pattern IS NULL THEN
        SELECT e.work_pattern_code INTO v_pt_eff_pattern
        FROM employees e WHERE e.id = NEW.employee_id;
      END IF;

      SELECT wp.scheduled_hours INTO v_pt_sched_hours
      FROM work_patterns wp
      WHERE wp.company_id = NEW.company_id
        AND wp.pattern_code = v_pt_eff_pattern;

      -- 休みの日 (v_contract=0) は上書きしない。
      -- 半休日 (has_am_leave/has_pm_leave のいずれか真) も上書きしない。
      -- 半休では既に修正3/修正4で v_contract に am_work/pm_work/am_cr+pm_cr が
      -- 入っており、1日分の所定 (v_pt_sched_min) で上書きすると半休判定が壊れる。
      -- 通常出勤・有給全日・欠勤の日など、v_contract>0 かつ半休でない日のみ
      -- work_patterns 由来の1日分所定に置換する。
      IF v_pt_sched_hours IS NOT NULL
         AND v_contract > 0
         AND NOT has_am_leave
         AND NOT has_pm_leave THEN
        v_pt_sched_min := (v_pt_sched_hours * 60)::INT;
        v_contract := v_pt_sched_min;
      END IF;

      -- パートは遅刻・早退・超過不足を「判定しない」。
      -- 0 (=差ゼロ) と NULL (=判定なし) は意味が違うため NULL を入れる。
      -- 帳票側は NULL を空欄として表示する。
      -- (late_minutes / early_leave_minutes は最終代入で下記の値になる。
      --  over_under は最終代入分岐で NULL 化する。)
      v_late := NULL;
      v_early := NULL;
    END IF;
  END IF;

  IF v_done THEN
    NEW.break_minutes := v_brk;
    NEW.late_minutes := v_late;
    NEW.early_leave_minutes := v_early;
    NEW.actual_hours := ROUND(v_work::NUMERIC / 60.0, 2);
    NEW.scheduled_hours := ROUND(v_contract::NUMERIC / 60.0, 2);
    NEW.overtime_hours := ROUND(v_ot::NUMERIC / 60.0, 2);
    -- ★修正6: over_under の計算
    --   KATパート: NULL (判定しない)
    --   KAT非パートで v_work>0: 実勤務 - 所定
    --   KAT非パートで v_work=0: 0 (休みの日=判定した結果ゼロ)
    --   KAT以外: 現行の v_ot
    IF v_is_kat THEN
      IF v_is_kat_part THEN
        NEW.over_under := NULL;
      ELSIF v_work > 0 THEN
        NEW.over_under := ROUND((v_work - v_contract)::NUMERIC / 60.0, 2);
      ELSE
        NEW.over_under := 0;
      END IF;
    ELSE
      NEW.over_under := ROUND(v_ot::NUMERIC / 60.0, 2);
    END IF;
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
