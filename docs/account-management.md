# 계정 가입과 사용자 관리

2026-10-01 구현. 기존 상품 테이블과 저장 RPC는 변경하지 않습니다.

## 화면과 권한

| 경로 | 사용 대상 | 동작 |
|---|---|---|
| `/` | 공개 | 아이디 또는 기존 이메일과 비밀번호로 로그인, 회원가입 바로가기 |
| `/signup` | 공개 | 아이디·이름·비밀번호로 계정 생성, 항상 승인 대기 |
| `/setup` | 설치 담당자 | Worker의 초기 설정 Secret을 아는 담당자만 `calla-admin` 최초 생성 |
| `/admin` | 관리자 | 사용자 조회·생성·승인·권한·상태 변경·비밀번호 재설정·삭제 |

새 아이디는 대소문자를 구분하지 않으며 영문 소문자·숫자·점·밑줄·하이픈 3–32자입니다. Supabase Auth 내부에서만 사용되는 이메일 형식의 식별자로 변환하여 기존 비밀번호 인증과 세션을 사용합니다. 실제 이메일 수집·이메일 인증·이메일 비밀번호 복구는 요구하지 않습니다. 이름·아이디·권한·승인 상태는 서버만 수정할 수 있는 `app_metadata`에 저장합니다. `user_metadata`나 브라우저 입력의 권한 정보는 승인 근거로 사용하지 않습니다.

## API

| Method / path | 권한 | 계약 |
|---|---|---|
| POST `/api/auth/signup` | 공개 | `{username,name,password}` → `{username}`; 승인 대기 |
| POST `/api/auth/login` | 공개 | `{identifier,password}` → 승인 계정의 `{access_token,refresh_token}` |
| POST `/api/auth/setup` | 초기 설정 코드 | `{setupToken,name,password}` → 고정 아이디 `calla-admin` |
| GET `/api/admin/users?page=1` | 관리자 | `{users,page,hasMore}`; 제한된 페이지 단위 조회 |
| POST `/api/admin/users` | 관리자 | `{username,name,password,role,status}` → `{user}` |
| PUT `/api/admin/users/:id` | 관리자 | `{name,role,status,password?}` → `{user}` |
| DELETE `/api/admin/users/:id` | 관리자 | `{ok:true}`; 사용자 계정만 삭제 |

계정 상태는 `pending`, `active`, `disabled`입니다. 최초 관리자와 자신의 계정은 삭제·정지·강등할 수 없습니다. 최초 관리자에 대한 보호는 모든 관리자에게 적용되며 이름·비밀번호 변경은 허용됩니다. 기존 `ADMIN_EMAILS` 방식은 인증 완료 이메일에만 적용되며 승인 대기·이용 중지 상태를 덮어쓰지 않습니다. 기존 승인 계정에만 상태 누락을 호환합니다.

## 운영 준비

Supabase 기본 공개 가입은 끄고 앱의 Worker 회원가입만 사용합니다. Admin API의 계정 생성은 이 설정과 별개입니다. `SUPABASE_PUBLISHABLE_KEY`와 `SUPABASE_SERVICE_ROLE_KEY`가 모두 필요합니다. `/setup`에는 추가로 24자 이상 무작위 `CALLA_SETUP_TOKEN`이 필요하며 첫 관리자 생성 후 삭제합니다. 공개 API의 요청 제한 바인딩은 `wrangler.jsonc`의 `AUTH_RATE_LIMITER`입니다.

설정은 [README](../README.md)의 순서를 따릅니다. 운영 Auth 계정은 현재 작업에서 생성·수정·삭제하지 않았습니다. 2026-10-01 읽기 전용 조회 결과 Auth 사용자 수는 0명이었습니다.

상품 데이터의 기존 익명 접근 정책 전환은 별도 절차입니다. [기존 접근 정책 전환 기록](backend-contract-audit.md#permission-cutover--reviewed-not-applied)을 함께 확인해야 합니다. 계정 화면의 승인과 Worker 검사는 이미 공개된 직접 DB API 권한을 변경하지 않습니다.

공식 자료: [Supabase 관리자 계정 생성](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [관리자 계정 변경](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid), [Cloudflare 요청 제한](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## 검증

- `npm test`: 56개 통과. 가입 권한 주입 거절, 승인·중지 상태, 관리자 전용 API, 초기 관리자 보호, 비밀값 비노출, 요청 제한, 삭제된 계정 제외, 동시 이름 변경 시 권한 보존을 포함합니다.
- `npm run build`: 타입 검사와 운영 빌드 통과. 기존 대형 번들 경고가 남아 있습니다.
- `npx wrangler deploy --dry-run`: Worker와 정적 자산, Rate Limiting 바인딩 번들 검증 통과. 운영 배포는 실행하지 않았습니다.
- 로컬 브라우저 데모: 로그인 → 가입 페이지 이동, 비밀번호 확인 오류, 아이디 가입 완료, 승인 대기 로그인 거절, 관리자 승인 반영, 조회자 `/admin` 직접 접근 거절을 확인했습니다.
- 390px 화면에서 가입 폼이 세로 스크롤로 표시되고 페이지 가로 넘침이 없음을 확인했습니다.

[관리자 화면 검증 이미지](screenshots/accounts-desktop.jpg)는 로컬 예시 계정이며 운영 계정 목록이 아닙니다.
