/**
 * Google Apps Script: Sheets → Turso 同期スクリプト
 *
 * 機能: 実績rawdataシートのデータをTursoデータベースに5分毎に同期
 *
 * 同期方式: 日付ベース + UPSERT（INSERT OR REPLACE）
 *   - スプレッドシート全行をスキャンし、直近SYNC_DAYS日分のデータを毎回同期
 *   - DB側のUNIQUE制約 (member_name, project_name, input_date) で重複を防止
 *   - 行の挿入位置に依存しないため、途中行への追加・編集にも対応
 *
 * セットアップ手順:
 * 1. GASエディタでこのファイルの内容をコピー
 * 2. スクリプトプロパティに以下を設定:
 *    - TURSO_DATABASE_URL: libsql://all-staff-rawdata-ebidigi.aws-ap-northeast-1.turso.io
 *    - TURSO_AUTH_TOKEN: (Tursoダッシュボードから取得)
 * 3. トリガーを設定: syncPerformanceToTurso を15分毎に実行
 */

// ==================== 設定 ====================

const CONFIG = {
  SPREADSHEET_ID: '1Qo9LvDqUgkPVcaoDN-t4p8YKryoILKEMdMugDlpDTIQ',
  SHEET_NAME: '実績rawdata',
  // ヘッダー行をスキップするため2行目から開始
  START_ROW: 2,
  // 同期対象の日数（今日からN日前まで）
  SYNC_DAYS: 7,
  // バッチサイズ（1リクエストあたりのINSERT数）
  BATCH_SIZE: 50
};

// ==================== 営業時間チェック ====================

/**
 * 稼働時間内かチェック（8時〜21時）
 * 入力は主に12〜13時と17時以降に集中するため、
 * 21時〜翌8時は同期不要
 * @returns {boolean} 稼働時間内ならtrue
 */
function isBusinessHours() {
  const hour = new Date().getHours();
  return hour >= 8 && hour < 21;
}

// ==================== メイン関数 ====================

/**
 * 実績rawdataをTursoに同期（5分毎トリガー用）
 *
 * 直近SYNC_DAYS日分のデータをスプレッドシートから読み取り、
 * INSERT OR REPLACEでTursoに同期する。
 * DB側のUNIQUE制約により、同じデータの重複挿入は自動で上書きされる。
 */
function syncPerformanceToTurso() {
  // 稼働時間外（21時〜翌8時）はスキップ
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

  // 同期対象の日付範囲を計算
  const today = new Date();
  const syncFromDate = new Date(today);
  syncFromDate.setDate(syncFromDate.getDate() - CONFIG.SYNC_DAYS);
  const syncFromStr = formatDate(syncFromDate);

  Logger.log('同期対象期間: ' + syncFromStr + ' 〜 今日');

  // スプレッドシート全行を読み取り
  const lastRow = sheet.getLastRow();
  if (lastRow < CONFIG.START_ROW) {
    Logger.log('No data in sheet');
    return;
  }

  const allData = sheet.getRange(CONFIG.START_ROW, 1, lastRow - CONFIG.START_ROW + 1, 8).getValues();

  // 同期対象の行をフィルタ（日付がsyncFromDate以降のもの）
  const targetRows = [];
  for (let i = 0; i < allData.length; i++) {
    const row = allData[i];

    // 空行をスキップ
    if (!row[0] && !row[1]) continue;

    // 日付を解析
    const inputDate = row[2];
    if (!inputDate) continue;

    const d = new Date(inputDate);
    if (isNaN(d.getTime())) continue;

    const dateStr = formatDate(d);
    if (dateStr >= syncFromStr) {
      targetRows.push(row);
    }
  }

  Logger.log('同期対象: ' + targetRows.length + '行（全' + allData.length + '行中）');

  if (targetRows.length === 0) {
    Logger.log('同期対象データなし');
    return;
  }

  // バッチでUPSERT
  let upsertedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < targetRows.length; i += CONFIG.BATCH_SIZE) {
    const batch = targetRows.slice(i, i + CONFIG.BATCH_SIZE);
    try {
      const result = upsertBatch(tursoUrl, tursoToken, batch);
      upsertedCount += result.success;
      errorCount += result.errors;
    } catch (e) {
      Logger.log('Batch error at index ' + i + ': ' + e.message);
      errorCount += batch.length;
    }
  }

  const summary = 'Turso同期完了: ' + upsertedCount + '件同期, ' + errorCount + '件エラー（対象期間: ' + syncFromStr + '〜）';
  Logger.log(summary);

  // エラーがあればSlack通知
  if (errorCount > 0) {
    sendSlackNotification('⚠️ ' + summary);
  }
}

// ==================== Turso API ====================

/**
 * 複数行をバッチでUPSERT
 * @param {string} tursoUrl - Turso URL
 * @param {string} tursoToken - 認証トークン
 * @param {Array[]} rows - 行データの配列
 * @returns {{success: number, errors: number}}
 */
function upsertBatch(tursoUrl, tursoToken, rows) {
  const httpUrl = tursoUrl.replace('libsql://', 'https://') + '/v3/pipeline';

  const requests = [];
  for (const row of rows) {
    const [memberName, projectName, inputDate, callHours, callCount, prCount, appointmentCount, qualitativeFeedback] = row;

    // 日付とタイムスタンプを解析
    let formattedDate = null;
    let formattedTimestamp = null;
    if (inputDate) {
      const d = new Date(inputDate);
      if (!isNaN(d.getTime())) {
        formattedDate = d.toISOString().split('T')[0];
        // YYYY-MM-DD HH:MM:SS 形式のタイムスタンプ
        formattedTimestamp = formattedDate + ' '
          + String(d.getHours()).padStart(2, '0') + ':'
          + String(d.getMinutes()).padStart(2, '0') + ':'
          + String(d.getSeconds()).padStart(2, '0');
      }
    }

    const args = [
      memberName || '',
      projectName || '',
      formattedDate,
      formattedTimestamp,
      parseFloat(callHours) || 0,
      parseInt(callCount) || 0,
      parseInt(prCount) || 0,
      parseInt(appointmentCount) || 0,
      qualitativeFeedback || null,
      'new'
    ];

    requests.push({
      type: 'execute',
      stmt: {
        sql: `INSERT OR REPLACE INTO performance_rawdata
          (member_name, project_name, input_date, input_timestamp, call_hours, call_count, pr_count, appointment_count, qualitative_feedback, data_source, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        args: args.map(toTursoArg)
      }
    });
  }

  requests.push({ type: 'close' });

  const options = {
    method: 'POST',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + tursoToken
    },
    payload: JSON.stringify({ requests: requests }),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(httpUrl, options);
  const statusCode = response.getResponseCode();

  if (statusCode !== 200) {
    Logger.log('Turso API error: ' + statusCode + ' - ' + response.getContentText());
    return { success: 0, errors: rows.length };
  }

  const result = JSON.parse(response.getContentText());

  let success = 0;
  let errors = 0;
  for (const r of result.results) {
    if (r.type === 'ok' && r.response && r.response.type === 'execute') {
      success++;
    } else if (r.type === 'error') {
      Logger.log('SQL error: ' + (r.error ? r.error.message : 'unknown'));
      errors++;
    }
  }

  return { success, errors };
}

/**
 * JavaScript値をTurso APIの引数形式に変換
 * @param {*} arg - 変換する値
 * @returns {object} Turso引数オブジェクト
 */
function toTursoArg(arg) {
  if (arg === null || arg === undefined) return { type: 'null' };
  if (typeof arg === 'number') {
    return Number.isInteger(arg)
      ? { type: 'integer', value: String(arg) }
      : { type: 'float', value: arg };
  }
  return { type: 'text', value: String(arg) };
}

/**
 * 日付をYYYY-MM-DD形式に変換
 * @param {Date} d - 日付オブジェクト
 * @returns {string} YYYY-MM-DD形式の文字列
 */
function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
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
 * 現在の同期状態を確認（デバッグ用）
 */
function checkSyncStatus() {
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME);
  const lastRow = sheet ? sheet.getLastRow() : 'Sheet not found';
  Logger.log('Current last row: ' + lastRow);
  Logger.log('Sync range: last ' + CONFIG.SYNC_DAYS + ' days');
}

/**
 * 指定日以降のデータを再同期（手動リカバリ用）
 * GASエディタで実行: manualSyncFromDate('2026-02-01')
 * @param {string} fromDateStr - 開始日（YYYY-MM-DD形式）
 */
function manualSyncFromDate(fromDateStr) {
  const scriptProps = PropertiesService.getScriptProperties();
  const tursoUrl = scriptProps.getProperty('TURSO_DATABASE_URL');
  const tursoToken = scriptProps.getProperty('TURSO_AUTH_TOKEN');

  if (!tursoUrl || !tursoToken) {
    Logger.log('ERROR: Turso credentials not configured');
    return;
  }

  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    Logger.log('ERROR: Sheet not found');
    return;
  }

  const lastRow = sheet.getLastRow();
  const allData = sheet.getRange(CONFIG.START_ROW, 1, lastRow - CONFIG.START_ROW + 1, 8).getValues();

  const targetRows = [];
  for (const row of allData) {
    if (!row[0] && !row[1]) continue;
    if (!row[2]) continue;

    const d = new Date(row[2]);
    if (isNaN(d.getTime())) continue;

    if (formatDate(d) >= fromDateStr) {
      targetRows.push(row);
    }
  }

  Logger.log('手動同期対象: ' + targetRows.length + '行（' + fromDateStr + '以降）');

  let upsertedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < targetRows.length; i += CONFIG.BATCH_SIZE) {
    const batch = targetRows.slice(i, i + CONFIG.BATCH_SIZE);
    try {
      const result = upsertBatch(tursoUrl, tursoToken, batch);
      upsertedCount += result.success;
      errorCount += result.errors;
    } catch (e) {
      Logger.log('Batch error: ' + e.message);
      errorCount += batch.length;
    }
  }

  Logger.log('手動同期完了: ' + upsertedCount + '件同期, ' + errorCount + '件エラー');
}
