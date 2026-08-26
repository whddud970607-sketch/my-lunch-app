# Delivery Shield Mobile (Flutter) — Phase 1D

기사 앱 인증·세션·`GET /v1/me` 연결까지.

## 요구사항

- Flutter SDK: `C:\Users\PANDA230811\develop\flutter`
- `apps/mobile/.env` — **publishable/anon 키만** (service_role 금지)

```bash
copy .env.example .env
# SUPABASE_ANON_KEY에 Dashboard publishable/anon 입력
```

## 실행

```bash
C:\Users\PANDA230811\develop\flutter\bin\flutter.bat pub get
C:\Users\PANDA230811\develop\flutter\bin\flutter.bat run
```

- Android 에뮬레이터 Nest API: `API_BASE_URL=http://10.0.2.2:4000/v1`
- iOS 시뮬레이터: `API_BASE_URL=http://127.0.0.1:4000/v1`

## 보안

- Flutter는 Nest API만 호출 (delivery_* PostgREST 직접 조회 없음)
- access_token / 비밀번호 로그 출력 없음
- 카메라·위치 권한은 매니페스트만 준비, Phase 1D에서 OS 요청 없음
