#!/bin/bash
set -e

DATA_DIR="${DATA_DIR:-/app/data}"
DB_PATH="${DATA_DIR}/proxy.db"
KEY_PATH="${DATA_DIR}/master.key"

echo "=== API Proxy Init ==="

mkdir -p "$DATA_DIR"

# -----------------------------------------------------------------------
# 1. Generate master encryption key (32 bytes) if it doesn't exist
# -----------------------------------------------------------------------
if [ ! -f "$KEY_PATH" ]; then
    echo "Generating master encryption key..."
    dd if=/dev/urandom bs=32 count=1 of="$KEY_PATH" 2>/dev/null
    chmod 600 "$KEY_PATH"
    echo "  -> $KEY_PATH"
else
    echo "Master key already exists, skipping."
fi

# -----------------------------------------------------------------------
# 2. Prepare seed SQL with real credentials from env vars
# -----------------------------------------------------------------------
SEED_SQL=$(cat /init/seed.sql)

# Substitute credential placeholders with env vars (or keep placeholder)
GOOGLE_KEY="${GOOGLE_API_KEY:-REPLACE_WITH_REAL_GOOGLE_API_KEY}"
MIRO_TOKEN="${MIRO_ACCESS_TOKEN:-REPLACE_WITH_REAL_MIRO_TOKEN}"
ASANA_TOKEN="${ASANA_ACCESS_TOKEN:-REPLACE_WITH_REAL_ASANA_TOKEN}"

SEED_SQL="${SEED_SQL//__GOOGLE_API_KEY__/$GOOGLE_KEY}"
SEED_SQL="${SEED_SQL//__MIRO_ACCESS_TOKEN__/$MIRO_TOKEN}"
SEED_SQL="${SEED_SQL//__ASANA_ACCESS_TOKEN__/$ASANA_TOKEN}"

# -----------------------------------------------------------------------
# 3. Create and seed the database
# -----------------------------------------------------------------------
if [ ! -f "$DB_PATH" ]; then
    echo "Creating database and seeding..."
    echo "$SEED_SQL" | sqlite3 "$DB_PATH"
    chmod 666 "$DB_PATH"
    echo "  -> $DB_PATH (seeded)"
else
    echo "Database already exists. Running seed with INSERT OR IGNORE..."
    echo "$SEED_SQL" | sqlite3 "$DB_PATH"
    echo "  -> Seed applied (existing data preserved)"
fi

# -----------------------------------------------------------------------
# 4. Print summary
# -----------------------------------------------------------------------
echo ""
echo "=== Seed Summary ==="
echo "  Providers:      $(sqlite3 "$DB_PATH" 'SELECT COUNT(*) FROM providers;')"
echo "  Apps:            $(sqlite3 "$DB_PATH" 'SELECT COUNT(*) FROM app_instances;')"
echo "  Credentials:     $(sqlite3 "$DB_PATH" 'SELECT COUNT(*) FROM credentials;')"
echo "  App-Providers:   $(sqlite3 "$DB_PATH" 'SELECT COUNT(*) FROM app_providers;')"
echo "  Registry Rules:  $(sqlite3 "$DB_PATH" 'SELECT COUNT(*) FROM registry_rules;')"
echo "  Firewall Rules:  $(sqlite3 "$DB_PATH" 'SELECT COUNT(*) FROM firewall_rules;')"
echo "  Alert Configs:   $(sqlite3 "$DB_PATH" 'SELECT COUNT(*) FROM alert_configs;')"
echo "  Mock Captures:   $(sqlite3 "$DB_PATH" 'SELECT COUNT(*) FROM mock_captures;')"
echo ""

DUMMY_KEY=$(sqlite3 "$DB_PATH" "SELECT dummy_api_key FROM app_instances LIMIT 1;")
echo "=== Ready ==="
echo "  Dummy API key:  $DUMMY_KEY"
echo "  Use this as your Bearer token when calling through the proxy."
echo ""

# Check if credentials are still placeholders
if [ "$GOOGLE_KEY" = "REPLACE_WITH_REAL_GOOGLE_API_KEY" ]; then
    echo "  WARNING: GOOGLE_API_KEY not set – Google API calls will fail"
fi
if [ "$MIRO_TOKEN" = "REPLACE_WITH_REAL_MIRO_TOKEN" ]; then
    echo "  WARNING: MIRO_ACCESS_TOKEN not set – Miro API calls will fail"
fi
if [ "$ASANA_TOKEN" = "REPLACE_WITH_REAL_ASANA_TOKEN" ]; then
    echo "  WARNING: ASANA_ACCESS_TOKEN not set – Asana API calls will fail"
fi

echo ""
echo "Init complete."
