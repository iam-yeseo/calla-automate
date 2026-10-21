# CALLA 0.5.4 · 등록 완료 안내 문구 제거

2026-10-13. 앱과 웹 공통 `RegistrationSummary`에서 `api_state=verified`인 결과는 `warnings`를 렌더링하지 않도록 변경했다. 별도 빈 공간을 두지 않아 해당 안내가 차지하던 높이도 사라진다. 등록 번호, 등록 시각, PC·모바일 상태, 오류 표시, 등록 전 검토와 저장된 결과 데이터는 변경하지 않았다.

## 검증

- TypeScript 검사 및 프로덕션 빌드 통과.
- 기존 데스크톱 테스트 6개 통과. 최초 제한 환경의 로컬 포트 권한 오류 후 허용 환경에서 재실행했다.
- 운영 웹의 실제 `261012-록스톤 신제품` 리스트에서 AV STEREO 소매·도매 안내 제거를 확인했다. 동일 브라우저 조건에서 해당 행 높이는 204px에서 143px로 줄었다.
- 설치된 `/Users/callam4/Applications/CALLA.app` 0.5.4를 실행해 기존 로그인과 리스트를 확인했다. 실제 상품 6개·등록 완료 결과 12건·저장됨 표시가 유지되고 모델번호 안내 문구가 없는 것을 확인했다.
- 설치본과 배포 앱의 `app.asar`가 일치하며 양쪽 서명 검증이 통과했다.

## 반영

- 웹 Worker 버전: `5f354eff-0043-453a-852d-e8ddaa966a8b` (`--keep-vars`). 오늘 등록 복구 작업을 포함한 현재 서버 소스와 설정을 유지했다.
- Mac 설치본: `/Users/callam4/Applications/CALLA.app`.
- 배포 파일: `release/CALLA-0.5.4-mac-arm64.zip`.
- 이전 설치본 백업: `release/previous/CALLA-0.5.3-before-registration-summary.app`.
- 수정 전 소스와 결과 화면: `test-results/registration-summary-054/`.
