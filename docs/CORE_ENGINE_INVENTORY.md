# Delivery Shield — Core Engine Inventory & Foundation Preparation

Status: P0 Foundation CLOSED/PASS. This document inventories engines against the live repository and defines extension boundaries without rewriting P0.

## Classification legend

| Label | Meaning |
|-------|---------|
| EXISTING | Production-usable domain module in repo |
| PARTIAL | Real code/schema stubs; not full product capability |
| MISSING | No durable domain implementation |
| EXTERNAL-INTEGRATION-PENDING | Needs commercial/provider contract before wiring |

---

## A. Existing Engine Inventory

### 1. Reliability & Sync Engine — EXISTING (A)

Evidence:

- `apps/mobile/lib/sync/*` — SQLite queue, statuses, dependency_results, retry classifier
- Wired ops: `POD_UPLOAD`, `DELIVERY_COMPLETE` via `composite_dispatch_setup.dart`
- Nest: `complete_delivery_point_atomic` + `operation_receipts` (migrations 012–014)

Reuse: do **not** create a second sync engine. Register future ops via dispatcher map. Keep **route buffer** separate from the operation queue.

### 2. Identity & Authorization Engine — EXISTING (A) + stub EXTERNAL (B)

Evidence:

- Nest: `auth/`, `identity/` (stub provider + production fail-fast), `account-recovery/`
- Flutter: Supabase Auth, recovery screens
- DB: RLS + roles; migration 010 identity/recovery

NICE real provider: EXTERNAL-INTEGRATION-PENDING. No new auth packages.

### 3. Company Namespace / Source Isolation — EXISTING (A)

Evidence:

- Migrations 015–017 (`delivery_sources`, namespaced tracking)
- Nest TodayWorkset / Workday `bySource` aggregates
- Flutter `shipment_namespace_key.dart`, map filters

### 4. Delivery Evidence / POD Engine — EXISTING (A)

Evidence:

- `delivery_proofs`, Storage `delivery-proofs`, atomic complete RPC
- Flutter POD upload dispatcher + complete screen

Do not duplicate POD.

### 5. Map / Current Location (supporting surface, not a numbered “engine” above) — EXISTING

Kakao/Naver adapters, DriverLocationService, RouteRecorder — keep as-is.

---

## B. Partial Engines

| Engine | Status | Evidence |
|--------|--------|----------|
| Audit / Event | PARTIAL | `data_access_logs`, recovery audits, access-info audit; **no** domain event bus |
| Health & Observability | PARTIAL | `GET /v1/health` liveness only; no DB/queue metrics |
| Geocoding / Address Resolution | PARTIAL | Offline scripts (`kakao-resolve-pin.mjs`, geocode previews); map display coords; **no** Nest `AddressResolver` |
| Route Optimization | PARTIAL | Design notes in `route_recommendation.dart`; legacy `routes` table unused by Nest |
| Building Access Intelligence | PARTIAL | Column `building_entrance_hint` exists; **separate** from `delivery_point_access_secrets` |
| Reliability type registry | PARTIAL | Op types reserved (`DELIVERY_EXCEPTION`, `SCAN_RECORDED`, …) but dispatchers not wired |

---

## C. Missing Engines

| Engine | Status |
|--------|--------|
| Workflow Versioning | MISSING |
| Import & Validation | MISSING (source_type enum only) |
| Exception / Unresolved Delivery | MISSING (`failed` status only; no reason queue) |
| Scanner / Input | MISSING (schema `barcode_raw` placeholder; no Flutter barcode dep) |
| SLA / Priority | MISSING |
| Notification | MISSING |
| Navigation (turn-by-turn) | MISSING (map ≠ navigation) |

---

## D. External Integration Pending

| Integration | Gate |
|-------------|------|
| NICE / real identity provider | Production stub fail-fast already; real adapter later |
| Kakao/Naver Local as Nest AddressResolver | API keys/terms; keep server-side |
| Kakao Mobility / TMAP / Naver routing | Commercial contract before Route Optimization provider |
| TMAP Navigation SDK | Commercial; NavigationEngine interface only until then |
| Hardware scanner vendor SDKs | After Scanner abstraction; no install now |
| FCM / push | After Notification domain model |

---

## E / F. Dependencies

### Installed this gate

**None.** Inventory + type/docs only.

### Recommended when implementing Phase C (Import) — not installed yet

| Need | Candidate | Why | Deferred install |
|------|-----------|-----|------------------|
| CSV streaming (Nest) | `csv-parse` (MIT) | Node Transform streams, maintained, RFC-friendly, no browser focus | Install in Phase C with Import module |
| XLSX (Nest) | `exceljs` (MIT) | Maintained, TypeScript-friendly; avoid SheetJS license ambiguity for commercial | Install in Phase C if Excel commit required |

### Rejected / deferred

| Package | Reason |
|---------|--------|
| PapaParse for Nest | Browser-first; Nest prefers `csv-parse` streams |
| SheetJS Pro / ambiguous CE | License risk; prefer ExcelJS |
| `@nestjs/event-emitter` | In-process EventEmitter / typed domain events enough for monolith |
| Kafka / RabbitMQ | Out of scope; modular monolith |
| `@nestjs/terminus` | Optional later; health interface first |
| `mobile_scanner` / barcode_* | Scanner Phase E; interface first |
| Firebase / FCM | Notification Phase K |
| Routing SDKs on device | Keys stay server-side |

---

## G. Engine Dependency Graph (acyclic)

```
ImportParser → Validate → AddressResolver(opt) → ImportCommit → Delivery Domain (jobs/points/shipments)
Scanner → IdentifierResolver → Shipment (source-namespaced)
Exception → Point/Workday (non-blocking) → Notification(opt)
SLA → RouteOptimization (signal only)
BuildingIntelligence → Driver UX / Route hints  (≠ Access Secret)
RouteOptimization → RoutePlan → Navigation(current stop only)
Domain Actions → AuditLog
Mutable field ops → Reliability Queue → Nest + Receipts
Map (Today) ⟂  independent of Workday lifecycle ownership
```

Circular dependency forbidden. Scanner is **not** a Source.

---

## H–T. Architecture sketches (foundation)

### H. Import & Validation

Pipeline (no immediate `delivery_points` INSERT):

`Input → Parse → Normalize → Validate → Resolve → Preview → Commit`

Draft models (TypeScript interfaces in `apps/api/src/import/`):

- `ImportBatch`, `ImportRow`, `ValidationIssue`, `NormalizedDeliveryDraft`

Commit is a separate explicit step. Target: 200–300 rows comfortable; ~1000 reasonable with streaming CSV.

### I. CSV strategy

Phase C: Nest `csv-parse` streaming Transform; never load entire file as one string for large batches.

### J. XLSX strategy

Phase C: ExcelJS worksheet → row iterator; convert to same `ImportRow` stream as CSV. Prefer converting XLSX → normalized rows early (one validator).

### K. Exception architecture (PLAN only — no migration)

States: `OPEN | DEFERRED | RESOLVED | CANCELLED`  
Reasons: extensible codes (`CUSTOMER_UNAVAILABLE`, `ACCESS_FAILED`, …) — not closed forever.  
Does **not** block Workday. Sync type `DELIVERY_EXCEPTION` already reserved.

### L. Scanner abstraction (PLAN / interface later)

`ScanInput → ScannerAdapter → IdentifierResolver → ScanResult`  
Adapters: Camera / HID / BLE / Manual. Vendor SDK behind adapter. No package now.

### M. Address Resolution

`AddressResolver` Nest port; Kakao/Naver adapters. Separate from MapProviderId. Scripts remain offline helpers until Nest adapter exists.

### N. Route Optimization

`RouteOptimizer` port → `RoutePlan` / stop order / reasons. Inputs include SLA signals later. ≠ Navigation. No SDK now.

### O. SLA

Domain status (`NORMAL|ATTENTION|AT_RISK|LATE`) mapped to UI separately. No color-as-truth.

### P. Building Intelligence boundary

Non-sensitive building knowledge vs Access Secret ciphertext. Never promote company A secrets into cross-company intelligence.

### Q. Navigation boundary

`NavigationEngine` opens external navi for **current stop** only. Main map owns workset overview.

### R. Notification

Domain notification intents → local/in-app first; push provider later. Driven by domain events, not FCM-centric.

### S. Observability

Extend health gradually: liveness → readiness (DB) → queue backlog metrics. No PII/GPS/secrets in metrics. No Datadog install this gate.

### T. Evidence / POD reuse

Extend existing proofs later (photo, method, exception link). GPS retention policy undecided — do not permanently store GPS in evidence by default.

---

## U. Required future DB migrations (PLAN — do not apply in this gate)

| Migration theme | When |
|-----------------|------|
| `import_batches` / `import_rows` / validation issues | Phase C |
| Exception / unresolved queue tables | Phase D |
| Workflow definition/version/pin on job | After design approval |
| Building intelligence tables | Phase H |
| Access secret `driver_id` sync on point reassignment | Security release gate |
| SLA columns (`due_at`, priority) | Phase G |

---

## V. Security impact

- New engines must use JWT + RLS + app-layer ownership patterns already established.
- Import commit: service_role only with driver/company scope checks.
- Access Secret remains Nest-only decrypt + audit.
- Do not bypass remaining release gates (below).

---

## W. Performance

- Import: stream CSV; bound memory; preview cap before commit.
- Sync queue already smoke-tested at 300/1000 ops.
- Route optimize / geocode: batch and cache provider results; never N+1 per pin from Flutter.

---

## Z. Remaining release gates (unchanged)

1. Postgres-backed Recovery Rate Limit — **before NICE production**
2. Live RLS Smoke
3. Access Secret driver reassignment sync
4. Route Buffer Encryption implementation
5. B3 Flag ON staging/device E2E

New engine work must not skip these.

---

## AA. Recommended implementation order

1. **Phase C — Import & Validation** (highest leverage; source_type already anticipates csv/excel)
2. **Phase D — Exception / Unresolved**
3. **Phase E — Scanner / Loading Verification** (uses queue `SCAN_RECORDED`)
4. **Phase F — Address Resolution + Route Optimization foundation**
5. **Phase G — SLA / Priority**
6. **Phase H — Building Intelligence**
7. **Phase I — Navigation**
8. **Phase J — Evidence/POD enhancement**
9. **Phase K — Notification / Driver Cockpit**

Rationale: Import creates durable multi-company volume; Exception unblocks incomplete days; Scanner plugs existing shipment scan columns; geocode/route need provider contracts.

---

## AC. Git

No commit / no push for this preparation gate.
