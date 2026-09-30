# CALLA 상품 등록 툴

기존 Supabase 상품 데이터를 유지하는 React 웹앱과 Cloudflare Worker API, 사용자 Chrome에서 고도몰 소매·도매를 등록하는 로컬 실행기입니다. 디자인 기준은 [칼라몰 상품등록 툴 Figma](https://www.figma.com/design/2eInZ8qvqO2kI88cxofumv/)입니다. 기본 컬러 `#F27490` 위의 글자는 `#FFFFFF`를 사용합니다.

## 로컬 미리보기

Node.js 22 이상과 npm이 필요합니다.

```sh
npm ci
npm run dev:demo
```

[http://127.0.0.1:5173](http://127.0.0.1:5173)에서 관리자·뷰어를 각각 확인할 수 있습니다. 예시 데이터는 해당 브라우저의 localStorage에만 저장됩니다. 운영 DB와 Chrome 실행기는 호출하지 않습니다. 이 모드는 개발 서버에서만 동작하며 배포 빌드에는 들어가지 않습니다.

## 실제 연결

1. `.dev.vars.example`을 `.dev.vars`로 복사하고 기존 Supabase 프로젝트의 publishable key와 service role key를 로컬 파일에 설정합니다. service key를 브라우저 코드나 Git에 넣지 않습니다.
2. Supabase Auth에 사용할 계정을 준비하고 관리자 도구로 해당 계정의 **app_metadata.calla_role**을 `admin` 또는 `viewer`로 지정합니다. 사용자 수정이 가능한 user_metadata는 권한으로 인정하지 않습니다. 대안으로 `wrangler.jsonc`의 `ADMIN_EMAILS`에 이메일 인증이 완료된 관리자 이메일을 지정할 수 있습니다.
3. 터미널 두 개에서 아래 명령을 각각 실행합니다.

```sh
npm run dev:api
```

```sh
npm run dev
```

기존 Supabase 프로젝트 URL은 `wrangler.jsonc`에 설정되어 있습니다. 테이블·상품 UUID·HTML·가격·카테고리·등록 결과를 이전하지 않고 그대로 사용합니다. 웹의 초안 저장은 기존 `save_product_draft` RPC를 사용합니다. 상품 선택과 등록 완료 상태는 독립적이며 일반 편집은 `done/done_at`을 덮어쓰지 않습니다. `/view/?list=UUID` 및 DOM 자동화 데이터도 유지합니다.

로컬 실행기 설치와 사용자 Chrome 로그인 절차는 [runner/README.md](runner/README.md)를 참고하세요. 웹사이트에서 저장 → 실행기 연결 → 상품·채널 검토 → Chrome 로그인 → 검토 모드 확인 → 실제 등록 순서입니다. 스마트스토어 자동 등록은 구현하지 않았습니다. 기존 Naver 관련 데이터는 유지합니다.

## 구현 범위

- 등록 요청 리스트 생성·검색·복제·삭제, 상품 추가·편집·일괄 설정·복제·삭제
- XLSX/CSV 불러오기와 템플릿, JSON 내보내기
- 썸네일 업로드, 상세 이미지 주소 생성·검증·바로가기 링크·HTML
- 브랜드·카테고리·이미지 폴더 설정, 기존 상품 검색
- 관리자 편집·실행, 뷰어 조회, 서버 권한 검사
- 로컬 실행기 연결·로그인 대기·검토·중단·결과 로그·중복 등록 방지

복제 상품은 원본의 정리 대상 업로드 썸네일을 공유하지 않습니다. 해당 썸네일을 다시 첨부해야 합니다. 상세 이미지와 일반 외부 이미지 주소는 유지됩니다. 이미지 폴더 설정은 주소 생성에 사용할 이름 목록이며 실제 원격 서버에 디렉터리를 만드는 기능은 아닙니다.

## 검증

```sh
npm test
npm run test:runner
npm run build
npx wrangler deploy --dry-run
```

자동 테스트는 fake Worker/DB/Chrome 엔진을 사용하며 운영 데이터를 변경하지 않습니다. 실제 고도몰 입력·등록과 관리자·뷰어 실계정 검수는 인증 설정 후 별도로 수행해야 합니다.

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

Worker 코드와 정적 자산 경로는 `wrangler.jsonc`에 정의되어 있습니다. `dist/`는 빌드로 생성하므로 Git에 포함하지 않습니다. 로컬 Chrome 실행기는 `runner/`에 포함되어 있으며 Worker와 별도로 사용자 컴퓨터에서 실행합니다.

Cloudflare Worker secrets에 아래 두 값을 설정합니다.

```sh
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

현재 운영 사이트는 익명 Supabase 접근을 사용하는 기존 구조입니다. **새 로그인 화면 배포만으로 기존 익명 API가 차단되지는 않습니다.** 운영 전환 때 구 사이트·구 실행기의 사용을 멈추고, 백업과 새 계정/키 연결을 확인한 뒤 [supabase/cutover-review.sql](supabase/cutover-review.sql)의 접근 정책 전환을 함께 적용해야 합니다. 이 스크립트는 자동 마이그레이션이 아니며 이번 구현에서 실행하지 않았습니다. 행을 이동하거나 삭제하는 내용은 없습니다.

새 Worker URL에서 실계정 조회·저장·뷰어 쓰기 거절·실행기 검토를 확인한 후 기존 도메인을 교체합니다. 별도 배포 도메인을 사용하면 실행기의 `CALLA_ALLOWED_ORIGINS`에 정확한 HTTPS origin을 추가합니다. API 동작과 전환 한계는 [backend 계약 기록](docs/backend-contract-audit.md)에 정리되어 있습니다.

현재 목록 저장은 기존 RPC의 마지막 저장 우선 방식입니다. 같은 리스트를 여러 창에서 동시에 편집하는 충돌 병합은 지원하지 않습니다. 설정 저장은 revision 비교로 충돌을 감지합니다. 고도몰 저장 결과가 불명확하면 자동 재시도하지 않고 확인 대기로 멈춥니다.
