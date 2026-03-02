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
# 2. Create and seed the database
# -----------------------------------------------------------------------
if [ ! -f "$DB_PATH" ]; then
    echo "Creating database and seeding..."
    sqlite3 "$DB_PATH" < /init/seed.sql
    chmod 666 "$DB_PATH"
    echo "  -> $DB_PATH (seeded)"
else
    echo "Database already exists. Running seed with INSERT OR IGNORE..."
    sqlite3 "$DB_PATH" < /init/seed.sql
    echo "  -> Seed applied (existing data preserved)"
fi

# -----------------------------------------------------------------------
# 3. Print summary
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
echo "  Dummy API key: $DUMMY_KEY"
echo ""
echo "  Next steps:"
echo "    1. Open http://localhost:3000 (password: admin)"
echo "    2. Go to Credentials and configure:"
echo "       - Google:  client_id + client_secret  (OAuth)"
echo "       - Miro:    access token               (API key)"
echo "       - Asana:   personal access token       (API key)"
echo "    3. Use Bearer $DUMMY_KEY through the proxy at :8888"
echo ""
echo "Init complete."
