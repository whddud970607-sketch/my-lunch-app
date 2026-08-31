# Signup identity provisioning

## Production (Phase B+)

After phone identity verification in the signup flow, the API calls:

`UserIdentityProfilesService.provisionOnSignup()`

This creates `user_identity_profiles` linked to the new `auth.users.id`.
It does **not** overwrite an existing row.

## Test-only backfill

`apps/api/scripts/seed-test-driver-identity.mjs` — interactive local input for fixture E2E only.

Do not use the seed script in production signup paths.
