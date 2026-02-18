# 全社員 営業分析ダッシュボード

全社員の営業実績データを分析するダッシュボード。稼働報酬チームのダッシュボードとは別に、全社員を対象とした分析機能を提供する。

## プロジェクト構成

```
all_staff_analysis/
├── index.html          # 分析ダッシュボードUI
├── comparison.html     # 過去比較表UI
├── gas/
│   └── Code.js         # GAS API（参照用・既存GASを更新）
├── deploy.sh           # UIデプロイスクリプト
└── CLAUDE.md           # 本ファイル
```

## データソース

- **スプレッドシートID**: `1Qo9LvDqUgkPVcaoDN-t4p8YKryoILKEMdMugDlpDTIQ`
- **対象シート**: 実績rawdata
- **列構成**:
  - A: 担当名
  - B: 案件名
  - C: 入力日
  - D: 架電時間
  - E: 架電数
  - F: PR数
  - G: アポ数

## API仕様

既存の稼働報酬チーム用GASを共有し、`source`パラメータで切り替える。

### エンドポイント

```
GET https://script.google.com/macros/s/AKfycbwG_1cvgfnnNuK9PuhmXJOSeBuS8kFzJbf-R1p0qvySu0BW8GYKJKCKzHJ4Ny11FtkV/exec
```

### パラメータ

| パラメータ | 説明 | 例 |
|-----------|------|-----|
| type | データ種別 | `rawdata` |
| source | データソース | `all_staff`（全社員用） |
| startDate | 開始日 | `2026-02-01` |
| endDate | 終了日 | `2026-02-28` |

### 使用例

```
?type=rawdata&source=all_staff&startDate=2026-02-01&endDate=2026-02-28
```

## デプロイ方法

### UI変更時

```bash
./deploy.sh
```

これで以下のファイルがコピーされる：
- `index.html` → `/Users/ebineryota/all_staff_analysis.html`
- `comparison.html` → `/Users/ebineryota/all_staff_comparison.html`

### GAS変更時

1. GASエディタを開く
2. `gas/Code.js` の内容をコピー＆ペースト
3. **デプロイ → デプロイを管理 → 鉛筆アイコン → バージョン「新バージョン」→ デプロイ**
   - ※「新しいデプロイ」だとURLが変わるので注意

### ブラウザで確認

```
file:///Users/ebineryota/all_staff_analysis.html      # 分析ダッシュボード
file:///Users/ebineryota/all_staff_comparison.html    # 過去比較表
```

## 除外設定

以下の担当者はデータから自動的に除外される：
- 山田　香苗

除外対象を変更する場合は、`index.html` と `comparison.html` の `EXCLUDED_MEMBERS` 配列を編集する。

## 機能一覧

### 分析ダッシュボード（index.html）

#### フィルター機能

- **案件フィルター**: 案件名で絞り込み
- **担当者フィルター**: 担当者名で絞り込み
- **双方向連動**: 案件選択→担当者候補を絞り込み、担当者選択→案件候補を絞り込み
- **期間フィルター**: 開始日・終了日で絞り込み（デフォルト: 月初〜今日）

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

- 架電数
- PR数
- アポ数
- 稼働時間
- 架電toPR率
- PRtoアポ率
- 架電toアポ率
- 架電数/H

#### 担当者別比較グラフ

- 横棒グラフで担当者間の比較を表示
- 選択した指標で降順ソート
- 架電数/PR数/アポ数/稼働時間/各率指標に対応

#### 前月比較機能

- 「前月と比較」チェックで有効化
- 率指標のみ表示（架電数/PR数/アポ数は非表示）
- 前月平均を水平線で表示

### 過去比較表（comparison.html）

#### 月別推移表

- 過去3/6/12ヶ月の月別データを表形式で表示
- 案件フィルターで絞り込み可能
- 各指標ボタンで表示切り替え
- 合計/平均と前月比を表示

#### 担当者×月別表

- 担当者ごとに各月の実績をマトリックス表示
- 合計でソート（降順）
- 全担当者の合計行を表示

## キャッシュ機能

- ローカルストレージに5分間キャッシュ
- キャッシュキー: `allStaffAnalysisDataCache`
- キャッシュクリア: コンソールで `localStorage.removeItem('allStaffAnalysisDataCache'); location.reload();`

## 将来の拡張計画

### データベース構築（Turso）

パフォーマンスが問題になった場合、Turso（SQLite）でデータベースを構築することを検討。

**想定構成**:
- Tursoでリアルタイムデータをキャッシュ
- GASからTursoへの定期同期
- フロントエンドはTurso HTTP APIを直接呼び出し

**メリット**:
- GASの実行時間制限を回避
- 高速なクエリ応答
- 履歴データの保存が容易

## 関連プロジェクト

- **稼働報酬チームダッシュボード**: `/Users/ebineryota/code/sales_dashboard_dynamic/`
  - 概要タブ・分析タブ・設定タブを持つフル機能ダッシュボード
  - 対象: 稼働報酬チームのみ

## 注意事項

- GASの変更は稼働報酬チームのダッシュボードにも影響する
- `source`パラメータなし（またはdefault）= 稼働報酬チーム用データ
- `source=all_staff` = 全社員用データ
