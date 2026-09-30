# CALLA 로컬 등록 실행기

CALLA 관리자 웹사이트에서 고도몰 소매·도매 등록을 시작하는 macOS용 연결 프로그램입니다. 웹 서버는 저장된 상품 정보와 등록 결과를 관리하고, 이 프로그램은 **사용자가 직접 로그인한 별도 Chrome**에서 폼을 입력합니다. 스마트스토어는 지원하지 않습니다.

## 설치와 실행

프로젝트 최상위 폴더에서 실행합니다.

```sh
python3 -m venv runner/.venv
runner/.venv/bin/python -m pip install -r runner/requirements.txt
runner/.venv/bin/python -m runner
```

Google Chrome이 `/Applications/Google Chrome.app`에 있어야 합니다. 기존 Chrome에 CDP로 접속하므로 Playwright 브라우저 다운로드는 필요하지 않습니다. 실행기 시작·연결만으로 Chrome이 열리지는 않습니다.

다른 터미널에서 아래 명령을 **직접** 실행하고 출력된 연결 토큰을 웹사이트의 실행기 연결 칸에 입력합니다. 토큰을 공유하거나 Git에 넣지 마세요.

```sh
runner/.venv/bin/python -m runner --show-token
```

웹 관리자 로그인이 필요합니다. 웹사이트가 연결을 요청하면 Chrome의 로컬 네트워크 접근 권한을 허용합니다. 공개 HTTPS 사이트에서 loopback 연결 시 브라우저 권한이 필요할 수 있습니다. [Chrome 안내](https://developer.chrome.com/blog/local-network-access)

1. 웹사이트에서 상품 리스트를 저장합니다.
2. 실행기를 연결하고 상품·채널을 선택합니다.
3. 먼저 **검토 모드**로 폼을 확인합니다. 검토 중 고도몰 저장 버튼을 직접 누르지 마세요.
4. 로그인 대기 상태에서는 별도 Chrome에서 로그인하고 상품 등록 화면을 연 뒤 웹사이트의 계속 버튼을 누릅니다.
5. 실제 등록 모드로 시작하면 각 채널을 저장하고 상품번호를 웹 서버에 기록합니다.

## 인증과 환경 설정

- HTTP 수신 주소는 `127.0.0.1:8765`로 고정됩니다.
- 모든 API는 정확한 `Origin`·`Host`와 `Authorization: Bearer <연결 토큰>`을 검사합니다. 토큰은 `~/.calla-automate-runner/connection-token`에 0600 권한으로 저장됩니다.
- `/session`의 Supabase 사용자 access token은 메모리에만 보관합니다. 브리지는 Supabase 서비스 키나 publishable key를 사용하지 않습니다.
- 각 API 요청 시 지정된 웹 origin의 `/api/me`에서 현재 관리자 권한을 확인합니다. 웹 토큰이 갱신되면 `/session`을 다시 호출하면 됩니다. 실행 중 계정 또는 origin 변경은 거부합니다.
- 기본 허용 origin: `http://localhost:5173`, `http://127.0.0.1:5173`, `https://calla.yeseo.im`. 미래 배포 도메인은 실행 전 `CALLA_ALLOWED_ORIGINS`에 쉼표로 구분한 **정확한 HTTPS origin**을 추가합니다. 와일드카드·경로는 허용하지 않습니다.
- `CALLA_CHROME_DEBUG_PORT` 기본값 `9223`, `CALLA_CHROME_PROFILE_DIR` 기본값 `~/.calla-automate-runner/chrome`. 기존 GUI 실행기의 `9222` 프로필과 분리되어 처음에는 다시 로그인해야 합니다.
- 썸네일은 HTTPS의 `*.supabase.co` 및 `calla.hgodo.com`을 허용합니다. 필요한 추가 호스트는 `CALLA_IMAGE_HOSTS`에 정확한 호스트 이름을 등록합니다. 리다이렉트는 허용하지 않습니다. 서버 context의 `image_url` 또는 `automation.thumbnail.url`에는 최종 공개 이미지 주소가 필요합니다.

## API 계약

연결 토큰을 Bearer 헤더로, 웹 페이지의 origin을 Origin 헤더로 전달합니다. 변경 요청은 `application/json`만 받습니다.

| API | 요청 / 응답 |
|---|---|
| `POST /session` | `{origin, accessToken}` → `{connected:true,user,runnerVersion}` |
| `GET /status` | `{connected:true,runnerVersion,capabilities:['retail','wholesale'],job}` |
| `POST /jobs` | `{listId,itemIds,channels,dryRun,idempotencyKey}` → 202 `{job,duplicate}` |
| `POST /jobs/{id}/continue` | `{}` → `{job}`; 로그인·검토 대기에서만 가능 |
| `POST /jobs/{id}/stop` | `{}` → `{job}`; 현재 채널 처리 후 중단 |

`job`에는 `id`, `listId`, `state`, `current`, `total`, `success`, `failed`, `reviewed`, `message`, `logs:[{time,message}]`가 포함됩니다. `current/total`은 상품×채널 건수입니다. `state`는 `running`, `waiting_login`, `waiting_review`, `stopping`, `completed`, `failed`, `needs_review` 중 하나입니다. 중단 완료는 `completed`와 `stopped:true`로 표시합니다. 한 번에 한 작업만 실행합니다.

웹 Worker가 제공해야 하는 API:

- `GET /api/me` → `{user:{id,email},role:'admin'}`
- `GET /api/runner/context?listId=UUID` → `{list,items,settings,registrations}`. items와 registrations는 원본 snake_case 행 배열입니다.
- `POST /api/runner/registrations` → `{itemId,channel,status,goodsNo,errorMessage,warnings,expectedUpdatedAt?}`. `status:'running'`은 pending/failed에서만 원자적으로 claim하고 이미 running/success면 409를 반환해야 합니다. 응답의 `registration.updated_at`을 그대로 보관합니다. 중단 후 `status:'pending'`으로 해제할 때 이 값을 `expectedUpdatedAt`으로 보내며 서버는 같은 버전의 running/failed만 해제합니다. 이미 pending인 반복 요청은 그대로 반환하고, 더 새 실행이나 success는 409로 보호합니다.
- `POST /api/runner/complete` → `{itemId}`. 서버가 필요한 고도몰 채널 성공 여부를 다시 확인하여 done/done_at을 처리합니다.

Worker 요청에는 사용자의 access token을 Bearer로 전달하며 매 요청마다 Worker가 관리자 권한을 재검증해야 합니다. Redirect를 따라 인증 헤더를 다른 주소에 보내지 않습니다.

## 중복 등록·복구

- 프로세스 잠금과 단일 작업 잠금, 요청 멱등키, 상품별 서버 상태 재검사, 로컬 원자적 journal을 함께 사용합니다.
- 같은 멱등키의 같은 요청은 기존 작업을 반환합니다. 다른 요청 내용을 같은 키로 보내면 409입니다.
- 상품별 입력 전과 저장 클릭 직전에 최신 상품·설정을 다시 읽습니다. 가격, 완료 여부, 필요 채널, 상세정보 또는 설정이 달라졌으면 이전 내용으로 저장하지 않고 실행을 멈춥니다. 잡았던 실행 상태는 동일 버전 CAS로 해제하며, 해제 실패는 `needs_review`로 남깁니다.
- 저장 클릭 **직전** `submitting`, 상품번호 확인 후 `success`를 로컬 journal에 먼저 기록합니다.
- 저장 결과가 불명확하거나 상품번호가 없거나 저장 후 서버 동기화가 실패하면 `needs_review`로 멈춥니다. 이 상품/채널은 자동 재시도하지 않습니다. 고도몰에서 결과를 확인하고 서버 상태를 정리해야 합니다. journal을 임의로 삭제하여 재실행하지 마세요.
- 실행 도중 프로세스가 종료되면 다음 시작 시 진행 중 작업을 `needs_review`로 복구합니다.
- 기존 GUI는 새 잠금 규칙을 모르므로 같은 상품을 동시에 실행하지 마세요. 서버의 원자적 claim과 별도 Chrome 프로필이 새 브리지의 경합을 줄이지만, 기존 GUI의 오래된 메모리 상태까지 통제하지는 못합니다.
- 중단은 즉시 브라우저를 종료하지 않습니다. 입력 중에는 저장 직전 중단을 확인하고, 이미 저장 중이면 저장 결과 확인 및 동기화를 마칩니다.

소매 정가(`price_retail_regular`)는 확인된 관리자 정가 필드 `input[name="fixedPrice"]`에 입력합니다. `null`이면 변경하지 않고 `0`은 0으로 입력합니다. 소매 판매가는 `goodsPrice`, 도매 정가는 기존과 같이 소매 판매가를 사용합니다.

`engine/`은 참고 폴더의 `browser.py`, `godomall.py`, `config.py`, `db.Item`을 복사한 것입니다. 원본은 수정하지 않았습니다. DB 클라이언트·키를 제거하고 별도 Chrome 프로필, 정확한 관리자 host 검사, 제한된 썸네일 다운로드를 적용했습니다.

## 검증

```sh
python3 -m unittest discover -s runner/tests -v
python3 -m py_compile runner/bridge.py runner/native_engine.py runner/engine/*.py
```

단위 테스트는 fake engine/Worker와 임시 loopback HTTP 서버를 사용합니다. Chrome을 실행하거나 운영 상품을 등록하지 않습니다. 실제 관리자 화면 입력·저장은 별도의 검토 모드 검증이 필요합니다.
