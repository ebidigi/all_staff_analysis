-- Turso Schema for all-staff-rawdata
-- Created: 2026-02-19

-- 1. 実績rawdata（旧rawdata + 新実績rawdata）
CREATE TABLE IF NOT EXISTS performance_rawdata (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    member_name TEXT NOT NULL,
    project_name TEXT NOT NULL,
    input_date TEXT,
    work_start_time TEXT,
    work_end_time TEXT,
    call_hours REAL,
    call_count INTEGER DEFAULT 0,
    pr_count INTEGER DEFAULT 0,
    email_count INTEGER DEFAULT 0,
    appointment_count INTEGER DEFAULT 0,
    document_send_count INTEGER DEFAULT 0,
    contact_name_count INTEGER DEFAULT 0,
    qualitative_feedback TEXT,
    data_source TEXT NOT NULL CHECK (data_source IN ('old', 'new')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 2. 売上報告rawdata（旧アポrawdata + 新売上報告rawdata）
CREATE TABLE IF NOT EXISTS sales_report_rawdata (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    sales_rep TEXT NOT NULL,
    sales_type TEXT,
    project_name TEXT NOT NULL,
    company_name TEXT,
    acquisition_date TEXT,
    meeting_datetime TEXT,
    amount INTEGER DEFAULT 0,
    department TEXT,
    position TEXT,
    contact_name TEXT,
    phone_number TEXT,
    email TEXT,
    call_hearing TEXT,
    sales_category TEXT,
    reschedule_flag TEXT,
    deal_id TEXT,
    layer TEXT,
    memo TEXT,
    status TEXT,
    data_source TEXT NOT NULL CHECK (data_source IN ('old', 'new')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 3. 外IDrawdata
CREATE TABLE IF NOT EXISTS external_id_rawdata (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    company_phone TEXT,
    company_name TEXT,
    department_name TEXT,
    department_phone TEXT,
    position TEXT,
    contact_last_name TEXT,
    contact_first_name TEXT,
    project_name TEXT,
    lead_source TEXT,
    sales_rep TEXT,
    original_id TEXT,
    timestamp TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 4. 資料送付rawdata
CREATE TABLE IF NOT EXISTS document_send_rawdata (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    project_name TEXT,
    company_name TEXT,
    contact_name TEXT,
    email TEXT,
    phone_number TEXT,
    temperature TEXT,
    temperature_reason TEXT,
    next_touch_date TEXT,
    next_action TEXT,
    substitute_call_request TEXT,
    proposal_content TEXT,
    customer_comment TEXT,
    send_address TEXT,
    email_proxy_request TEXT,
    department_position TEXT,
    other_notes TEXT,
    sender TEXT,
    timestamp TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_performance_member ON performance_rawdata(member_name);
CREATE INDEX IF NOT EXISTS idx_performance_project ON performance_rawdata(project_name);
CREATE INDEX IF NOT EXISTS idx_performance_date ON performance_rawdata(input_date);

-- UNIQUE制約: 同一人物・同一案件・同一タイムスタンプのデータは1件のみ
-- 同じ日にAM/PM等で複数入力がある場合はタイムスタンプが異なるため許容される
-- INSERT OR REPLACE で upsert 動作を実現
CREATE UNIQUE INDEX IF NOT EXISTS idx_performance_unique ON performance_rawdata(member_name, project_name, input_timestamp);

CREATE INDEX IF NOT EXISTS idx_sales_rep ON sales_report_rawdata(sales_rep);
CREATE INDEX IF NOT EXISTS idx_sales_project ON sales_report_rawdata(project_name);
CREATE INDEX IF NOT EXISTS idx_sales_acquisition_date ON sales_report_rawdata(acquisition_date);
CREATE INDEX IF NOT EXISTS idx_sales_meeting_datetime ON sales_report_rawdata(meeting_datetime);

CREATE INDEX IF NOT EXISTS idx_external_company ON external_id_rawdata(company_name);
CREATE INDEX IF NOT EXISTS idx_external_sales_rep ON external_id_rawdata(sales_rep);

CREATE INDEX IF NOT EXISTS idx_doc_project ON document_send_rawdata(project_name);
CREATE INDEX IF NOT EXISTS idx_doc_sender ON document_send_rawdata(sender);
CREATE INDEX IF NOT EXISTS idx_doc_timestamp ON document_send_rawdata(timestamp);
