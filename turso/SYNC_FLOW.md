# データ同期フロー

## 概要

Slackワークフローから入力された営業実績データを、Google Sheets経由でTursoデータベースに自動同期するフロー。

```
Slackワークフロー（フォーム入力）
    ↓
Google Sheets（rawdataシート）
    ↓ GASトリガー（5分毎）
Turso DB
```

## システム構成

### 1. Slackワークフロー

- **入力方法**: 「情報をフォームで収集する」ステップでデータ入力
- **送信先**: Google Sheetsへ行追加

#### 実績rawdata入力項目

| 項目 | 説明 | 型 |
|------|------|-----|
| 担当名 | 営業担当者名 | テキスト |
| 案件名 | プロジェクト名 | テキスト |
| 入力日 | 実績の対象日 | 日付 |
| 架電時間 | 架電に費やした時間（時間単位） | 数値 |
| 架電数 | 架電した件数 | 数値 |
| PR数 | PRした件数 | 数値 |
| アポ数 | アポイントメント獲得数 | 数値 |
| 定性所感 | 自由記述 | テキスト |

#### 売上報告rawdata入力項目

| 項目 | 説明 | 型 |
|------|------|-----|
| 営業担当者 | 担当者名 | テキスト |
| 売上種別 | アポ/資料送付など | テキスト |
| 案件名 | プロジェクト名 | テキスト |
| 会社名 | 取引先企業名 | テキスト |
| 取得日 | アポ取得日 | 日付 |
| 実施日時 | アポ実施日時 | 日時 |
| 金額 | 取得アポ金額 | 数値 |
| 部署 | 取引先部署 | テキスト |
| 役職 | 取引先役職 | テキスト |
| 名前 | 取引先担当者名 | テキスト |
| 電話番号 | 取引先電話番号 | テキスト |
| メールアドレス | 取引先メール | テキスト |
| 架電ヒアリング | ヒアリング内容 | テキスト |
| 営業区分 | 新規/既存など | テキスト |
| リスケ | リスケジュールフラグ | テキスト |
| 取引 | 取引ID | テキスト |

### 2. Google Sheets

- **スプレッドシートID**: `1Qo9LvDqUgkPVcaoDN-t4p8YKryoILKEMdMugDlpDTIQ`
- **対象シート**:
  - `実績rawdata` - 営業活動の実績データ
  - `売上報告rawdata` - アポ・売上関連データ

### 3. GAS → Turso同期

- **トリガー**: 5分毎のバッチ処理（時間主導型）
- **処理内容**: 前回同期以降の新規行をTursoへINSERT
- **同期位置管理**: PropertiesServiceで最終同期行を記録

## セットアップ手順

### 1. GASプロジェクトを開く

1. [スプレッドシート](https://docs.google.com/spreadsheets/d/1Qo9LvDqUgkPVcaoDN-t4p8YKryoILKEMdMugDlpDTIQ) を開く
2. 拡張機能 → Apps Script

### 2. スクリプトを追加

以下のファイルをGASプロジェクトに追加:
- `SyncToTurso.js` - 実績rawdata用同期スクリプト
- `SyncSalesToTurso.js` - 売上報告rawdata用同期スクリプト

### 3. スクリプトプロパティを設定

**プロジェクトの設定 → スクリプトプロパティ** で以下を追加:

| プロパティ名 | 値 |
|-------------|-----|
| TURSO_DATABASE_URL | `libsql://all-staff-rawdata-ebidigi.aws-ap-northeast-1.turso.io` |
| TURSO_AUTH_TOKEN | Tursoダッシュボードから取得したトークン |
| SLACK_WEBHOOK_URL | （オプション）エラー通知用Webhook URL |

### 4. トリガーを設定

**トリガー** メニューから以下を追加:

| 関数名 | イベントソース | 時間ベース | 間隔 |
|--------|---------------|-----------|------|
| syncPerformanceToTurso | 時間主導型 | 分ベース | 5分 |
| syncSalesToTurso | 時間主導型 | 分ベース | 5分 |

## データ量の想定

| 期間 | 予想件数 |
|------|---------|
| 1日 | 100〜150件 |
| 1ヶ月 | 約4,500件 |
| 1年 | 約55,000件 |

この規模であれば:
- ✅ Google Sheets: 問題なし（100万セル上限に余裕）
- ✅ GAS: 問題なし（6分実行制限に余裕、5分間隔で十分）
- ✅ Turso: 問題なし（無料枠9GB、500Mリード/月で余裕）

## 運用・メンテナンス

### 同期状態の確認

GASエディタで以下を実行:
```javascript
checkSyncStatus();      // 実績rawdataの同期状態
checkSalesSyncStatus(); // 売上報告rawdataの同期状態
```

### 同期位置のリセット（再同期時）

```javascript
resetSyncPosition();       // 実績rawdata
resetSalesSyncPosition();  // 売上報告rawdata
```

**注意**: 重複挿入を避けるため、リセット前にTursoの該当データを削除してください。

### トラブルシューティング

#### 同期が動作しない

1. トリガーが設定されているか確認
2. スクリプトプロパティが正しいか確認
3. GASの実行ログを確認（View → Execution log）

#### データが重複する

1. 同期位置が正しいか確認（`checkSyncStatus()`）
2. 手動でTursoの重複レコードを削除
3. 同期位置を正しい値に設定

#### Turso接続エラー

1. TURSO_DATABASE_URLが正しい形式か確認
2. TURSO_AUTH_TOKENが有効か確認（期限切れの可能性）
3. Tursoダッシュボードでデータベースステータスを確認

## アーカイブ計画

1年程度運用後、Sheetsの行数が5万件を超えた場合:

1. 古いデータをCSVエクスポート
2. シートから古い行を削除
3. 同期位置をリセット

Tursoにはすべてのデータが蓄積されているため、履歴参照はTursoから行う。

## 将来の拡張

### Slack → Turso直接連携

現在のSlack → Sheets → Tursoフローを、Slack → Turso直接連携に移行する場合:

**推奨構成**:
```
Slackワークフロー（Webhook送信）
    ↓
Cloudflare Workers / AWS Lambda
    ↓
Turso DB
```

**メリット**:
- Sheetsを経由しないためリアルタイム性向上
- 中間データ層が不要に
- よりシンプルな構成

**要件**:
1. Slackワークフローから「Webhookを送信」ステップで外部URLへPOST
2. Cloudflare Workers等でWebhookを受信
3. ペイロードをパースしてTursoにINSERT

この構成は別途ドキュメント化予定。
