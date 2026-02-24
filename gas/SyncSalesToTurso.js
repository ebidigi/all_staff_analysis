/**
 * Google Apps Script: 売上報告rawdata → Turso 同期スクリプト
 *
 * 機能: 売上報告rawdataシートの新規行をTursoデータベースに5分毎に同期
 *
 * セットアップ手順:
 * 1. GASエディタでこのファイルの内容をコピー
 * 2. スクリプトプロパティに以下を設定:
 *    - TURSO_DATABASE_URL: libsql://all-staff-rawdata-ebidigi.aws-ap-northeast-1.turso.io
 *    - TURSO_AUTH_TOKEN: (Tursoダッシュボードから取得)
 * 3. トリガーを設定: syncSalesToTurso を5分毎に実行
 */

// ==================== 設定 ====================

const SALES_CONFIG = {
  SPREADSHEET_ID: '1Qo9LvDqUgkPVcaoDN-t4p8YKryoILKEMdMugDlpDTIQ',
  SHEET_NAME: '売上報告rawdata',
  LAST_SYNC_ROW_KEY: 'turso_last_sync_row_sales',
  START_ROW: 2
};

// ==================== 営業時間チェック ====================

/**
 * 営業時間内かチェック（7時〜20時）
 * @returns {boolean} 営業時間内ならtrue
 */
function isBusinessHoursSales() {
  const hour = new Date().getHours();
  return hour >= 7 && hour < 20;
}

// ==================== メイン関数 ====================

/**
 * 売上報告rawdataをTursoに同期（5分毎トリガー用）
 */
function syncSalesToTurso() {
  // 営業時間外（20時〜翌7時）はスキップ
  if (!isBusinessHoursSales()) {
    Logger.log('営業時間外のためスキップ: ' + new Date().getHours() + '時');
    return;
  }

  const scriptProps = PropertiesService.getScriptProperties();
  const tursoUrl = scriptProps.getProperty('TURSO_DATABASE_URL');
  const tursoToken = scriptProps.getProperty('TURSO_AUTH_TOKEN');

  if (!tursoUrl || !tursoToken) {
    Logger.log('ERROR: Turso credentials not configured');
    sendSlackNotification('Turso同期エラー: 認証情報が設定されていません');
    return;
  }

  const sheet = SpreadsheetApp.openById(SALES_CONFIG.SPREADSHEET_ID).getSheetByName(SALES_CONFIG.SHEET_NAME);
  if (!sheet) {
    Logger.log('ERROR: Sheet not found: ' + SALES_CONFIG.SHEET_NAME);
    return;
  }

  let lastSyncRow = parseInt(scriptProps.getProperty(SALES_CONFIG.LAST_SYNC_ROW_KEY) || (SALES_CONFIG.START_ROW - 1));
  const lastRow = sheet.getLastRow();

  if (lastRow <= lastSyncRow) {
    Logger.log('No new sales data to sync. Last sync row: ' + lastSyncRow);
    return;
  }

  const newRowCount = lastRow - lastSyncRow;
  const range = sheet.getRange(lastSyncRow + 1, 1, newRowCount, 16); // A:P列（16列）
  const newData = range.getValues();

  Logger.log('Found ' + newRowCount + ' new sales rows to sync');

  let insertedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < newData.length; i++) {
    const row = newData[i];

    if (!row[0] && !row[1]) {
      continue;
    }

    try {
      const success = insertSalesRecord(tursoUrl, tursoToken, row);
      if (success) {
        insertedCount++;
      } else {
        errorCount++;
      }
    } catch (e) {
      Logger.log('Error inserting row ' + (lastSyncRow + 1 + i) + ': ' + e.message);
      errorCount++;
    }
  }

  scriptProps.setProperty(SALES_CONFIG.LAST_SYNC_ROW_KEY, lastRow.toString());

  const summary = 'Turso売上同期完了: ' + insertedCount + '件挿入, ' + errorCount + '件エラー';
  Logger.log(summary);

  if (errorCount > 0) {
    sendSlackNotification('⚠️ ' + summary);
  }
}

// ==================== Turso API ====================

/**
 * 売上報告データをTursoに挿入
 * @param {string} tursoUrl - Turso HTTP API URL
 * @param {string} tursoToken - 認証トークン
 * @param {Array} row - 新データ: [営業担当者, 売上種別, 案件名, 会社名, 取得日, 実施日時, 金額, 部署, 役職, 名前, 電話番号, メールアドレス, 架電ヒアリング, 営業区分, リスケ, 取引]
 * @returns {boolean} 成功したらtrue
 */
function insertSalesRecord(tursoUrl, tursoToken, row) {
  const [
    salesRep, salesType, projectName, companyName, acquisitionDate, meetingDatetime,
    amount, department, position, contactName, phoneNumber, email,
    callHearing, salesCategory, rescheduleFlag, dealId
  ] = row;

  // 日付をISO形式に変換
  let acqDate = null;
  if (acquisitionDate) {
    const d = new Date(acquisitionDate);
    if (!isNaN(d.getTime())) {
      acqDate = d.toISOString().split('T')[0];
    }
  }

  let meetDatetime = null;
  if (meetingDatetime) {
    const d = new Date(meetingDatetime);
    if (!isNaN(d.getTime())) {
      meetDatetime = d.toISOString();
    }
  }

  const sql = `INSERT INTO sales_report_rawdata
    (sales_rep, sales_type, project_name, company_name, acquisition_date,
     meeting_datetime, amount, department, position, contact_name,
     phone_number, email, call_hearing, sales_category, reschedule_flag, deal_id, data_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  const args = [
    salesRep || '',
    salesType || null,
    projectName || '',
    companyName || '',
    acqDate,
    meetDatetime,
    parseInt(amount) || 0,
    department || null,
    position || null,
    contactName || null,
    phoneNumber || null,
    email || null,
    callHearing || null,
    salesCategory || null,
    rescheduleFlag || null,
    dealId || null,
    'new'
  ];

  return executeTursoQueryForSales(tursoUrl, tursoToken, sql, args);
}

/**
 * Turso HTTP APIでSQLを実行
 */
function executeTursoQueryForSales(tursoUrl, tursoToken, sql, args) {
  const httpUrl = tursoUrl.replace('libsql://', 'https://') + '/v3/pipeline';

  const payload = {
    requests: [
      {
        type: 'execute',
        stmt: {
          sql: sql,
          args: args.map(arg => {
            if (arg === null) return { type: 'null' };
            if (typeof arg === 'number') {
              return Number.isInteger(arg) ? { type: 'integer', value: String(arg) } : { type: 'float', value: arg };
            }
            return { type: 'text', value: String(arg) };
          })
        }
      },
      { type: 'close' }
    ]
  };

  const options = {
    method: 'POST',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + tursoToken
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(httpUrl, options);
  const statusCode = response.getResponseCode();

  if (statusCode !== 200) {
    Logger.log('Turso API error: ' + statusCode + ' - ' + response.getContentText());
    return false;
  }

  const result = JSON.parse(response.getContentText());

  if (result.results && result.results[0] && result.results[0].type === 'error') {
    Logger.log('Turso SQL error: ' + result.results[0].error.message);
    return false;
  }

  return true;
}

// ==================== ユーティリティ ====================

/**
 * 売上同期位置をリセット（デバッグ用）
 */
function resetSalesSyncPosition() {
  const scriptProps = PropertiesService.getScriptProperties();
  scriptProps.deleteProperty(SALES_CONFIG.LAST_SYNC_ROW_KEY);
  Logger.log('Sales sync position reset');
}

/**
 * 売上同期状態を確認（デバッグ用）
 */
function checkSalesSyncStatus() {
  const scriptProps = PropertiesService.getScriptProperties();
  const lastSyncRow = scriptProps.getProperty(SALES_CONFIG.LAST_SYNC_ROW_KEY) || 'Not set';

  const sheet = SpreadsheetApp.openById(SALES_CONFIG.SPREADSHEET_ID).getSheetByName(SALES_CONFIG.SHEET_NAME);
  const lastRow = sheet ? sheet.getLastRow() : 'Sheet not found';

  Logger.log('Sales last sync row: ' + lastSyncRow);
  Logger.log('Sales current last row: ' + lastRow);
  Logger.log('Sales pending rows: ' + (lastRow - parseInt(lastSyncRow || 0)));
}
