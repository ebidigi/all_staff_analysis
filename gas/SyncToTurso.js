/**
 * Google Apps Script: Sheets → Turso 同期スクリプト
 *
 * 機能: 実績rawdataシートの新規行をTursoデータベースに5分毎に同期
 *
 * セットアップ手順:
 * 1. GASエディタでこのファイルの内容をコピー
 * 2. スクリプトプロパティに以下を設定:
 *    - TURSO_DATABASE_URL: libsql://all-staff-rawdata-ebidigi.aws-ap-northeast-1.turso.io
 *    - TURSO_AUTH_TOKEN: (Tursoダッシュボードから取得)
 * 3. トリガーを設定: syncPerformanceToTurso を5分毎に実行
 */

// ==================== 設定 ====================

const CONFIG = {
  SPREADSHEET_ID: '1Qo9LvDqUgkPVcaoDN-t4p8YKryoILKEMdMugDlpDTIQ',
  SHEET_NAME: '実績rawdata',
  // 同期位置を記録するプロパティキー
  LAST_SYNC_ROW_KEY: 'turso_last_sync_row_performance',
  // ヘッダー行をスキップするため2行目から開始
  START_ROW: 2
};

// ==================== 営業時間チェック ====================

/**
 * 営業時間内かチェック（7時〜20時）
 * @returns {boolean} 営業時間内ならtrue
 */
function isBusinessHours() {
  const hour = new Date().getHours();
  return hour >= 7 && hour < 20;
}

// ==================== メイン関数 ====================

/**
 * 実績rawdataをTursoに同期（5分毎トリガー用）
 */
function syncPerformanceToTurso() {
  // 営業時間外（20時〜翌7時）はスキップ
  if (!isBusinessHours()) {
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

  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    Logger.log('ERROR: Sheet not found: ' + CONFIG.SHEET_NAME);
    return;
  }

  // 最終同期行を取得（初回は開始行-1）
  let lastSyncRow = parseInt(scriptProps.getProperty(CONFIG.LAST_SYNC_ROW_KEY) || (CONFIG.START_ROW - 1));
  const lastRow = sheet.getLastRow();

  // 新規データがなければ終了
  if (lastRow <= lastSyncRow) {
    Logger.log('No new data to sync. Last sync row: ' + lastSyncRow);
    return;
  }

  // 新規行を取得
  const newRowCount = lastRow - lastSyncRow;
  const range = sheet.getRange(lastSyncRow + 1, 1, newRowCount, 8); // A:H列（8列）
  const newData = range.getValues();

  Logger.log('Found ' + newRowCount + ' new rows to sync');

  // Tursoに挿入
  let insertedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < newData.length; i++) {
    const row = newData[i];

    // 空行をスキップ
    if (!row[0] && !row[1]) {
      continue;
    }

    try {
      const success = insertPerformanceRecord(tursoUrl, tursoToken, row);
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

  // 同期位置を更新
  scriptProps.setProperty(CONFIG.LAST_SYNC_ROW_KEY, lastRow.toString());

  const summary = 'Turso同期完了: ' + insertedCount + '件挿入, ' + errorCount + '件エラー';
  Logger.log(summary);

  // エラーがあればSlack通知
  if (errorCount > 0) {
    sendSlackNotification('⚠️ ' + summary);
  }
}

// ==================== Turso API ====================

/**
 * 実績データをTursoに挿入
 * @param {string} tursoUrl - Turso HTTP API URL
 * @param {string} tursoToken - 認証トークン
 * @param {Array} row - [担当名, 案件名, 入力日, 架電時間, 架電数, PR数, アポ数, 定性所感]
 * @returns {boolean} 成功したらtrue
 */
function insertPerformanceRecord(tursoUrl, tursoToken, row) {
  const [memberName, projectName, inputDate, callHours, callCount, prCount, appointmentCount, qualitativeFeedback] = row;

  // 日付をISO形式に変換
  let formattedDate = null;
  if (inputDate) {
    const d = new Date(inputDate);
    if (!isNaN(d.getTime())) {
      formattedDate = d.toISOString().split('T')[0];
    }
  }

  // SQLパラメータ
  const sql = `INSERT INTO performance_rawdata
    (member_name, project_name, input_date, call_hours, call_count, pr_count, appointment_count, qualitative_feedback, data_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  const args = [
    memberName || '',
    projectName || '',
    formattedDate,
    parseFloat(callHours) || 0,
    parseInt(callCount) || 0,
    parseInt(prCount) || 0,
    parseInt(appointmentCount) || 0,
    qualitativeFeedback || null,
    'new'
  ];

  return executeTursoQuery(tursoUrl, tursoToken, sql, args);
}

/**
 * Turso HTTP APIでSQLを実行
 * @param {string} tursoUrl - Turso URL
 * @param {string} tursoToken - 認証トークン
 * @param {string} sql - SQL文
 * @param {Array} args - パラメータ配列
 * @returns {boolean} 成功したらtrue
 */
function executeTursoQuery(tursoUrl, tursoToken, sql, args) {
  // HTTP API エンドポイント（v3 pipeline）
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

  // エラーチェック
  if (result.results && result.results[0] && result.results[0].type === 'error') {
    Logger.log('Turso SQL error: ' + result.results[0].error.message);
    return false;
  }

  return true;
}

// ==================== Slack通知 ====================

/**
 * Slackに通知を送信（オプション）
 * @param {string} message - 通知メッセージ
 */
function sendSlackNotification(message) {
  const scriptProps = PropertiesService.getScriptProperties();
  const webhookUrl = scriptProps.getProperty('SLACK_WEBHOOK_URL');

  if (!webhookUrl) {
    Logger.log('Slack webhook not configured, skipping notification');
    return;
  }

  const payload = {
    text: message,
    username: 'Turso Sync Bot',
    icon_emoji: ':database:'
  };

  const options = {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    UrlFetchApp.fetch(webhookUrl, options);
  } catch (e) {
    Logger.log('Failed to send Slack notification: ' + e.message);
  }
}

// ==================== ユーティリティ ====================

/**
 * 同期位置をリセット（デバッグ用）
 */
function resetSyncPosition() {
  const scriptProps = PropertiesService.getScriptProperties();
  scriptProps.deleteProperty(CONFIG.LAST_SYNC_ROW_KEY);
  Logger.log('Sync position reset');
}

/**
 * 現在の同期状態を確認（デバッグ用）
 */
function checkSyncStatus() {
  const scriptProps = PropertiesService.getScriptProperties();
  const lastSyncRow = scriptProps.getProperty(CONFIG.LAST_SYNC_ROW_KEY) || 'Not set';

  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME);
  const lastRow = sheet ? sheet.getLastRow() : 'Sheet not found';

  Logger.log('Last sync row: ' + lastSyncRow);
  Logger.log('Current last row: ' + lastRow);
  Logger.log('Pending rows: ' + (lastRow - parseInt(lastSyncRow || 0)));
}

/**
 * 手動で全データを再同期（初回セットアップ用）
 * 注意: 既存データと重複する可能性があるため、通常は使用しない
 */
function fullResync() {
  const scriptProps = PropertiesService.getScriptProperties();
  scriptProps.setProperty(CONFIG.LAST_SYNC_ROW_KEY, (CONFIG.START_ROW - 1).toString());
  Logger.log('Full resync initiated. Run syncPerformanceToTurso() to sync all data.');
}
