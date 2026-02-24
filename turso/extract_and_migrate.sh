#!/bin/bash

# Change to script directory
cd "$(dirname "$0")"

echo "=== All Staff Rawdata Migration ==="
echo "Starting migration at $(date)"

# Function to run migration
migrate_table() {
    local table=$1
    local source=$2
    local json_file=$3

    if [ -f "$json_file" ]; then
        echo "Migrating $table ($source) from $json_file..."
        cat "$json_file" | node migrate.js "$table" "$source"
    else
        echo "ERROR: File not found: $json_file"
    fi
}

# Check if data files exist
echo "Checking for data files..."
ls -la data/ 2>/dev/null || echo "No data directory found. Please create data files first."

# Run migrations if data files exist
if [ -d "data" ]; then
    # Performance data (old + new)
    [ -f "data/old_rawdata.json" ] && migrate_table "performance" "old" "data/old_rawdata.json"
    [ -f "data/new_performance.json" ] && migrate_table "performance" "new" "data/new_performance.json"

    # Sales report data (old + new)
    [ -f "data/old_apo.json" ] && migrate_table "sales" "old" "data/old_apo.json"
    [ -f "data/new_sales.json" ] && migrate_table "sales" "new" "data/new_sales.json"

    # External ID data
    [ -f "data/external_id.json" ] && migrate_table "external" "" "data/external_id.json"

    # Document send data
    [ -f "data/document_send.json" ] && migrate_table "document" "" "data/document_send.json"
fi

echo "Migration completed at $(date)"
