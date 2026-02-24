require('dotenv').config();
const { createClient } = require('@libsql/client');

// Turso client
const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Google Sheets data (will be injected via command line)
async function migratePerformanceData(data, source) {
  console.log(`Migrating ${data.length} performance records (source: ${source})...`);

  let inserted = 0;
  let errors = 0;

  for (const row of data) {
    try {
      if (source === 'old') {
        // 旧データ: 担当名, 案件名, 稼働開始, 稼働終了, 架電数, PR数, メール数, アポ数, 資料送付数, 担当者名取得数
        const [member_name, project_name, work_start, work_end, call_count, pr_count, email_count, appointment_count, document_send_count, contact_name_count] = row;

        // Calculate call hours from start/end time
        let call_hours = null;
        if (work_start && work_end) {
          const start = new Date(work_start.replace(/\//g, '-'));
          const end = new Date(work_end.replace(/\//g, '-'));
          if (!isNaN(start) && !isNaN(end)) {
            call_hours = (end - start) / (1000 * 60 * 60);
          }
        }

        // Convert date format
        let input_date = null;
        if (work_start) {
          const d = new Date(work_start.replace(/\//g, '-'));
          if (!isNaN(d)) {
            input_date = d.toISOString().split('T')[0];
          }
        }

        await turso.execute({
          sql: `INSERT INTO performance_rawdata
                (member_name, project_name, input_date, work_start_time, work_end_time,
                 call_hours, call_count, pr_count, email_count, appointment_count,
                 document_send_count, contact_name_count, data_source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            member_name || '',
            project_name || '',
            input_date,
            work_start || null,
            work_end || null,
            call_hours,
            parseInt(call_count) || 0,
            parseInt(pr_count) || 0,
            parseInt(email_count) || 0,
            parseInt(appointment_count) || 0,
            parseInt(document_send_count) || 0,
            parseInt(contact_name_count) || 0,
            'old'
          ]
        });
      } else {
        // 新データ: 担当名, 案件名, 入力日, 架電時間, 架電数, PR数, アポ数, 定性所感
        const [member_name, project_name, input_date, call_hours, call_count, pr_count, appointment_count, qualitative_feedback] = row;

        // Convert date format
        let formatted_date = null;
        if (input_date) {
          const d = new Date(input_date.replace(/\//g, '-'));
          if (!isNaN(d)) {
            formatted_date = d.toISOString().split('T')[0];
          }
        }

        await turso.execute({
          sql: `INSERT INTO performance_rawdata
                (member_name, project_name, input_date, call_hours, call_count,
                 pr_count, appointment_count, qualitative_feedback, data_source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            member_name || '',
            project_name || '',
            formatted_date,
            parseFloat(call_hours) || 0,
            parseInt(call_count) || 0,
            parseInt(pr_count) || 0,
            parseInt(appointment_count) || 0,
            qualitative_feedback || null,
            'new'
          ]
        });
      }
      inserted++;
    } catch (e) {
      errors++;
      console.error(`Error inserting row:`, row, e.message);
    }
  }

  console.log(`Inserted: ${inserted}, Errors: ${errors}`);
  return { inserted, errors };
}

async function migrateSalesReportData(data, source) {
  console.log(`Migrating ${data.length} sales report records (source: ${source})...`);

  let inserted = 0;
  let errors = 0;

  for (const row of data) {
    try {
      if (source === 'old') {
        // 旧データ: 担当名, 案件名, アポ取得日, アポ実施日, 作成日, レイヤー, メモ, 会社名, 取得アポ金額, 取得リードソース, アポ実施日付（関数）, 実施ステータス, アポ実施時間（関数）, 取得アポ金額(旧)
        const [sales_rep, project_name, acquisition_date, meeting_datetime, created_date, layer, memo, company_name, amount, lead_source, meeting_date_formula, status] = row;

        // Convert dates
        let acq_date = null;
        if (acquisition_date) {
          const d = new Date(acquisition_date.replace(/\//g, '-'));
          if (!isNaN(d)) {
            acq_date = d.toISOString().split('T')[0];
          }
        }

        let meet_datetime = null;
        if (meeting_datetime) {
          const d = new Date(meeting_datetime.replace(/\//g, '-'));
          if (!isNaN(d)) {
            meet_datetime = d.toISOString();
          }
        }

        await turso.execute({
          sql: `INSERT INTO sales_report_rawdata
                (sales_rep, project_name, company_name, acquisition_date, meeting_datetime,
                 amount, layer, memo, status, data_source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            sales_rep || '',
            project_name || '',
            company_name || '',
            acq_date,
            meet_datetime,
            parseInt(amount) || 0,
            layer || null,
            memo || null,
            status || null,
            'old'
          ]
        });
      } else {
        // 新データ: 営業担当者, 売上種別, 案件名, 会社名, 取得日, 実施日時, 金額, 部署, 役職, 名前, 電話番号, メールアドレス, 架電ヒアリング, 営業区分, リスケ, 取引
        const [sales_rep, sales_type, project_name, company_name, acquisition_date, meeting_datetime, amount, department, position, contact_name, phone_number, email, call_hearing, sales_category, reschedule_flag, deal_id] = row;

        // Convert dates
        let acq_date = null;
        if (acquisition_date) {
          const d = new Date(acquisition_date.replace(/\//g, '-'));
          if (!isNaN(d)) {
            acq_date = d.toISOString().split('T')[0];
          }
        }

        let meet_datetime = null;
        if (meeting_datetime) {
          const d = new Date(meeting_datetime.replace(/\//g, '-'));
          if (!isNaN(d)) {
            meet_datetime = d.toISOString();
          }
        }

        await turso.execute({
          sql: `INSERT INTO sales_report_rawdata
                (sales_rep, sales_type, project_name, company_name, acquisition_date,
                 meeting_datetime, amount, department, position, contact_name,
                 phone_number, email, call_hearing, sales_category, reschedule_flag, deal_id, data_source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            sales_rep || '',
            sales_type || null,
            project_name || '',
            company_name || '',
            acq_date,
            meet_datetime,
            parseInt(amount) || 0,
            department || null,
            position || null,
            contact_name || null,
            phone_number || null,
            email || null,
            call_hearing || null,
            sales_category || null,
            reschedule_flag || null,
            deal_id || null,
            'new'
          ]
        });
      }
      inserted++;
    } catch (e) {
      errors++;
      console.error(`Error inserting row:`, row.slice(0, 3), e.message);
    }
  }

  console.log(`Inserted: ${inserted}, Errors: ${errors}`);
  return { inserted, errors };
}

async function migrateExternalIdData(data) {
  console.log(`Migrating ${data.length} external ID records...`);

  let inserted = 0;
  let errors = 0;

  for (const row of data) {
    try {
      // 法人電話番号, 企業名, 部署名, 部署番号, 役職, 担当者（姓）, 担当者名（名）, 架電案件, 取得ソース, saleRep, タイムスタンプ, [original_id]
      const [company_phone, company_name, department_name, department_phone, position, contact_last_name, contact_first_name, project_name, lead_source, sales_rep, timestamp, original_id] = row;

      await turso.execute({
        sql: `INSERT INTO external_id_rawdata
              (company_phone, company_name, department_name, department_phone, position,
               contact_last_name, contact_first_name, project_name, lead_source, sales_rep,
               original_id, timestamp)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          company_phone || null,
          company_name || null,
          department_name || null,
          department_phone || null,
          position || null,
          contact_last_name || null,
          contact_first_name || null,
          project_name || null,
          lead_source || null,
          sales_rep || null,
          original_id || null,
          timestamp || null
        ]
      });
      inserted++;
    } catch (e) {
      errors++;
      console.error(`Error inserting row:`, row.slice(0, 3), e.message);
    }
  }

  console.log(`Inserted: ${inserted}, Errors: ${errors}`);
  return { inserted, errors };
}

async function migrateDocumentSendData(data) {
  console.log(`Migrating ${data.length} document send records...`);

  let inserted = 0;
  let errors = 0;

  for (const row of data) {
    try {
      // 案件名, 会社名, 担当名, メールアドレス, 電話番号, 温度感, 温度感の根拠, NT, NA, 代打コール依頼先, 提案内容, 客先発言, 送付アドレス, メール送信代行依頼, 部署名/役職名, その他, 送信者, タイムスタンプ
      const [project_name, company_name, contact_name, email, phone_number, temperature, temperature_reason, next_touch_date, next_action, substitute_call_request, proposal_content, customer_comment, send_address, email_proxy_request, department_position, other_notes, sender, timestamp] = row;

      await turso.execute({
        sql: `INSERT INTO document_send_rawdata
              (project_name, company_name, contact_name, email, phone_number,
               temperature, temperature_reason, next_touch_date, next_action, substitute_call_request,
               proposal_content, customer_comment, send_address, email_proxy_request, department_position,
               other_notes, sender, timestamp)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          project_name || null,
          company_name || null,
          contact_name || null,
          email || null,
          phone_number || null,
          temperature || null,
          temperature_reason || null,
          next_touch_date || null,
          next_action || null,
          substitute_call_request || null,
          proposal_content || null,
          customer_comment || null,
          send_address || null,
          email_proxy_request || null,
          department_position || null,
          other_notes || null,
          sender || null,
          timestamp || null
        ]
      });
      inserted++;
    } catch (e) {
      errors++;
      console.error(`Error inserting row:`, row.slice(0, 3), e.message);
    }
  }

  console.log(`Inserted: ${inserted}, Errors: ${errors}`);
  return { inserted, errors };
}

// Read data from stdin and migrate
async function main() {
  const args = process.argv.slice(2);
  const tableType = args[0]; // 'performance', 'sales', 'external', 'document'
  const source = args[1]; // 'old', 'new' (only for performance and sales)

  console.log(`Reading data for ${tableType} (${source || 'default'})...`);

  let inputData = '';
  process.stdin.setEncoding('utf8');

  for await (const chunk of process.stdin) {
    inputData += chunk;
  }

  const data = JSON.parse(inputData);
  console.log(`Parsed ${data.length} rows`);

  switch (tableType) {
    case 'performance':
      await migratePerformanceData(data, source);
      break;
    case 'sales':
      await migrateSalesReportData(data, source);
      break;
    case 'external':
      await migrateExternalIdData(data);
      break;
    case 'document':
      await migrateDocumentSendData(data);
      break;
    default:
      console.error(`Unknown table type: ${tableType}`);
      process.exit(1);
  }

  console.log('Migration completed!');
}

main().catch(console.error);
