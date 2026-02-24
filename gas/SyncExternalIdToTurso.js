/**
 * Google Apps Script: 外ID_rawdata → Turso 同期スクリプト
 *
 * 機能: 外ID_rawdataシートの新規行をTursoデータベースに5分毎に同期
 *
 * セットアップ手順:
 * 1. GASエディタでこのファイルの内容をコピー
 * 2. スクリプトプロパティに以下を設定:
 *    - TURSO_DATABASE_URL: libsql://all-staff-rawdata-ebidigi.aws-ap-northeast-1.turso.io
 *    - TURSO_AUTH_TOKEN: (Tursoダッシュボードから取得)
 * 3. トリガーを設定: syncExternalIdToTurso を5分毎に実行
 */

// ==================== 設定 ====================

const EXTERNAL_ID_CONFIG = {
  SPREADSHEET_ID: '1Qo9LvDqUgkPVcaoDN-t4p8YKryoILKEMdMugDlpDTIQ',
  SHEET_NAME: '外ID_rawdata',
  LAST_SYNC_ROW_KEY: 'turso_last_sync_row_external_id',
  START_ROW: 2
};

// ==================== 営業時間チェック ====================

/**
 * 営業時間内かチェック（7時〜20時）
 * @returns {boolean} 営業時間内ならtrue
 */
function isBusinessHoursExternalId() {
  const hour = new Date().getHours();
  return hour >= 7 && hour < 20;
}

// ==================== メイン関数 ====================

/**
 * 外ID_rawdataをTursoに同期（5分毎トリガー用）
 */
function syncExternalIdToTurso() {
  // 営業時間外（20時〜翌7時）はスキップ
  if (!isBusinessHoursExternalId()) {
    Logger.log('営業時間外のためスキップ: ' + new Date().getHours() + '時');
    return;
  }

  const scriptProps = PropertiesService.getScriptProperties();
  const tursoUrl = scriptProps.getProperty('TURSO_DATABASE_URL');
  const tursoToken = scriptProps.getProperty('TURSO_AUTH_TOKEN');

  if (!tursoUrl || !tursoToken) {
    Logger.log('ERROR: Turso credentials not configured');
    return;
  }

  const sheet = SpreadsheetApp.openById(EXTERNAL_ID_CONFIG.SPREADSHEET_ID).getSheetByName(EXTERNAL_ID_CONFIG.SHEET_NAME);
  if (!sheet) {
    Logger.log('ERROR: Sheet not found: ' + EXTERNAL_ID_CONFIG.SHEET_NAME);
    return;
  }

  let lastSyncRow = parseInt(scriptProps.getProperty(EXTERNAL_ID_CONFIG.LAST_SYNC_ROW_KEY) || (EXTERNAL_ID_CONFIG.START_ROW - 1));
  const lastRow = sheet.getLastRow();

  if (lastRow <= lastSyncRow) {
    Logger.log('No new external ID data to sync. Last sync row: ' + lastSyncRow);
    return;
  }

  const newRowCount = lastRow - lastSyncRow;
  const range = sheet.getRange(lastSyncRow + 1, 1, newRowCount, 12); // A:L列（12列）
  const newData = range.getValues();

  Logger.log('Found ' + newRowCount + ' new external ID rows to sync');

  let insertedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < newData.length; i++) {
    const row = newData[i];

    if (!row[0] && !row[1]) {
      continue;
    }

    try {
      const success = insertExternalIdRecord(tursoUrl, tursoToken, row);
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

  scriptProps.setProperty(EXTERNAL_ID_CONFIG.LAST_SYNC_ROW_KEY, lastRow.toString());

  const summary = 'Turso外ID同期完了: ' + insertedCount + '件挿入, ' + errorCount + '件エラー';
  Logger.log(summary);
}

// ==================== Turso API ====================

/**
 * 外IDデータをTursoに挿入
 * @param {string} tursoUrl - Turso HTTP API URL
 * @param {string} tursoToken - 認証トークン
 * @param {Array} row - [法人電話番号, 企業名, 部署名, 部署番号, 役職, 担当者（姓）, 担当者名（名）, 架電案件, 取得ソース, saleRep, タイムスタンプ, original_id]
 * @returns {boolean} 成功したらtrue
 */
function insertExternalIdRecord(tursoUrl, tursoToken, row) {
  const [
    companyPhone, companyName, departmentName, departmentPhone, position,
    contactLastName, contactFirstName, projectName, leadSource, salesRep,
    timestamp, originalId
  ] = row;

  const sql = `INSERT INTO external_id_rawdata
    (company_phone, company_name, department_name, department_phone, position,
     contact_last_name, contact_first_name, project_name, lead_source, sales_rep,
     original_id, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  const args = [
    companyPhone || null,
    companyName || null,
    departmentName || null,
    departmentPhone || null,
    position || null,
    contactLastName || null,
    contactFirstName || null,
    projectName || null,
    leadSource || null,
    salesRep || null,
    originalId || null,
    timestamp ? String(timestamp) : null
  ];

  return executeTursoQueryForExternalId(tursoUrl, tursoToken, sql, args);
}

/**
 * Turso HTTP APIでSQLを実行
 */
function executeTursoQueryForExternalId(tursoUrl, tursoToken, sql, args) {
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
 * 外ID同期位置をリセット（デバッグ用）
 */
function resetExternalIdSyncPosition() {
  const scriptProps = PropertiesService.getScriptProperties();
  scriptProps.deleteProperty(EXTERNAL_ID_CONFIG.LAST_SYNC_ROW_KEY);
  Logger.log('External ID sync position reset');
}

/**
 * 外ID同期状態を確認（デバッグ用）
 */
function checkExternalIdSyncStatus() {
  const scriptProps = PropertiesService.getScriptProperties();
  const lastSyncRow = scriptProps.getProperty(EXTERNAL_ID_CONFIG.LAST_SYNC_ROW_KEY) || 'Not set';

  const sheet = SpreadsheetApp.openById(EXTERNAL_ID_CONFIG.SPREADSHEET_ID).getSheetByName(EXTERNAL_ID_CONFIG.SHEET_NAME);
  const lastRow = sheet ? sheet.getLastRow() : 'Sheet not found';

  Logger.log('External ID last sync row: ' + lastSyncRow);
  Logger.log('External ID current last row: ' + lastRow);
  Logger.log('External ID pending rows: ' + (lastRow - parseInt(lastSyncRow || 0)));
}
