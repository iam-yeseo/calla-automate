# 코드 리뷰 후속 작업 지시서 (0.6.3 기준)

이 문서는 2026-10-19 전체 코드 리뷰 결과를 Codex가 바로 작업할 수 있는 형태로 정리한 것입니다.
읽는 순서대로 작업하되, 각 작업은 **독립된 커밋(또는 PR)** 으로 분리하세요.

- 리뷰 대상 버전: `package.json` 0.6.3
- 리뷰 범위: `server/` 전체, `src/` 주요 파일, `desktop/`, `supabase/migrations/`, `src/lib/automation-core.js`
- 리뷰 시점 상태: `npm run check` 오류 없음, `npm test` 169개 전부 통과

---

## 공통 규칙

### 작업 전

- 이 문서의 **줄 번호는 0.6.3 기준**입니다. 파일이 바뀌었을 수 있으니 줄 번호를 믿지 말고 주변 코드로 위치를 확인하세요.
- 각 작업을 시작하기 전에 해당 파일 전체를 읽으세요. 이 코드베이스는 한 줄에 여러 문장을 몰아 쓰는 스타일이라 부분 읽기로는 맥락을 놓칩니다.

### 검증 (모든 작업 공통)

작업마다 아래를 실행해 통과를 확인하세요.

```sh
npm run check          # tsc --noEmit
npm test               # Worker/도메인 테스트 (기준 169개)
npm run test:desktop   # Electron 단위 테스트
```

UI를 건드린 작업은 추가로:

```sh
npm run test:desktop:ui
npm run build
```

### 금지사항

- **운영 배포하지 마세요.** `npm run deploy`, `wrangler deploy` 금지. 확인이 필요하면 `npx wrangler deploy --dry-run`만 쓰세요.
- **Supabase 운영 프로젝트에 마이그레이션을 적용하지 마세요.** 새 마이그레이션 파일은 작성만 하고, 적용은 사람이 합니다.
- **`.dev.vars`, `.env*`를 커밋하지 마세요.** `.gitignore`에 이미 들어 있으니 `git status`로 확인만 하세요.
- **시크릿 값을 로그·주석·커밋 메시지에 남기지 마세요.**
- 지시서에 없는 리팩터링을 덤으로 하지 마세요. 특히 아래 "손대지 말 것" 절을 먼저 읽으세요.

### 커밋 메시지

한국어로, 변경 이유를 한 줄로 적으세요. 예: `죽은 로컬 러너 경로 제거 (0.4.0 API 전환 잔여물)`

---

## 손대지 말 것 (의도된 설계)

리뷰에서 **의도적이고 올바른 설계**로 확인한 부분입니다. "개선"하지 마세요.

| 위치 | 내용 | 이유 |
|---|---|---|
| `server/godomall-client.ts` 뮤테이션 경로 | `insert`/`update`는 네트워크 오류에도 재시도하지 않음 | 중복 등록 방지. 재시도 추가는 치명적 회귀 |
| `server/godomall.ts:178-181` | 응답 유실 시 `needs_review`를 **먼저 기록**한 뒤 재조회 | 호출자 연결이 끊겨도 재시도로 변질되지 않게 하는 순서 |
| `server/godomall.ts:192-198` | `godomallPayload`가 인증 없이 열린 경로 | 고도몰 서버가 `data_url`로 가져가는 capability URL. 64자 토큰 해시 + 만료 + state 조건으로 보호됨 |
| `server/godomall.ts:159` | `op.created_by !== c.user.id` 검사 | 검토한 관리자만 실행 가능. 완화 금지 |
| `src/lib/automation-core.js` `detailHtml` 텍스트 블록 | 텍스트를 **이스케이프하지 않고** 그대로 삽입 | 관리자가 상세설명 HTML을 직접 붙여넣는 기능. 소비처는 전부 `sandbox=""` iframe |
| `src/PreviewProductName.tsx:15-16` | `template.innerHTML = name` | `<template>` 내부는 inert. 허용목록 기반으로 React 노드를 다시 만드는 안전한 관용구 |
| `src/xlsx-limits.ts` 예산 상수 | 엔트리/전체 바이트, 행·열·셀 상한 | zip-bomb·XML-bomb 방어. 상한을 올리지 마세요 |
| `supabase/migrations/20261008024948_*.sql` | RLS 활성화 + `anon`/`authenticated` 권한 `revoke` | Worker가 유일한 데이터 통로라는 전제. 정책을 추가해 우회로를 만들지 마세요 |
| `desktop/main.cjs:96-97` | 권한 요청·검사 전부 거부 | 이 앱은 카메라/위치/알림을 쓰지 않습니다 |
| `desktop/main.cjs:105` | `contextIsolation`, `sandbox: true`, `nodeIntegration: false` | 완화 금지 |

---

# P0 — 먼저 처리

## 작업 1. 죽은 로컬 러너 경로 제거

### 배경

0.4.0에서 로컬 Python(Playwright) 러너로 브라우저를 자동 조작하는 방식 → 고도몰 공식 API(`server/godomall*.ts`) 방식으로 전환했습니다. 옛 경로가 통째로 남아 약 2,800줄의 죽은 코드가 되었고, `desktop/*.cjs` 글롭 때문에 **`runner-service.cjs`는 실제로 앱에 패키징되어 배포됩니다.**

가장 큰 문제는 처음 코드를 읽는 사람(사람이든 에이전트든)이 상품 등록이 어떻게 동작하는지 오해한다는 점입니다.

### 근거 (삭제해도 안전한 이유)

- `runner/`: `desktop/builder.json`의 `files` 목록에 없어 패키징되지 않고, `desktop/main.cjs`가 러너 프로세스를 spawn하지 않음
- `desktop/runner-service.cjs`: `main.cjs`가 `require`하지 않음. `desktop/tests/runner-service.test.cjs`만 참조
- `desktop/config.cjs`의 `ACTIVE_STATES`, `runnerPath`: 위 서비스와 자기 테스트에서만 사용
- `src/runner-client.ts`, `src/RunnerConnection.tsx`: `src/` 안 어떤 컴포넌트도 import하지 않음. `src/Automation.tsx`는 고도몰 API 경로만 사용
- `desktop/preload.cjs`의 `retryRunner`/`runnerRequest` → `desktop/main.cjs`의 `desktop:retry`/`desktop:runner` 핸들러는 항상 에러만 반환

### 삭제 대상

1. `runner/` 디렉터리 전체
2. `scripts/build-runner.mjs`
3. `package.json`의 `"desktop:runner"`, `"test:runner"` 스크립트
4. `desktop/runner-service.cjs`, `desktop/tests/runner-service.test.cjs`
5. `desktop/config.cjs`의 `ACTIVE_STATES`, `runnerPath`, 그리고 `module.exports`에서 두 이름 제거
6. `desktop/tests/config.test.cjs`에서 `runnerPath`를 쓰는 단정(19~31행 부근)
   → `trustedPage`, `externalURL`, `assetPath` 테스트는 **반드시 남기세요**
7. `src/runner-client.ts`, `src/RunnerConnection.tsx`
8. `desktop/preload.cjs`의 `retryRunner`, `runnerRequest` 노출
9. `desktop/main.cjs`의 `'desktop:retry'`, `'desktop:runner'` 핸들러
10. `src/desktop.ts`의 `DesktopAPI` 타입에서 `retryRunner`, `runnerRequest`
11. `desktop/tests/ui/app.spec.ts`에서 `runnerRequest`를 호출하는 단정(39행 부근)

### 추가 확인

`src/desktop.ts`의 `DesktopState`에 있는 `chromeAvailable`, `job` 필드가 위 삭제 후에도 읽히는지 grep으로 확인하세요. 아무도 읽지 않으면 함께 제거하고, `desktop/main.cjs:125`의 `desktop:state` 반환값도 맞추세요.

### 하지 말 것

**`server/index.ts`의 `/api/runner/*` 세 엔드포인트는 이번에 건드리지 마세요.**

- `/api/runner/context` (index.ts:243)
- `/api/runner/registrations` (index.ts:244)
- `/api/runner/complete` (index.ts:285)

`tests/server.test.ts`가 이들을 광범위하게 검증하고 있고, 수동 복구 경로로 의도적으로 남겼을 가능성이 있습니다. 대신 작업 보고에 **"이 세 엔드포인트가 이제 프런트엔드 호출자 없이 남아 있다"** 는 사실을 적어 사람이 판단하게 하세요.

### 완료 기준

- `npm run check` 오류 없음
- `npm test` 전부 통과 (삭제한 러너 테스트 수만큼 줄어든 것은 정상)
- `npm run test:desktop` 통과
- 아래 결과가 비어 있음:
  ```sh
  grep -rn "runnerRequest\|retryRunner\|RunnerService\|runnerPath\|runner-client\|RunnerConnection" \
    --include="*.ts" --include="*.tsx" --include="*.cjs" src/ desktop/ scripts/
  ```

---

## 작업 2. `/api/lists`의 워크스페이스 전체 스캔 제거

### 배경

`server/index.ts:166`에서 목록 화면을 그릴 때마다 `product_items`와 `product_registrations` **전체**를 가져와 Worker 메모리에서 집계합니다.

`allRows`(`server/index.ts:66-70`)는 1,000행씩 **순차로** 최대 100페이지를 요청합니다. 이것을 세 개 병렬로 돌리므로 한 요청이 최대 300 서브리퀘스트입니다. Cloudflare Workers 상한이 1,000이라 지금은 통과하지만, 상품이 늘면 목록 화면이 가장 먼저 무너집니다.

### 할 일

집계를 Postgres로 내리세요. 이 프로젝트에는 이미 RPC 패턴이 있습니다 (`rpc/save_product_draft`, `rpc/godomall_reserve_call`).

1. `supabase/migrations/` 에 새 마이그레이션 파일을 추가해, 리스트별 집계를 반환하는 뷰 또는 함수를 만드세요. 반환해야 하는 값은 `server/index.ts:168`의 `empty()`가 정의한 그대로입니다:
   - `total`, `doneCount`, `retailSuccess`, `wholesaleSuccess`, `retailTotal`, `wholesaleTotal`, `runningCount`, `failedCount`
2. 집계 규칙은 `server/index.ts:169-170`의 현재 동작을 **정확히** 보존하세요. 특히:
   - `retailTotal`/`wholesaleTotal`은 `need_<channel> = '필요'` 인 상품만 셈
   - `retailSuccess`/`wholesaleSuccess`는 `status = 'success'` **이면서** 해당 채널이 `'필요'` 인 경우만 셈 (등록 필요가 꺼진 뒤에 남은 성공 기록은 세지 않음)
   - `runningCount`, `failedCount`는 `need_` 조건 없이 전체 집계
3. 새 함수에 `revoke all ... from public, anon, authenticated` + `grant execute ... to service_role`을 반드시 적용하세요. 기존 마이그레이션들의 패턴을 따르세요.
4. `server/index.ts`의 `/api/lists` 핸들러가 새 RPC 한 번만 호출하도록 바꾸세요.

### 하지 말 것

- 마이그레이션을 운영 DB에 적용하지 마세요. 파일만 만들고 보고하세요.
- `allRows` 함수 자체를 지우지 마세요. 다른 곳(`registrations()`, `/api/runner/context` 등)에서 여전히 씁니다.

### 완료 기준

- `tests/server.test.ts`의 `/api/lists` 관련 테스트가 통과하거나, 새 RPC를 모킹하도록 갱신되어 통과
- 집계 숫자가 변경 전과 동일함을 테스트로 보장 (기존 기대값을 바꾸지 말고, 바꿔야 한다면 왜 바꾸는지 보고)

---

## 작업 3. Worker의 예상 못한 에러를 로깅

### 배경

`server/index.ts:317`의 catch-all이 `ApiError`/`AccountError`/`GodomallError`가 아닌 에러를 전부 "요청을 처리하지 못했습니다"로 바꿔 500을 반환하면서 **아무것도 로깅하지 않습니다.** `wrangler.jsonc`에 `observability.enabled: true`가 켜져 있는데도 운영에서 500의 원인을 볼 수 없습니다.

### 할 일

`server/index.ts:317`의 마지막 `return json({ error: { code: 'internal_error', ... } }, 500)` 직전에 구조화 로그를 추가하세요.

이미 있는 패턴을 따르세요 — `server/godomall-client.ts:151`, `:166`, `:192`가 `console.warn('godomall_upstream_...', { ... })` 형태로 씁니다.

```
console.error('api_unhandled', { path, method, name, message })
```

정도로, **최소한 다음을 담되 그 이상은 담지 마세요**:

- `url.pathname` (쿼리스트링 제외 — 검색어·ID가 들어갈 수 있음)
- `request.method`
- `error.name`, `error.message`

### 하지 말 것

- **스택 트레이스, 요청 본문, 헤더, `Authorization` 값을 로깅하지 마세요.**
- 사용자에게 가는 응답 메시지는 바꾸지 마세요. 내부 오류 내용이 클라이언트로 새면 안 됩니다.
- `ApiError`/`AccountError`/`GodomallError`는 정상적인 검증 실패이므로 로깅하지 마세요. 로그가 노이즈로 가득 차면 의미가 없습니다.

### 완료 기준

- 알려진 에러(422/403/409 등)는 로그를 남기지 않음
- 예상 못한 에러만 `console.error`를 한 번 남기고 500 반환
- 기존 테스트 전부 통과

---

# P1 — 다음으로

## 작업 4. 공개 회원가입 경로 제한

### 배경

`server/accounts.ts:170-175`의 `/api/auth/signup`은 인터넷에 열려 있어 누구나 pending 계정을 만들 수 있습니다. 방어는 IP당 30회/분 레이트리밋(`server/index.ts:304-307`)뿐이고, 정리 작업도 관리자 알림도 없습니다. 계정 목록을 쉽게 오염시킬 수 있습니다.

### 할 일

가입에 공유 비밀을 요구하세요. 기존 `/api/auth/setup`이 쓰는 `CALLA_SETUP_TOKEN` 패턴을 그대로 재사용하는 것이 가장 단순합니다:

1. 새 환경변수(예: `CALLA_SIGNUP_CODE`)를 `.dev.vars.example`에 이름만 추가
2. `accounts.ts`의 `fields(input, [...])` 허용 목록에 해당 필드 추가
3. 검증은 `tokenMatches`(accounts.ts:144-148)를 재사용 — **반드시 타이밍 안전 비교를 쓰세요.** 단순 `===` 비교로 바꾸지 마세요.
4. 환경변수가 설정되지 않은 경우의 동작을 **명시적으로** 정하세요. 권장: 가입 자체를 503으로 막습니다(`accounts.ts:178`의 `setup_unavailable` 패턴과 동일). 미설정 시 무조건 통과시키면 지금과 같아집니다.
5. `src/Auth.tsx`에 가입 코드 입력란을 추가하세요.

### 하지 말 것

- `/api/auth/login`과 `/api/auth/setup`의 동작은 바꾸지 마세요.
- 가입 실패 메시지에서 아이디 존재 여부를 더 흘리지 마세요. `accounts.ts:124`가 이미 `email_exists`를 "이미 사용 중인 아이디입니다"로 바꾸고 있는데, 이 수준을 유지하세요.

### 완료 기준

- 코드 없이 가입 요청 → 403
- 틀린 코드로 가입 요청 → 403, 메시지에 정답 힌트 없음
- 맞는 코드로 가입 → 201, 기존처럼 `status: 'pending'`
- `tests/accounts.test.ts`에 위 세 경우를 추가

---

## 작업 5. `desktop/main.cjs` 결함 4건 (한 커밋으로 묶어도 됨)

### 5-1. 프록시가 `retry-after` 헤더를 버림

`desktop/main.cjs:74`가 응답을 재조립할 때 `content-type`과 `cache-control`만 복사합니다. Worker는 레이트리밋 429(`server/index.ts:307`)와 고도몰 대기(`server/index.ts:317`, `GodomallError.retryAfter`)에 `retry-after`를 붙이는데 Mac 앱에서는 사라집니다.

→ `retry-after`를 화이트리스트에 추가해 전달하세요. 상류 헤더를 **통째로 복사하지는 마세요**(지금 선별 복사하는 것이 의도입니다).

### 5-2. 죽은 줄 제거

```js
headers.set('Origin', WEB_ORIGIN);   // 68행
...
headers.set('Origin', apiOrigin);    // 72행 — 즉시 덮어씀
```

→ 68행을 삭제하세요. 테스트 모드에서 어느 Origin이 전송되는지 읽는 사람이 헷갈립니다.

### 5-3. 본문을 전부 버퍼링한 뒤에 크기 검사

`desktop/main.cjs:70-71`이 `await request.arrayBuffer()`를 끝낸 **다음** 20MB 초과를 판단합니다.

→ `content-length` 헤더를 먼저 검사해 조기 거부하세요. Worker의 `boundedBody`(`server/index.ts:31-38`)가 이미 올바른 방식(선언값 검사 + 스트리밍 누적)을 보여줍니다. 그 패턴을 참고하되, 여기서는 `content-length` 선검사만으로도 충분합니다.

### 5-4. `storedAuth`가 객체가 아닐 수 있음

`desktop/main.cjs:100`에서 복호화한 JSON이 `"x"`나 `[]`, `42`일 수 있습니다. CJS는 non-strict 모드라 `storedAuth[key] = value`(135행)가 **조용히 무시되고**, 로그인 세션이 저장되지 않는데 에러도 나지 않습니다.

→ 파싱 직후 plain object인지 검사하고, 아니면 `{}`로 폴백하세요. `server/accounts.ts:34`의 `record()` 헬퍼와 같은 판정(`value && typeof value === 'object' && !Array.isArray(value)`)을 쓰세요.

### 완료 기준

- `npm run test:desktop` 통과
- 5-4에 대한 테스트 추가: 손상된 `session.enc`(유효 JSON이지만 객체가 아닌 값)로도 앱이 정상 기동하고 이후 `setItem`이 동작

---

## 작업 6. `ProductEditor.tsx` 미리보기 iframe에 CSP 추가

### 배경

`srcDoc` iframe 세 곳 중 `src/ProductEditor.tsx:129`만 CSP meta가 없습니다. 형제들은 둘 다 있습니다:

- `src/Godomall.tsx:269` — `default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; font-src https:; base-uri 'none'; form-action 'none'`
- `src/ProductRegistrationPreview.tsx:15` — 거의 동일 (+ `font-src https: data:`)

`sandbox=""`로 스크립트는 이미 막혀 XSS는 아닙니다. 다만 관리자가 붙여넣은 HTML이 임의 외부 리소스를 불러올 수 있어(트래킹 픽셀 등) 심층 방어가 한 겹 빠진 상태입니다.

### 할 일

`src/ProductEditor.tsx:129`의 `srcDoc` 문자열 `<head>`에 형제들과 **동일한** CSP meta를 추가하세요.

세 곳의 CSP가 제각각 손으로 복제되어 있으니, 공통 상수로 추출하는 것을 권합니다. 추출할 경우 세 곳 모두 같은 정책을 쓰도록 통일하고, `font-src`에 `data:`를 포함하는 쪽(`ProductRegistrationPreview.tsx`)으로 맞추세요.

### 하지 말 것

- `sandbox=""`를 바꾸지 마세요. 비어 있는 것이 가장 강한 설정입니다.
- `script-src`를 어떤 형태로든 허용하지 마세요.

### 완료 기준

- 세 iframe 모두 동일 CSP 적용
- `npm run test:desktop:ui` 통과 (미리보기 렌더 테스트가 깨지지 않음)

---

## 작업 7. XLSX 검증 실패 메시지 분리

### 배경

`src/xlsx-limits.ts:141`의 `catch { throw invalid(); }` 때문에 **모든** 실패가 하나의 메시지로 뭉개집니다:

> "XLSX 파일의 압축 해제 크기 또는 시트 구조가 안전한 처리 범위를 초과했습니다. 필요한 상품 표만 새 파일에 저장해 주세요."

손상된 파일, 암호 걸린 파일, zip이 아닌 파일도 이 메시지를 받습니다. 정작 맞는 안내문인 "XLSX 파일을 읽지 못했습니다. 암호를 해제하고 정상적인 .xlsx 파일로 다시 저장해 주세요"(`src/importer.ts:107`)는 `validateXlsxArchive`가 먼저 터지므로 **도달하지 못합니다.**

### 할 일

`validateXlsxArchive`에서 두 실패를 구분하세요.

1. `JSZip.loadAsync(buffer)` 실패 = 파일 자체가 xlsx가 아니거나 손상/암호화 → `src/importer.ts:107`과 같은 취지의 메시지
2. 예산 초과(`invalid()`) = 현재 메시지 유지

`invalid()`가 던지는 에러와 로드 실패 에러를 구분할 수 있게 하세요. 가장 단순한 방법은 `loadAsync`만 별도 `try`로 감싸는 것입니다. 전체를 감싼 `catch`는 **유지하되**(예상 못한 파서 예외가 그대로 새면 안 됨), 내부에서 던진 `invalid()`는 그대로 통과시키세요.

### 완료 기준

- `tests/xlsx-security.test.ts`의 기존 169개 중 관련 테스트 전부 통과 (**예산 상한 테스트의 기대 메시지를 바꾸지 마세요**)
- 테스트 추가: zip이 아닌 바이트 → 로드 실패 메시지, 예산 초과 파일 → 기존 메시지

---

# P2 — 여력이 있을 때

## 작업 8. `automation-core`의 타입 안전성 확보

### 배경

`src/lib/automation-core.js`(282줄, ES5 `var` 스타일)에 `src/lib/automation-core.d.ts`를 **손으로 써서** 붙여놨고, Worker(`server/index.ts:1`)와 UI가 둘 다 import합니다.

`.js`에서 함수를 지우거나 이름을 바꿔도 **컴파일이 깨지지 않습니다.** 두 런타임의 핵심 데이터 계약이 타입 검사 바깥에 있습니다.

### 할 일

둘 중 하나를 고르세요. 1번이 근본적이지만 범위가 큽니다.

**옵션 1 (권장):** `automation-core.js`를 `.ts`로 이전하고 `.d.ts`를 삭제. DOM·DB 의존이 없는 순수 모듈이므로 이전 자체는 기계적입니다. 단, Worker와 브라우저 양쪽에서 쓰이니 **런타임 의존성을 새로 추가하지 마세요.**

**옵션 2 (최소):** `.d.ts`의 선언과 `.js`의 실제 export가 일치하는지 검사하는 테스트를 `tests/`에 추가. `core` 객체의 키 집합과 각 값의 `typeof`를 단정하면 됩니다. 함수 삭제·오타는 이것만으로도 잡힙니다.

### 함께 고칠 것

`core.validateSettings`와 `server/index.ts:154`의 `validateSettings`가 **이름은 같고 동작은 다릅니다.** 하나를 바꿔 부르세요. Worker 쪽을 `validateSettingsPayload` 같은 이름으로 바꾸는 편이 호출부가 적습니다.

### 완료 기준

- `npm run check`, `npm test` 통과
- 옵션 1을 골랐다면 `npm run build`와 `npx wrangler deploy --dry-run`도 통과 (양쪽 번들에 다 들어가는 모듈이므로 필수)

---

## 작업 9. `/api/catalog` 검색어에서 마침표가 사라지는 문제

### 배경

`server/index.ts:228`:

```js
const q = string(url.searchParams.get('q'), '검색어', 100).replace(/[\\%_*(),."\r\n]/g, ' ').trim();
```

PostgREST `or=(...)` 필터 주입을 막기 위해 필요한 처리지만, 마침표가 공백으로 바뀌면서 `MODEL-1.0`, `A1.5` 같은 **정상 검색어가 말없이 깨집니다.**

### 할 일

먼저 이것이 의도인지 판단하세요. 모델명에 마침표가 흔한 도메인이면 고쳐야 합니다.

고칠 경우: 문자를 지우는 대신 PostgREST 값 인용 규칙을 쓰세요. `or=(brand.ilike."*{q}*",...)` 형태로 값을 큰따옴표로 감싸고 내부의 `"`와 `\`만 이스케이프하면, `.`과 `,`를 보존하면서 연산자 주입을 막을 수 있습니다.

### 하지 말 것

- `%`와 `_`에 대한 처리를 없애지 마세요. `ilike` 와일드카드이므로 사용자가 넣으면 의도치 않은 광범위 검색이 됩니다. 이스케이프는 하되 보존 여부는 판단에 맡깁니다.
- 고치지 않기로 결정했다면, 해당 줄에 **왜 마침표를 지우는지 주석을 남기세요.** 다음 사람이 버그로 오해합니다.

### 완료 기준

- `tests/server.test.ts`에 `.`이 포함된 검색어 케이스 추가
- 필터 주입 시도(`,`, `)`, `.eq.` 등을 담은 검색어)가 여전히 무해함을 테스트로 보장

---

## 작업 10. `App.tsx`의 history 관리 분리

### 배경

`src/App.tsx`는 207줄이지만 `useState` 약 40개, 직접 구현한 popstate/history 가로채기(`src/App.tsx:65-90`), 드래프트 락 6종, 업로드 캐시, 라우팅이 한 컴포넌트에 들어 있습니다. 기능은 동작하지만 이 프로젝트에서 **수정하기 가장 위험한 파일**입니다.

### 할 일

**동작을 바꾸지 않는 추출만** 하세요. 범위를 history 관리로 한정합니다.

`navigation`, `restoring`, `allowedTraversal`, `popHandler`, `historyCommand`, `applyNavigation`, `go`, `requestDiscard`와 관련 `useEffect`를 `src/use-navigation.ts`(또는 `.tsx`) 커스텀 훅으로 옮기세요.

### 하지 말 것

- **동작을 "개선"하지 마세요.** 뒤로 가기 중 드래프트 확인, 차단 조건(`registrationBusy`, 각종 락, `dialog[open]`), 인덱스 복원 로직은 미묘하고 손으로 맞춰진 것입니다. 한 줄도 의미를 바꾸지 마세요.
- 다른 상태(업로드 캐시, 드래프트, 리스트 로딩)를 같은 커밋에서 건드리지 마세요.
- `useState`를 `useReducer`로 바꾸는 작업을 여기에 섞지 마세요.

### 완료 기준

- `npm run test:desktop:ui` 통과 — 특히 `desktop/tests/ui/` 아래 네비게이션·선택 인계(`selection-handoff.spec.ts`) 테스트
- `src/App.tsx`의 줄 수와 `useState` 개수가 줄어들고, 추출된 훅이 동일한 공개 인터페이스를 제공

---

## 작업 11. Supabase 프로젝트 ref 상수화

### 배경

Supabase 프로젝트 ref `giuqapykceosroauaijq`가 세 곳에 하드코딩되어 있습니다.

- `desktop/main.cjs:86` — CSP의 `connect-src`
- `desktop/main.cjs:133` — 스토리지 키 허용 정규식 `^sb-giuqapykceosroauaijq-auth-token...$`
- `wrangler.jsonc`의 `vars.SUPABASE_URL`

프로젝트를 바꾸면 세 군데를 다 찾아야 하고, 하나를 놓치면 로그인이 조용히 깨집니다(133행을 놓치는 경우가 특히 그렇습니다).

### 할 일

`desktop/config.cjs`에 ref 상수를 하나 두고 `main.cjs`의 두 곳이 그것으로부터 CSP 문자열과 정규식을 만들도록 하세요. `config.cjs`는 이미 `WEB_ORIGIN`/`APP_ORIGIN`을 보유한 설정 모듈이므로 적절한 자리입니다.

### 하지 말 것

- 정규식을 느슨하게 만들지 마세요. 현재 허용 목록은 `-auth-token`, `-auth-token-code-verifier`, `-auth-token-user` 세 개뿐이고, 이 좁음이 보안 장치입니다. ref만 변수화하고 **나머지 구조는 그대로** 두세요.
- `wrangler.jsonc`는 그대로 두세요(배포 설정이라 런타임에서 참조할 수 없습니다). 대신 `config.cjs` 상수 위에 "wrangler.jsonc의 SUPABASE_URL과 일치해야 함" 주석을 남기세요.

### 완료 기준

- ref 리터럴이 `desktop/` 안에서 한 곳에만 존재:
  ```sh
  grep -rn "giuqapykceosroauaijq" desktop/
  ```
- `npm run test:desktop` 통과

---

# P3 — 참고 사항 (작업 아님)

## 긴 줄 포맷

`server/index.ts:225`는 약 700자 한 줄이고 `:158`, `:62`도 비슷합니다. 코드 리뷰와 `git blame`이 어려워집니다.

**Codex가 임의로 재포맷하지 마세요.** 전체 재포맷은 diff를 폭파시켜 리뷰 자체를 불가능하게 만듭니다. 사람이 Prettier 도입 여부를 결정한 뒤, 도입한다면 단독 커밋으로 처리할 사안입니다.

다만 **이 지시서의 다른 작업으로 이미 수정하는 줄**이라면, 그 줄을 읽기 쉽게 쪼개는 것은 괜찮습니다.

## 데스크톱 코드 서명

`desktop/builder.json`이 `identity: "-"`(ad-hoc), `hardenedRuntime: false`, 타깃은 `dir`만입니다. 작성자 본인 Mac에서는 동작하지만 다른 Mac에서는 Gatekeeper가 막고, 자동 업데이트 경로도 없습니다.

의도한 선택일 수 있으므로 코드를 바꾸지 말고, 다른 사람에게 배포할 계획이 있는지만 사람에게 확인하세요.

---

## 작업 보고 양식

각 작업을 마치면 다음을 보고하세요.

1. 바꾼 파일과 줄 수
2. 실행한 검증 명령과 결과 (테스트 개수 포함)
3. 지시서와 다르게 한 부분이 있다면 무엇을, 왜
4. 작업 중 발견한, 지시서에 없는 문제 — **고치지 말고 보고만** 하세요
