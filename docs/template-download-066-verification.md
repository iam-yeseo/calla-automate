# 0.6.6 Excel 템플릿 다운로드 배포 검증

검증일: 2026-10-19 (KST)

리스트 만들기의 기존 CSV 템플릿 다운로드를 사용자가 확인한 빈 XLSX 양식으로 교체했다. `빈 리스트로 시작하기`를 해제하면 `Excel 템플릿 다운로드` 버튼에서 `CALLA_리스트등록_빈템플릿.xlsx`를 받는다. CSV 가져오기는 계속 지원한다.

## 구현

- `src/CreateList.tsx`: 버튼 문구 변경, 다운로드 진행 표시, 중복 클릭 방지 및 실패 안내.
- `src/importer.ts`: 정적 XLSX를 읽어 원본 바이트 그대로 저장. 15초 제한과 파일 시그니처 검사로 HTTP 실패·빈 응답·SPA HTML 대체 응답을 처리.
- `public/templates/calla-product-list-template.xlsx`: Excel 복구 경고를 수정한 최종 양식 그대로 포함. 스마트스토어 전용 열만 빠진 빈 양식이며 나머지 열과 서식은 보존.
- `package.json`, `package-lock.json`: 버전 0.6.6.
- `tests/importer.test.ts`, `desktop/tests/ui/template-download.spec.ts`: 파일 일치·다운로드 실패·가져오기 미리보기 검증.

템플릿 크기: 7,655 bytes. SHA-256: `7da94bbcb2100464d7b403f00378aae676f3a1a78ec3d436e97053628d477814`.

## 검사 결과

| 검사 | 결과 |
| --- | --- |
| TypeScript / production build | 통과 |
| 전체 단위 검사 | 183/183 통과 |
| 데스크톱 검사 | 12/12 통과 |
| 웹·Electron 다운로드 및 가져오기 UI | 2/2 통과 |
| 실제 파일 구조 | 첫 시트 230110, 제목 3–5행, 입력 영역 공란 확인 |
| 메모리에서 값을 채운 사본의 미리보기 | 1개 상품 인식, 상품 쓰기 0건 |
| 앱 서명 / ZIP 무결성 | 통과 |

UI 최초 실행의 두 표면 검증은 모두 통과했다. 이후 화면 증거를 다시 찍는 실행에서는 웹은 통과했으나 Electron의 `page.screenshot`이 다운로드 시작 전에 타임아웃되었다. 설치된 최종 0.6.6 앱을 네이티브 UI로 별도 확인하여 버튼·저장 창·실제 저장 파일을 검증했다. 이 추가 확인은 아래 기록에 남아 있다.

## 운영 웹

- URL: https://cauto.yeseo.im/
- Worker version: `c7481c77-310b-467d-80b7-fe5082e38c17`
- `wrangler deploy --keep-vars --tag 0.6.6`으로 기존 운영 환경변수를 보존해 배포.
- 운영 HTML·참조 JS/CSS·XLSX 응답이 로컬 최종 빌드와 바이트 단위로 일치.
- XLSX HTTP 200, MIME `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- 로그인된 Chrome에서 새로고침 후 리스트 만들기 → 빈 리스트 체크 해제 → 새 버튼 클릭.
- 다운로드 폴더에 실제 저장된 파일명·크기·SHA-256이 최종 양식과 일치.

## 설치 Mac 앱

- 설치 위치: `/Users/callam4/Applications/CALLA.app`
- Info.plist 및 패키지 버전: 0.6.6, arm64.
- 설치된 앱·빌드 패키지·ZIP 안 `app.asar` SHA-256 모두 `48aa021810d62d050f9cabf9233be83b3a4992ea0de134981f3d9ffc461688f0`.
- 기존 로그인과 11개 리스트가 유지된 상태로 실행됨.
- 리스트 만들기에서 새 버튼을 클릭하고 macOS 저장 창을 통해 실제 XLSX 저장. 원본과 동일한 파일명·7,655 bytes·SHA-256 확인.
- 이전 앱 백업: `release/previous/CALLA-0.6.5-before-template-download-066.app`.
- 배포 ZIP: `release/CALLA-0.6.6-mac-arm64.zip` (129,625,721 bytes).
- ZIP SHA-256: `db8f953f1d03577cd056302b59dc53a88549d7742b8d4c1ddb77856cd46f20a4`.

## 증거

모든 경로는 저장소 기준이다.

- `test-results/template-download-066/build.log`, `check.log`, `test.log`, `desktop.log`
- `test-results/template-download-066/desktop-ui.log`: 최초 UI 2/2 성공
- `test-results/template-download-066/web/verification.json`, `desktop/verification.json`
- `test-results/template-download-066/deploy.log`, `http-verification.json`
- `test-results/template-download-066/package-verification.json`, `installed-verification.json`, `zip-verification.json`
- `test-results/template-download-066/live-download-verification.json`: 운영 웹·설치 앱 실제 다운로드 결과
- `test-results/template-download-066/live-web/`: 운영 화면과 실제 다운로드 파일 사본
- `test-results/template-download-066/installed-desktop/`: 설치 앱 화면과 앱에서 저장한 실제 파일

이번 변경에는 DB 마이그레이션이 필요하지 않으며, 운영 검증 중 리스트나 상품을 생성하지 않았다.

![설치된 0.6.6 앱의 Excel 템플릿 다운로드](../test-results/template-download-066/installed-desktop/download-button.png)
