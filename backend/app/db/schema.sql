-- ============================================================
-- Mail Agent — Initial Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- for gen_random_uuid()

-- ---------- Identity ----------

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    display_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('google','microsoft')),
    access_token_encrypted BYTEA NOT NULL,
    refresh_token_encrypted BYTEA NOT NULL,
    scopes TEXT[] NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- Conversation memory ----------

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title TEXT,                          -- auto-generated from first instruction
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user','assistant','tool')),
    content TEXT NOT NULL,
    referenced_entities JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

-- ---------- Style ----------

CREATE TABLE IF NOT EXISTS style_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    signature_html TEXT,
    font_family TEXT DEFAULT 'Arial',
    font_size INT DEFAULT 11,
    accent_color TEXT,
    tone TEXT DEFAULT 'neutral',
    is_default BOOLEAN DEFAULT false
);

-- ---------- Email cache ----------

CREATE TABLE IF NOT EXISTS email_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    provider_message_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    sender TEXT,
    subject TEXT,
    snippet TEXT,
    category TEXT,
    category_confidence REAL,
    received_at TIMESTAMPTZ,
    UNIQUE(user_id, provider_message_id)
);
CREATE INDEX IF NOT EXISTS idx_email_cache_thread ON email_cache(user_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_email_cache_category ON email_cache(user_id, category);

CREATE TABLE IF NOT EXISTS thread_summaries (
    thread_id TEXT NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    last_message_id TEXT NOT NULL,  -- watermark
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, thread_id)
);

-- ---------- Categorization rules ----------

CREATE TABLE IF NOT EXISTS category_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    match_type TEXT NOT NULL CHECK (match_type IN ('sender_domain','sender_exact','subject_keyword','gmail_label')),
    match_value TEXT NOT NULL,
    category TEXT NOT NULL,
    is_system_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_category_rules_user ON category_rules(user_id);

-- ---------- Drafts ----------

CREATE TABLE IF NOT EXISTS drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    thread_id TEXT NOT NULL,
    provider_draft_id TEXT,
    body_markdown TEXT,
    body_html TEXT,
    style_profile_id UUID REFERENCES style_profiles(id),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','sent','rejected','send_failed')),
    created_by_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- Permissions ----------

CREATE TABLE IF NOT EXISTS approval_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    agent_reasoning TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired','consumed')),
    confirmation_token TEXT UNIQUE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ
);
ALTER TABLE IF EXISTS approval_queue
    ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_approval_queue_status ON approval_queue(user_id, status);
CREATE INDEX IF NOT EXISTS idx_approval_queue_conversation ON approval_queue(conversation_id);

CREATE TABLE IF NOT EXISTS permission_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    condition JSONB,
    level TEXT NOT NULL CHECK (level IN ('AUTO','CONFIRM','BLOCKED')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- Reminders & calendar ----------

CREATE TABLE IF NOT EXISTS reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    related_thread_id TEXT,
    title TEXT NOT NULL,
    due_at TIMESTAMPTZ,
    status TEXT DEFAULT 'open' CHECK (status IN ('open','done','dismissed')),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    provider_event_id TEXT,
    title TEXT,
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    attendees TEXT[],
    source_thread_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- Cron jobs ----------

CREATE TABLE IF NOT EXISTS cron_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    name TEXT,
    prompt TEXT NOT NULL,
    schedule_type TEXT NOT NULL CHECK (schedule_type IN ('interval_minutes','daily')),
    schedule_value TEXT NOT NULL,
    enabled BOOLEAN DEFAULT true,
    state TEXT DEFAULT 'scheduled' CHECK (state IN ('scheduled','running','paused','failed','disabled')),
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cron_jobs_user ON cron_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_jobs_due ON cron_jobs(enabled, next_run_at);

CREATE TABLE IF NOT EXISTS cron_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES cron_jobs(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    status TEXT NOT NULL CHECK (status IN ('running','completed','failed')),
    output TEXT,
    error TEXT,
    started_at TIMESTAMPTZ DEFAULT now(),
    finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cron_runs_job ON cron_runs(job_id, started_at DESC);

-- ---------- Audit ----------

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    agent_name TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    input_params JSONB,
    output JSONB,
    approval_id UUID REFERENCES approval_queue(id),
    reasoning TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_time ON audit_log(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log_access (
    id BIGSERIAL PRIMARY KEY,
    viewer_user_id UUID REFERENCES users(id),
    viewed_user_id UUID REFERENCES users(id),
    accessed_at TIMESTAMPTZ DEFAULT now()
);
