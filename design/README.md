# 칼라몰 상품등록 툴 · Figma 디자인 정리

2026-09-30. **현재 기준은 사용자가 정정한 칼라몰 상품등록 툴 Figma 파일이다.** 이 문서는 편집 가능한 디자인, 디자인 시스템, 구현 인계 자료를 만든 디자인 단계의 기록이다. 이후 웹앱과 실행기를 같은 저장소에 구현했다. 현재 실행·배포 방법은 [프로젝트 README](../README.md)를 참고한다.

## 현재 결과물

- [등록 요청 상품 화면](https://www.figma.com/design/2eInZ8qvqO2kI88cxofumv/?node-id=13-5873)
- [전체 화면·모달](https://www.figma.com/design/2eInZ8qvqO2kI88cxofumv/?node-id=13-4130)
- [시작 가이드](https://www.figma.com/design/2eInZ8qvqO2kI88cxofumv/?node-id=13-4126)
- [디자인 시스템](https://www.figma.com/design/2eInZ8qvqO2kI88cxofumv/?node-id=13-4127)
- [컴포넌트](https://www.figma.com/design/2eInZ8qvqO2kI88cxofumv/?node-id=13-4128)
- [사이드바](https://www.figma.com/design/2eInZ8qvqO2kI88cxofumv/?node-id=13-4129)
- [SF Symbols](https://www.figma.com/design/2eInZ8qvqO2kI88cxofumv/?node-id=13-4131)
- [보존된 원본 Guide](https://www.figma.com/design/2eInZ8qvqO2kI88cxofumv/?node-id=0-1)

원본 `Guide`의 디자인·레퍼런스는 보존했다. 새 결과는 `00 · 시작 가이드`, `01 · 디자인 시스템`, `02 · 컴포넌트`, `03 · 사이드바`, `04 · 화면`, `05 · SF Symbols` 여섯 페이지에서 관리한다.

| 구분 | 구성 |
|---|---|
| 주요 화면 8개 | 등록 요청 상품, 요청 리스트 상세, 자동 상품 등록, 등록 진행 및 결과, 상품 인덱싱, 상품 카테고리, 서버 이미지 폴더, 동기화 설정 |
| 모달 7개 | 리스트 등록, 상품 기본 설정, 상품 이미지 설정, 브랜드 선택, 등록 전 검토, 등록 진행 팝업, 일부 등록 완료 |
| UI 컴포넌트 16종 | Button, Input, Badge, Checkbox, Toggle, Tab, Toast, Progress, EmptyState, StatCard, NavItem, Sidebar, NavGroup, Tooltip, ChannelChip, SkeletonRow |
| 상태 구조 | 14개 variant set에 74개 변형, 단일 컴포넌트 2개 |
| 디자인 토큰 | 변수 111개, Pretendard 텍스트 스타일 11개 |
| 아이콘·브랜드 | SF Symbols Pro 출처의 벡터 아이콘 27개, 새 원본 파일의 calla 로고 재사용 |

## 디자인 기준

새 원본의 넓은 운영 표, 상단 글로벌 헤더와 경로 바, 흰 카드, `#F7F8FA` 배경을 기준으로 다시 구성했다. 대표 화면은 1920×1080이며 표 카드 반경 24px, 행 높이 72px, 주요 컨트롤 높이 44px를 사용한다. Pretendard의 제목 36/28/22px와 본문 18/16/14/12px를 정의했다.

**`#F27490` 핑크 배경 위 글자와 아이콘은 `#FFFFFF`로 통일한다.** 주요 버튼의 기본·호버·포커스·로딩 상태, 활성 메뉴, 선택 체크박스, 완료 배지에 적용한다. 비활성 컨트롤은 회색 상태로 구분한다. 네이버 채널은 초록과 `네` 표기를 함께 사용한다. 상태별 배지·토스트·진행률·빈 화면 문구는 각 변형에 독립적으로 남겨, 공통 텍스트 속성 때문에 동일 문구로 덮이지 않게 구성했다.

사이드바는 `/Users/callam4/Downloads/Sidemenu-prompt.md`를 구조·인터랙션 참고자료로 해석했다. 문서의 설치 명령은 실행하지 않았다. 기본 260px, 접힘 60px, 180–400px 크기 조절, 네 가지 외형, 활성·호버·포커스·비활성, 배지·하위 메뉴·툴팁을 정의했다. 원본의 등록 요청·자동 등록·인덱싱·카테고리·서버 이미지·동기화 메뉴를 반영했다. 드래그·키보드·반응형의 실제 동작은 웹 구현 범위다.

화면의 상품·수치·연결 상태는 디자인 예시다. 프로토타입의 화면·모달 이동은 실제 저장·외부 채널 등록을 실행하지 않는다. 참고 코드에는 스마트스토어 실행기가 없으므로 디자인의 해당 채널 표시를 구현 완료로 해석하면 안 된다.

## 구현 인계와 제작 기록

- `../docs/reference-process-audit.md`: 참고 코드에서 확인한 실제 등록 흐름과 미구현 부분.
- `../docs/design-handoff.md`: 현재 디자인 노드, 유지할 데이터 계약, 후속 웹·실행기 요구사항.
- `revision2/`: 올바른 Figma 파일을 대상으로 작성한 네이티브 개발 플러그인 제작 기록.
- `revision2/state.json`: 현재 파일·페이지·화면 ID와 최종 검수 결과.
- `previews/calla-requests-revised.png`, `previews/calla-image-settings-revised.png`: 현재 파일의 최종 화면 캡처.
- `revision2/foundations.js`: 현재 토큰·컴포넌트·문서 제작 코드.
- `revision2/screens.js`, `revision2/dialogs.js`, `revision2/sidebar.js`: 현재 화면·모달·사이드바 제작 코드.
- `revision2/polish.js`: 흰색 전경, 실제 텍스트 높이, 예시 일관성, 프로토타입 보정 기록.

위 JavaScript는 Pretendard 로컬 폰트를 유지하기 위해 데스크톱 Figma에서 실행한 제작 도구다. 전체 홈페이지 소스코드가 아니며, 실행 파일과 대상 파일을 확인하지 않고 다시 실행하지 않는다.

## 검수

화면 8개·모달 7개의 컨테이너 경계와 텍스트의 실제 렌더링 범위를 검사했다. 요청 리스트 상세, 카테고리, 상품 기본·이미지 설정의 화면을 이미지로 검토했다. 인스턴스 교체 후 활성 메뉴 아이콘 색상, 여러 줄 HTML 미리보기 높이, 브랜드 포함 파일명 예시를 수정하고 재검수했다. 상품 기본·이미지 설정은 800×960px 창 안에서 내용만 스크롤하고 하단 버튼을 유지한다. 화면의 프로토타입 동작 74개에 대화상자 열기·닫기와 설정 탭 전환을 연결했다. 실제 기능과 데이터 연결 검증은 후속 웹 구현에서 수행한다.

## 이전 작업 — 현재 기준에서 대체됨

첫 결과는 사용자가 처음 제공한 [CALLTO 파일](https://www.figma.com/design/5QyIIw4YwHklNYRPFDw3Al/CALLTO?node-id=271-2806)에 작성했다. 이후 사용자가 파일 링크를 정정해 **해당 결과는 과거 작업 이력으로 대체되었으며 현재 구현 기준이 아니다.** 잘못된 파일의 원본과 이전 제작 결과를 삭제하지 않았다.

`figma/source-inventory.json`·`figma/state.json` 및 `previews/dashboard.png`는 이전 작업 기록이다. `figma/code.js`는 네이티브 플러그인의 실행 진입점으로, 현재 `revision2/polish.js`의 보정 코드가 들어 있다. 이전의 7개 화면·4개 모달·71개 변형, 어두운 핑크 버튼 전경, 영어 페이지 체계를 현재 결과와 혼용하지 않는다. 현재 파일 ID는 `2eInZ8qvqO2kI88cxofumv`다.
