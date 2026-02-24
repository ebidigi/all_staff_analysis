# Turso データベース スキーマ設計

## データベース名
`all-staff-rawdata`

## テーブル構成

### 1. performance_rawdata（実績rawdata）
旧rawdata + 新実績rawdata をマージしたテーブル

| カラム名 | 型 | 説明 | 備考 |
|---------|-----|------|------|
| id | TEXT | UUID主キー | 自動生成 |
| member_name | TEXT | 担当名 | @付きSlackユーザー名 |
| project_name | TEXT | 案件名 | |
| input_date | TEXT | 入力日 | ISO8601形式 |
| work_start_time | TEXT | 稼働開始時刻 | 旧データのみ |
| work_end_time | TEXT | 稼働終了時刻 | 旧データのみ |
| call_hours | REAL | 架電時間（時間） | |
| call_count | INTEGER | 架電数 | |
| pr_count | INTEGER | PR数 | |
| email_count | INTEGER | メール数 | 旧データのみ |
| appointment_count | INTEGER | アポ数 | |
| document_send_count | INTEGER | 資料送付数 | 旧データのみ |
| contact_name_count | INTEGER | 担当者名取得数 | 旧データのみ |
| qualitative_feedback | TEXT | 定性所感 | 新データのみ |
| data_source | TEXT | データソース | 'old' or 'new' |
| created_at | TEXT | 作成日時 | ISO8601形式 |
| updated_at | TEXT | 更新日時 | ISO8601形式 |

### 2. sales_report_rawdata（売上報告rawdata）
旧アポrawdata + 新売上報告rawdata をマージしたテーブル

| カラム名 | 型 | 説明 | 備考 |
|---------|-----|------|------|
| id | TEXT | UUID主キー | 自動生成 |
| sales_rep | TEXT | 営業担当者 | @付きSlackユーザー名 |
| sales_type | TEXT | 売上種別 | IS成果報酬/IS稼働報酬など |
| project_name | TEXT | 案件名 | |
| company_name | TEXT | 会社名 | |
| acquisition_date | TEXT | アポ取得日 | ISO8601形式 |
| meeting_datetime | TEXT | アポ実施日時 | ISO8601形式 |
| amount | INTEGER | 金額 | |
| department | TEXT | 部署 | |
| position | TEXT | 役職 | |
| contact_name | TEXT | 担当者名 | |
| phone_number | TEXT | 電話番号 | |
| email | TEXT | メールアドレス | |
| call_hearing | TEXT | 架電ヒアリング内容 | |
| sales_category | TEXT | 営業区分 | 新規獲得先など |
| reschedule_flag | TEXT | リスケフラグ | |
| deal_id | TEXT | 取引ID | UUID |
| layer | TEXT | レイヤー | 旧データのみ |
| memo | TEXT | メモ | 旧データのみ |
| status | TEXT | 実施ステータス | 旧データのみ |
| data_source | TEXT | データソース | 'old' or 'new' |
| created_at | TEXT | 作成日時 | ISO8601形式 |
| updated_at | TEXT | 更新日時 | ISO8601形式 |

### 3. external_id_rawdata（外IDrawdata）
外部からの見込み客IDデータ

| カラム名 | 型 | 説明 | 備考 |
|---------|-----|------|------|
| id | TEXT | UUID主キー | 自動生成 |
| company_phone | TEXT | 法人電話番号 | |
| company_name | TEXT | 企業名 | |
| department_name | TEXT | 部署名 | |
| department_phone | TEXT | 部署番号 | |
| position | TEXT | 役職 | |
| contact_last_name | TEXT | 担当者（姓） | |
| contact_first_name | TEXT | 担当者名（名） | |
| project_name | TEXT | 架電案件 | |
| lead_source | TEXT | 取得ソース | |
| sales_rep | TEXT | saleRep | @付きSlackユーザー名 |
| original_id | TEXT | 元データのUUID | |
| timestamp | TEXT | タイムスタンプ | |
| created_at | TEXT | 作成日時 | ISO8601形式 |
| updated_at | TEXT | 更新日時 | ISO8601形式 |

### 4. document_send_rawdata（資料送付rawdata）
資料送付報告データ

| カラム名 | 型 | 説明 | 備考 |
|---------|-----|------|------|
| id | TEXT | UUID主キー | 自動生成 |
| project_name | TEXT | 案件名 | |
| company_name | TEXT | 会社名 | |
| contact_name | TEXT | 担当名 | |
| email | TEXT | メールアドレス | |
| phone_number | TEXT | 電話番号 | |
| temperature | TEXT | 温度感 | 熱見込/薄見込/資料送付のみ |
| temperature_reason | TEXT | 温度感の根拠 | |
| next_touch_date | TEXT | NT（次回接触日） | |
| next_action | TEXT | NA（次回アクション） | |
| substitute_call_request | TEXT | 代打コール依頼先 | |
| proposal_content | TEXT | 提案内容 | |
| customer_comment | TEXT | 客先発言 | |
| send_address | TEXT | 送付アドレス | |
| email_proxy_request | TEXT | メール送信代行依頼 | |
| department_position | TEXT | 部署名/役職名 | |
| other_notes | TEXT | その他 | |
| sender | TEXT | 送信者 | @付きSlackユーザー名 |
| timestamp | TEXT | タイムスタンプ | |
| created_at | TEXT | 作成日時 | ISO8601形式 |
| updated_at | TEXT | 更新日時 | ISO8601形式 |

## インデックス

```sql
-- performance_rawdata
CREATE INDEX idx_performance_member ON performance_rawdata(member_name);
CREATE INDEX idx_performance_project ON performance_rawdata(project_name);
CREATE INDEX idx_performance_date ON performance_rawdata(input_date);

-- sales_report_rawdata
CREATE INDEX idx_sales_rep ON sales_report_rawdata(sales_rep);
CREATE INDEX idx_sales_project ON sales_report_rawdata(project_name);
CREATE INDEX idx_sales_acquisition_date ON sales_report_rawdata(acquisition_date);
CREATE INDEX idx_sales_meeting_datetime ON sales_report_rawdata(meeting_datetime);

-- external_id_rawdata
CREATE INDEX idx_external_company ON external_id_rawdata(company_name);
CREATE INDEX idx_external_sales_rep ON external_id_rawdata(sales_rep);

-- document_send_rawdata
CREATE INDEX idx_doc_project ON document_send_rawdata(project_name);
CREATE INDEX idx_doc_sender ON document_send_rawdata(sender);
CREATE INDEX idx_doc_timestamp ON document_send_rawdata(timestamp);
```

## データ件数（移行済み: 2026-02-19）

| テーブル | 旧データ | 新データ | 合計 |
|---------|---------|---------|------|
| performance_rawdata | 7,957件 | 717件 | **8,674件** |
| sales_report_rawdata | 9,324件 | 1,239件 | **10,563件** |
| external_id_rawdata | - | 114件 | **114件** |
| document_send_rawdata | - | 597件 | **597件** |

**総レコード数: 19,948件**

## Slack→Turso直接連携要件

### 現状フロー
```
Slack ワークフロー → Google スプレッドシート → ダッシュボード（GAS API経由）
```

### 目標フロー
```
Slack ワークフロー → Turso（直接HTTP API） → ダッシュボード
```

### 実装方法

#### Option 1: Slack Workflow + Webhook
1. Slackワークフローから外部Webhookを呼び出し
2. Cloudflare Workers / Vercel Edge Functions でTurso HTTP APIを呼び出し
3. データをTursoに直接INSERT

#### Option 2: Zapier / Make 連携
1. Slackワークフローのトリガー
2. Zapier/MakeでTurso HTTP APIを呼び出し
3. データをINSERT

#### 推奨: Option 1（Cloudflare Workers）
- コスト: 無料枠で十分
- レイテンシ: 低い
- メンテナンス: シンプル

### Turso HTTP API エンドポイント

```
https://all-staff-rawdata-ebidigi.turso.io
```

### 認証
- Turso Database Token を使用
- `TURSO_AUTH_TOKEN` 環境変数で管理
