-- 001_enable_postgis.sql
-- Purpose: Enable PostGIS for delivery pin geography (Point, 4326).
-- NOTE: Do NOT apply until Phase 1B approval. This file is repo-only for Phase 1A.

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
