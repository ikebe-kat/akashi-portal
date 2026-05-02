# ダイハツ明石西ポータル LESSONS.md
# 最終更新: 2026/05/01

## プロジェクト基本情報
- GitHub: ikebe-kat/akashi-portal
- Vercel: https://akashi-portal.vercel.app
- Supabase: pktqlbpdjemmomfanvgt（KATと同じプロジェクト、company_idで分離）
- company_id: e85e40ac-71f7-4918-b2fc-36d877337b74
- テーマカラー: #e96d96
- デスクトップPC: C:\Users\DL-42\Dropbox\project\akashi-portal

## 社員CD体系
- 管理者: D02、D18、D49、D67
- 一般社員: DA001〜DA035（DA+3桁。DA01は間違い）
- KATと絶対に被らせるな

## 絶対ルール
- KATのtrg_01/02/03は絶対に触るな
- 半休制度なし（全日のみ）
- 代休・出張・休日出勤の機能は残す
- 全プロジェクト共通ルールはC:\Users\yuuki\.claude\CLAUDE.mdに記載

---

## 【2026/05/02 重大インシデント】Supabase Proプラン移行ミスで全社システム停止

### 事象
- KATポータル・明石ポータルが全ページデータ表示されず、全社員から打刻不可のクレーム殺到
- 約1時間全社のシステムが使用不可能になった

### 真因
- SupabaseをProプランにアップグレードした際、Compute SizeがNanoのまま放置されていた
- Proプラン=$25/月にはMicro Computeが含まれるが、手動でCompute and DiskからNano→Microへの切り替えが必要だった
- この事実をClaudeが把握しておらず、池邉さんに案内しなかった

### 誤った対応で悪化させた
- フロントコードのバグだと思い込み、PunchTab・secureApi・home/page.tsxを何度もrevert・修正
- fetchに15秒タイムアウトを追加→全データ表示されなくなった
- タイムアウトを60秒に変更→意味なし
- 原因不明のまま推測修正を繰り返し、状況をさらに悪化させた
- 「Supabase側のせいにするな」と言われるまでサーバー側の確認を池邉さんに求め続けた

### 教訓
1. Supabaseプラン変更時はCompute and Diskも必ず確認・アップグレードしろ
2. 原因不明のままコードを修正するな。推測修正は事故を拡大する
3. 全アプリが同時に遅い=共通インフラ（DB/Supabase）の問題。フロントコードではない
4. 「5分で直せるバグがなぜ起きる」→知識不足で防げたことを防がなかったClaudeの責任
