-- ============================================================
-- 明石西ポータル 有給自動付与システム
-- 作成日: 2026-05-11
-- 実行: 池邉さん確認後、Supabase SQL Editorで実行
-- ============================================================
-- company_id: e85e40ac-71f7-4918-b2fc-36d877337b74 (明石西)
-- KATには一切影響しない（全WHERE句にcompany_id指定）
-- 既存テーブル・カラム・制約・トリガーの変更なし
-- ============================================================


-- ■■■ PART 1: ヘルパー関数 ■■■

-- ============================================================
-- akashi_get_grant_days: 週所定労働日数×付与インデックス → 付与日数
-- 労基法準拠テーブル（フロントのDAYS_FULL/DAYS_PARTと同一）
-- ============================================================
CREATE OR REPLACE FUNCTION akashi_get_grant_days(
  p_weekly_days INT,
  p_index INT
) RETURNS INT AS $$
DECLARE
  v_idx INT := LEAST(GREATEST(p_index, 0), 6);
  -- 正社員/週5: 10→11→12→14→16→18→20
  full_days INT[] := ARRAY[10, 11, 12, 14, 16, 18, 20];
  -- パート週4: 7→8→9→10→12→13→15
  w4_days   INT[] := ARRAY[7, 8, 9, 10, 12, 13, 15];
  -- パート週3: 5→6→6→8→9→10→11
  w3_days   INT[] := ARRAY[5, 6, 6, 8, 9, 10, 11];
  -- パート週2: 3→4→4→5→6→6→7
  w2_days   INT[] := ARRAY[3, 4, 4, 5, 6, 6, 7];
  -- パート週1: 1→2→2→2→3→3→3
  w1_days   INT[] := ARRAY[1, 2, 2, 2, 3, 3, 3];
BEGIN
  IF p_weekly_days >= 5 THEN
    RETURN full_days[v_idx + 1];
  ELSIF p_weekly_days = 4 THEN
    RETURN w4_days[v_idx + 1];
  ELSIF p_weekly_days = 3 THEN
    RETURN w3_days[v_idx + 1];
  ELSIF p_weekly_days = 2 THEN
    RETURN w2_days[v_idx + 1];
  ELSIF p_weekly_days = 1 THEN
    RETURN w1_days[v_idx + 1];
  ELSE
    RETURN full_days[v_idx + 1];
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- ============================================================
-- akashi_get_grant_index: 勤続月数 → 付与テーブルのインデックス(0〜6)
-- GRANT_MONTHS = [6, 18, 30, 42, 54, 66, 78]
-- ============================================================
CREATE OR REPLACE FUNCTION akashi_get_grant_index(p_months INT)
RETURNS INT AS $$
DECLARE
  grant_months INT[] := ARRAY[6, 18, 30, 42, 54, 66, 78];
  v_index INT := 0;
BEGIN
  FOR i IN 1..7 LOOP
    IF p_months >= grant_months[i] THEN
      v_index := i - 1;
    END IF;
  END LOOP;
  RETURN v_index;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- ■■■ PART 2: メイン関数 ■■■

-- ============================================================
-- akashi_daily_leave_check: 毎日0:05 JST実行
-- 処理1: 入社6ヶ月後を迎えた社員に初回有給付与
-- 処理2: 失効日を過ぎたレコードをis_expired=trueに更新
-- ============================================================
CREATE OR REPLACE FUNCTION akashi_daily_leave_check()
RETURNS void AS $$
DECLARE
  v_company_id UUID := 'e85e40ac-71f7-4918-b2fc-36d877337b74';
  v_today DATE := (now() AT TIME ZONE 'Asia/Tokyo')::DATE;
  rec RECORD;
  v_grant_date DATE;
  v_days INT;
BEGIN
  -- ① 失効処理: expiry_date < 今日 → is_expired = true
  UPDATE paid_leave_grants
  SET is_expired = true, updated_at = now()
  WHERE company_id = v_company_id
    AND is_expired = false
    AND expiry_date < v_today;

  -- ② 初回付与: hire_date + 6ヶ月 <= 今日 かつ paid_leave_grants に1件もない社員のみ
  --    既にレコードがある社員 = Excel等で既に有給管理済み → 初回付与は不要
  FOR rec IN
    SELECT
      e.id AS emp_id,
      e.employee_code,
      COALESCE(e.weekly_work_days, 5) AS weekly_days,
      (e.hire_date + INTERVAL '6 months')::DATE AS first_grant_date
    FROM employees e
    WHERE e.company_id = v_company_id
      AND e.is_active = true
      AND e.employee_code LIKE 'DA%'
      AND e.employment_type != '代表取締役'
      AND e.hire_date IS NOT NULL
      AND (e.hire_date + INTERVAL '6 months')::DATE <= v_today
      AND NOT EXISTS (
        SELECT 1 FROM paid_leave_grants g
        WHERE g.employee_id = e.id
      )
  LOOP
    v_grant_date := rec.first_grant_date;
    v_days := akashi_get_grant_days(rec.weekly_days, 0);

    INSERT INTO paid_leave_grants (
      id, employee_id, company_id, grant_date, grant_days, remaining_days,
      expiry_date, is_expired, granted, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      rec.emp_id,
      v_company_id,
      v_grant_date,
      v_days,
      v_days,
      (v_grant_date + INTERVAL '2 years')::DATE,
      false,
      true,
      now(),
      now()
    );

    -- employees.paid_leave_grant_date を初回付与日で更新
    UPDATE employees
    SET paid_leave_grant_date = v_grant_date, updated_at = now()
    WHERE id = rec.emp_id
      AND company_id = v_company_id
      AND (paid_leave_grant_date IS NULL OR paid_leave_grant_date != v_grant_date);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- akashi_annual_leave_grant: 毎年4/1 0:10 JST実行
-- 処理1: 全社員に勤続年数ベースで年次有給付与
-- 処理2: 2年前以前のレコードを強制失効
-- ============================================================
CREATE OR REPLACE FUNCTION akashi_annual_leave_grant()
RETURNS void AS $$
DECLARE
  v_company_id UUID := 'e85e40ac-71f7-4918-b2fc-36d877337b74';
  v_today DATE := (now() AT TIME ZONE 'Asia/Tokyo')::DATE;
  v_this_april DATE := make_date(EXTRACT(YEAR FROM v_today)::INT, 4, 1);
  v_expiry DATE := make_date(EXTRACT(YEAR FROM v_this_april)::INT + 2, 3, 31);
  v_expire_before DATE := make_date(EXTRACT(YEAR FROM v_this_april)::INT - 2, 4, 1);
  rec RECORD;
  v_months INT;
  v_index INT;
  v_days INT;
BEGIN
  -- ① 強制失効: grant_date が2年前の4/1以前 → is_expired = true
  UPDATE paid_leave_grants
  SET is_expired = true, updated_at = now()
  WHERE company_id = v_company_id
    AND is_expired = false
    AND grant_date <= v_expire_before;

  -- ② 年次付与: 初回付与済み（hire+6ヶ月 <= この4/1）の全社員
  FOR rec IN
    SELECT
      e.id AS emp_id,
      e.employee_code,
      e.hire_date,
      COALESCE(e.weekly_work_days, 5) AS weekly_days
    FROM employees e
    WHERE e.company_id = v_company_id
      AND e.is_active = true
      AND e.employee_code LIKE 'DA%'
      AND e.employment_type != '代表取締役'
      AND e.hire_date IS NOT NULL
      AND (e.hire_date + INTERVAL '6 months')::DATE <= v_this_april
      AND NOT EXISTS (
        SELECT 1 FROM paid_leave_grants g
        WHERE g.employee_id = e.id
          AND g.grant_date = v_this_april
      )
  LOOP
    -- 勤続月数 → 付与インデックス → 付与日数
    v_months := (EXTRACT(YEAR FROM v_this_april) - EXTRACT(YEAR FROM rec.hire_date)) * 12
              + (EXTRACT(MONTH FROM v_this_april) - EXTRACT(MONTH FROM rec.hire_date));
    v_index := akashi_get_grant_index(v_months);
    v_days := akashi_get_grant_days(rec.weekly_days, v_index);

    INSERT INTO paid_leave_grants (
      id, employee_id, company_id, grant_date, grant_days, remaining_days,
      expiry_date, is_expired, granted, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      rec.emp_id,
      v_company_id,
      v_this_april,
      v_days,
      v_days,
      v_expiry,
      false,
      true,
      now(),
      now()
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ■■■ PART 3: pg_cronジョブ登録 ■■■
-- Supabase SQL Editorで実行（pg_cron拡張が必要）

-- 毎日 0:05 JST = 15:05 UTC
SELECT cron.schedule(
  'akashi-daily-leave-check',
  '5 15 * * *',
  $$SELECT akashi_daily_leave_check()$$
);

-- 毎年 4/1 0:10 JST = 3/31 15:10 UTC
SELECT cron.schedule(
  'akashi-annual-leave-grant',
  '10 15 31 3 *',
  $$SELECT akashi_annual_leave_grant()$$
);
