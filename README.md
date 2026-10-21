# CALLA 상품 등록 툴

기존 Supabase 상품 데이터를 유지하는 React 웹앱·Mac 앱과 Cloudflare Worker API입니다. 현재 버전은 **0.6.7**입니다. 0.4.0부터 고도몰 공식 API로 소매몰·도매몰 상품을 직접 조회·등록·수정하고 결과를 확인합니다. 상품 삭제는 고도몰 관리자에서만 진행합니다. 자동 등록에 로컬 실행기나 관리자 Chrome 로그인이 필요하지 않습니다. 디자인 기준은 [칼라몰 상품등록 툴 Figma](https://www.figma.com/design/2eInZ8qvqO2kI88cxofumv/)입니다. 기본 컬러 `#F27490` 위의 글자는 `#FFFFFF`를 사용합니다.

## 0.6.7 상품 편집·등록·조회 업데이트

상품 편집에서 빨간색 머리말을 설정하고, 소매·도매 카테고리를 여러 개 추가할 수 있습니다. 첫 카테고리가 대표이며, 기존 이름에서 분리가 명확한 머리말만 자동으로 인식합니다. 편집을 목록에 반영한 뒤 `⌘S`(Windows `Ctrl+S`)로 리스트를 저장합니다. 편집 창을 닫을 때는 취소 확인을 표시합니다.

신규 등록 공급사는 두 몰 모두 본사(`1`)로 고정하며, 등록 진행률은 성공한 상품·몰 작업 수를 기준으로 표시합니다. 상품 조회의 노출·판매 설정은 토글로 바뀌었고, 도매 표에는 정가·기본가·마스터가 열을 표시합니다. 마스터가는 이번 버전에서 `—`로 표시합니다. 무한 재고·품절 표시와 사이드바 그룹도 정리했습니다. [0.6.7 구현·검증 기록](docs/update-067-verification.md)을 참고하세요.

## 0.5.2 보안 수정

공개 DB 접근을 차단하고, 거절된 고도몰 요청이 공유 대기열을 연장하지 않도록 수정했습니다. XLSX 압축 해제량·셀 범위·병합·정의된 이름을 파싱 전에 제한하고, 라이브러리 보안 패치를 적용했습니다. 회귀 검증은 [DB 권한·대기열 테스트](tests/security-database.sql)와 [XLSX 입력 제한 테스트](tests/xlsx-security.test.ts)에 있습니다.

## 0.5.1 상품 편집·조회 개선

원산지는 대한민국·중국·일본·미국 또는 영어 국가명을 선택하여 `Made in 국가명`으로 저장합니다. 도매 정가는 소매 판매가와 연동하며 직접 입력 체크로 별도 금액을 저장합니다. 등록 상품명은 HTML 문자를 포함해 기본 상품명(`goodsNmFl=d`, `goodsNm`)에만 그대로 전송합니다. 조회 상세는 기본 설정·이미지 설정으로 정리했습니다. 요청 상품 표는 썸네일과 10·20·30·50·100개 보기를 제공하고, 자동 등록의 현재 리스트 전체선택과 마우스 뒤로·앞으로 이동을 지원합니다.

## 0.5.0 새 디자인

Figma `06 · CALLA-AUTOMATE 새 디자인` 페이지를 기준으로 웹과 Mac의 헤더·사이드바, 요청 리스트와 상품 표, 상품 편집·이미지 설정, 자동 등록·결과, 상품 조회·변경 비교, 인덱싱, 설정·계정 화면을 통일했습니다. 본문 내부 스크롤과 고정 작업 하단을 사용하며, 작은 Mac 창은 60px 사이드바로 표시합니다. 목록에 반영 → 리스트 저장 → 등록 전 검토의 단계와 원문 HTML, 네 가지 가격, 재고, 소매·도매별 결과를 유지합니다. [디자인 및 검증 기록](docs/redesign-050-verification.md)을 참고하세요.

## 0.4.0 고도몰 API

**상품 조회** 메뉴에서 소매몰·도매몰을 선택해 상품명·상품번호·모델번호·자체상품코드로 검색합니다. 상품 상세의 **수정** 또는 저장된 상품의 **API 등록**에서 내용을 확인하고 실행합니다. 등록·수정은 같은 몰에서 재조회하여 반영을 확인한 뒤 완료 처리합니다. 응답 유실 시 작업 이력의 **실제 결과 다시 확인**을 사용하며 등록을 다시 전송하지 않습니다. 삭제 버튼과 삭제 API 실행은 제공하지 않습니다.

Cloudflare의 **Workers & Pages → calla-automate → Settings → Variables and Secrets**에 아래 이름을 **Secret**으로 저장합니다. 각각 JSON이 아닌 키 문자열 한 개입니다. 빌드 환경변수가 아닌 Worker 런타임에 설정합니다.

| Secret | 용도 |
|---|---|
| `GODOMALL_PARTNER_KEY` | 두 몰 공통 제휴사 키 (`partner_key`) |
| `GODOMALL_CALLAMEDIA_API_USER_KEY` | 소매몰 www.callamedia.kr 사용자 키 (`key`) |
| `GODOMALL_CALLAMEDIA1_API_USER_KEY` | 도매몰 www.callamedia.co.kr 사용자 키 (`key`) |

Worker 배포 전에 `supabase/migrations/20261007032806_godomall_api_040.sql`과 `supabase/migrations/20261007050051_api_catalog_sync.sql`을 순서대로 적용해야 합니다. 등록·수정 데이터 URL의 공개 HTTPS 주소는 `GODOMALL_PUBLIC_ORIGIN`이며 운영 기본값은 `https://cauto.yeseo.im`입니다. 로컬의 localhost 주소만으로는 고도몰이 XML에 접근할 수 없습니다.

공식 API에 없는 도매 회원등급별 가격은 전송하지 않으며, 기본 판매가 등록을 막지는 않습니다. 수정 시 원본 조회 경고가 있어도 입력·검토·실행할 수 있습니다. 실제 `goodsMustInfo` 응답의 빈 값과 인식 가능한 JSON을 공식 `goodsMustInfoData`로 변환해 전송합니다. 고도몰 스펙상 미전송 추가정보·필수정보는 제거되므로 복원할 수 없는 항목은 검토 화면에 안내합니다. API 필수값 검사와 중복 전송 방지는 유지합니다. 사용 방법, 파일별 변경, 테스트와 실제 연동 검증 범위는 [0.4.0 구현·검증 기록](docs/godomall-040-worklog.md)을 참고하세요.

2026-10-16부터 신규 고도몰 API 등록은 상품 이미지 4종을 고도몰 기본 저장소(`imageStorage=local`)로 가져오고 몰별 설정 크기로 리사이즈하도록 요청합니다. 기존 URL 등록 상품은 자동 전환하지 않습니다. 적용 범위와 실등록 검증 한계는 [이미지 저장소 변경 기록](docs/godomall-local-images-verification.md)을 확인하세요.

## macOS 앱

고도몰 API와 연결되는 Apple Silicon용 앱을 제공합니다. 웹과 같은 계정·Supabase 데이터를 사용하며 창을 닫아도 메뉴 막대에서 등록 작업이 계속됩니다. 설치·빌드·검증 방법은 [desktop/README.md](desktop/README.md)를 참고하세요.

## 로컬 미리보기

Node.js 22 이상과 npm이 필요합니다.

```sh
npm ci
npm run dev:demo
```

[http://127.0.0.1:5173](http://127.0.0.1:5173)에서 관리자·뷰어를 각각 확인할 수 있습니다. 예시 데이터는 해당 브라우저의 localStorage에만 저장됩니다. 운영 DB와 Chrome 실행기는 호출하지 않습니다. 이 모드는 개발 서버에서만 동작하며 배포 빌드에는 들어가지 않습니다.

## 실제 연결

1. `.dev.vars.example`을 `.dev.vars`로 복사하고 기존 Supabase 프로젝트의 publishable key와 service role key를 로컬 파일에 설정합니다. service key를 브라우저 코드나 Git에 넣지 않습니다.
2. 최초 관리자 설정용 `CALLA_SETUP_TOKEN`을 `.dev.vars`에 설정합니다. 24자 이상의 무작위 코드를 사용하고 `/setup`에서 관리자 이름과 비밀번호를 정합니다. 첫 관리자 아이디는 `calla-admin`입니다. 생성 후 초기 설정 코드를 삭제합니다. 기존 이메일 계정은 계속 로그인할 수 있습니다.
3. 회원가입을 받으려면 `CALLA_SIGNUP_CODE`를 `.dev.vars`에 설정합니다. 24~512자의 무작위 코드를 사용하고 가입할 사람에게만 전달합니다. 이 값을 설정하지 않으면 `/signup`은 503으로 막히고 기존 계정의 로그인만 동작합니다. 관리자가 `/admin`에서 직접 계정을 만드는 방식만 쓸 경우에는 설정하지 않아도 됩니다.
4. 터미널 두 개에서 아래 명령을 각각 실행합니다.

```sh
npm run dev:api
```

```sh
npm run dev
```

`supabase/migrations/`의 마이그레이션은 Worker보다 먼저 적용합니다. 특히 `20261019000000_product_list_summaries.sql`은 `/api/lists`가 호출하는 `product_list_summaries` 함수를 만듭니다. 이 함수가 없는 DB에 Worker를 배포하면 등록 요청 목록 화면이 "데이터베이스 요청을 완료하지 못했습니다" 502로 비어 있게 됩니다. 함수 누락을 안내하는 별도 메시지는 없으므로 순서를 지켜 주세요.

운영 반영 순서는 마이그레이션 적용 → 목록 화면 확인 → `npm run deploy`입니다. `.dev.vars`는 로컬 전용이므로, `.dev.vars.example`에 있는 값은 배포 환경에서 `npx wrangler secret put <이름>`으로 각각 설정합니다. 새 Secret을 추가한 뒤에는 배포 후 해당 기능을 한 번 확인합니다. `CALLA_SIGNUP_CODE`가 비어 있으면 회원가입만 503으로 막히고 나머지 기능은 정상 동작합니다.

기존 Supabase 프로젝트 URL은 `wrangler.jsonc`에 설정되어 있습니다. 테이블·상품 UUID·HTML·가격·카테고리·등록 결과를 이전하지 않고 그대로 사용합니다. 웹의 초안 저장은 기존 `save_product_draft` RPC를 사용합니다. 상품 선택과 등록 완료 상태는 독립적이며 일반 편집은 `done/done_at`을 덮어쓰지 않습니다. `/view/?list=UUID` 및 DOM 자동화 데이터도 유지합니다.

상품 저장 → 자동 상품 등록 → 등록 전 검토 → 몰별 배송비·브랜드 확인(공급사 본사 고정) → API 검증 결과 검토 → 확인 체크 후 등록 순서입니다. 검토 전에는 실제 상품을 전송하지 않습니다. 결과가 불명확하면 다음 전송을 멈추고 상품 조회의 작업 이력에서 재조회합니다. 카테고리·브랜드는 상품 카테고리 화면의 몰별 업데이트 버튼으로 가져오며, 새 분류는 고도몰 관리자에서 추가합니다. 스마트스토어 자동 등록은 구현하지 않았습니다. 기존 Naver 관련 데이터는 유지합니다.

## 구현 범위

- 로그인 아래 회원가입 바로가기, 이메일 없이 아이디 가입·로그인, 관리자 승인 대기
- `/admin` 사용자 계정 관리: 계정 생성·승인·권한 변경·이용 중지·비밀번호 재설정·삭제
- 등록 요청 리스트 생성·검색·복제·삭제, 상품 추가·편집·일괄 설정·복제·삭제
- XLSX/CSV 불러오기와 템플릿, JSON 내보내기. 병합된 여러 줄 제목을 인식하고, 파일 선택 시 상품 수와 상품명 누락을 미리 안내합니다. 모델명 등이 있는 행은 상품명이 없어도 초안으로 가져올 수 있습니다.
- 썸네일 업로드, 상세 이미지 주소 생성·검증·바로가기 링크·HTML
- 판매 재고(무한정 판매 / 재고량에 따름)와 상품 재고 설정. 기본값은 무한정 판매·0개입니다.
- 상세페이지에 원문 텍스트·HTML 추가, 이미지와 텍스트의 위·아래 순서 변경
- 브랜드·카테고리·이미지 폴더 설정, 기존 상품 검색. 상품 편집에서는 카테고리 경로와 코드를 검색해 선택하며, 관리 화면에서는 상위 분류별로 하위 목록을 조회합니다.
- 관리자 편집·실행, 뷰어 조회, 서버 권한 검사
- API 연결 상태·등록 전 검토·몰별 진행과 결과·응답 유실 재확인·중복 등록 방지

복제 상품은 원본의 정리 대상 업로드 썸네일을 공유하지 않습니다. 해당 썸네일을 다시 첨부해야 합니다. 상세 이미지와 일반 외부 이미지 주소는 유지됩니다. 이미지 폴더 설정은 주소 생성에 사용할 이름 목록이며 실제 원격 서버에 디렉터리를 만드는 기능은 아닙니다.

## 검증

```sh
npm test
npm run test:desktop
npm run test:desktop:ui
npm run build
npx wrangler deploy --dry-run
```

자동 테스트는 격리된 Worker/DB/API 응답과 브라우저·Electron 테스트 세션을 사용하며 운영 데이터를 변경하지 않습니다. 실제 고도몰 등록·수정 검증은 별도로 수행하며 버전별 기록에서 범위를 구분합니다.

2026-10-02 카테고리·이미지 폴더 갱신과 웹·Mac 0.2.5 검증 결과는 [업데이트 기록](docs/category-update-verification.md)에 있습니다.

Mac 0.2.6의 한국식 날짜 표시와 사용 중에만 보이는 스크롤바 변경은 [날짜·스크롤바 검증 기록](docs/date-scrollbar-verification.md)에 있습니다.

## GitHub와 Cloudflare 전환

저장소: [iam-yeseo/calla-automate](https://github.com/iam-yeseo/calla-automate). Cloudflare Workers에서 이 저장소를 연결할 때 아래 설정을 사용합니다.

| 항목 | 값 |
|---|---|
| 프로덕션 브랜치 | `main` |
| 루트 디렉터리 | 저장소 루트 (`/`) |
| Node.js | 22 이상 |
| 설치 명령 | `npm ci` |
| 빌드 명령 | `npm run build` |
| 배포 명령 | `npx wrangler deploy` |
| Worker 이름 | `calla-automate` |

Worker 코드와 정적 자산 경로는 `wrangler.jsonc`에 정의되어 있습니다. `dist/`는 빌드로 생성하므로 Git에 포함하지 않습니다. Mac 앱도 같은 Worker API를 호출합니다. 과거 실행기 소스는 Git 이력에서 확인할 수 있으며 현재 앱에서 시작하거나 패키징하지 않습니다.

Cloudflare Worker의 **Settings → Variables and Secrets**에서 아래 두 값을 **Secret**으로 설정합니다. 빌드 전용 변수에만 등록하면 실행 중인 Worker에서 사용할 수 없습니다. `wrangler.jsonc`의 `keep_vars: true`는 GitHub 자동 배포 때 대시보드에서 등록한 런타임 변수를 보존합니다. 실제 키 값은 소스나 Git에 넣지 않습니다.

```sh
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

첫 관리자 계정은 아래 순서로 준비합니다.

1. Supabase **Authentication → Sign In / Providers → User Signups**에서 **Allow new users to sign up**을 끕니다. 회원가입은 이 앱의 Worker가 Admin API로 처리하므로 앱의 가입 기능은 계속 사용할 수 있습니다. Supabase 기본 가입 경로를 닫아 예약된 관리자 아이디를 외부에서 선점하지 못하게 합니다.
2. `openssl rand -hex 24` 등으로 초기 설정 코드를 생성하고 Cloudflare Worker의 **Variables and Secrets**에 `CALLA_SETUP_TOKEN`이라는 **Secret**으로 저장합니다. 코드를 소스·Git·URL에 넣지 않습니다.
3. 새 사이트의 `/setup` 또는 로그인 화면의 **첫 관리자 계정 설정**에서 코드·이름·비밀번호를 입력합니다. `calla-admin` 계정 생성이 완료되면 로그인합니다.
4. Cloudflare에서 `CALLA_SETUP_TOKEN`을 삭제합니다. 첫 관리자 계정은 다른 관리자도 삭제·정지·강등할 수 없습니다. 이름과 비밀번호는 변경할 수 있습니다.

회원가입 페이지는 `/signup`입니다. 아이디는 영문 소문자·숫자·점·밑줄·하이픈 3–32자이며 대소문자는 구분하지 않습니다. 이메일 주소를 입력할 필요가 없습니다. 가입자는 승인 대기 상태이며, 관리자가 `/admin`에서 조회자 또는 관리자로 승인합니다. 비밀번호를 잊은 경우 관리자가 재설정합니다. 이메일로 비밀번호를 보내는 기능은 제공하지 않습니다.

계정 관리 API는 매 요청마다 Supabase에서 현재 권한과 계정 상태를 확인합니다. 이용 중지·승인 취소 후 기존 로그인 세션도 Worker 접근이 거절됩니다. 공개 가입·로그인·초기 설정 요청에는 Cloudflare Rate Limiting 바인딩을 적용합니다. 초기 관리자 생성에 실패했을 때 기존 계정을 자동으로 관리자로 승격하지 않습니다.

2026-10-08 보안 마이그레이션으로 상품 관련 테이블 5개와 초안 저장 RPC의 익명·직접 사용자 접근을 차단했습니다. 썸네일 쓰기도 Worker만 허용하며 기존 공개 이미지 읽기는 유지합니다. 현재 웹·Mac·복구 실행기는 인증된 Worker API를 사용합니다. `supabase/cutover-review.sql`은 역사적 검토안이며 실제 적용본은 `supabase/migrations/20261008024948_close_direct_product_access.sql`입니다. 데이터 행은 변경하지 않았습니다.

새 Worker URL에서 실계정 조회·저장·뷰어 쓰기 거절·실행기 검토를 확인한 후 기존 도메인을 교체합니다. 별도 배포 도메인을 사용하면 실행기의 `CALLA_ALLOWED_ORIGINS`에 정확한 HTTPS origin을 추가합니다. API 동작과 전환 한계는 [backend 계약 기록](docs/backend-contract-audit.md)에 정리되어 있습니다.

현재 목록 저장은 기존 RPC의 마지막 저장 우선 방식입니다. 같은 리스트를 여러 창에서 동시에 편집하는 충돌 병합은 지원하지 않습니다. 설정 저장은 revision 비교로 충돌을 감지합니다. 고도몰 저장 결과가 불명확하면 자동 재시도하지 않고 확인 대기로 멈춥니다.

Mac 0.2.7의 고도몰 저장 확인과 중단된 결과 복구 개선은 [저장 결과 검증 기록](docs/save-recovery-verification.md)에 있습니다.

웹과 Mac 0.3.0의 재고 설정·상세페이지 텍스트 추가·순서 변경은 [재고·상세페이지 검증 기록](docs/stock-detail-verification.md)에 있습니다. 자동 등록에는 실행기 1.1.0 이상이 필요하며 Mac 0.3.0에 포함되어 있습니다.
