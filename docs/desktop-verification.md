# CALLA macOS 0.2.1 검증

최신 모달 위치 수정(0.2.3) 검증은 [모달 크기 변경 검증](modal-resize-verification.md), 엑셀 가져오기 수정(0.2.2)은 [엑셀 가져오기 검증](excel-import-verification.md)을 참고하세요. 아래 내용은 0.2.1 시점 기록입니다.

검증 환경: 2026-10-02, Apple Silicon, macOS 27.0.

## 결과

- 기존 웹/API/상품/엑셀 테스트: **57개 통과**.
- Python 실행기 테스트: **28개 통과**. 중복 등록·가격·상태 복구, health 인증, 진행 중 로그아웃 거절과 함께 실행기 식별자 및 인증/서버 차단 오류 구분을 확인했습니다.
- 데스크톱 경계·실행기 테스트: **5개 통과**. 임의 URL·파일 접근 거절, Python 없이 번들 실행, 동시 시작 방지, 토큰 파일 권한, 자동 연결과 종료를 확인했습니다.
- 실제 Electron 창 통합 테스트: **1개 통과**. 로그인, 자동 실행기 연결, 주요 관리 화면, 상품 모달, macOS 저장 메뉴, 서버 저장 반영, CSV 불러오기, JSON 다운로드, 창 숨기기·복원, 재로딩 후 로그인 유지, 세션 암호화와 Electron 내부 문구 없는 오류 안내를 확인했습니다. 최초 기동 대기 검증은 실행기의 25초 제한과 화면 갱신 주기를 반영합니다.
- 최종 `CALLA.app`의 `codesign --verify --deep --strict`: **통과**.
- 최종 앱에서 운영 `/api/config`: **HTTP 200**, 기존 Supabase 프로젝트 일치, 공개 인증 설정 존재 확인.
- 최종 앱: 버전 `0.2.1`, 내장 실행기 `1.0.1`, Chrome 설치 확인.
- 설치 경로 `/Users/callam4/Applications/CALLA.app`를 갱신하고 다시 연 실제 앱에서 저장된 관리자 로그인 유지, 운영 상품 조회, **상품 데이터 연결됨 / 로컬 등록 실행기 연결됨**을 확인했습니다.
- 운영 서버에 수정된 실행기 HTTP 클라이언트로 `/api/config` 조회 성공, 잘못된 테스트 토큰의 `/api/me`는 실제 Worker의 `authentication_required` / HTTP 401로 구분됨을 확인했습니다.
- 번들 `--self-check`: Playwright 드라이버 초기화 및 고도몰 엔진 import 성공. 지원 채널은 retail/wholesale입니다.
- 배포 `app.asar`에는 개발 비밀키 파일, 테스트, 가상 환경, 원본 node_modules가 포함되지 않습니다.

## 확인 범위

편집·저장·계정 UI 검증은 모의 서버와 임시 데이터로 수행했습니다. 운영 계정은 기존 로그인 복원과 읽기 전용 연결 확인에 사용했습니다. 운영 DB 변경과 실제 고도몰 상품 등록은 수행하지 않았습니다. 고도몰 폼 입력·저장은 별도 검토 모드 검증이 필요합니다.

개인 로컬 실행용 ad-hoc 서명을 사용합니다. Apple 공증·Developer ID 배포 서명 및 다른 운영체제 검증은 이 빌드에 포함하지 않습니다.

## 0.2.1 연결 오류 수정

0.2.0의 Python 기본 User-Agent 요청은 운영 서버에서 Cloudflare 1010 / HTTP 403으로 차단됐습니다. 이 응답을 모두 로그인 오류로 바꾸어 실제 원인을 가렸습니다. 이전의 잘못된 토큰을 이용한 검증은 이 차단을 정상 인증 거절로 오인했으므로 유효한 계정의 연결 성공을 입증하지 못했습니다.

- 모든 실행기 Worker 요청에 실제 앱 식별자 `CALLA-Runner/1.0.1`을 명시합니다. 기존 사용자 Bearer 인증, 관리자 권한 확인, HTTPS 인증서 검증과 리다이렉트 거절을 유지합니다.
- 서버 보안 검사 차단, 일반 연결 거절, 로그인 만료, 관리자 권한 부족, 승인 대기, 계정 중지를 구분합니다. 임의 서버 응답 본문은 화면에 노출하지 않습니다.
- 앱과 실행기 사이의 예상 오류는 구조화한 응답으로 전달하여 `Error invoking remote method` 접두사가 사용자 화면에 표시되지 않도록 했습니다.
- 번들 실행기 통합 테스트 서버가 기본 Python 식별자를 거절하도록 보강했습니다.
- 기존 앱은 `release/previous/`에 백업하고 암호화 로그인 파일과 실행기 작업 기록을 그대로 유지했습니다.

원인 설명: [Cloudflare Error 1010](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/).

## 화면

아래 저장된 화면은 초기 0.2.0 검증 자료입니다. 0.2.1의 실제 운영 연결 성공은 설치된 앱의 동기화 설정 화면에서 확인했습니다.

- `screenshots/desktop/packaged-login.png`: 초기 패키지의 실제 로그인 화면.
- `screenshots/desktop/workspace.png`: 테스트 데이터로 확인한 상품 목록.
- `screenshots/desktop/sync.png`: 모의 서버에 연결된 실행기 화면.
- `screenshots/desktop/product-editor.png`: 상품 편집 모달.
