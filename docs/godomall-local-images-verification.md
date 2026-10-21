# 고도몰 신규 상품 이미지 기본 저장소 적용

2026-10-16 KST. API로 등록한 상품이 관리자에서 `URL 직접입력` 형태로 나타나 파일 선택으로 썸네일을 교체할 수 없는 문제에 대한 변경이다.

## 원인과 변경

`server/godomall-mapping.ts`의 신규 등록 요청은 `imageStorage=url`로 고정되어 있었다. 이를 `local`로 변경했다. 여기서 local은 사용자 컴퓨터 경로가 아니라 고도몰 기본 이미지 저장소를 뜻한다. 상품 등록 API와 공개 원본 이미지 URL은 계속 사용한다.

- 확대·상세·썸네일·리스트 이미지 4종에 `image_size_decrease="Y"`를 보내 각 몰 관리자에 설정된 크기를 사용한다. 크기 수치를 코드에 고정하지 않는다.
- 재조회에서는 저장소가 local이고 요청한 이미지 4종에 유효한 HTTP(S) 이미지 주소가 각각 반환되었는지 확인한다. 저장 과정에서 주소가 바뀌므로 원본 URL과 단순 일치 비교하지 않는다. 원본 URL만 그대로 돌아오거나 슬롯이 비어 있으면 완료로 처리하지 않는다.
- 검토 화면은 요청 시점의 원본 썸네일을 계속 보여준다.
- 이미 검토한 구형 URL 등록 요청은 전송 전에 409 `image_storage_changed`로 거절하고 새로 검토하도록 안내한다. 이미 전송한 구형 작업의 결과 확인은 기존 비교 규칙을 사용한다.
- 기존 상품의 가격·내용 수정은 기존 이미지 저장소와 `imageUpdate=N`을 보존한다. 기존 URL 상품을 자동 이관하는 기능은 이번 변경에 포함하지 않는다.

## 참조한 자료

- 사용자 첨부 2026-10-16 09.53.05 / 09.54.07 관리자 화면: URL 직접입력과 기본 경로 파일 선택 UI의 차이.
- [고도몰 공식 Open API 명세](https://devcenter.nhn-commerce.com/godomall5/openapi/specDownload), 31쪽 `imageStorage`, 33–34쪽 이미지별 `image_size_decrease`, 41·43쪽 수정 API의 이미지 설정. 다운로드 원문과 추출 텍스트: `test-results/godomall-local-images/reference/godomall-openapi-spec.pdf`, `.txt`.
- `test-results/edit-unlock-040/live-source.json`: 이전에 실제 조회한 소매 `1000008202`, 도매 `1000008292`의 local 저장소 응답. 네 이미지 태그가 각각 고도몰 CDN 절대주소로 반환되는 형태를 참고했다. 이 과거 자료는 이번 변경의 실등록 증거가 아니다.
- `runner/engine/godomall.py`: 이전 원본 이미지 파일 업로드 및 자동 리사이즈 동작.

## 검증 결과

- 자동 테스트 169개 통과. 최초 전체 실행은 168개 성공, Workers 실행환경 검사 1개는 샌드박스의 `listen EPERM`으로 실패했다. 해당 검사만 허용된 실행환경에서 재실행하여 성공했다.
- 신규 회귀 검사 6개: 소매·도매 XML, 4종 이미지 누락·잘못된 주소·원본 주소 반환, 기존 URL 검증, 기존 이미지 보존, 새 주소로 저장된 등록 결과와 미리보기, 불완전한 저장 후 재전송 없는 복구, 구형 검토 요청 차단을 포함한다.
- TypeScript와 Vite 운영 빌드, Wrangler dry-run 성공.
- 테스트 로그: `test-results/godomall-local-images/tests.log`, `runtime-test.log`, `build.log`, `dry-run.log`.
- 변경 전 파일: `test-results/godomall-local-images/source-before/`.

## 운영 적용

- `wrangler deploy --keep-vars`로 기존 설정을 유지하고 공통 Worker에 배포했다. 웹과 기존 Mac 앱이 같은 API를 사용하므로 앱 패키지는 0.6.3을 유지한다. 프론트엔드 자산은 변경되지 않았다.
- 새 Worker 버전: `94adb03c-62e0-4848-a48e-2e9c0b773a6b`.
- 변경 전 Worker 버전: `ef43dea3-9f4e-4133-8a0d-b5aa1de4f65a`.
- 운영 HTML·주 JS·CSS가 로컬 빌드와 일치한다. `/api/config`는 200, 인증 없는 소매·도매 상품 조회는 각각 401이었다.
- 증거: `test-results/godomall-local-images/deploy.log`, `deployments-before.log`, `public-verification.json`.

## 아직 확인하지 않은 범위

이번에는 실상품 등록·수정 API를 실행하지 않았다. 운영 웹과 설치된 CALLA 앱은 모두 로그인 화면이었다. 따라서 새로 등록한 상품의 이미지가 실제로 복사·리사이즈되고, 고도몰 관리자에서 파일 선택으로 교체되는 최종 확인은 남아 있다. 자동 검증은 API의 저장소와 이미지 주소 반환을 확인하며 이미지 픽셀의 동일성이나 실제 파일 다운로드 성공을 검증하지는 않는다.

이미 URL 방식으로 등록된 상품은 별도 이관 대상이다. 이관 시에는 각 상품의 현재 이미지와 몰별 상품번호를 먼저 확인하고 옵션·추가정보 등 다른 값을 보존한 상태에서 이미지를 다시 저장해야 한다. 이번 작업에서는 기존 상품을 변경하지 않았다.
