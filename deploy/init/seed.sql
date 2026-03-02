-- ============================================================================
-- API Proxy – Schema + Seed Data
--
-- Seeds the structure: providers, app, credential stubs, app-provider links,
-- registry rules, firewall rules, alert configs, mock captures.
--
-- Credentials start EMPTY.  Configure real values through the admin panel
-- at http://localhost:3000 after startup.
-- ============================================================================

PRAGMA journal_mode=WAL;

-- ---------------------------------------------------------------------------
-- Schema (mirrors proxy/src/db/mod.rs exactly)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS providers (
    id            TEXT PRIMARY KEY,
    name          TEXT UNIQUE NOT NULL,
    auth_type     TEXT,
    base_urls     TEXT,
    is_built_in   BOOLEAN,
    auth_url      TEXT,
    token_url     TEXT,
    refresh_url   TEXT,
    scopes        TEXT,
    redirect_url  TEXT,
    is_llm_provider BOOLEAN,
    created_at    TEXT,
    updated_at    TEXT
);

CREATE TABLE IF NOT EXISTS app_instances (
    id            TEXT PRIMARY KEY,
    name          TEXT UNIQUE NOT NULL,
    description   TEXT,
    dummy_api_key TEXT UNIQUE NOT NULL,
    is_active     BOOLEAN,
    created_at    TEXT,
    updated_at    TEXT
);

CREATE TABLE IF NOT EXISTS credentials (
    id                      TEXT PRIMARY KEY,
    provider_id             TEXT NOT NULL REFERENCES providers(id),
    api_key_encrypted       TEXT,
    client_id               TEXT,
    client_secret_encrypted TEXT,
    label                   TEXT,
    created_at              TEXT,
    updated_at              TEXT
);

CREATE TABLE IF NOT EXISTS app_providers (
    id            TEXT PRIMARY KEY,
    app_id        TEXT NOT NULL REFERENCES app_instances(id),
    provider_id   TEXT NOT NULL REFERENCES providers(id),
    credential_id TEXT,
    created_at    TEXT
);

CREATE TABLE IF NOT EXISTS tokens (
    id                       TEXT PRIMARY KEY,
    provider_id              TEXT NOT NULL REFERENCES providers(id),
    app_id                   TEXT NOT NULL REFERENCES app_instances(id),
    credential_id            TEXT NOT NULL REFERENCES credentials(id),
    access_token_encrypted   TEXT,
    refresh_token_encrypted  TEXT,
    expires_at               TEXT,
    token_type               TEXT,
    scope                    TEXT,
    created_at               TEXT,
    updated_at               TEXT
);

CREATE TABLE IF NOT EXISTS token_usage (
    id            TEXT PRIMARY KEY,
    provider_id   TEXT REFERENCES providers(id),
    app_id        TEXT REFERENCES app_instances(id),
    model         TEXT,
    input_tokens  INTEGER,
    output_tokens INTEGER,
    total_tokens  INTEGER,
    request_path  TEXT,
    created_at    TEXT
);

CREATE TABLE IF NOT EXISTS alert_configs (
    id          TEXT PRIMARY KEY,
    app_id      TEXT REFERENCES app_instances(id),
    limit_type  TEXT,
    provider_id TEXT,
    threshold   INTEGER,
    hard_limit  INTEGER,
    is_active   BOOLEAN,
    created_at  TEXT,
    updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS registry_rules (
    id              TEXT PRIMARY KEY,
    app_id          TEXT REFERENCES app_instances(id),
    domain          TEXT,
    allowed_methods TEXT,
    path_pattern    TEXT,
    rate_limit      INTEGER,
    is_active       BOOLEAN,
    created_at      TEXT,
    updated_at      TEXT
);

CREATE TABLE IF NOT EXISTS firewall_rules (
    id        TEXT PRIMARY KEY,
    app_id    TEXT,
    rule_type TEXT,
    pattern   TEXT,
    action    TEXT,
    priority  INTEGER,
    is_active BOOLEAN,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS request_logs (
    id          TEXT PRIMARY KEY,
    app_id      TEXT,
    method      TEXT,
    host        TEXT,
    path        TEXT,
    status_code INTEGER,
    action      TEXT,
    details     TEXT,
    duration    INTEGER,
    created_at  TEXT
);

CREATE TABLE IF NOT EXISTS mock_captures (
    id               TEXT PRIMARY KEY,
    provider_id      TEXT,
    app_id           TEXT,
    method           TEXT,
    url_pattern      TEXT,
    request_headers  TEXT,
    request_body     TEXT,
    response_status  INTEGER,
    response_headers TEXT,
    response_body    TEXT,
    is_simulation    BOOLEAN,
    created_at       TEXT,
    updated_at       TEXT
);

CREATE TABLE IF NOT EXISTS oauth_callbacks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL,
    state       TEXT,
    received_at TEXT NOT NULL
);

-- =========================================================================
-- PROVIDERS
-- =========================================================================

-- Google  (OAuth – client_id + client_secret, used for Sheets / Calendar / Drive)
INSERT OR IGNORE INTO providers (id, name, auth_type, base_urls, is_built_in, auth_url, token_url, refresh_url, scopes, redirect_url, is_llm_provider, created_at, updated_at)
VALUES (
    '10000000-0000-0000-0000-000000000001',
    'google',
    'oauth',
    '["https://sheets.googleapis.com","https://www.googleapis.com","https://calendar-json.googleapis.com","https://drive.googleapis.com"]',
    0,
    'https://accounts.google.com/o/oauth2/v2/auth',
    'https://oauth2.googleapis.com/token',
    'https://oauth2.googleapis.com/token',
    '["https://www.googleapis.com/auth/spreadsheets","https://www.googleapis.com/auth/calendar","https://www.googleapis.com/auth/drive.readonly"]',
    'http://localhost:8889/oauth/callback',
    0,
    datetime('now'), datetime('now')
);

-- Miro  (Bearer access token)
INSERT OR IGNORE INTO providers (id, name, auth_type, base_urls, is_built_in, auth_url, token_url, refresh_url, scopes, redirect_url, is_llm_provider, created_at, updated_at)
VALUES (
    '10000000-0000-0000-0000-000000000002',
    'miro',
    'api_key',
    '["https://api.miro.com"]',
    0,
    'https://miro.com/oauth/authorize',
    'https://api.miro.com/v1/oauth/token',
    NULL,
    '["boards:read","boards:write"]',
    NULL, 0,
    datetime('now'), datetime('now')
);

-- Asana  (Personal Access Token as Bearer)
INSERT OR IGNORE INTO providers (id, name, auth_type, base_urls, is_built_in, auth_url, token_url, refresh_url, scopes, redirect_url, is_llm_provider, created_at, updated_at)
VALUES (
    '10000000-0000-0000-0000-000000000003',
    'asana',
    'api_key',
    '["https://app.asana.com"]',
    0, NULL, NULL, NULL, NULL, NULL, 0,
    datetime('now'), datetime('now')
);

-- =========================================================================
-- APPLICATION
-- =========================================================================

INSERT OR IGNORE INTO app_instances (id, name, description, dummy_api_key, is_active, created_at, updated_at)
VALUES (
    '20000000-0000-0000-0000-000000000001',
    'test-app',
    'Pre-configured test application for Google, Miro, and Asana',
    'proxy_testapp_00000000-0000-0000-0000-000000000001',
    1,
    datetime('now'), datetime('now')
);

-- =========================================================================
-- CREDENTIALS  (empty stubs – fill via admin panel at http://localhost:3000)
--
--   Google:  set client_id  +  client_secret   (OAuth)
--   Miro:    set api_key                       (access token)
--   Asana:   set api_key                       (personal access token)
--
-- The admin UI encrypts values with AES-256-GCM before storing.
-- =========================================================================

-- Google credential stub  (OAuth: needs client_id + client_secret)
INSERT OR IGNORE INTO credentials (id, provider_id, api_key_encrypted, client_id, client_secret_encrypted, label, created_at, updated_at)
VALUES (
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    NULL, NULL, NULL,
    'Google OAuth Credential',
    datetime('now'), datetime('now')
);

-- Miro credential stub  (needs access token in api_key field)
INSERT OR IGNORE INTO credentials (id, provider_id, api_key_encrypted, client_id, client_secret_encrypted, label, created_at, updated_at)
VALUES (
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    NULL, NULL, NULL,
    'Miro Access Token',
    datetime('now'), datetime('now')
);

-- Asana credential stub  (needs personal access token in api_key field)
INSERT OR IGNORE INTO credentials (id, provider_id, api_key_encrypted, client_id, client_secret_encrypted, label, created_at, updated_at)
VALUES (
    '30000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000003',
    NULL, NULL, NULL,
    'Asana Personal Access Token',
    datetime('now'), datetime('now')
);

-- =========================================================================
-- APP <-> PROVIDER LINKS  (with credential stubs attached)
-- =========================================================================

INSERT OR IGNORE INTO app_providers (id, app_id, provider_id, credential_id, created_at)
VALUES (
    '40000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    datetime('now')
);

INSERT OR IGNORE INTO app_providers (id, app_id, provider_id, credential_id, created_at)
VALUES (
    '40000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000002',
    datetime('now')
);

INSERT OR IGNORE INTO app_providers (id, app_id, provider_id, credential_id, created_at)
VALUES (
    '40000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000003',
    datetime('now')
);

-- =========================================================================
-- REGISTRY RULES  (API method/path allowlists per domain)
-- =========================================================================

-- Google Sheets
INSERT OR IGNORE INTO registry_rules (id, app_id, domain, allowed_methods, path_pattern, rate_limit, is_active, created_at, updated_at)
VALUES (
    '50000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'sheets.googleapis.com',
    '["GET","POST","PUT","PATCH"]',
    '/v4/spreadsheets.*',
    60, 1, datetime('now'), datetime('now')
);

-- Google Calendar
INSERT OR IGNORE INTO registry_rules (id, app_id, domain, allowed_methods, path_pattern, rate_limit, is_active, created_at, updated_at)
VALUES (
    '50000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'www.googleapis.com',
    '["GET","POST","PUT","PATCH","DELETE"]',
    '/calendar/v3/.*',
    60, 1, datetime('now'), datetime('now')
);

-- Google Drive
INSERT OR IGNORE INTO registry_rules (id, app_id, domain, allowed_methods, path_pattern, rate_limit, is_active, created_at, updated_at)
VALUES (
    '50000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000001',
    'www.googleapis.com',
    '["GET","POST"]',
    '/drive/v3/.*',
    30, 1, datetime('now'), datetime('now')
);

-- Miro
INSERT OR IGNORE INTO registry_rules (id, app_id, domain, allowed_methods, path_pattern, rate_limit, is_active, created_at, updated_at)
VALUES (
    '50000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000001',
    'api.miro.com',
    '["GET","POST","PUT","PATCH","DELETE"]',
    '/v2/.*',
    120, 1, datetime('now'), datetime('now')
);

-- Asana
INSERT OR IGNORE INTO registry_rules (id, app_id, domain, allowed_methods, path_pattern, rate_limit, is_active, created_at, updated_at)
VALUES (
    '50000000-0000-0000-0000-000000000005',
    '20000000-0000-0000-0000-000000000001',
    'app.asana.com',
    '["GET","POST","PUT","DELETE"]',
    '/api/1.0/.*',
    60, 1, datetime('now'), datetime('now')
);

-- =========================================================================
-- FIREWALL RULES
-- =========================================================================

-- Block Google admin console
INSERT OR IGNORE INTO firewall_rules (id, app_id, rule_type, pattern, action, priority, is_active, created_at, updated_at)
VALUES (
    '60000000-0000-0000-0000-000000000001',
    NULL, 'domain', 'admin.google.com', 'block', 1, 1,
    datetime('now'), datetime('now')
);

-- Block Google Accounts (prevent OAuth hijacking)
INSERT OR IGNORE INTO firewall_rules (id, app_id, rule_type, pattern, action, priority, is_active, created_at, updated_at)
VALUES (
    '60000000-0000-0000-0000-000000000002',
    NULL, 'domain', 'accounts.google.com', 'block', 2, 1,
    datetime('now'), datetime('now')
);

-- Block direct token endpoint access (all providers)
INSERT OR IGNORE INTO firewall_rules (id, app_id, rule_type, pattern, action, priority, is_active, created_at, updated_at)
VALUES (
    '60000000-0000-0000-0000-000000000003',
    NULL, 'path', '.*/oauth.*/token.*', 'block', 3, 1,
    datetime('now'), datetime('now')
);

-- Block cloud metadata endpoints
INSERT OR IGNORE INTO firewall_rules (id, app_id, rule_type, pattern, action, priority, is_active, created_at, updated_at)
VALUES (
    '60000000-0000-0000-0000-000000000004',
    NULL, 'domain', '169.254.169.254', 'block', 0, 1,
    datetime('now'), datetime('now')
);

-- Block localhost / loopback
INSERT OR IGNORE INTO firewall_rules (id, app_id, rule_type, pattern, action, priority, is_active, created_at, updated_at)
VALUES (
    '60000000-0000-0000-0000-000000000005',
    NULL, 'domain', 'localhost', 'block', 0, 1,
    datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO firewall_rules (id, app_id, rule_type, pattern, action, priority, is_active, created_at, updated_at)
VALUES (
    '60000000-0000-0000-0000-000000000006',
    NULL, 'domain', '127.0.0.1', 'block', 0, 1,
    datetime('now'), datetime('now')
);

-- =========================================================================
-- ALERT CONFIGS  (token usage limits)
-- =========================================================================

-- Global daily limit for the test app
INSERT OR IGNORE INTO alert_configs (id, app_id, limit_type, provider_id, threshold, hard_limit, is_active, created_at, updated_at)
VALUES (
    '70000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'daily', NULL, 50000, 100000, 1,
    datetime('now'), datetime('now')
);

-- =========================================================================
-- MOCK CAPTURE  (demo – works without real credentials)
-- =========================================================================

INSERT OR IGNORE INTO mock_captures (id, provider_id, app_id, method, url_pattern, request_headers, request_body, response_status, response_headers, response_body, is_simulation, created_at, updated_at)
VALUES (
    '80000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'GET',
    '%/v4/spreadsheets/mock-sheet-id%',
    NULL, NULL,
    200,
    '{"Content-Type":"application/json"}',
    '{"spreadsheetId":"mock-sheet-id","properties":{"title":"Mock Spreadsheet","locale":"en_US"},"sheets":[{"properties":{"sheetId":0,"title":"Sheet1","index":0}}]}',
    1,
    datetime('now'), datetime('now')
);
