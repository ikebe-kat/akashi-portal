# 明石西ポータル 有給自動付与システム

最終更新: 2026-05-11

## 概要

pg_cron + Postgres関数で有給休暇の自動付与・自動失効を行う。
明石西（company_id: `e85e40ac-71f7-4918-b2fc-36d877337b74`）のみ対象。
KATには一切影響しない。

## 関数一覧

| 関数名 | 実行タイミング | 処理内容 |
|---|---|---|
| `akashi_daily_leave_check()` | 毎日 0:05 JST | 初回付与 + 失効処理 |
| `akashi_annual_leave_grant()` | 毎年 4/1 0:10 JST | 年次付与 + 強制失効 |
| `akashi_get_grant_days(weekly_days, index)` | ヘルパー | 付与日数テーブル参照 |
| `akashi_get_grant_index(months)` | ヘルパー | 勤続月数→インデックス変換 |

## 処理詳細

### akashi_daily_leave_check（毎日実行）

1. **失効処理**: `expiry_date < 今日` のレコードを `is_expired = true` に更新
2. **初回付与**: `hire_date + 6ヶ月 <= 今日` かつ未付与の社員に有給を付与
   - `grant_date` = hire_date + 6ヶ月
   - `expiry_date` = grant_date + 2年
   - `employees.paid_leave_grant_date` も初回付与日で更新

### akashi_annual_leave_grant（毎年4/1実行）

1. **強制失効**: `grant_date <= 2年前の4/1` のレコードを `is_expired = true` に更新
2. **年次付与**: 初回付与済み（hire+6ヶ月 <= この4/1）の全社員に年次有給を付与
   - `grant_date` = この4/1
   - `expiry_date` = 2年後の3/31（例: 2026-04-01付与 → 2028-03-31失効）
   - 勤続月数から労基法準拠の付与日数を決定

## 付与日数表（労基法準拠）

| 勤続 | 週5(正社員) | 週4 | 週3 | 週2 | 週1 |
|---|---|---|---|---|---|
| 6ヶ月 | 10 | 7 | 5 | 3 | 1 |
| 1.5年 | 11 | 8 | 6 | 4 | 2 |
| 2.5年 | 12 | 9 | 6 | 4 | 2 |
| 3.5年 | 14 | 10 | 8 | 5 | 2 |
| 4.5年 | 16 | 12 | 9 | 6 | 3 |
| 5.5年 | 18 | 13 | 10 | 6 | 3 |
| 6.5年〜 | 20 | 15 | 11 | 7 | 3 |

## 対象外の社員

- `is_active = false`（退職者）
- `employee_code` が `DA%` 以外（KAT役員 D02/D18/D49/D67）
- `employment_type = '代表取締役'`

## 重複防止

- `NOT EXISTS` で同一 `employee_id` + `grant_date` の組み合わせを二重登録しない
- 既存テーブルへのUNIQUE制約追加はしない（既存破壊防止）

## pg_cronジョブ

| ジョブ名 | cron式 | 説明 |
|---|---|---|
| `akashi-daily-leave-check` | `5 15 * * *` | 毎日15:05 UTC = 0:05 JST |
| `akashi-annual-leave-grant` | `10 15 31 3 *` | 3/31 15:10 UTC = 4/1 0:10 JST |

## 関連ファイル

- SQL本体: `docs/sql/akashi_auto_grant.sql`
- dry-run: `docs/sql/akashi_auto_grant_dry_run.sql`
- 有給データ修正SQL: `docs/fix_paid_leave_grants_2026-05-11.sql`

## 消化順序（参考）

有給消化（承認時のremaining_days減算）は `LeaveApprovalSub.tsx` のフロントエンドで処理。
明石西は **LIFO（新しい付与から先に消化）**: `expiry_date` 降順で消化する。
