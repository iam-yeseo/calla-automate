# Product-Share-Tool 참조 확인

2026-10-19 GitHub 연결로 `iam-yeseo/Product-Share-Tool`의 `main`을 읽기 전용으로 확인했다. 기준 커밋은 [`2cf50478911b3fa35fedaca533183e1779fd38c2`](https://github.com/iam-yeseo/Product-Share-Tool/commit/2cf50478911b3fa35fedaca533183e1779fd38c2)이며, 커밋 시각은 **2026-09-15 06:51 KST**다. 아래 링크는 모두 이 커밋에 고정했다. 원격 코드 실행·변경·푸시·PR 생성은 하지 않았다.

## 확인한 파일

- [README.md](https://github.com/iam-yeseo/Product-Share-Tool/blob/2cf50478911b3fa35fedaca533183e1779fd38c2/README.md)
- [package.json](https://github.com/iam-yeseo/Product-Share-Tool/blob/2cf50478911b3fa35fedaca533183e1779fd38c2/package.json)
- [docs/automation-contract.md](https://github.com/iam-yeseo/Product-Share-Tool/blob/2cf50478911b3fa35fedaca533183e1779fd38c2/docs/automation-contract.md)
- [docs/verification.md](https://github.com/iam-yeseo/Product-Share-Tool/blob/2cf50478911b3fa35fedaca533183e1779fd38c2/docs/verification.md)
- [js/automation-core.js](https://github.com/iam-yeseo/Product-Share-Tool/blob/2cf50478911b3fa35fedaca533183e1779fd38c2/js/automation-core.js)
- [scripts/check.cjs](https://github.com/iam-yeseo/Product-Share-Tool/blob/2cf50478911b3fa35fedaca533183e1779fd38c2/scripts/check.cjs)
- [tests/automation.test.cjs](https://github.com/iam-yeseo/Product-Share-Tool/blob/2cf50478911b3fa35fedaca533183e1779fd38c2/tests/automation.test.cjs)
- [tests/workspace.test.cjs](https://github.com/iam-yeseo/Product-Share-Tool/blob/2cf50478911b3fa35fedaca533183e1779fd38c2/tests/workspace.test.cjs)
- [tests/schema.test.cjs](https://github.com/iam-yeseo/Product-Share-Tool/blob/2cf50478911b3fa35fedaca533183e1779fd38c2/tests/schema.test.cjs)
- [tests/xlsx-import.test.cjs](https://github.com/iam-yeseo/Product-Share-Tool/blob/2cf50478911b3fa35fedaca533183e1779fd38c2/tests/xlsx-import.test.cjs)
- [tests/bulk-editor.test.cjs](https://github.com/iam-yeseo/Product-Share-Tool/blob/2cf50478911b3fa35fedaca533183e1779fd38c2/tests/bulk-editor.test.cjs)
- [tests/thumbnail-cleanup.test.cjs](https://github.com/iam-yeseo/Product-Share-Tool/blob/2cf50478911b3fa35fedaca533183e1779fd38c2/tests/thumbnail-cleanup.test.cjs)

브랜치 응답과 누락 없는 재귀 Git 트리도 확인했다. 해당 트리에는 `AGENTS.md`가 없다. 현재 저장소는 HTML/CSS/바닐라 JavaScript 구조이고, `check`는 JavaScript 구문·설정 검증이다. 테스트 파일 6개에 테스트 41개가 선언되어 있으나 이번 참조 조사에서 그 테스트를 실행하지는 않았다.

## 이번 변경과 함께 유지할 계약

| 참조 계약 | CALLA-AUTOMATE에서 확인한 대응 |
|---|---|
| 상품명 HTML 원문과 표시용 텍스트 분리 | `tests/domain.test.ts`, `tests/server.test.ts`가 저장·복사·내보내기 원문 보존을 검증한다. 작업 06은 원문을 바꾸지 않고 `sandbox=""`와 공통 CSP를 적용한다. |
| 편집 저장에서 `done`·`done_at` 제외, 완료와 채널 성공 구분 | 도메인·서버 테스트와 작업 02 SQL 회귀 테스트가 기존 완료값과 채널별 집계를 별도로 검증한다. |
| 가격의 null·0 구분, 몰별 카테고리 문자열과 앞자리 0 유지 | `tests/domain.test.ts`, `tests/importer.test.ts`, `tests/categories.test.ts`가 해당 계약을 검증한다. |
| URL 변경 시 이전 이미지 정상 판정 무효화 | `tests/domain.test.ts`가 바뀐 이미지 주소의 등록 가능 여부를 검증한다. 준비 완료와 실제 등록 성공도 별도 상태로 유지한다. |
| DOM·DB에 의존하지 않는 공유 core | 작업 08은 런타임 구현을 바꾸지 않고 선언과 실제 export의 키·타입 일치를 검사한다. |
| 취소한 편집과 뒤늦은 응답이 현재 상태를 덮어쓰지 않음 | 작업 10의 주요 검증 대상은 `desktop/tests/ui/product-workflow.spec.ts`의 뒤로/앞으로 이동·드래프트 확인과 `selection-handoff.spec.ts`의 선택 인계다. |

## 그대로 가져오지 않은 이전 구조

이전 저장소는 로그인 없는 공유와 익명 클라이언트의 직접 Supabase 접근을 전제로 한다. 특히 [schema 테스트의 익명 테이블 권한](https://github.com/iam-yeseo/Product-Share-Tool/blob/2cf50478911b3fa35fedaca533183e1779fd38c2/tests/schema.test.cjs#L15)과 [직접 DB 등록 상태 기록 설명](https://github.com/iam-yeseo/Product-Share-Tool/blob/2cf50478911b3fa35fedaca533183e1779fd38c2/docs/automation-contract.md#L117)은 현재 CALLA의 인증된 Worker·service_role 경계에 적용하지 않았다.

또한 [이전 exportItem](https://github.com/iam-yeseo/Product-Share-Tool/blob/2cf50478911b3fa35fedaca533183e1779fd38c2/js/automation-core.js#L172)은 이미지 배열에서 상세 HTML을 생성한다. 현재 CALLA는 원문 텍스트와 이미지를 섞은 `detailBlocks`, 재고, 도매 정가 설정도 지원하므로 이전 core를 통째로 가져오면 이 계약이 손실된다. 참조 조사를 이유로 제품 소스를 추가 변경하지 않았다.

## 관찰한 테스트 공백

이전 저장소는 [브랜드 이름·별칭·초성·코드 검색](https://github.com/iam-yeseo/Product-Share-Tool/blob/2cf50478911b3fa35fedaca533183e1779fd38c2/tests/automation.test.cjs#L108)을 `CONNECTER`, `커넥터`, `ㅋㄴㅌ`, `086001`로 검증한다. 현재 CALLA의 `Settings.tsx`와 `ProductEditor.tsx`도 `brandMatches`를 사용하지만, 해당 동작을 직접 검증하는 자동 테스트는 찾지 못했다. 작업 08의 테스트는 export 존재와 타입을 검증하는 최소 계약 검사다. 이는 발견된 기능 결함이나 이번 작업의 실패가 아니라 후속 행동 테스트 후보이며, 지시서 밖 수정은 하지 않았다.
