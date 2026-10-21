# 0.6.3 코드 리뷰 후속 작업 보고

2026-10-19 · 기준: 사용자가 전달한 `code-review-0.6.3-codex-tasks.md`

후속 승인에 따라 운영 DB·웹·설치 앱을 **0.6.4로 배포하고 검증 완료**했습니다. 현재 운영 상태는 [0.6.4 배포 보고서](../release-064-verification.md)를 참조하세요. 아래 내용과 11개 패치는 배포 전 리뷰 구현·검증 기록이며, 이후 릴리스 버전 변경은 별도입니다.

11개 작업의 소스 수정과 로컬 검증을 완료했습니다. Worker 런타임을 포함한 전체 테스트 180개, 웹·Electron UI 테스트 23개가 모두 통과했습니다. 운영 배포·운영 DB 마이그레이션·설치 앱 교체는 하지 않았고 버전은 0.6.3을 유지했습니다.

## 변경물과 적용 방법

현재 폴더에는 `.git`이 없어 커밋·PR을 만들지 않았습니다. 대신 [11개 작업별 패치와 한국어 커밋 제목](patches/manifest.json)을 남겼습니다. 패치는 01→11 순서이며, 각각 `git apply --check` 후 적용하고 임시 기준본과 현재 소스를 대조했습니다. 3,400개 기준본/변경 텍스트 경로가 바이트 단위로 일치했습니다.

현재 작업 폴더에는 이미 수정이 적용돼 있으므로 여기서 패치를 다시 적용하지 마세요. 별도의 동일 기준본 Git 저장소에 옮길 때 사용하는 패치입니다. 고유 소스 파일 55개, 작업별 합산 +865/−4,328줄이며 Python 캐시 15개는 패치에서 제외했습니다. 실제 `.dev.vars`·`.env*`·시크릿은 변경물에 포함하지 않았습니다.

## 최종 검증

| 명령/검증 | 결과 |
|---|---|
| `npm run check` | 통과 |
| `npm run build` | 통과 |
| `npm run test:desktop` | 12/12 통과 |
| `npm test` | 180/180 통과, Workers 런타임 테스트 포함 |
| `npm run test:desktop:ui` | 23/23 통과, 웹·Electron UI 및 macOS 패키지 실행 포함 |
| 목록 집계 실제 SQL 테스트 | 격리 PGlite 6/6 통과 |
| 상품 검색 실제 ILIKE 테스트 | 격리 PGlite 6/6 통과 |
| 서버 집중 테스트 | 41/41 통과 |
| 제거 대상 러너 심볼 검사 | 결과 없음 |
| desktop 내 프로젝트 ref 리터럴 | config.cjs 한 곳 |
| 11개 패치 순차 적용·현재 소스 비교 | 통과 |

최초 실행을 막았던 로컬 포트 권한 제한은 사용자 승인 후 해소됐습니다. 최종 전체 실행에서 실패·건너뛴 테스트는 없습니다. UI 검증에는 미리보기 편집·재준비·실패 복구, 중복 등록 방지, 뒤로/앞으로 이동, 선택 인계, 웹·Electron 가입 코드 입력이 포함됩니다. 운영 서비스 대신 로컬 fixture를 사용했습니다.

첫 UI 재실행에서 새 Electron 가입 테스트의 요청 대기가 실패했습니다. Electron의 `calla://` 요청을 Playwright 페이지 이벤트로 관찰하던 테스트를 로컬 HTTP 프록시에서 관찰하도록 수정했습니다. 제품 코드는 변경하지 않았으며 가입 테스트 2/2와 최종 전체 UI 23/23으로 확인했습니다. 이 수정은 작업 04 패치에 포함했고 11개 패치 순차 적용도 다시 검증했습니다.

최종 로그: [`npm test`](../../test-results/review-063/test-approved.log), [전체 UI](../../test-results/review-063/desktop-ui-final.log), [가입 UI](../../test-results/review-063/signup-ui-approved.log), [패치 적용](../../test-results/review-063/patch-validation.log). 개별 작업 도중의 로그는 `test-results/review-063/tasks/01`~`11`에 보존했습니다.

격리 DB 테스트 재현 명령(테스트용 PGlite는 프로젝트 의존성에 추가하지 않음):

```sh
node tests/list-summaries-database.mjs /tmp/calla-review-db/node_modules/@electric-sql/pglite/dist/index.js
node --import tsx tests/catalog-search-database.mjs /tmp/calla-review-db/node_modules/@electric-sql/pglite/dist/index.js
```

## 운영 반영 전 준비사항

1. 사람이 `supabase/migrations/20261019000000_product_list_summaries.sql`을 먼저 적용한 뒤 대응 Worker를 배포해야 합니다. 여기서는 SQL 파일 작성과 격리 DB 적용만 했습니다.
2. Worker Secret `CALLA_SIGNUP_CODE`를 24~512자로 설정해야 회원가입이 열립니다. 비어 있거나 범위 밖이면 503으로 닫힙니다. 예제 파일에는 빈 이름만 추가했습니다. 로그인과 최초 관리자 설정 동작은 유지했습니다.

## GitHub 참조

사용자가 지정한 [iam-yeseo/Product-Share-Tool](https://github.com/iam-yeseo/Product-Share-Tool/tree/2cf50478911b3fa35fedaca533183e1779fd38c2)의 `main` 커밋 `2cf5047`을 GitHub 연결로 확인했습니다. 원문 HTML 보존, 편집 저장과 완료 상태 분리, 가격 null·0 구분, 카테고리 코드 보존, 이미지 판정 무효화, 탐색·비동기 응답 처리 규칙을 현재 구현 및 테스트와 대조했습니다. 현재 인증·권한 구조와 맞지 않는 이전 구현은 가져오지 않았습니다. [확인 파일과 대응 근거](github-reference.md)에 고정 커밋 링크를 남겼으며 원격 저장소는 변경하지 않았습니다.

## 지시서와 달라진 점·추가 발견

- Git 정보가 없어 독립 커밋 대신 독립 패치 11개로 전달합니다. 각 패치의 한국어 커밋 제목을 manifest에 적었습니다.
- Supabase CLI 도움말은 확인했지만 빈 마이그레이션 생성 실행은 CLI 사용자 폴더 접근에 대한 승인 검토 용량 오류로 실패했습니다. 허용된 작업 폴더에 SQL 파일을 직접 작성했습니다. 운영 DB 접속은 하지 않았습니다.
- 작업 8은 허용된 최소 옵션 2를 선택했습니다. 기존 `.d.ts`에서 빠진 `brandKey`, `hangulInitials`, `brandSearchText` 선언도 계약을 맞추기 위해 추가했습니다. 런타임 JS는 그대로입니다.
- 작업 9는 `%`, `_`, `*`를 기존처럼 공백으로 치환합니다. 다른 구두점은 보존합니다. 추가 검토에서 발견한 역슬래시의 이중 해석도 같은 작업 안에서 고쳤고 실제 PostgreSQL 검색으로 검증했습니다.
- 작업 11의 한 곳 리터럴 조건을 만족하도록 `desktop/tests/ui/fixture.ts`도 상수를 참조하게 했습니다.
- `/api/runner/context`, `/api/runner/registrations`, `/api/runner/complete`는 유지했습니다. 세 엔드포인트는 이제 프런트엔드 호출자 없이 남아 있습니다.
- 삭제 대상에 없던 `desktop/runner-entry.py`, `desktop/requirements-build.txt`, `src/DesktopChrome.tsx`의 `DesktopRunnerDetails`는 남겨 보고합니다. `runner-entry.py`는 제거된 `runner.bridge`를 참조하고 있습니다. 이 Python 파일은 데스크톱 패키징 대상이 아닙니다. `chromeAvailable`은 남아 있는 컴포넌트에서 읽혀 유지했습니다.
- 빌드에서 500KB 초과 번들 경고가 나옵니다. 지시서 밖의 번들 분할 리팩터링은 하지 않았습니다.
- ad-hoc 서명과 hardenedRuntime 설정은 변경하지 않았습니다. 다른 Mac에 배포할 경우 서명·업데이트 체계는 별도로 결정해야 합니다.

DB 함수 보안은 [Supabase 공식 함수 문서](https://supabase.com/docs/guides/database/functions), 값 인용은 [PostgREST URL 문법](https://docs.postgrest.org/en/stable/references/api/url_grammar.html#reserved-characters), ILIKE는 [PostgreSQL 패턴 문서](https://www.postgresql.org/docs/current/functions-matching.html#FUNCTIONS-LIKE)를 확인했습니다.

## 작업별 내용과 파일 변경량

아래 모든 작업에 최종 타입 검사·빌드·데스크톱 12/12·전체 테스트 180/180·UI 23/23 결과가 적용됩니다. 개별 작업 도중의 검증 명령·테스트 수는 해당 작업 로그에 보존했습니다. 같은 파일이 여러 작업에 등장하면 각 단계의 증감입니다.

### 작업 1 — 죽은 로컬 러너 경로 제거 (공식 API 전환 잔여물)

runner 디렉터리·러너 서비스·브리지·스크립트 제거. 사용 중인 chromeAvailable은 유지하고 미사용 job만 제거.

[01-remove-local-runner.patch](patches/01-remove-local-runner.patch) · 32개 파일 · +3/−4239

| 파일 | 추가 | 삭제 |
|---|---:|---:|
| `desktop/config.cjs` | 1 | 10 |
| `desktop/main.cjs` | 1 | 3 |
| `desktop/preload.cjs` | 0 | 6 |
| `desktop/runner-service.cjs` | 0 | 104 |
| `desktop/tests/config.test.cjs` | 1 | 16 |
| `desktop/tests/runner-service.test.cjs` | 0 | 45 |
| `desktop/tests/ui/app.spec.ts` | 0 | 4 |
| `package.json` | 0 | 2 |
| `runner/.gitignore` | 0 | 7 |
| `runner/README.md` | 0 | 90 |
| `runner/__init__.py` | 0 | 1 |
| `runner/__main__.py` | 0 | 3 |
| `runner/bridge.py` | 0 | 859 |
| `runner/browser_tests/test_form.py` | 0 | 236 |
| `runner/engine/__init__.py` | 0 | 1 |
| `runner/engine/browser.py` | 0 | 86 |
| `runner/engine/config.py` | 0 | 98 |
| `runner/engine/db.py` | 0 | 129 |
| `runner/engine/godomall.py` | 0 | 827 |
| `runner/native_engine.py` | 0 | 90 |
| `runner/requirements.txt` | 0 | 2 |
| `runner/tests/fixtures/godomall-save-completed.html` | 0 | 54 |
| `runner/tests/test_bridge.py` | 0 | 618 |
| `runner/tests/test_prices.py` | 0 | 80 |
| `runner/tests/test_save_verification.py` | 0 | 427 |
| `runner/tests/test_security_limits.py` | 0 | 78 |
| `runner/tests/test_stock_detail.py` | 0 | 126 |
| `runner/tests/test_worker_client.py` | 0 | 163 |
| `scripts/build-runner.mjs` | 0 | 22 |
| `src/RunnerConnection.tsx` | 0 | 19 |
| `src/desktop.ts` | 0 | 5 |
| `src/runner-client.ts` | 0 | 28 |

### 작업 2 — 목록 집계를 DB로 옮겨 전체 상품 조회 제거

목록/상품/등록 내역 전체 전송을 product_list_summaries RPC 1회로 교체. 집계 규칙·정렬·메타데이터 보존, service_role만 실행 허용.

[02-database-list-summaries.patch](patches/02-database-list-summaries.patch) · 5개 파일 · +188/−11

| 파일 | 추가 | 삭제 |
|---|---:|---:|
| `server/index.ts` | 2 | 6 |
| `tests/server.test.ts` | 13 | 5 |
| `supabase/migrations/20261019000000_product_list_summaries.sql` | 34 | 0 |
| `tests/list-summaries-database.sql` | 36 | 0 |
| `tests/list-summaries-database.mjs` | 103 | 0 |

### 작업 3 — 예상하지 못한 Worker 오류에 최소 진단 로그 추가

예상하지 못한 예외만 api_unhandled로 1회 기록. pathname·method·name·message만 기록하고 사용자 응답은 유지.

[03-log-unhandled-api-errors.patch](patches/03-log-unhandled-api-errors.patch) · 2개 파일 · +26/−1

| 파일 | 추가 | 삭제 |
|---|---:|---:|
| `server/index.ts` | 5 | 1 |
| `tests/server.test.ts` | 21 | 0 |

### 작업 4 — 공개 회원가입에 공유 가입 코드 검증 추가

타이밍 안전 비교로 가입 코드 검증. 없거나 틀리면 403, 서버 코드가 없거나 설정 범위 밖이면 503. 성공 시 기존 pending 계정 생성.

[04-require-signup-code.patch](patches/04-require-signup-code.patch) · 5개 파일 · +161/−14

| 파일 | 추가 | 삭제 |
|---|---:|---:|
| `server/accounts.ts` | 5 | 1 |
| `src/Auth.tsx` | 4 | 3 |
| `tests/accounts.test.ts` | 51 | 10 |
| `.dev.vars.example` | 2 | 0 |
| `desktop/tests/ui/signup-code.spec.ts` | 99 | 0 |

### 작업 5 — 데스크톱 프록시 헤더와 본문 및 세션 검증 보완

retry-after 전달, 덮어쓰는 Origin 제거, content-length 선검사, 객체가 아닌 저장 세션 복구. 실제 main 코드를 모의 Electron API로 실행하는 회귀 테스트 추가.

[05-fix-desktop-proxy-and-session.patch](patches/05-fix-desktop-proxy-and-session.patch) · 2개 파일 · +163/−3

| 파일 | 추가 | 삭제 |
|---|---:|---:|
| `desktop/main.cjs` | 9 | 3 |
| `desktop/tests/main.test.cjs` | 154 | 0 |

### 작업 6 — 상품 상세 미리보기 iframe CSP 통일

세 srcDoc 미리보기가 공통 CSP 사용. font-src에 data: 포함, sandbox="" 유지.

[06-unify-preview-csp.patch](patches/06-unify-preview-csp.patch) · 4개 파일 · +8/−3

| 파일 | 추가 | 삭제 |
|---|---:|---:|
| `src/ProductEditor.tsx` | 2 | 1 |
| `src/Godomall.tsx` | 2 | 1 |
| `src/ProductRegistrationPreview.tsx` | 2 | 1 |
| `src/preview-csp.ts` | 2 | 0 |

### 작업 7 — XLSX 파일 손상과 처리 한도 초과 안내 분리

손상·암호화·비 ZIP/파서 오류 안내와 예산 초과 안내 분리. 모든 기존 예산 상수 유지.

[07-separate-xlsx-failure-messages.patch](patches/07-separate-xlsx-failure-messages.patch) · 2개 파일 · +29/−3

| 파일 | 추가 | 삭제 |
|---|---:|---:|
| `src/xlsx-limits.ts` | 10 | 3 |
| `tests/xlsx-security.test.ts` | 19 | 0 |

### 작업 8 — 공유 automation-core 선언과 실제 export 계약 검증

옵션 2 선택. 선언·실제 export 키/typeof 계약 테스트 추가, 누락 선언 3개 보완. Worker 함수를 validateSettingsPayload로 변경.

[08-verify-automation-core-contract.patch](patches/08-verify-automation-core-contract.patch) · 4개 파일 · +40/−4

| 파일 | 추가 | 삭제 |
|---|---:|---:|
| `src/lib/automation-core.d.ts` | 3 | 0 |
| `tests/automation-core-contract.test.ts` | 33 | 0 |
| `server/index.ts` | 2 | 2 |
| `tests/server.test.ts` | 2 | 2 |

### 작업 9 — 상품 검색 문장부호를 보존하고 필터 값을 안전하게 인용

모델명 마침표·쉼표·괄호·따옴표 보존. 사용자 와일드카드 제거 유지, 역슬래시는 ILIKE와 PostgREST 양쪽에 이스케이프.

[09-preserve-catalog-search-punctuation.patch](patches/09-preserve-catalog-search-punctuation.patch) · 3개 파일 · +148/−1

| 파일 | 추가 | 삭제 |
|---|---:|---:|
| `server/index.ts` | 10 | 1 |
| `tests/server.test.ts` | 30 | 0 |
| `tests/catalog-search-database.mjs` | 108 | 0 |

### 작업 10 — 기존 탐색 동작을 유지하며 history 관리를 훅으로 분리

history 관련 상태·이벤트·복원·이탈 확인을 useNavigation으로 이동. App 207→170줄, App 내부 useState 39→38개. 원본 의미 대조 9항목 통과.

[10-extract-navigation-hook.patch](patches/10-extract-navigation-hook.patch) · 2개 파일 · +65/−43

| 파일 | 추가 | 삭제 |
|---|---:|---:|
| `src/App.tsx` | 6 | 43 |
| `src/use-navigation.ts` | 59 | 0 |

### 작업 11 — 데스크톱 Supabase 프로젝트 참조값 상수화

desktop/config.cjs의 단일 프로젝트 ref에서 CSP·저장 키·UI fixture 인증 URL 생성. 허용 저장 키 3개는 그대로 유지.

[11-centralize-supabase-project-ref.patch](patches/11-centralize-supabase-project-ref.patch) · 4개 파일 · +34/−6

| 파일 | 추가 | 삭제 |
|---|---:|---:|
| `desktop/config.cjs` | 3 | 1 |
| `desktop/main.cjs` | 4 | 3 |
| `desktop/tests/main.test.cjs` | 25 | 1 |
| `desktop/tests/ui/fixture.ts` | 2 | 1 |

