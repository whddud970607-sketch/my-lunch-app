# Delivery Shield — Dev Checkpoint

**Saved:** 2026-08-28 (KST)  
**Purpose:** Resume next session without secrets. No keys/tokens/passwords in this file.  
**Git:** No commit/push was made for this checkpoint.

---

## Completed features (code + DB where noted)

- Multi-map (Kakao/Naver) delivery map spike flow (existing baseline)
- Pin visual status: open (red) / completed (gray)
- Detail panel layout: customer/address/access/goods/contact/navigate-complete
- `delivery_shipments` 1:N under points (migration + API + Flutter list)
- Namdong10 fixture list API expanded to also return Seoul parc1 fixture keys
- Nest `GET /v1/delivery/points/:pointId/access-info` (AES-256-GCM decrypt, driver/active-job/incomplete checks, `read_access_info` audit)
- Flutter 「출입정보 보기」 wired to Nest (30s auto-remask; no secret debugPrint)
- Camera: initial focus uses **namdong cluster only** (not Incheon+Seoul fit); list tap can focus a point (`focusPointId`)
- Seoul fixture **seeded** (see Fixture status) — not rolled back

---

## Major changed files (local, uncommitted)

### API (`apps/api`)
- `src/access/access-info-crypto.service.ts` (+ unit spec)
- `src/access/access-secrets.repository.ts`
- `src/deliveries/deliveries.controller.ts` (shipments, hasAccessInfo, access-info GET, fixtureGroup, deliveryMemo)
- `src/deliveries/deliveries.repository.ts` (fixture OR filter, tracking key, delivery_memo)
- `src/deliveries/deliveries.module.ts`
- `src/deliveries/location.util.ts` (`fixtureGroupFromKey`)
- `scripts/seed-seoul-parc1.mjs` (safe summary logs only)
- `scripts/kakao-resolve-pin.mjs` (existing helper used by seed)
- `scripts/fixtures/seoul-parc1-geocode-preview.json`
- `.env.example` — `ACCESS_INFO_KEY=` placeholder only

### Mobile (`apps/mobile`)
- `lib/models/map_spike_point.dart` (shipments, hasAccessInfo, fixtureGroup, deliveryMemo)
- `lib/models/delivery_shipment.dart`
- `lib/services/map_spike_service.dart` (`fetchAccessInfo`)
- `lib/widgets/delivery_detail_panel.dart` (shipments + access reveal + contact)
- `lib/screens/map_spike_screen.dart` (namdong camera, focusPointId, reveal callback)
- `lib/screens/home_screen.dart` (list → map focus; summary label)
- `lib/map/delivery_map_controller.dart` (`moveCamera`)
- `lib/map/kakao_delivery_map.dart` / `naver_delivery_map.dart` (initialTarget camera; moveCamera)
- Related pin/status files from earlier session (quantity pin, visual status)

### Supabase
- `supabase/migrations/009_delivery_shipments.sql` (**applied**)

---

## DB migration status

| Migration | Status |
|-----------|--------|
| 001–008 (prior) | Applied (existing project) |
| **009_delivery_shipments** | **Applied** |
| New migrations for access-info | **None required** (env key + existing `delivery_point_access_secrets`) |

---

## Fixture status

### Namdong10 (`fixture:namdong10-sim:01` … `:10`)
- Points: **10** (unchanged; no delete/modify in last session)
- Quantity sum: **25**
- Shipments: **25** (virtual `CP-TEST-NN-##`)
- Contact: mostly none / fixture style
- Access secrets: none expected for namdong

### Seoul Parc1 (`fixture:seoul-parc1-sim:01`)
- Seed: **executed successfully** (same active job as namdong; namdong count stayed 10)
- Points: **1**
- Quantity: **1**
- Shipment: **1** (`CP-TEST-SEOUL-01-01`)
- Contact: `virtual_number` (test channel; value not logged here)
- Access secret: **1** row, ciphertext present, `key_version=1`, not purged
- Geocode: Kakao Local for 여의대로 108 (coords from geocode preview; not inventing)

### Combined totals (DB at checkpoint)
- Points: **11**
- Quantity: **26**
- Shipments: **26**

### Legacy spike
- `phase1-map-spike-kakao` kept (not deleted)

---

## access-info implementation status

| Item | Status |
|------|--------|
| AES-256-GCM service | Implemented |
| Env `ACCESS_INFO_KEY` (dev, local `.env`) | Present & valid format (hex64) — **value not recorded** |
| Prod / Vercel secrets | **Not done** (explicitly deferred) |
| Nest GET access-info | Implemented in controller |
| Audit `read_access_info` | Implemented (user JWT insert) |
| List API `hasAccessInfo` boolean only | Implemented |
| Flutter reveal UI | Implemented in code |
| Complete → 403 + PII mask + gray pin | Code paths exist; **on-device not verified this evening** |
| Multi-key rotation | Deferred (approved design: later) |

---

## Flutter implementation status

| Item | Status |
|------|--------|
| Shipments in detail | Code done |
| Access reveal + 30s remask | Code done |
| Contact dial/SMS (OS UI only) | Code done |
| Namdong-centered initial camera | Code done |
| List → focus Seoul pin | Code done (`focusPointId`) |
| Debug APK build | **Succeeded** (`app-debug.apk`) this session |
| Install / UI Automator / Kakao+Naver E2E | **Not completed** (stopped per request) |

---

## Last build / test results

- `apps/api` `npm run build` — **OK**
- `access-info-crypto.service.spec.ts` — **2 passed**
- Nest health after restart — **200** (process may still be running locally; do not kill/reset for cleanup)
- Flutter `build apk --debug` — **OK**
- On-device install/verify of Seoul+access-info — **not run to completion**

---

## Not yet verified on device

- Home shows 11 / qty 26
- Map shows Seoul pin + namdong pins; initial camera stays namdong-scale
- List select 김정애 → camera to Seoul; detail fields (name/address/detail/memo/product/qty/shipment/contact/access)
- 「출입정보 보기」 decrypt + audit row (do not log plaintext)
- Dial/SMS open OS screens only (no auto-send)
- Kakao **and** Naver same point
- Complete Seoul (or a test point) → PII blind, access-info **403**, pin gray immediately
- Kakao PlatformView black-screen on resume (known earlier issue; still open)

---

## Next session start point

1. Confirm API up (`/v1/health`) + `adb reverse tcp:4000` + device `R5KL3049JZN`
2. Install latest debug APK (already built under `apps/mobile/build/app/outputs/flutter-apk/`) **or** rebuild if sources changed
3. Run on-device checklist above (Kakao then Naver)
4. Optionally confirm `data_access_logs` got `read_access_info` after reveal (no secret in logs)
5. Do **not** create prod keys / Vercel secrets until separately approved

---

## Awaiting approval

- Multi-key / rotation loader
- Prod ACCESS_INFO_KEY / Secret Manager / Vercel
- Nest access-info decrypt endpoint hardening beyond current minimal (if any)
- “전체 배송 보기” full fit camera (designed as future separate feature)
- Access-info ciphertext re-encrypt migration tooling
- Any **new** schema migration (none pending for current scope)

---

## Known bugs / issues

- Kakao map PlatformView may black-screen after app background→foreground (reopen map to recover)
- Flutter Naver plugin still applies Kotlin Gradle Plugin (Flutter future warning)
- Gallery / complete-photo automation was flaky earlier (manual path exists)
- Some namdong points may already be `completed` from prior testing (affects count of pending vs completed on home)
- Agent must not auto-append `ACCESS_INFO_KEY` to `.env` (human-managed)

---

## Security reminders for resume

- Never print `ACCESS_INFO_KEY`, service_role, API keys, tokens, door codes, or raw phone
- `.env` is gitignored (`apps/api/.gitignore` + root `.env` rules); not tracked
- No DB wipe/rollback of fixtures
- Flutter must not query `delivery_point_access_secrets` directly

---

## Stopped intentionally (2026-08-28 evening)

No further feature work, migrations, seeds, deletes, or device tests after this checkpoint.

---

## Auth Phase A — Password recovery E2E (2026-08-29)

**Status:** Passed on physical Android device (`R5KL3049JZN`) with debug APK + `adb reverse tcp:4000`.

### Verified flow

1. Login → **비밀번호 찾기**
2. Name / birth date (8 digits only on screen) / phone (digits only on screen)
3. Identity verification start (stub provider)
4. OTP confirm
5. New password set
6. Sign in with new password → **login success**

### Also confirmed

- Client-side normalize before API; identity profile match OK
- Existing Supabase Auth user retained (no delete/recreate)
- Existing user UUID unchanged
- Delivery / RLS / access-info / fixture data untouched

### Identity input UX (recovery)

- Birth date and phone: **digits-only on screen**; app normalizes internally before API
- No hyphen auto-format on display
- Server re-validates/normalizes defensively

### Provider scope

- **Stub identity provider only** (`IDENTITY_PROVIDER=stub` + local OTP env)
- Real SMS / commercial phone identity provider **not** integrated yet

### Device prep recipe (no secrets)

1. `flutter build apk --debug`
2. `adb install -r app-debug.apk` (no `pm clear` / no uninstall)
3. `adb reverse tcp:4000 tcp:4000`
4. Nest API running; `GET /v1/health` → 200
5. Test driver identity row seeded locally via interactive script (values not stored in repo)

### Not logged here

Phone numbers, birth dates, OTP, passwords, tokens, or API secrets.

### Open UX note (observed, not fixed)

Recovery identify fields may show prior in-session values when returning from OTP step, or OS keyboard suggestions — see analysis in session notes; fresh screen entry should start empty by design except hint/keyboard layer.

---

## Delivery Session Phase B (2026-08-29)

**Status:** Implemented (additive migration 011 applied). Device E2E pending manual test.

### Added

- `delivery_sessions` + `delivery_route_points` (RLS own-driver only)
- Nest `/v1/delivery/sessions/*` (start/active/end/finalize/batch/report)
- Flutter `DeliverySessionController` + `DeliveryRouteRecorder` (app-scoped, not MapSpikeScreen)
- Home: 오늘 배송 시작 / 배송 중 / 배송 종료 / report screen
- Sampling: 25m OR 15s + noise/accuracy/jump filters (config in one place)
- Local buffer: app sandbox, ACK delete, no SharedPreferences GPS
- Kakao: trail-marker approximation (SDK has no polyline); Naver: `NPolylineOverlay`

### Retention (product default, not legal final)

- Route points 30d / session metadata 90d purge helpers (service_role)
- Production TODO: consent, privacy policy, law review, encryption-at-rest

### Not done

- Background location / TMAP
- Company-admin full route access
- Device E2E of start→route→end→report (manual)

---

## Progress Snapshot — 2026-08-31 (KST)

**Saved:** 2026-08-31 evening  
**Purpose:** End-of-day checkpoint — progress, next start point, local backup anchor.  
**Git:** Local commit + tag only. **No push.**  
**Secrets:** No keys/tokens/credentials in this file.

### A. Foundation

| Item | Status |
|------|--------|
| P0 Foundation | **CLOSED / PASS** |
| B3 Workday-first architecture | **PASS** |
| Reliability / Sync | Foundation in place |
| Identity / Authorization | Foundation in place |
| Company / Source isolation | Foundation in place |
| POD foundation | Foundation in place |

### B. Import

| Phase | Status |
|-------|--------|
| C1 Import Parser / Normalizer | **PASS** |
| C2 Import Validation Engine | **PASS** |
| C3 Import Persistence / Privacy / Idempotency | **NEXT IMPLEMENTATION PHASE / NOT_STARTED** |

**Note:** Core Completion Gate order — **Building / Dong Coordinate Resolution (#1) is current priority** before C3.

### C. Kakao Map / Navigation

| Item | Status |
|------|--------|
| KAKAO_MAIN_MAP | **PASS** |
| KAKAO_IN_APP_NAVIGATION | **PASS** |
| KAKAO_NAVIGATION_REAL_DEVICE | **PASS** |
| DELIVERY_MARKER_ATTACH_10 | **PASS** |
| DELIVERY_MARKER_RENDER | **PASS** |
| DELIVERY_MARKER_CLICK | **PASS** (real-device; not downgraded by automated tap miss) |
| DELIVERY_INFO_CARD | **PASS** |
| NAVIGATION_GUIDANCE_COEXISTENCE | **PASS** |
| WHITE_MAP_REGRESSION | **RESOLVED** |
| GL_SURFACE_NPE | **RESOLVED** |
| ACTION_PANEL_CURRENT_AUTOMATED_RUN | **NOT_VERIFIED** |

### D. Address / Building Resolution

| Item | Status |
|------|--------|
| Address Engine architecture | **CONDITIONAL PASS** |
| Building / Dong resolution (real) | **NOT COMPLETE** |

**609 PUBLIC benchmark** (no PII): 인천 남동구 서창남순환로 190-100, 에코에비뉴 609동

| Item | Status |
|------|--------|
| KAKAO_609_PLACE_EVIDENCE | **PASS** — Kakao PUBLIC query confirmed `에코에비뉴아파트 609동` |
| BUILDING_IDENTITY_VERIFIED | **NOT_YET** |
| BUILDING_GEOMETRY_VERIFIED | **NOT_YET** |
| BUILDING_ENTRANCE_VERIFIED | **NOT_YET** |

**Reference coords (Kakao place, not verified 609 building geometry):** lat 37.423283, lng 126.741867

Do **not** treat complex representative coords as accurate 609-dong building pin.

### E. VWorld / Building Hub

| Item | Status |
|------|--------|
| `research-vworld-building-609.mjs` | Created (safe research script) |
| `research-building-register-609.mjs` | Created |
| VWorld live | **PENDING CREDENTIAL** |
| 건축HUB live | **PENDING CREDENTIAL** |

**Target sequence:** 건축HUB → 609동 building identity → VWorld → matching geometry → BUILDING_CENTER

### F. NAVER Track (provider parity — not Kakao fallback)

NAVER is an **equal Provider Track** with Kakao.

| Item | Status |
|------|--------|
| NAVER Directions 5 | **SUPPORTED** (official docs) |
| NAVER Directions 15 | **SUPPORTED** (official docs; max 15 waypoints) |
| NAVER Directions live | **NOT_CONFIGURED** |
| NAVER Geocoding live | **NOT_CONFIGURED** |
| NAVER Reverse Geocoding live | **NOT_CONFIGURED** |
| NAVER Public In-App TBT SDK | **NOT_FOUND** |
| NAVER Public Maps Native TBT Engine | **NOT_FOUND** |
| Kakao KNNaviView public equivalent | **NOT_FOUND** |
| NAVER External App Navigation (`nmap://navigation`) | **FOUND** |
| MapType.Navi / NaviHybrid | **SUPPORTED** (map rendering only, not TBT) |
| DELIVERY_SHIELD_NAVER_ROUTE_MAP | **FEASIBLE** |
| PUBLIC_CLOUD_TBT_RESEARCH | **CLOSED** |
| NAVERMAPS_GITHUB_PUBLIC_TBT_RESEARCH | **CLOSED** |
| NAVER_B2B_ENTERPRISE_TBT | **UNKNOWN** → next: **B2B_ENTERPRISE_INQUIRY** |

**Do not repeat** same public TBT site searches next session.

**Directions endpoints (no credentials):**
- D5: `https://maps.apigw.ntruss.com/map-direction/v1/driving`
- D15: `https://maps.apigw.ntruss.com/map-direction-15/v1/driving`

### G. NAVER Next Live Test (when credential ready)

1. Geocoding v2 live  
2. Reverse Geocoding live  
3. PUBLIC 609 test + Kakao/NAVER comparison  
4. Directions 5 live  
5. Directions 15 live + waypoint boundary (0/5/6/10/15/16)

Scripts: `research-naver-609-real.mjs`, `research-naver-directions-609.mjs`

### H. Core Completion Gate (unchanged order)

1. **Building / Dong Coordinate Resolution** ← **CURRENT ACTIVE**
2. Exception Engine  
3. Import C3/C4  
4. Offline Delivery/POD E2E  
5. Route Optimization Engine  
6. Delivery Window + ETA + SLA  
7. Dynamic Route Replanning  
8. Arrival Detection  
9. Scanner/OCR  
10. Building Access Intelligence  
11. Notification Engine  
12. Admin real-time control tower  
13. Operations reporting/analytics  

### I. Architecture Principles (preserve)

- Provider-neutral Core; no direct Kakao/NAVER types in core  
- Adapters: Kakao, NAVER, Building HUB, VWorld (acquisition layer)  
- Geocoder coordinate **≠** accurate delivery pin  
- Accuracy hierarchy: COMPLEX_REPRESENTATIVE → BUILDING_IDENTITY_VERIFIED → BUILDING_GEOMETRY_VERIFIED → BUILDING_CENTER → BUILDING_ENTRANCE → VEHICLE_ACCESS_POINT  
- **RouteProvider** (Kakao / NAVER Directions) and **NavigationProvider** (Kakao Mobility / NAVER external or B2B) **separate ports**

### Next session start point

**Building / Dong Coordinate Resolution**

1. Add NAVER Maps credentials to `apps/api/.env` (local only; never commit)  
2. NAVER 609 live geocode/reverse evidence  
3. 건축HUB 609 identity (`DATA_GO_KR_SERVICE_KEY`)  
4. VWorld 609 geometry (`VWORLD_API_KEY`)  
5. Kakao / NAVER / public-data fusion  

### Stopped intentionally (2026-08-31)

No further feature work, API live calls, migrations APPLY, or device tests after this checkpoint + local backup.

---

## Progress Snapshot — 2026-09-01 (KST)

**Saved:** 2026-09-01 evening  
**Purpose:** End-of-day checkpoint — PUBLIC 609 provider research (NAVER / 건축HUB / VWorld prep). Local commit + tag + physical backup. **No push.**  
**Secrets:** No keys/tokens/credentials in this file. `.env` never committed.

### A. PUBLIC 609 benchmark (no PII)

| Field | Value |
|-------|--------|
| Region | 인천광역시 남동구 |
| Jibun | 서창동 695 |
| Road | 서창남순환로 190-100 |
| Complex | 에코에비뉴 |
| Dong | 609동 |

### B. Kakao 609 (prior evidence — unchanged)

| Item | Status |
|------|--------|
| KAKAO_609_PLACE_EVIDENCE | **PASS** — query `에코에비뉴 609동` → `에코에비뉴아파트 609동` |
| KAKAO_609_CLASSIFICATION | **BUILDING_CANDIDATE** (place evidence; not geometry verified) |
| Reference coords | lat 37.423283, lng 126.741867 |

### C. NAVER 609 LIVE (research-only)

| Item | Status |
|------|--------|
| NAVER_AUTH | **PASS** (after research script host fix to `maps.apigw.ntruss.com`) |
| Initial blocker | HTTP 401 on legacy `naveropenapi.apigw.ntruss.com` → **NOT_VERIFIED_AUTH_BLOCKED** (not address quality failure) |
| NAVER_GEOCODING_LIVE | **PASS** (HTTP 200 / status OK) |
| NAVER_REVERSE_GEOCODING_LIVE | **PASS** (1 call on first valid coordinate) |

**Forward geocoding (approved 4 queries):**

| Query | RESULT_COUNT | Classification |
|-------|--------------|----------------|
| A road-only (`서창남순환로 190-100`) | 1 | **COMPLEX_REPRESENTATIVE** — `BUILDING_NAME` = 에코 에비뉴 |
| B complex (`에코에비뉴`) | 0 | **NO_RESULT** |
| C complex+dong (`에코에비뉴 609동`) | 0 | **NO_RESULT** |
| D road+dong (`서창남순환로 190-100 609동`) | 1 | **COMPLEX_REPRESENTATIVE** — same as A; 609동 ignored |

| Item | Status |
|------|--------|
| EXACT_609_STRUCTURED_FORWARD_EVIDENCE | **NO** |
| EXACT_609_TEXT_FORWARD_EVIDENCE | **NO** |
| NAVER_EXACT_DONG_CAPABILITY | **COMPLEX_ONLY** |
| Kakao vs NAVER complex-rep distance | ~111 m (not accuracy evidence) |

**Verdict:** NAVER confirms **complex representative** level only. **No exact 609-dong evidence** from NAVER Geocoding/Reverse. Do **not** promote coordinate return to pin verified.

**Research script change (today):** `research-naver-609-real.mjs` — host `maps.apigw.ntruss.com`; approved PUBLIC query strings for B/C. Production `naver-geocode.adapter.ts` still on legacy host — **not changed** (separate approval).

### D. BuildingHUB 609 Identity (research-only)

| Item | Status |
|------|--------|
| BUILDING_HUB_AUTH | **PASS** |
| BUILDING_HUB_LIVE | **PASS** |
| RESULT_CODE | **00** |
| KEY_TRANSPORT | **DECODE_ONCE** (`decodeURIComponent` once before `URLSearchParams`; `.env` stores encoding form) |
| EXACT_609_REGISTER_OBJECT_FOUND | **YES** |
| DONG_NM | **609동** |
| BLD_NM | **에코 에비뉴** |
| PLAT_PLC | 인천광역시 남동구 서창동 695번지 |
| NEW_PLAT_PLC | 인천광역시 남동구 서창남순환로 190-100 (서창동) |
| DONG_MATCH | **YES** |
| COMPLEX_MATCH | **YES** |
| ADDRESS_MATCH | **YES** |
| DISTINCT_DONG_COUNT (parcel) | **19** (609 is individual register object, not complex-only label) |
| BUILDING_IDENTITY_VERIFIED | **YES** |

**Parcel context (Kakao-derived seed, not identity evidence):** sigunguCd 28200, bjdongCd 10500, platGbCd 0, bun 0695, ji 0000

**Not logged:** `mgmBldrgstPk` values (presence only: YES)

### E. VWorld (prep + official doc research)

| Item | Status |
|------|--------|
| VWORLD_API_KEY | **CONFIGURED** (local `.env` only) |
| VWORLD_DOMAIN | **NOT_CONFIGURED** in `.env` |
| Operating key application | **NOT requested** (development key only) |
| VWorld GetCapabilities LIVE (domain-safe gate) | **NOT_RUN** — blocked when `VWORLD_DOMAIN` missing; no `localhost` fallback |
| VWorld DescribeFeatureType LIVE | **NOT_RUN** |
| VWorld GetFeature / 609 geometry | **NOT_RUN** |

**Official vworld.kr public documentation (no live API this step):**

| Topic | Finding |
|-------|---------|
| WFS `key` param | **발급받은 api key** / **인증키** |
| WFS `domain` param | **O/1 optional** — “API KEY를 발급받을때 입력했던 URL”; required for non-webviewer browser use per guide |
| `INCORRECT_KEY` | Mismatch with domain registered at key issuance |
| 개발키 vs 운영키 | **UNKNOWN** in public API reference (login-gated issuance UI) |
| `localhost` arbitrary default | **NOT supported** by official docs — do not assume |
| WFS GetCapabilities | **Listed** in official WFS request ops |
| DescribeFeatureType | **Not listed** in official WFS request table (UNKNOWN support from docs alone) |

**Prior exploratory live call note:** One schema probe succeeded with implicit `localhost` before domain-safety rule was enforced — **not** adopted as configuration policy.

### F. Geometry / Pin trust (strict — do not upgrade)

| Item | Status |
|------|--------|
| BUILDING_GEOMETRY_VERIFIED | **NO** |
| BUILDING_CENTER_VERIFIED | **NO** |
| PIN_VERIFIED | **NO** |
| REAL_609_PIN_READY | **NO** |

### G. Credential inventory (presence only — no values)

| Variable | Status |
|----------|--------|
| KAKAO_REST_API_KEY | CONFIGURED |
| NAVER_MAP_CLIENT_ID / SECRET | CONFIGURED |
| DATA_GO_KR_SERVICE_KEY | CONFIGURED |
| VWORLD_API_KEY | CONFIGURED |
| VWORLD_DOMAIN | NOT_CONFIGURED |

### H. Core Completion Gate (unchanged order)

1. **Building / Dong Coordinate Resolution** ← **CURRENT ACTIVE** (identity partial; geometry pending)
2. Exception Engine  
3. Import C3/C4  
4. Offline Delivery/POD E2E  
5. Route Optimization Engine  
6. Delivery Window + ETA + SLA  
7. Dynamic Route Replanning  
8. Arrival Detection  
9. Scanner/OCR  
10. Building Access Intelligence  
11. Notification Engine  
12. Admin real-time control tower  
13. Operations reporting/analytics  

### I. Next session start point

**VWorld 609 Geometry Gate (after console verification)**

1. VWorld 콘솔 → 인증키 관리: 서비스유형(APP), 등록 URL/domain, 키 유형(개발) 확인  
2. Set `VWORLD_DOMAIN` in local `.env` to **match console registration** (no arbitrary `localhost`)  
3. Official WFS schema gate: GetCapabilities + DescribeFeatureType (if applicable)  
4. Attribute-based GetFeature for 609동 (`buld_nm_dc` + `buld_nm`) — **no proximity/nearest-polygon guess**  
5. After polygon evidence: representative point comparison (centroid vs point-on-surface)  
6. Fuse verified delivery coordinate as navigation single source of truth (future gate; not production yet)

**Also pending (not started):**

- Production `naver-geocode.adapter.ts` host update (separate approval after NAVER live evidence)  
- 건축HUB `research-building-register-609.mjs` DECODE_ONCE transport in script (if reused for filesystem runs)  
- NAVER Directions 5/15 live (out of scope today)

### J. Files touched today (research only)

| File | Change |
|------|--------|
| `apps/api/scripts/research-naver-609-real.mjs` | Host fix + approved B/C query strings |
| `docs/DEV_CHECKPOINT.md` | This snapshot |

**Not changed:** production adapters, Flutter, Nest, DB, navigation, AddressCanonicalizationService.

### Stopped intentionally (2026-09-01)

No production wiring, no new live API calls, no operating-key application, no geometry/pin promotion after this checkpoint + backup.
