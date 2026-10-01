# Backend contract audit and implementation

Date: 2026-09-30. Existing Supabase product data is retained. Godomall registration continues through local Chrome; Smartstore execution is outside this version. No production write, schema change, permission change, product registration or deployment was performed during this audit.

## Evidence and live/local differences

The local reference is `../CALLTO/Product-Share-Tool` plus `../상품 등록 자동화`. No applicable `AGENTS.md` was found in these projects or their examined ancestors. The local website has no login: browser code calls Supabase with a public key. `editor` and `registrar` in `js/state.js` are presentation modes, not authenticated roles.

Read-only SQL inspection of the existing project confirmed:

- `product_lists`, `product_items`, `product_registrations` and `app_settings` each currently have an `anon,authenticated FOR ALL USING(true) WITH CHECK(true)` policy.
- The live `save_product_draft(jsonb,jsonb,uuid[])` differs from the local migration: its list update includes `note`. The server therefore preserves list notes.
- The live RPC keeps `done/done_at` out of its item insert/update and prevents an item ID belonging to a different list from being reused. It is the existing atomic save boundary.

The initial schema for lists/items/settings is not present in the local migration directory. Local migrations alone must not be treated as a complete description of production. The root task also obtained the newer GitHub main image contract; automation JSON may contain `linkEnabled`, `linkUrl` and additional keys absent in this local checkout. The server preserves those fields rather than normalizing them away.

## Existing data and behavior

| Store | Contract to preserve |
|---|---|
| `product_lists` | UUID `id`, `title`, `author`, `work_date`, `note`, timestamps |
| `product_items` | Existing UUID/list ownership, sequence, raw HTML product name, Naver name, brand/model, channel flags/prices, `content`, `image_usage`, `image_url`, `ref_link`, `note`, automation JSON, completion fields |
| `product_registrations` | Unique `(item_id,channel)`, channels `retail/wholesale`, states `pending/running/success/failed`, goods number, warnings, error and attempt time |
| `app_settings` | `product_automation_v1` with retail/wholesale category trees, brand list, image folder list; `hidden_columns` is a separate legacy key |
| Storage | Public `product-thumbnails`, 6MB JPEG/PNG/WebP/GIF, immutable `list/item/upload.ext` paths |

The current web save uploads pending thumbnails, then calls `save_product_draft`. Modal edits first apply to the local list draft; cancelling a modal does not persist anything. Explicit removed IDs are deleted only within their list. Omitted items are not implicitly deleted. Raw product-name HTML is preserved; list display must use a safe text rendering. Prices remain integer or null; category codes retain leading zeros. The current UI derives Naver price from retail selling price, and Smartstore execution remains unsupported.

The Python executor reads Supabase directly in its legacy version. It does not consume the DOM export in its current default path. `Db.sync_done` marks a product done when all requested **Godomall** channels succeeded; it does not include Naver. Dry run fills a form and pauses without writing registration state. A failure normally continues to the next item. A stop waits until the current item finishes. Missing goods numbers can still be a successful registration with a warning, so automatic blind resubmission is unsafe.

Source evidence: `js/api.js`, `js/app.js:86`, `js/app.js:826`, `js/automation-editor.js:29`, `js/automation-editor.js:168`, `js/automation-core.js`, `supabase/migrations/20260908083101_add_retail_regular_price.sql`, `../상품 등록 자동화/db.py:116`, `../상품 등록 자동화/core.py:112`.

## Worker API implemented

`server/index.ts` exports the default Worker plus `createWorker({fetch})` for isolated transport tests. Every data endpoint verifies the bearer token against Supabase `/auth/v1/user` before database access. Trusted `app_metadata.calla_role` supplies `admin` or `viewer`. An email listed in `ADMIN_EMAILS` overrides to admin only when Auth reports `email_confirmed_at`. User-editable metadata is never used for authorization. Unknown roles receive 403; there is no production demo fallback.

The Worker is a BFF: after authorization it accesses PostgREST/Storage with its server-only service key. Viewer is read-only. Every mutation and runner endpoint requires admin. Cross-origin browser requests are rejected; same-origin requests and a bearer-authenticated local runner are supported. Responses are `no-store`, errors do not echo upstream diagnostics or secrets, JSON bodies are bounded to 4MB and uploads to 6MB plus multipart overhead. Database/auth/upload requests have bounded timeouts.

Required bindings: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ASSETS`; optional `ADMIN_EMAILS`. Missing configuration returns a clear 503. The service key belongs in Worker secrets, never source or browser environment variables.

| Method / path | Access | Response / behavior |
|---|---|---|
| GET `/api/config` | Public | `{supabaseUrl,supabasePublishableKey}` only |
| GET `/api/me` | Member | `{user:{id,email,username,name},role}`; 현재 계정 상태·권한 검사 |
| GET `/api/lists` | Member | `{lists}` with total, doneCount, retailSuccess, wholesaleSuccess, retailTotal, wholesaleTotal, runningCount, failedCount |
| POST `/api/lists` | Admin | `{title,author,work_date,note}` → `{list}` |
| GET `/api/lists/:id` | Member | `{list}` |
| DELETE `/api/lists/:id` | Admin | `{ok:true}`; explicit delete only |
| GET `/api/lists/:id/items` | Member | `{items}` ordered by sequence, creation time and ID |
| PUT `/api/lists/:id/draft` | Admin | `{list,items,removedIds}` → existing atomic RPC → `{ok:true}` |
| GET `/api/lists/:id/registrations` | Member | `{registrations}` raw channel rows |
| POST `/api/items/:id/completion` | Admin | `{done:boolean}` → `{item}`; explicit manual completion only |
| GET `/api/settings` | Member | `{value,updated_at}` |
| PUT `/api/settings` | Admin | `{value,revision}`; atomic timestamp compare-and-set; 409 if stale |
| POST `/api/uploads` | Admin | Multipart `{listId,itemId,file}` → `{path,url,originalName,mimeType,size}` |
| GET `/api/catalog?offset=0&limit=50&q=…` | Member | `{items,total,nextOffset}`; limit 1–100 |
| GET `/api/runner/context?listId=…` | Admin | `{list,items,settings,registrations}`; settings is the value object |
| POST `/api/runner/registrations` | Admin | `{itemId,channel,status,goodsNo,errorMessage,warnings}` → `{registration}` |
| POST `/api/runner/complete` | Admin | `{itemId}` → `{done,godomallComplete,naverImplemented:false}` |

All IDs are validated. Drafts reject duplicates, cross-list IDs and save/delete overlap. The server reads previous rows to preserve omitted legacy fields and unknown automation keys; `done`, `done_at`, selection and other UI state never enter the draft RPC payload. It does not strip product-name or detail HTML. An explicit cleared thumbnail removes its old path reference when omitted from the new automation value.

New unsaved item UUIDs can upload below an existing list before the draft RPC. Existing item IDs must belong to that list. File type, size and image signature are checked; uploads never overwrite a previous object. A failed subsequent save can leave an unreferenced upload, so the frontend retains the upload result for retries. This version does not implement orphan upload cleanup. Existing completion-based thumbnail cleanup remains unchanged.

## Registration claim and completion semantics

A running claim is a conditional database PATCH of an existing `pending/failed` row. If no row changed, the server checks for an existing row and returns 409 for running/success. For a genuinely missing row it inserts a new row; the unique item/channel constraint resolves racing initial claims, and duplicate insertion returns 409. Success transitions only from running. Failed transitions from pending/running. Existing success cannot be overwritten through this endpoint.

This prevents duplicate starting claims through the new API, but is not a full durable job queue: there is no job-specific lease, heartbeat or claim owner in the existing schema. Two active legacy direct-DB clients can bypass the API until the access cutover occurs. A crashed running row remains running and requires an explicit recovery design; the server does not silently retry it. Unknown post-submit outcomes require checking the mall before retrying.

Completion preserves existing `done=true` and only sets it when every requested retail/wholesale channel is success. Naver need/name/price data remains stored but is not counted as implemented automation. Show this as Godomall completion, not a successful Naver registration. No Naver result is fabricated.

The manual completion endpoint separately preserves the existing registrar checkbox workflow. A false→true transition stamps `done_at`; true→false clears it. Repeating the same state keeps the timestamp unchanged. Its conditional write detects a concurrent status change, and it never changes channel registrations. Reads do not synchronize or modify completion. List `doneCount` therefore counts manual/automatic completion independently of channel success. Channel totals and success counts refer to currently requested channels; running/failed counts refer to recorded channel rows. Empty lists return all summary counts as zero.

## Permission cutover — reviewed, not applied

`supabase/cutover-review.sql` is a reviewed deployment-coordination script, not an automatically applied migration. It revokes anonymous/authenticated direct table and draft-RPC access, removes the known open policies, grants the Worker service role the required access, and restricts direct writes only to the thumbnail bucket. It does not delete or migrate rows, alter existing cleanup functions, or change public image reading.

Until that script is coordinated and applied, **the old anonymous endpoints remain reachable**, even though the new Worker checks admin/viewer correctly. A frontend login screen or hidden buttons cannot close those paths. Cutover must happen with the old website/runner stopped and the new authenticated website/runner ready. Verify Auth membership, a real administrator, a real viewer, signed-out denial, read/save/upload, claim conflict and no secret leakage before considering access control deployed.

Role assignment uses a trusted Auth administrative process. Do not write `calla_role` through user metadata. No Auth users, roles or policies were changed by this implementation.

2026-10-01: 가입·아이디 로그인·첫 관리자 설정·관리자 계정 관리 API와 화면을 추가했습니다. 현재 상태와 권한은 매 요청의 Auth 사용자 조회로 검사합니다. 사용자 생성·승인·중지·비밀번호 변경·삭제 계약 및 배포 설정은 [계정 관리 기록](account-management.md)을 참고하세요. 운영 계정 생성이나 정책 전환은 이 작업에서 실행하지 않았습니다.

## Remaining integration constraints

- The existing list-save RPC has no optimistic revision argument. Settings writes are protected from stale revisions, but list drafts still use the legacy last-writer behavior. Do not claim conflict-safe concurrent list editing.
- Retain `/view/?list=<UUID>`, `html[data-automation-ready]` and `script#automation-data` if external consumers still use them. With login required, those consumers also need an authenticated session.
- The new runner maps retail regular price to the existing verified `fixedPrice` selector; null skips input and zero is entered explicitly. Fake locator tests verify the mapping, while live mall entry remains unverified.
- Copying a product clears owned thumbnail paths and requires reattachment, avoiding a shared reference that the legacy three-day completion cleanup could delete. External image URLs and detail images are preserved; the original item is unchanged.
- Browser image validation is a timestamped observation, not a permanent guarantee. Preserve `linkEnabled/linkUrl` from newer main and distinguish readiness from execution outcome.
- This API does not yet create durable jobs/event logs or support Smartstore execution. Its registration table is the latest result per item/channel.

## Verification

`node --import tsx --test tests/server.test.ts tests/domain.test.ts` passes 22 tests covering secret-free config and public-key misconfiguration, unauthenticated/metadata/verified-email authorization, viewer write denial, HTML/legacy-field preservation, duplicate/foreign IDs, date/body bounds, settings revision conflict, concurrent claims, Godomall-only completion, explicit manual completion and sanitized upstream errors. Domain tests cover immutable draft serialization without completion fields, raw HTML versus display names, linked images, copied-product completion reset, leading-zero category codes, null prices, readiness/save flags and run eligibility. No production write was used to test these paths. Full end-to-end verification requires configured Worker secrets and an authorized test list.

Official references reviewed: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [verified getUser lookup](https://supabase.com/docs/reference/javascript/auth-getuser), [Supabase breaking changes](https://supabase.com/changelog?types=breaking-change), [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).
