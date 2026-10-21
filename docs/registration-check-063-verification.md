# 등록완료 체크 태그 · 0.6.3

2026-10-15. 리스트의 완료 결과에서 소매몰·도매몰 이름과 부가 문구를 제거하고 `✓ 등록완료`만 표시한다. 준비 상태에서 사용하는 공통 `Badge`를 재사용해 체크표시·글꼴·배경·높이를 맞췄다. 몰별 상품 링크와 키보드 포커스 표시는 유지한다.

- TypeScript 검사와 운영 빌드 통과.
- 운영 웹의 실제 울프믹스 리스트에서 두 완료 태그의 체크표시 `✓`, `등록완료` 문구, 공통 `badge success` 스타일, 높이 28px, 글자 13px와 기존 몰별 상품 링크를 확인했다. 브라우저 오류 로그 없음.
- `/Users/callam4/Applications/CALLA.app` 0.6.3 설치 후 기존 로그인·리스트·저장됨 상태와 완료 태그 두 개의 문구 및 링크를 확인했다.
- 기존 변수를 유지하여 웹 배포 완료. Worker 버전: `ef43dea3-9f4e-4133-8a0d-b5aa1de4f65a`.
- 설치 앱 서명 검증 통과. 설치본과 빌드본의 `app.asar` SHA-256 일치: `c2f1e8b78251b94e3e51e1f19953c5d7830f12a11f88eb604ea4bd2718e3999d`.
- 화면: `test-results/registration-check-063/web-results.png`.
- 보관본: `release/CALLA-0.6.3-mac-arm64.zip`.
- 이전 앱: `release/previous/CALLA-0.6.2-before-registration-check.app`.
