# CALLA 0.6.4 운영 배포 검증

2026-10-19 14:40 KST · 사용자의 운영 DB·웹·데스크톱 업데이트 승인에 따라 완료.

후속 사용자 확인에서 등록 성공 목록의 대기 표시 오류를 발견해 0.6.5로 수정 배포했다. 현재 상태와 원인은 [0.6.5 검증 보고서](list-completion-065-verification.md)를 참조한다. 아래는 0.6.4 당시 검증 기록이다.

## 배포 결과

- 운영 웹: [cauto.yeseo.im](https://cauto.yeseo.im/)
- Worker 버전: `67d4a286-c6f1-43d5-8a47-b857408b1e6e` (tag `0.6.4`)
- 배포 직전 Worker: `94adb03c-62e0-4848-a48e-2e9c0b773a6b`. 10월 16일 기본 이미지 저장 방식 변경도 현재 소스에 유지됨을 확인했다.
- DB: `giuqapykceosroauaijq` / `product-registration-tool`, 운영 마이그레이션 `20261019053314_product_list_summaries` 성공.
- 설치 앱: `/Users/callam4/Applications/CALLA.app`, version/build `0.6.4`, arm64. 실행 후 기존 관리자 로그인 세션과 저장 데이터를 확인했다.
- 배포 ZIP: `release/CALLA-0.6.4-mac-arm64.zip` (129,618,516 bytes).
- 이전 앱 백업: `release/previous/CALLA-0.6.3-before-review-064.app`.

검증된 리뷰 변경을 그대로 배포했다. 릴리스 준비의 추가 소스 변경은 `package.json`·`package-lock.json`의 버전 값뿐이다. Product-Share-Tool 참조 근거는 [기존 참조 보고서](review-0.6.3/github-reference.md)에 있다.

## 운영 DB 검증

마이그레이션을 Worker보다 먼저 적용했다. 테이블 데이터 변경 없이 목록 집계 함수와 실행 권한을 추가했다. 적용 전 목록 11개·상품 150개·등록 이력 94개를 확인했다.

- 함수 속성·권한 13개 검사 모두 통과: `security invoker`, `stable`, 빈 `search_path`, scalar JSONB, PUBLIC/anon/authenticated 실행 차단, service_role 실행 가능, 원본 테이블 RLS 유지.
- service_role로 같은 읽기 전용 스냅샷에서 기존 집계 규칙과 RPC 결과 비교: 목록 11/11, 누락·추가·중복·값 불일치·메타데이터 불일치·정렬 위반 모두 0, `all_equal=true`.
- 원본 파일 `20261019000000_product_list_summaries.sql`과 MCP가 부여한 운영 이력 `20261019053314`는 같은 SQL이다. 원본 리뷰 패치 보존을 위해 로컬 파일명은 유지했다. 향후 CLI `db push/pull` 전에는 이 대응을 기준으로 이력을 정리하고 같은 SQL을 다시 적용하지 않아야 한다.

근거: [DB 검증 결과](../test-results/release-064/database-verification.json), [권한 검사 SQL](../test-results/release-064/list-summary-preflight.sql), [동등성 검사 SQL](../test-results/release-064/list-summary-parity.sql).

## 웹·보안 설정 검증

`wrangler deploy --keep-vars`로 기존 운영 설정을 보존했다. 신규 `CALLA_SIGNUP_CODE`는 암호학적 난수로 생성해 Worker `secret_text`로 추가했다. 값은 소스·패키지·로그에 기록하지 않았다. 관리자용 로컬 파일은 `/Users/callam4/.config/calla-automate/signup-code.txt`이며 사용자 읽기/쓰기 권한(0600)으로 보관한다.

| 검증 | 결과 |
|---|---|
| 운영 루트·`/api/config` | HTTP 200 |
| 배포 HTML 및 JS/CSS 5개 | 로컬 dist와 SHA-256 일치 |
| 무인증 `/api/lists` | 401 `authentication_required` |
| 가입 코드 누락·오류 | 403 `invalid_signup_code` |
| 올바른 코드·빈 아이디 | 422 `invalid_username`, 계정 생성 없음 |
| 공개 설정 필드 | Supabase URL·publishable key만 반환 |
| 가입 코드 노출 검사 | HTML·설정·JS/CSS·검증 응답에 없음 |
| 브라우저 콘솔 | 관찰된 error 0개 |

근거: [HTTP·자산 검증](../test-results/release-064/http-verification.json), [배포 로그](../test-results/release-064/deploy.log), [Secret 이름 목록](../test-results/release-064/secret-binding-names.json).

## 실제 화면·앱 검증

- 웹에서 기존 계정 로그인 성공 후 배포 새로고침에도 세션 유지. 새 집계 API로 목록 11개 표시.
- 웹·설치 앱에서 기존 `261012-록스톤 신제품` 6개 상품, 저장됨 상태, 소매·도매 등록완료 링크 12개 보존 확인.
- 웹 뒤로/앞으로 이동 후 목록·상세 화면 복원 확인. 상품 편집은 열고 취소했으며 저장하지 않았다.
- 상세 미리보기의 `sandbox=""`와 공통 CSP(`font-src https: data:` 포함) 확인. 실제 이미지 로드 성공(950×4900).
- 새 설치 앱에서 소매·도매몰 실제 상품 조회와 `AV STEREO` 검색 성공. 두 몰의 연결 상태가 이번 조회 시각으로 갱신됐다.
- 설치본·빌드본·ZIP 추출본 app.asar SHA-256 일치: `1d93bafd342ddcb1dfbde2de6cde7257b82949d9d626508df12c9efbe159d1b7`.
- 설치본·빌드본·추출본의 `codesign --verify --deep --strict` 통과. ZIP 전체 CRC 통과. ZIP SHA-256: `756ed78b22afe5dd83832c8beda518fd5391cfc407023c689bc53b10e3356d21`.

근거: [설치 결과](../test-results/release-064/installed-after.json), [패키지 검증](../test-results/release-064/package-verification.json), [ZIP 검증](../test-results/release-064/archive-verification.json), [웹 상세 화면](../test-results/release-064/web-detail.png), [웹 미리보기](../test-results/release-064/web-preview.png), [앱 도매몰 검색](../test-results/release-064/app-wholesale-search.png).

배포 전 동일 기능 소스의 전체 테스트 180/180, 데스크톱 12/12, 웹·Electron UI 23/23 및 격리 SQL 12/12가 통과했다. 릴리스 패키징에서 타입 검사·웹 빌드를 다시 통과했다. 이번 운영 검증은 조회와 유효성 검사로 진행했으며 실제 상품 신규 등록·수정·삭제나 테스트 계정 생성은 수행하지 않았다.

## 유지된 설정과 범위

Supabase 보안 Advisor는 적용 전후 동일했다. 서버 전용 테이블의 RLS/no-policy INFO 10개와 기존 [유출 비밀번호 보호 비활성 WARN](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)이 있으며 이번 마이그레이션으로 추가된 경고는 없다. 기존 ad-hoc 서명과 hardenedRuntime 설정을 유지했고 notarization은 수행하지 않았다.

확인한 공식 문서: [Supabase 함수 권한](https://supabase.com/docs/guides/database/functions), [TLS 변경 공지](https://supabase.com/changelog/cbc-tls-ciphers-deprecated), [PostgreSQL 변경 공지](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes). 이번 집계 함수·현재 클라이언트에 별도 변경이 필요한 항목은 확인되지 않았다.
