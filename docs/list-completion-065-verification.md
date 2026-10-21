# CALLA 0.6.5 — 등록 완료 리스트의 대기 표시 수정

2026-10-19 · 운영 웹과 설치 Mac 앱 적용 및 검증 완료.

## 원인과 수정

리스트 상태 계산(`src/domain.ts`의 `listState`)은 `doneCount === total`인 수동 완료만 검사했다. 공식 고도몰 API의 성공 처리는 채널별 등록 결과를 갱신하고 상품의 수동 완료 플래그는 별도로 유지한다. 따라서 실제 등록은 성공했지만 수동 완료를 누르지 않은 리스트가 등록 대기로 남았다. 새 DB 집계 함수의 수치 오류는 아니었다.

운영에서 확인한 대상:

| 리스트 | 상품 수 | 수동 완료 | 소매 성공/필요 | 도매 성공/필요 | 실패·진행 | 수정 전→후 |
|---|---:|---:|---|---|---|---|
| 261012-록스톤 신제품(재업) | 6 | 0 | 6/6 | 6/6 | 0 | 등록 대기→작업 완료 |
| 261016-중고상품 2건 등록 | 2 | 0 | 2/2 | 2/2 | 0 | 등록 대기→작업 완료 |

실패→진행 중 우선순위를 유지하면서, 전체 수동 완료이거나 필요한 소매·도매 등록이 모두 성공하면 완료로 표시하도록 수정했다. 빈 목록·필요 채널 0/0·부분 등록·누락된 집계는 자동 완료하지 않는다. 한 채널만 필요한 목록은 해당 채널이 전부 성공하면 완료다. `done`·`done_at`, 상품 정보, 등록 이력, 썸네일 정리 규칙은 변경하지 않았다. 자동 상품 등록 화면의 공통 목록 상태도 같은 함수를 사용한다.

## 검증

- 수정 전 새 회귀 테스트로 문제 재현: 전 채널 성공인데 pending 반환.
- 수정 후 도메인 17/17, 전체 테스트 182/182, 데스크톱 12/12 통과.
- 웹·Electron 집중 UI 2/2 통과. 완료·부분 대기·실패·진행·대상 없음·빈 목록의 배지와 상태 필터 검증. 첫 UI 실행의 장식 아이콘 텍스트 매칭 문제는 테스트 선택자만 고쳐 해결했다.
- 타입 검사·웹 빌드·Worker dry-run·Mac 패키징 통과.
- 운영 웹과 설치 0.6.5 앱에서 위 두 리스트 모두 실제로 **작업 완료** 표시 확인. 기존 로그인 유지.
- 운영 HTML 및 JS/CSS 5개가 dist와 바이트/SHA-256 일치. 루트·설정 HTTP 200, 무인증 목록 401, 웹 콘솔 오류 0개.
- 설치·패키지·ZIP 추출본 app.asar 일치, 서명 검증과 ZIP CRC 통과.

로그·화면: `test-results/list-completion-065/`. [운영 웹 행 검증](../test-results/list-completion-065/live-web-rows.json), [HTTP 검증](../test-results/list-completion-065/http-verification.json), [UI 회귀 결과](../test-results/list-completion-065/desktop-ui-retry.log), [설치 결과](../test-results/list-completion-065/installed-after.json).

## 배포 식별

- 웹: [cauto.yeseo.im](https://cauto.yeseo.im/), Worker `bc39d744-bc54-4cb4-bfab-e7a693a96946`, tag `0.6.5`.
- 설치: `/Users/callam4/Applications/CALLA.app` 0.6.5 arm64.
- 백업: `release/previous/CALLA-0.6.4-before-list-completion-065.app`.
- ZIP: `release/CALLA-0.6.5-mac-arm64.zip`, SHA-256 `b450d6454d2c02014d5758e53a8fd9c4d0b39ba3b22b8ffc60a8aaba502af42c`.
- app.asar SHA-256: `d603b3ecc906938c7c03358f47779b5cd664de3f75524b89a3bb42f506731e5f`.

기존 운영 변수·Secret을 유지했고 추가 DB 마이그레이션은 없다. 실제 상품 재등록이나 수동 완료값 강제 변경은 하지 않았다. 0.6.4 검증에서 집계 수치 보존만 확인하고 표시 조건의 모순을 놓친 부분을 이번 회귀 테스트로 보완했다.

![수정 후 설치 앱](../test-results/list-completion-065/live-desktop.png)
