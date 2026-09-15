#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy

echo "Syncing database schema..."
npx prisma db push --accept-data-loss

echo "Starting application..."
exec node dist/src/main.js
