#!/bin/sh
# Creates the integration-test database alongside the compose database.
# POSTGRES_MULTIPLE_DATABASES is not supported natively, so we do it here.
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE DATABASE webhook_test;" 2>/dev/null || true
