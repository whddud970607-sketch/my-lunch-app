# Supabase migrations (Phase 1A — files only)

**Status:** SQL authored in-repo. **Not applied** to the remote Supabase project.  
Do not run `apply_migration` / enable PostGIS / create buckets until Phase 1B is approved.

Project observed at plan time: empty `public` schema, PostGIS available but not installed, no custom RLS, no storage buckets.

## Migration map

| File | Purpose |
|------|---------|
| [`001_enable_postgis.sql`](001_enable_postgis.sql) | Enable PostGIS in `extensions` schema for `geography(Point,4326)` pins. |
| [`002_enums_and_helpers.sql`](002_enums_and_helpers.sql) | Roles, statuses, pin accuracy, access-log actions, **`delivery_contact_type`**. |
| [`003_companies_profiles_drivers.sql`](003_companies_profiles_drivers.sql) | `companies`, `profiles`, `drivers`; signup trigger (always `driver`); **role-escalation blockers**. |
| [`004_delivery_domain_and_pii.sql`](004_delivery_domain_and_pii.sql) | Jobs/points/routes/proofs; **PII + contact channel**; **access_secrets**; retention; purge fns. |
| [`005_rls_policies.sql`](005_rls_policies.sql) | RLS + FORCE RLS; scoped policies; **no admin default PII/access_info access**. |
| [`006_storage_delivery_proofs.sql`](006_storage_delivery_proofs.sql) | Private `delivery-proofs` bucket + path policies `{driver_id}/{point_id}/...`. |
| [`007_data_access_logs.sql`](007_data_access_logs.sql) | Audit log + `delivery_points_list_safe` view (`pii_is_masked`). |
| [`008_security_advisor_hardening.sql`](008_security_advisor_hardening.sql) | **Not applied yet** — search_path, EXECUTE revoke, least-privilege GRANTs. See [`HARDENING_008.md`](HARDENING_008.md). |

## Contact / 안심번호 model (MVP)

**Principle:** Prefer **not** storing the customer’s real mobile number.

| Field (on `delivery_point_pii`) | Meaning |
|----------------------------------|---------|
| `contact_type` | `none` \| `masked_number` \| `virtual_number` |
| `contact_value` | Number shown to driver (carrier 안심/가상번호). **Not** a dedicated raw-MSISDN column. |
| `contact_expires_at` | After this, `purge_expired_contacts()` deletes `contact_value`. |
| `contact_provider` | Opaque provider id for Nest adapters (company/carrier code). |
| `provider_reference` | External binding id for that provider. |
| `contact_purged_at` | When value was destroyed. |

- **MVP:** ingest carrier/company-provided masked/virtual numbers only. **No** Delivery Shield number issuance.
- **No `customer_phone` / raw phone column** in schema.
- Contact lives only under `delivery_point_pii` (same RLS as other PII): assigned driver + `job=active` + point `pending`/`in_progress`.
- After point complete or job `done`, RLS blocks PII (including contact). Lists use `delivery_points_list_safe`.

### Future NestJS ContactProvider adapters (not implemented in Phase 1A)

```text
ContactProvider (interface)
  ├─ CarrierCompanyIngestProvider   // MVP: store numbers already issued by 배송사
  ├─ TelcoVirtualNumberProviderX    // P1/P2 optional
  └─ DeliveryShieldNumberProvider   // P2+: DS-issued, swap telco behind adapter
```

- Nest selects provider by `contact_provider` without hard-coding a single telco.
- Provider APIs / DS number issuance are **out of scope** for Phase 1A/1B SQL apply.

## Auth / Nest / RLS intended runtime (Phase 1B+)

1. Flutter/Web: Supabase Auth with **anon key only** (never `service_role`).
2. Nest: verify user JWT; for normal driver/company reads use **user-scoped Supabase client** so RLS enforces.
3. Nest `service_role` **only** for: platform_admin grant (`SET LOCAL app.allow_platform_admin_grant=on`), access_info decrypt, retention write, signed URL edge cases, `purge_expired_access_info`, `purge_expired_contacts`.

## Privacy rules encoded in SQL

| Rule | How |
|------|-----|
| PII + contact only for assigned driver on active work | `delivery_point_pii` SELECT requires `driver_can_access_active_pii`. |
| Unassigned / other drivers / other companies | No SELECT (helper / company_id fail). |
| After point complete or job `done` | Helper false → RLS denies entire PII row (incl. contact). |
| Masking targets | name, detail address, memo, contact_*, access secrets; list UI uses safe view. |
| No raw phone store | No `customer_phone` column; contact is masked/virtual/none only. |
| Retention vs display | `delivery_point_retention` encrypted archive; **no authenticated policies**. |
| access_info | Ciphertext table; **no authenticated GRANT/policy**; purge NULLs ciphertext. |
| Admins no default door codes / PII / contact | No SELECT policies on `delivery_point_pii` or `access_secrets` for company/platform admin. |
| Break-glass | Future Nest + `data_access_logs` (`break_glass_*`, `read_contact`, reason). |
| platform_admin not via signup/API | Trigger signup=`driver`; role change needs `service_role`; platform needs grant flag. |

## Security self-check (re-run after contact change)

| Check | Result |
|-------|--------|
| Raw customer phone column | **Absent** (`customer_phone` removed). |
| contact on `delivery_points` plaintext | **No** — only on `delivery_point_pii`. |
| Contact after complete / job done | **Blocked** by same RLS as PII (`driver_can_access_active_pii` = false). |
| Other driver / other company contact | **Denied** (driver_id + company_admin has no PII SELECT policy). |
| access_info ciphertext via authenticated | **No** policy/GRANT on `delivery_point_access_secrets`. |
| platform_admin default access_info plaintext | **Impossible** via RLS (no policy; ciphertext only anyway). |
| Role escalate without service_role | **Blocked** by trigger + profile UPDATE policy. |
| platform_admin without grant flag | **Blocked** even for service_role unless `app.allow_platform_admin_grant=on`. |
| Expired contact destruction | `purge_expired_contacts()` clears value (not ****). |
| service_role in clients | Not introduced; Nest must keep key server-side. |

### Residual risks (1B code)

1. Nest must use user JWT for routine PII/contact reads (not service_role).
2. Active assigned drivers can read `contact_value` while job active — intended for calling 안심번호.
3. App must not write raw MSISDN into `contact_value` despite column being text — enforce in Nest validation.
4. `extensions.geography` type name validate on apply.

## Apply order (after approval only)

`001` → `002` → `003` → `004` → `005` → `006` → `007`
