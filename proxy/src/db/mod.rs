use chrono::{NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{FromRow, SqlitePool};
use std::str::FromStr;
use thiserror::Error;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Error, Debug)]
pub enum DbError {
    #[error("sqlx error: {0}")]
    Sqlx(#[from] sqlx::Error),

    #[error("migration error: {0}")]
    Migration(String),

    #[error("record not found")]
    NotFound,
}

pub type DbResult<T> = Result<T, DbError>;

// ---------------------------------------------------------------------------
// Record types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub auth_type: Option<String>,
    pub base_urls: Option<String>,
    pub is_built_in: Option<bool>,
    pub auth_url: Option<String>,
    pub token_url: Option<String>,
    pub refresh_url: Option<String>,
    pub scopes: Option<String>,
    pub redirect_url: Option<String>,
    pub is_llm_provider: Option<bool>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AppInstance {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub dummy_api_key: String,
    pub is_active: Option<bool>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AppProvider {
    pub id: String,
    pub app_id: String,
    pub provider_id: String,
    pub credential_id: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Credential {
    pub id: String,
    pub provider_id: String,
    pub api_key_encrypted: Option<String>,
    pub client_id: Option<String>,
    pub client_secret_encrypted: Option<String>,
    pub label: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct TokenRecord {
    pub id: String,
    pub provider_id: String,
    pub app_id: String,
    pub credential_id: String,
    pub access_token_encrypted: Option<String>,
    pub refresh_token_encrypted: Option<String>,
    pub expires_at: Option<String>,
    pub token_type: Option<String>,
    pub scope: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct TokenUsageEntry {
    pub id: String,
    pub provider_id: Option<String>,
    pub app_id: Option<String>,
    pub model: Option<String>,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub total_tokens: Option<i64>,
    pub request_path: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AlertConfigRecord {
    pub id: String,
    pub app_id: Option<String>,
    pub limit_type: Option<String>,
    pub provider_id: Option<String>,
    pub threshold: Option<i64>,
    pub hard_limit: Option<i64>,
    pub is_active: Option<bool>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct RegistryRuleRecord {
    pub id: String,
    pub app_id: Option<String>,
    pub domain: Option<String>,
    pub allowed_methods: Option<String>,
    pub path_pattern: Option<String>,
    pub rate_limit: Option<i64>,
    pub is_active: Option<bool>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct FirewallRuleRecord {
    pub id: String,
    pub app_id: Option<String>,
    pub rule_type: Option<String>,
    pub pattern: Option<String>,
    pub action: Option<String>,
    pub priority: Option<i64>,
    pub is_active: Option<bool>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct RequestLogEntry {
    pub id: String,
    pub app_id: Option<String>,
    pub method: Option<String>,
    pub host: Option<String>,
    pub path: Option<String>,
    pub status_code: Option<i64>,
    pub action: Option<String>,
    pub details: Option<String>,
    pub duration: Option<i64>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct MockCaptureRecord {
    pub id: String,
    pub provider_id: Option<String>,
    pub app_id: Option<String>,
    pub method: Option<String>,
    pub url_pattern: Option<String>,
    pub request_headers: Option<String>,
    pub request_body: Option<String>,
    pub response_status: Option<i64>,
    pub response_headers: Option<String>,
    pub response_body: Option<String>,
    pub is_simulation: Option<bool>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

// ---------------------------------------------------------------------------
// Database wrapper
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct Database {
    pool: SqlitePool,
}

impl Database {
    /// Open (or create) a SQLite database at the given path and run
    /// migrations to ensure all tables exist.
    pub async fn new(path: &str) -> DbResult<Self> {
        // Ensure the parent directory exists.
        if let Some(parent) = std::path::Path::new(path).parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| DbError::Migration(e.to_string()))?;
        }

        let options = SqliteConnectOptions::from_str(path)
            .unwrap_or_else(|_| {
                SqliteConnectOptions::new().filename(path)
            })
            .create_if_missing(true)
            .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal);

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await?;

        let db = Self { pool };
        db.run_migrations().await?;
        Ok(db)
    }

    /// Convenience constructor that uses the default path `data/proxy.db`.
    pub async fn default() -> DbResult<Self> {
        Self::new("data/proxy.db").await
    }

    /// Return a reference to the underlying connection pool.
    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    // -----------------------------------------------------------------------
    // Migrations
    // -----------------------------------------------------------------------

    async fn run_migrations(&self) -> DbResult<()> {
        let statements = vec![
            r#"
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
            )
            "#,
            r#"
            CREATE TABLE IF NOT EXISTS app_instances (
                id            TEXT PRIMARY KEY,
                name          TEXT UNIQUE NOT NULL,
                description   TEXT,
                dummy_api_key TEXT UNIQUE NOT NULL,
                is_active     BOOLEAN,
                created_at    TEXT,
                updated_at    TEXT
            )
            "#,
            r#"
            CREATE TABLE IF NOT EXISTS credentials (
                id                      TEXT PRIMARY KEY,
                provider_id             TEXT NOT NULL REFERENCES providers(id),
                api_key_encrypted       TEXT,
                client_id               TEXT,
                client_secret_encrypted TEXT,
                label                   TEXT,
                created_at              TEXT,
                updated_at              TEXT
            )
            "#,
            r#"
            CREATE TABLE IF NOT EXISTS app_providers (
                id            TEXT PRIMARY KEY,
                app_id        TEXT NOT NULL REFERENCES app_instances(id),
                provider_id   TEXT NOT NULL REFERENCES providers(id),
                credential_id TEXT,
                created_at    TEXT
            )
            "#,
            r#"
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
            )
            "#,
            r#"
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
            )
            "#,
            r#"
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
            )
            "#,
            r#"
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
            )
            "#,
            r#"
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
            )
            "#,
            r#"
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
            )
            "#,
            r#"
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
            )
            "#,
        ];

        for sql in statements {
            sqlx::query(sql)
                .execute(&self.pool)
                .await
                .map_err(|e| DbError::Migration(e.to_string()))?;
        }

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Provider queries
    // -----------------------------------------------------------------------

    /// Find a provider whose `base_urls` JSON array contains the given domain.
    ///
    /// `base_urls` is stored as a JSON-encoded string array
    /// (e.g. `["https://api.openai.com"]`). We use a simple `LIKE` match on
    /// the serialised text so no JSON1 extension is required.
    pub async fn find_provider_by_base_url(&self, domain: &str) -> DbResult<Option<Provider>> {
        let pattern = format!("%{}%", domain);
        let row = sqlx::query_as::<_, Provider>(
            "SELECT * FROM providers WHERE base_urls LIKE ?1 LIMIT 1",
        )
        .bind(&pattern)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row)
    }

    // -----------------------------------------------------------------------
    // App instance queries
    // -----------------------------------------------------------------------

    /// Look up an application by its dummy API key (the key clients send in
    /// the `Authorization` header).
    pub async fn find_app_by_dummy_key(&self, key: &str) -> DbResult<Option<AppInstance>> {
        let row = sqlx::query_as::<_, AppInstance>(
            "SELECT * FROM app_instances WHERE dummy_api_key = ?1 AND is_active = 1 LIMIT 1",
        )
        .bind(key)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row)
    }

    // -----------------------------------------------------------------------
    // Credential queries
    // -----------------------------------------------------------------------

    /// Resolve the credential that an application should use for a given
    /// provider. We join through `app_providers` to find the mapping, then
    /// fetch the credential row.
    pub async fn get_credential_for_app_provider(
        &self,
        app_id: &str,
        provider_id: &str,
    ) -> DbResult<Option<Credential>> {
        let row = sqlx::query_as::<_, Credential>(
            r#"
            SELECT c.*
            FROM credentials c
            INNER JOIN app_providers ap ON ap.credential_id = c.id
            WHERE ap.app_id = ?1
              AND ap.provider_id = ?2
            LIMIT 1
            "#,
        )
        .bind(app_id)
        .bind(provider_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row)
    }

    // -----------------------------------------------------------------------
    // Token queries
    // -----------------------------------------------------------------------

    /// Fetch the most recent OAuth token for an app + provider pair.
    pub async fn get_token_for_app_provider(
        &self,
        app_id: &str,
        provider_id: &str,
    ) -> DbResult<Option<TokenRecord>> {
        let row = sqlx::query_as::<_, TokenRecord>(
            r#"
            SELECT *
            FROM tokens
            WHERE app_id = ?1
              AND provider_id = ?2
            ORDER BY created_at DESC
            LIMIT 1
            "#,
        )
        .bind(app_id)
        .bind(provider_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row)
    }

    /// Insert a new token row.
    pub async fn save_token(&self, token: &TokenRecord) -> DbResult<()> {
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();

        sqlx::query(
            r#"
            INSERT INTO tokens (
                id, provider_id, app_id, credential_id,
                access_token_encrypted, refresh_token_encrypted,
                expires_at, token_type, scope,
                created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            "#,
        )
        .bind(&token.id)
        .bind(&token.provider_id)
        .bind(&token.app_id)
        .bind(&token.credential_id)
        .bind(&token.access_token_encrypted)
        .bind(&token.refresh_token_encrypted)
        .bind(&token.expires_at)
        .bind(&token.token_type)
        .bind(&token.scope)
        .bind(token.created_at.as_deref().unwrap_or(&now))
        .bind(token.updated_at.as_deref().unwrap_or(&now))
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Update an existing token row (matched by `id`).
    pub async fn update_token(&self, token: &TokenRecord) -> DbResult<()> {
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();

        sqlx::query(
            r#"
            UPDATE tokens
            SET access_token_encrypted  = ?1,
                refresh_token_encrypted = ?2,
                expires_at              = ?3,
                token_type              = ?4,
                scope                   = ?5,
                updated_at              = ?6
            WHERE id = ?7
            "#,
        )
        .bind(&token.access_token_encrypted)
        .bind(&token.refresh_token_encrypted)
        .bind(&token.expires_at)
        .bind(&token.token_type)
        .bind(&token.scope)
        .bind(token.updated_at.as_deref().unwrap_or(&now))
        .bind(&token.id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Request logging
    // -----------------------------------------------------------------------

    /// Persist a single request log entry.
    pub async fn log_request(&self, log: &RequestLogEntry) -> DbResult<()> {
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();

        sqlx::query(
            r#"
            INSERT INTO request_logs (
                id, app_id, method, host, path,
                status_code, action, details, duration, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            "#,
        )
        .bind(&log.id)
        .bind(&log.app_id)
        .bind(&log.method)
        .bind(&log.host)
        .bind(&log.path)
        .bind(log.status_code)
        .bind(&log.action)
        .bind(&log.details)
        .bind(log.duration)
        .bind(log.created_at.as_deref().unwrap_or(&now))
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Token usage tracking
    // -----------------------------------------------------------------------

    /// Record token/model usage for billing & alerting.
    pub async fn record_token_usage(&self, usage: &TokenUsageEntry) -> DbResult<()> {
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();

        sqlx::query(
            r#"
            INSERT INTO token_usage (
                id, provider_id, app_id, model,
                input_tokens, output_tokens, total_tokens,
                request_path, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
        )
        .bind(&usage.id)
        .bind(&usage.provider_id)
        .bind(&usage.app_id)
        .bind(&usage.model)
        .bind(usage.input_tokens)
        .bind(usage.output_tokens)
        .bind(usage.total_tokens)
        .bind(&usage.request_path)
        .bind(usage.created_at.as_deref().unwrap_or(&now))
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Firewall rules
    // -----------------------------------------------------------------------

    /// Return active firewall rules, optionally filtered by `app_id`.
    /// Global rules (where `app_id IS NULL`) are always included.
    /// Results are ordered by priority ascending (lowest number = highest
    /// priority).
    pub async fn get_firewall_rules(
        &self,
        app_id: Option<&str>,
    ) -> DbResult<Vec<FirewallRuleRecord>> {
        let rows = match app_id {
            Some(aid) => {
                sqlx::query_as::<_, FirewallRuleRecord>(
                    r#"
                    SELECT *
                    FROM firewall_rules
                    WHERE is_active = 1
                      AND (app_id IS NULL OR app_id = ?1)
                    ORDER BY priority ASC
                    "#,
                )
                .bind(aid)
                .fetch_all(&self.pool)
                .await?
            }
            None => {
                sqlx::query_as::<_, FirewallRuleRecord>(
                    r#"
                    SELECT *
                    FROM firewall_rules
                    WHERE is_active = 1
                    ORDER BY priority ASC
                    "#,
                )
                .fetch_all(&self.pool)
                .await?
            }
        };

        Ok(rows)
    }

    // -----------------------------------------------------------------------
    // Registry rules
    // -----------------------------------------------------------------------

    /// Return active registry (allow-list) rules for a given application.
    pub async fn get_registry_rules(&self, app_id: &str) -> DbResult<Vec<RegistryRuleRecord>> {
        let rows = sqlx::query_as::<_, RegistryRuleRecord>(
            r#"
            SELECT *
            FROM registry_rules
            WHERE app_id = ?1
              AND is_active = 1
            "#,
        )
        .bind(app_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    // -----------------------------------------------------------------------
    // Mock captures
    // -----------------------------------------------------------------------

    /// Find a mock capture that matches the given HTTP method and URL.
    /// The `url_pattern` column is compared using `LIKE` so that simple
    /// wildcards work (e.g. `%/v1/chat/completions%`).
    pub async fn get_mock_capture(
        &self,
        method: &str,
        url: &str,
    ) -> DbResult<Option<MockCaptureRecord>> {
        let row = sqlx::query_as::<_, MockCaptureRecord>(
            r#"
            SELECT *
            FROM mock_captures
            WHERE method = ?1
              AND ?2 LIKE url_pattern
            LIMIT 1
            "#,
        )
        .bind(method)
        .bind(url)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row)
    }

    /// Upsert a mock capture record. If a row with the same `id` already
    /// exists it will be replaced.
    pub async fn save_mock_capture(&self, capture: &MockCaptureRecord) -> DbResult<()> {
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();

        sqlx::query(
            r#"
            INSERT OR REPLACE INTO mock_captures (
                id, provider_id, app_id, method, url_pattern,
                request_headers, request_body,
                response_status, response_headers, response_body,
                is_simulation, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
            "#,
        )
        .bind(&capture.id)
        .bind(&capture.provider_id)
        .bind(&capture.app_id)
        .bind(&capture.method)
        .bind(&capture.url_pattern)
        .bind(&capture.request_headers)
        .bind(&capture.request_body)
        .bind(capture.response_status)
        .bind(&capture.response_headers)
        .bind(&capture.response_body)
        .bind(capture.is_simulation)
        .bind(capture.created_at.as_deref().unwrap_or(&now))
        .bind(capture.updated_at.as_deref().unwrap_or(&now))
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Alert configs
    // -----------------------------------------------------------------------

    /// Return all active alert configurations for an application.
    pub async fn get_alert_configs(&self, app_id: &str) -> DbResult<Vec<AlertConfigRecord>> {
        let rows = sqlx::query_as::<_, AlertConfigRecord>(
            r#"
            SELECT *
            FROM alert_configs
            WHERE app_id = ?1
              AND is_active = 1
            "#,
        )
        .bind(app_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    // -----------------------------------------------------------------------
    // Usage aggregation
    // -----------------------------------------------------------------------

    /// Sum total tokens consumed by an app today (UTC). Optionally filter by
    /// provider.
    pub async fn get_daily_usage(
        &self,
        app_id: &str,
        provider_id: Option<&str>,
    ) -> DbResult<i64> {
        let today = Utc::now().format("%Y-%m-%d").to_string();
        let start = format!("{}T00:00:00Z", today);
        let end = format!("{}T23:59:59Z", today);

        let total: (Option<i64>,) = match provider_id {
            Some(pid) => {
                sqlx::query_as(
                    r#"
                    SELECT COALESCE(SUM(total_tokens), 0)
                    FROM token_usage
                    WHERE app_id = ?1
                      AND provider_id = ?2
                      AND created_at >= ?3
                      AND created_at <= ?4
                    "#,
                )
                .bind(app_id)
                .bind(pid)
                .bind(&start)
                .bind(&end)
                .fetch_one(&self.pool)
                .await?
            }
            None => {
                sqlx::query_as(
                    r#"
                    SELECT COALESCE(SUM(total_tokens), 0)
                    FROM token_usage
                    WHERE app_id = ?1
                      AND created_at >= ?2
                      AND created_at <= ?3
                    "#,
                )
                .bind(app_id)
                .bind(&start)
                .bind(&end)
                .fetch_one(&self.pool)
                .await?
            }
        };

        Ok(total.0.unwrap_or(0))
    }
}
