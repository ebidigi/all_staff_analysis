# 全社員 営業分析ダッシュボード

全社員の営業実績データを分析するダッシュボード。稼働報酬チームのダッシュボードとは別に、全社員を対象とした分析機能を提供する。

## プロジェクト構成

```
all_staff_analysis/
├── index.html          # 月内管理ダッシュボードUI
├── comparison.html     # 過去比較ダッシュボードUI
├── gas/
│   ├── Code.js         # GAS API（参照用・既存GASを更新）
│   └── Sync*.js        # Turso同期スクリプト
├── turso/
│   ├── .env            # Turso認証情報
│   └── schema.sql      # DBスキーマ
├── deploy.sh           # UIデプロイスクリプト
└── CLAUDE.md           # 本ファイル
```

## データソース

### Turso データベース（メイン）

実績データはTurso（SQLite）に保存され、HTTP APIで取得する。

**パフォーマンスDB**:
- URL: `https://all-staff-rawdata-ebidigi.aws-ap-northeast-1.turso.io`
- テーブル: `performance_rawdata`
- カラム: `member_name`, `project_name`, `input_date`, `call_hours`, `call_count`, `pr_count`, `appointment_count`, `data_source`

**社員マスターDB**:
- URL: `https://digiman-talent-ebidigi.aws-ap-northeast-1.turso.io`
- テーブル: `employees`
- カラム: `name`, `employee_type` (employee/contractor/intern), `department`, `position`, `hire_date`, `retire_date`

### スプレッドシート（元データ）

- **スプレッドシートID**: `1Qo9LvDqUgkPVcaoDN-t4p8YKryoILKEMdMugDlpDTIQ`
- **対象シート**: 実績rawdata
- GASトリガーでTursoに同期

## デプロイ方法

### UI変更時

```bash
./deploy.sh
```

これで以下のファイルがコピーされる：
- `index.html` → `/Users/ebineryota/all_staff_analysis.html`
- `comparison.html` → `/Users/ebineryota/all_staff_comparison.html`

### ブラウザで確認

```
file:///Users/ebineryota/all_staff_analysis.html      # 月内管理ダッシュボード
file:///Users/ebineryota/all_staff_comparison.html    # 過去比較ダッシュボード
```

## 社員種別

担当者は以下の3種別に分類される：

| 種別 | employee_type | 説明 |
|------|---------------|------|
| 社員 | `employee` | 正社員 |
| インターン | `intern` | インターン生 |
| 業務委託 | `contractor` | 業務委託メンバー |

### 種別の管理

社員マスターDBの`employees`テーブルで管理。新しいメンバーを追加する場合：

```sql
INSERT INTO employees (name, employee_type, created_at, updated_at)
VALUES ('@名前/romanized name', 'contractor', datetime('now'), datetime('now'));
```

**注意**: `name`はperformance_rawdataの`member_name`と一致させる必要がある（部分マッチも対応）

## 除外設定

以下の担当者はデータから自動的に除外される：
- @山田　香苗
- @須藤　明里/akari sudo

除外対象を変更する場合は、`index.html` と `comparison.html` の `EXCLUDED_MEMBERS` 配列を編集する。

## 機能一覧

### 月内管理ダッシュボード（index.html）

#### サイドバーフィルター

- **表示期間**: 開始日・終了日で絞り込み（デフォルト: 月初〜今日）
- **種別フィルター**: 社員/インターン/業務委託で絞り込み
- **案件フィルター**: 案件名で絞り込み
- **担当者フィルター**: 担当者名で絞り込み（検索ボックス付き、種別順ソート）
- **双方向連動**: 案件選択→担当者候補を絞り込み、担当者選択→案件候補を絞り込み

#### 前月同日比 進捗ペース

- 今月（1日〜今日）と前月同期間の比較
- 架電数/PR数/アポ数/稼働時間の増減率を表示

#### 実数KPI

- 架電数
- PR数
- アポ数
- 稼働時間
- 架電数/H

#### 率KPI

- 架電toPR率（先月比・通算比）
- PRtoアポ率（先月比・通算比）
- 架電toアポ率（先月比・通算比）

#### 日次推移グラフ

- 架電数/PR数/アポ数/稼働時間
- 架電toPR率/PRtoアポ率/架電toアポ率/架電数/H

#### 担当者別比較グラフ

- 横棒グラフで担当者間の比較を表示
- 選択した指標で降順ソート

### 過去比較ダッシュボード（comparison.html）

#### サイドバーフィルター

- **年度選択**: 決算年度（7月〜翌6月）
- **表示期間**: 月単位で選択
- **種別フィルター**: 社員/インターン/業務委託
- **案件フィルター**: 案件名で絞り込み
- **担当者フィルター**: 担当者名で絞り込み（検索ボックス付き）

#### 月別推移表

- 選択期間の月別データを表形式で表示
- 各指標ボタンで表示切り替え
- 合計/期間平均と前月比を表示

#### 担当者×月別表

- 担当者ごとに各月の実績をマトリックス表示
- 合計でソート（降順）
- 全担当者の合計行を表示

#### 月別チャート

- 月別推移を棒グラフで可視化

## 名前マッチングロジック

performance_rawdataとemployeesテーブルの名前照合は以下の順で行う：

1. **完全一致**: `employeeMaster[name]`
2. **前方一致**: performance名がtalent名で始まる
3. **逆前方一致**: talent名がperformance名で始まる
4. **正規化一致**: @とスペースを除去し、/以前の部分で比較

マッチしない場合はデフォルトで`employee`（社員）として扱う。

## GitHubリポジトリ

**URL:** https://github.com/ebidigi/all_staff_analysis

## 関連プロジェクト

- **稼働報酬チームダッシュボード**: `/Users/ebineryota/code/sales_dashboard_dynamic/`
  - 概要タブ・分析タブ・設定タブを持つフル機能ダッシュボード
  - 対象: 稼働報酬チームのみ

## 注意事項

- Turso認証トークンは`turso/.env`に保存（リポジトリにはコミットしない）
- 新しいメンバーが追加された場合、社員マスターDBへの登録が必要
- 名前の形式（@プレフィックス、/以降のローマ字など）はperformance_rawdataと合わせる
