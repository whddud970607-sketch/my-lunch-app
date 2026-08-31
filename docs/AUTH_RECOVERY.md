# Account Recovery (Phase A)

## Primary password reset flow

1. Login screen → **비밀번호 찾기**
2. Account identification (name, birth date, phone)
3. Phone identity verification (Provider adapter)
4. Phone ↔ registered identity match
5. User enters new password in app
6. Recovery token consumed → Supabase Auth password updated
7. Sign in → existing driver home and delivery data

Supabase recovery email links are **not** the primary path.

## Dev stub provider

- `IDENTITY_PROVIDER=stub` (dev/test only)
- `STUB_IDENTITY_OTP` must be set in `apps/api/.env` (never hardcoded in source)
- Production: `NODE_ENV=production` + `IDENTITY_PROVIDER=stub` → API fail-fast on boot

## Forbidden patterns

- `prep-device-driver-login.mjs` (disabled)
- Random password generation for real users
- Credential JSON files
- ADB password input
- Password/token logging
- Operator-visible passwords

## Test driver fixture

Local interactive seed (no values in source/env):

```powershell
Set-Location apps/api
node scripts/seed-test-driver-identity.mjs
```

Prompts for phone and birth date at runtime. Does not log them.
If `user_identity_profiles` row already exists → **stops without update**.

Optional env: `TEST_DRIVER_USER_ID` (defaults to fixture UUID).

## Dev OTP (local only)

Set in `apps/api/.env`:

```env
IDENTITY_PROVIDER=stub
STUB_IDENTITY_OTP=
```

Never commit, log, or hardcode OTP. Production + stub → API fail-fast.

## E2E verified (2026-08-29, Android device)

Password reset flow end-to-end with **stub provider** (not production SMS):

| Step | Result |
|------|--------|
| 비밀번호 찾기 → identify (name, birth date, phone) | OK |
| 본인인증 시작 | OK |
| OTP 확인 | OK |
| 새 비밀번호 설정 | OK |
| 새 비밀번호로 로그인 | OK |

Additional checks:

- Digits-only birth date / phone UX; client normalize → server match
- Auth user and UUID preserved (no account recreate)
- Fixture / delivery / RLS / access-info unchanged

Real commercial identity/SMS provider integration remains **Phase A+ / production** work.

## Identity input UX (shared)

Principle: user types simple digits; app normalizes; server stores/compares strict canonical forms.

- **Birth date (screen):** 8 digits only (e.g. `19970607`); no on-screen hyphens
- **Phone (screen):** digits only (e.g. `01012345678`)
- **API/DB:** `YYYY-MM-DD`, E.164 phone
- Shared util: `apps/mobile/lib/utils/identity_input_util.dart`
- Server: `normalizeBirthDate` / `normalizeKrPhoneToE164` in account-recovery util

Pasted formats (hyphens, slashes, spaces) are stripped on normalize; invalid calendar dates rejected.

Recovery identify fields should be **empty on first entry**; do not prefill from `user_identity_profiles`.
