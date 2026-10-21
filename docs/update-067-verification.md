# 0.6.7 상품 편집·등록·조회 업데이트 검증

검증일: 2026-10-21 (KST). 웹과 설치 Mac 앱 0.6.7 반영을 확인했다.

사용자 제공 `CALLA AUTOMATE 업데이트-261021-01.md`, `Progress.md`, `Toggle.md`와 후속 확정 답변을 기준으로 웹과 Electron의 공통 기능을 변경했다. 기능·등록 흐름은 로컬 fixture로 검사하고, 운영 웹과 설치 앱은 실계정 조회 및 편집 취소까지 확인했다. 실제 운영 고도몰 상품 등록·수정 API 쓰기는 실행하지 않았다.

## 변경 사항과 확정된 동작

| 항목 | 적용 동작 |
| --- | --- |
| 상품명 머리말 | `머리말 사용`과 별도 입력란을 제공한다. 해제하면 입력란이 비활성화되고 입력값은 재편집을 위해 보존된다. 명확한 기존 머리말 HTML만 자동 분리하고, 해석이 애매한 형식은 원문을 유지한다. 목록 머리말 색상은 `#EF4036`이다. |
| 몰별 복수 카테고리 | 소매·도매에 각각 카테고리를 반복 추가한다. 같은 코드는 중복 선택할 수 없다. 첫 항목이 대표이며, 첫 항목을 제거하면 다음 항목이 대표가 된다. 저장한 순서를 유지하고 API에는 `cateCd`로 대표, `allCateCd`로 전체 선택을 전달한다. |
| 리스트 저장 단축키 | 편집 내용을 `목록에 반영`한 뒤 Cmd+S로 리스트를 저장한다. 모달이 열려 있거나 저장할 변경이 없거나 저장·등록 작업 중이면 단축키로 추가 저장하지 않는다. 웹은 Ctrl+S도 지원한다. |
| 편집 닫기 확인 | 편집 모달의 바깥 클릭·Esc·닫기·취소에서 확인창을 띄운다. `계속 편집`은 입력값을 유지하고, `편집 취소`를 선택하면 닫는다. 정상적인 목록 반영·변경 검토 진행은 기존 흐름을 따른다. |
| 공급사 | 소매·도매 공급사 선택 UI를 제거했다. 신규 등록 경로는 서버에서 공급사 `1`(본사)을 사용한다. |
| 등록 진행률 | 분모는 선택한 상품과 몰의 등록 작업 수, 분자는 결과 확인까지 성공한 작업 수다. 상품 1개를 두 몰에 등록하면 총 2건이며 한 몰만 확인되면 50%다. 실패·확인 필요·중단 시 마지막 실제 완료 비율과 사유를 유지한다. |
| 상품 조회·수정 | PC·모바일 노출·판매 4개 상태를 Toggle로 변경했다. 변경 전·후 검토를 거친 실행 흐름을 유지한다. |
| 도매 가격 열 | `정가 / 베이직 판매가 / 마스터 판매가`로 나눴다. 사용자가 확정한 대로 마스터는 열만 만들고 `—`를 표시한다. 마스터 가격을 추정하거나 API에 추가 전송하지 않는다. |
| 재고·품절 | 무한 판매 재고는 `∞`, 유한 재고가 0이면 `0개`다. 명시적 품절 또는 재고 사용 상태의 0 이하 재고는 회색 행과 브랜드색 `품절` 표시를 사용한다. 상품명 클릭으로 상세 모달을 여는 기능은 유지한다. |
| 사이드바 | 상단 `상품 운영` 문구를 제거하고 `상품 등록 / 상품 조회 및 수정 / 등록 설정 / 일반 설정`으로 메뉴를 묶었다. |

`automation` JSON에 선택 카테고리와 머리말 정보를 저장하며 기존 단일 카테고리 데이터도 정규화한다. 테이블·열을 추가하지 않으므로 DB 마이그레이션은 필요하지 않다.

## 로컬 검증 결과

| 검사 | 결과와 범위 |
| --- | --- |
| 전체 단위 검사 | 최종 193/193 통과. 미지원·불완전·잘못된 HTML 엔티티 보존과 대문자 hex·한 번만 해석하는 엔티티 검사 포함. |
| 데스크톱 검사 | 12/12 통과. |
| 기능 UI | 9/9 통과. 웹·Electron 상품 편집, 복수 카테고리, 저장 단축키, 모달 확인, 공급사 고정, 진행률, 상품 조회를 fixture로 검사. |
| 회귀 UI | 22/22 통과. 위 기능 UI의 신규 업데이트 검사 2개가 포함되므로 9+22를 고유 검사 수로 합산하지 않는다. |
| 최종 기능 재검사 | 엔티티 수정 후 웹·Electron 신규 기능 2/2 재검사 통과. |
| 빌드·앱 패키징 | TypeScript·production build·arm64 패키징 통과. 앱 서명 및 설치본·ZIP 무결성 일치. |
| API 매핑·등록 확인 | 복수 카테고리의 정규화·저장·XML 생성·대표 항목·동일 몰 코드 검증 및 응답 대조를 fixture로 확인. 고도몰이 상위 카테고리를 함께 반환하는 경우도 처리한다. |
| 중단·불확실한 응답 | fixture에서 마지막 확인 완료율을 유지하고 확인 필요 안내를 표시하며, 불확실한 등록을 자동 재전송하지 않는 동작을 검사. |

운영 고도몰의 실제 등록 성공을 위 결과만으로 주장하지 않는다. 운영 쓰기 없이 매핑과 사용자 흐름을 검증한 결과다.

## 로컬 증거

다음 경로는 저장소 루트 기준이다.

- 검사 로그: `test-results/update-067/unit-tests.log`, `final-unit-tests.log`, `feature-ui-tests.log`, `final-feature-ui-tests.log`, `regression-ui-tests.log`.
- 빌드·패키징: `test-results/update-067/build.log`, `package.log`, `package-verification.json`.
- 편집·닫기 확인·저장 화면: `test-results/update-067/{web,desktop}-{editor,close-confirm,saved-list}.png`.
- 등록 진행 화면: `test-results/update-261021/web-registration-halfway.png`, `{web,desktop}-registration-progress.png`, `uncertain-registration-progress.png`.
- 조회 화면: `test-results/update-261021/{web,desktop}-wholesale-table.png`, `{web,desktop}-status-toggles.png`.
- 기능 검사 소스: `desktop/tests/ui/update-067.spec.ts`, `api-workflow.spec.ts`, `godomall.spec.ts`.
- 데이터·매핑 검사 소스: `tests/product-editor-data.test.ts`, `tests/goods-display.test.ts` 및 기존 카테고리 검증 검사.

구현 근거는 `src/ProductEditor.tsx`, `src/lib/automation-core.js`, `src/App.tsx`, `src/ui.tsx`, `src/Automation.tsx`, `src/Godomall.tsx`, `src/goods-display.ts`, `src/components/ui/{Progress,Toggle}.tsx`, `server/index.ts`, `server/godomall-mapping.ts`다. Progress·Toggle은 기존 디자인 토큰과 전용 CSS를 사용한다.

## 운영 웹 및 설치 앱

- 운영 URL: https://cauto.yeseo.im/
- Worker version: `5803fbf4-87f0-45f9-b016-b3511bacf3d2`.
- `wrangler deploy --keep-vars --tag 0.6.7`로 기존 운영 변수를 보존해 배포했다.
- 운영 HTML, JS, CSS, XLSX가 최종 `dist`와 바이트 단위로 일치한다. `/api/config`는 HTTP 200이다. 증거: `test-results/update-067/http-verification.json`.
- Chrome과 설치 앱에서 기존 로그인과 12개 리스트 조회, 개정 사이드바를 확인했다. 웹 상품 편집의 머리말·복수 카테고리 UI와 닫기 경고를 확인하고 취소했다.
- 두 표면의 운영 도매 조회에서 정가·베이직·마스터 `—`, 무한 판매와 품절 상태를 확인했다. 설치 앱에서 품절 상품 상세를 열고 PC 노출 토글을 임시 변경한 뒤 취소하여 저장하지 않았다.
- Mac 설치 위치: `/Users/callam4/Applications/CALLA.app`, 버전 0.6.7, arm64.
- `codesign --verify --deep --strict` 통과. 기존 방식의 ad-hoc 서명이며 공증 배포를 검증한 기록은 아니다.
- 빌드·설치본·ZIP의 `app.asar` SHA-256: `b0c49a3414f228ceba59679ea3c89ee67ab51e9025a91fb601735680c41987c6`.
- 배포 ZIP: `release/CALLA-0.6.7-mac-arm64.zip`, 129,628,695 bytes.
- ZIP SHA-256: `82894dbb0796f27651dd885c9ce388d28f630243065365067046b52348cdfa7e`.
- 이전 앱: `release/previous/CALLA-0.6.6-before-update-067.app`.

운영 검증은 조회·편집 취소 범위이며 실제 상품 등록·수정은 수행하지 않았다. DB 데이터와 사용자 세션을 이전하거나 초기화하지 않았다.

## 디자인 및 보관 위치

- [Figma 개정 영역](https://www.figma.com/design/2eInZ8qvqO2kI88cxofumv/?node-id=54-4022): 기존 `06 · CALLA-AUTOMATE 새 디자인` 페이지에 개정 화면 6개와 상태 예시 3개 추가. Pretendard·기존 컴포넌트·토큰을 재사용하고 원본 화면을 보존했다. 검증 기록은 `design/update-261021/`에 있다.
- 소스 저장소: [iam-yeseo/calla-automate](https://github.com/iam-yeseo/calla-automate), `main`.
- Drive 백업 위치: [01_Vibe Code / CALLA-AUTOMATE](https://drive.google.com/drive/folders/1zmAZYF-BRr53rGswIWL7wpDvlCgb7j15).
- [Mac 앱 ZIP](https://drive.google.com/file/d/1uCvJiHTkRNBoCAJiKwVH6yUW-Xlg8QmN/view)은 Drive 웹 업로드 완료를 확인했다. 연결 도구의 100MiB 제한을 초과하여 웹 업로드를 사용했다.
- 최종 소스 커밋, 백업 파일의 크기·해시와 Drive 읽기 확인은 배포 폴더의 `CALLA-0.6.7-release-manifest.json`에 기록한다. 소스 백업에는 로컬 비밀키·계정 세션·node_modules를 포함하지 않는다.
