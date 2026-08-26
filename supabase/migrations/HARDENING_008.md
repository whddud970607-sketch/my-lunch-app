# Phase 1B.1 — Security Advisor hardening (SQL only, not applied)

**Status:** [`008_security_advisor_hardening.sql`](008_security_advisor_hardening.sql) authored. **Do not `apply_migration` until approved.**

## Function matrix (after hardening SQL)

| Function | SECURITY DEFINER | search_path | anon EXECUTE | authenticated EXECUTE | service_role EXECUTE | Intended caller |
|----------|------------------|-------------|----------------|----------------------|----------------------|-----------------|
| `request_jwt_role` | no | `public, pg_temp` | no | no | yes | Internal / service |
| `is_service_role` | no | `public, pg_temp` | no | no | yes | Internal / service |
| `current_profile_role` | yes | `public, pg_temp` | no | yes | yes | RLS policies (user JWT) |
| `current_company_id` | yes | `public, pg_temp` | no | yes | yes | RLS policies |
| `current_driver_id` | yes | `public, pg_temp` | no | yes | yes | RLS policies |
| `is_platform_admin` | yes | `public, pg_temp` | no | yes | yes | RLS policies |
| `is_company_admin_of` | yes | `public, pg_temp` | no | yes | yes | RLS policies |
| `driver_owns_point` | yes | `public, pg_temp` | no | yes | yes | RLS policies |
| `driver_can_access_active_pii` | yes | `public, pg_temp` | no | yes | yes | RLS / safe view |
| `storage_path_driver_id` | no | `public, pg_temp` | no | yes | yes | Storage RLS |
| `storage_path_point_id` | no | `public, pg_temp` | no | yes | yes | Storage RLS |
| `handle_new_user` | yes | `public, pg_temp` | no | no | yes | Auth trigger only |
| `enforce_profile_role_security` | yes | `public, pg_temp` | no | no | yes | profiles trigger (blocks client role escalate) |
| `touch_updated_at` | no | `public, pg_temp` | no | no | yes | BEFORE UPDATE triggers |
| `sync_delivery_point_driver` | yes | `public, pg_temp` | no | no | yes | delivery_points trigger |
| `on_delivery_point_status_change` | yes | `public, pg_temp` | no | no | yes | delivery_points trigger |
| `on_delivery_job_done` | yes | `public, pg_temp` | no | no | yes | delivery_jobs trigger |
| `purge_expired_access_info` | yes | `public, pg_temp` | no | no | yes | Nest cron (service_role) |
| `purge_expired_contacts` | yes | `public, pg_temp` | no | no | yes | Nest cron (service_role) |

**Not in DB as SQL functions (Nest-only by design):** access_info decrypt, break-glass PII, platform_admin grant orchestration (`SET LOCAL app.allow_platform_admin_grant=on` + service_role update). Hardening keeps clients unable to call purge/trigger RPCs.

## Advisor → change mapping

| Advisor | Level | Fix in 008 |
|---------|-------|------------|
| `function_search_path_mutable` (`request_jwt_role`, `is_service_role`, `touch_updated_at`, `storage_path_*`) | WARN | `SET search_path = public, pg_temp` on recreate/ALTER |
| `function_search_path_mutable` on other DEFINER fns | (preventive) | ALTER … SET search_path |
| `anon_security_definer_function_executable` | WARN | REVOKE EXECUTE from `anon` (+ `PUBLIC` where needed) |
| `authenticated_security_definer_function_executable` on triggers/purge | WARN | REVOKE EXECUTE from `authenticated` for trigger/purge/internal fns |
| `authenticated_security_definer_function_executable` on RLS helpers | WARN (expected residual) | **Keep** EXECUTE for `authenticated` — required for RLS policy evaluation under user JWT. Cannot fully clear without breaking RLS. |
| `rls_enabled_no_policy` on `delivery_point_access_secrets` / `retention` | INFO | **Keep** — intentional default deny; no authenticated SELECT policies |

## Table GRANT plan

| Table | anon | authenticated (after) | Notes |
|-------|------|----------------------|-------|
| business ops tables | **REVOKE ALL** | SELECT/(INSERT)/UPDATE per RLS policies only | Removes default broad GRANTs |
| `delivery_point_access_secrets` | none | **none** | service_role only |
| `delivery_point_retention` | none | **none** | service_role only |
| `delivery_points_list_safe` | none | SELECT | Masked list contract |

## RLS impact (driver / company_admin / platform_admin)

| Role | Expected impact |
|------|-----------------|
| driver | **Unchanged** if Nest uses user JWT + PostgREST/Supabase client: policies still call helpers; helpers remain executable by `authenticated`. |
| company_admin | **Unchanged** for scoped SELECT on jobs/points/proofs; still **no** PII/access_secrets SELECT policies. |
| platform_admin | **Unchanged** for operational oversight policies; still **no** default access_info/PII ciphertext access. |
| anon | Stronger: no table GRANTs + no helper RPC — cannot probe delivery data or helper endpoints. |
| Triggers / signup | Still fire: trigger functions do not require invoker EXECUTE. |

## Residual Advisor items after apply (expected)

1. **WARN** may remain for RLS helper DEFINER functions executable by `authenticated` — intentional for user-JWT RLS.
2. **INFO** may remain for tables with RLS and zero policies (`access_secrets`, `retention`) — intentional lockout.

## Out of scope this file

- NestJS / Flutter / Vercel
- Creating decrypt/break-glass SQL RPCs
- Changing existing RLS policy expressions
