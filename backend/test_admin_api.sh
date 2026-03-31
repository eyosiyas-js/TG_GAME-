#!/bin/bash
# test_admin_api.sh
# Set an API key from your .env
API_KEY="admin_key_2024_03_31_abc123"
URL="http://localhost:3005"

echo "=== Testing Admin API === "
echo "Fetching Users List..."
curl -s -X GET "${URL}/admin/api/users" -H "X-Admin-API-Key: ${API_KEY}" | jq || echo "Users endpoint failed"

echo -e "\nFetching Revenue Overview..."
curl -s -X GET "${URL}/admin/api/revenue/overview" -H "X-Admin-API-Key: ${API_KEY}" | jq || echo "Revenue endpoint failed"

echo -e "\nFetching System Settings..."
curl -s -X GET "${URL}/admin/api/settings" -H "X-Admin-API-Key: ${API_KEY}" | jq || echo "Settings endpoint failed"
