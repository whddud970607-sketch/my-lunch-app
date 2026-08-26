# Delivery Shield

유니버셜 송장 스캔, 배송지 핀, 경로 최적화, 통합 배송관리 솔루션.

## Phase 0 상태

- 모노레포 골격(`apps/*`, `packages/shared`)이 추가되었습니다.
- **루트의 My Lunch App(Vite)은 유지**됩니다. GitHub `main` ↔ Vercel 연결을 깨지 않기 위함입니다.
- Supabase 스키마/PostGIS/배포 설정 변경은 아직 하지 않았습니다.

## 저장소 구조

```text
/
├── apps/
│   ├── web/            # Delivery Shield Landing + Login (Vercel 교체 후보)
│   ├── web-company/    # 배송회사 Web 골격
│   ├── web-admin/      # 관리자 Web 골격
│   ├── api/            # NestJS API 골격 (health only)
│   └── mobile/         # Flutter 자리 (SDK로 create 예정)
├── packages/shared/    # 공유 타입 스텁
├── index.html          # (기존) My Lunch App — 교체 전까지 유지
├── src/                # (기존) My Lunch App
└── package.json        # (기존) Vite 루트 — Vercel이 현재 이 경로를 사용 중일 수 있음
```

## 로컬 실행

### 기존 My Lunch App (루트, 현재 Vercel과 동일 계열)

```bash
npm install
npm run dev
```

### Delivery Shield Web (교체 후보)

```bash
cd apps/web
npm install
npm run build
npm run dev
```

### API / Company / Admin 골격

```bash
cd apps/api && npm install && npm run build
cd apps/web-company && npm install && npm run build
cd apps/web-admin && npm install && npm run build
```

## Vercel Root Directory (아직 변경하지 말 것)

현재 Production은 **저장소 루트의 Vite 앱**을 빌드하는 구성으로 보는 것이 안전합니다.

Delivery Shield로 전환하려면 (승인 후):

1. `apps/web`에서 `npm run build` 성공 확인
2. Vercel Project Settings → General → **Root Directory** = `apps/web`
3. Framework Preset = Next.js
4. 필요 시 `NEXT_PUBLIC_SUPABASE_*` 등 env 추가 (값은 대시보드에만)
5. Redeploy로 Production URL 확인
6. 확인 후에만 루트 Vite(My Lunch App) 제거

**Phase 0에서는 Vercel 설정을 변경하지 않았습니다.** Root Directory 변경이 **필요한 구조**입니다 — 새 앱은 `apps/web`에 있으므로 루트 그대로 두면 Delivery Shield Web이 배포되지 않습니다.

## 환경 변수

- 루트 / 각 앱의 `.env.example` 참고
- 시크릿을 코드에 하드코딩하지 마세요

## 다음 Phase (승인 후)

- Phase 1: Supabase Auth / PostGIS / 스키마 (승인 후에만)
- Flutter 앱 create, NestJS 도메인 모듈 등
