"""고도몰 상품 등록 폼 채우기 + 저장 검증. 소매/도매는 가격 입력부만 분기."""
from __future__ import annotations

import os
import re
import time
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import requests
from playwright.sync_api import Page, TimeoutError as PWTimeout

from . import config
from .config import SEL, Mall
from .db import Item


class RegisterError(Exception):
    """해당 건을 실패 처리하고 다음 건으로 넘어가야 하는 오류."""


@dataclass
class Result:
    ok: bool
    goods_no: Optional[str] = None
    error: Optional[str] = None
    warnings: list[str] = field(default_factory=list)
    dialogs: list[str] = field(default_factory=list)


# ---------------------------------------------------------------- 유틸
def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "")
    return re.sub(r"[\s\-_./()]+", "", s).casefold()


def _slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
    return s or "thumb"


def _ascii_safe(name: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9._-]+", name or ""))


def _price_text(v: int) -> str:
    return str(int(v))


# 진행 로그 출력 경로. core.run()이 UI에 맞게 갈아 끼운다(터미널이면 print, 창이면 로그 칸).
LOG = print


def _log(msg: str) -> None:
    LOG(f"    {msg}")


def _attach_dialog_collector(page: Page) -> list[str]:
    """alert/confirm을 자동 수락하고 문구를 모은다. 페이지당 한 번만 등록."""
    store = getattr(page, "_godo_dialogs", None)
    if store is None:
        store = []
        setattr(page, "_godo_dialogs", store)

        def _on_dialog(d):
            store.append(d.message)
            try:
                d.accept()
            except Exception:
                pass

        page.on("dialog", _on_dialog)
    return store


# ---------------------------------------------------------------- 사전 검증
def validate_item(item: Item, mall: Mall) -> tuple[list[str], list[str]]:
    """(치명 오류 목록, 경고 목록)"""
    errors, warnings = [], []
    if not item.name_own:
        errors.append("자사몰 상품명이 비어 있음")
    code = item.category_code(mall.key)
    if not code:
        errors.append(f"{mall.label} 카테고리 미선택")
    elif not re.fullmatch(r"(\d{3}){1,4}", code):
        errors.append(f"{mall.label} 카테고리 코드 형식 오류: {code}")
    if mall.key == "retail" and item.price_retail is None:
        errors.append("소매몰 가격이 비어 있음")
    if mall.key == "wholesale" and item.price_retail is None and item.price_wholesale is None:
        errors.append("도매몰 가격과 소매몰 가격이 모두 비어 있음")
    if not item.thumbnail_url:
        warnings.append("썸네일 없음 (이미지 없이 등록)")
    if not item.detail_html:
        warnings.append("상세페이지 HTML 없음")
    if not item.brand:
        warnings.append("브랜드 비어 있음")
    return errors, warnings


# ---------------------------------------------------------------- 폼 입력
def open_register_form(page: Page, mall: Mall) -> None:
    if "goods_register.php" not in page.url or page.url.count("?") or page.url.count("#"):
        page.goto(mall.register_url, wait_until="domcontentloaded")
    page.wait_for_selector(SEL["goods_name"], timeout=config.UI_TIMEOUT_MS)
    if "login" in page.url or not page.query_selector(SEL["form"]):
        raise RegisterError(f"{mall.label} 관리자 로그인이 필요합니다.")
    # SmartEditor2 준비 대기
    try:
        page.wait_for_function(
            "() => window.oEditors && oEditors.getById && oEditors.getById['editor']",
            timeout=config.UI_TIMEOUT_MS,
        )
    except PWTimeout:
        raise RegisterError("상세설명 에디터가 로딩되지 않았습니다.")


def fill_text(page: Page, selector: str, value: str) -> None:
    loc = page.locator(selector).first
    loc.fill(value)
    loc.dispatch_event("change")


def set_display(page: Page) -> None:
    """등록 시점에는 PC/모바일 모두 '노출 안 함'. 판매 상태는 건드리지 않는다."""
    page.locator(SEL["display_pc"].format(value=config.DISPLAY_PC)).first.check()
    page.locator(SEL["display_mobile"].format(value=config.DISPLAY_MOBILE)).first.check()


def set_category(page: Page, code: str, warnings: list[str]) -> None:
    depths = [code[: 3 * (i + 1)] for i in range(len(code) // 3)]
    try:
        for i, prefix in enumerate(depths):
            sel = SEL["cate_select"].format(depth=i + 1)
            page.wait_for_selector(f'{sel} option[value="{prefix}"]', state="attached", timeout=config.UI_TIMEOUT_MS)
            page.select_option(sel, prefix)
        page.click(SEL["cate_apply"])
        page.wait_for_selector(SEL["cate_row"].format(code=code), state="attached", timeout=5000)
    except PWTimeout:
        # 셀렉트 조작이 안 될 때: 페이지가 만드는 것과 같은 hidden input 행을 직접 주입
        warnings.append(f"카테고리 셀렉트 조작 실패 → 코드 직접 주입({code})")
        page.evaluate(
            """(code) => {
                const tbody = document.querySelector('#cateGoodsInfo tbody');
                if (!tbody) throw new Error('카테고리 표를 찾을 수 없음');
                document.querySelectorAll('#cateGoodsInfo thead, #cateGoodsInfo tbody').forEach(e => e.style.display = '');
                if (document.getElementById('cateGoodsInfo' + code)) return;
                const tr = document.createElement('tr');
                tr.id = 'cateGoodsInfo' + code;
                tr.innerHTML =
                  `<td class='center'><input type='hidden' name='link[cateCd][]' value='${code}'>` +
                  `<input type='hidden' name='link[cateLinkFl][]' value='y' id='cateLink_${code}'>` +
                  `<input type='radio' name='cateCd' value='${code}'></td>` +
                  `<td>${code}</td><td class='center'>${code}</td>` +
                  `<td class='center'><input type='button' class='btn btn-sm btn-white btn-icon-minus' onclick='field_remove("cateGoodsInfo${code}")' value='삭제'></td>`;
                tbody.appendChild(tr);
            }""",
            code,
        )
    # 대표 카테고리 체크 보장
    page.evaluate(
        """(code) => {
            const r = document.querySelector(`input[name="cateCd"][value="${code}"]`);
            if (r && !document.querySelector('input[name="cateCd"]:checked')) r.checked = true;
        }""",
        code,
    )
    if not page.query_selector(SEL["cate_row"].format(code=code)):
        raise RegisterError(f"카테고리 {code} 연결 실패")


_BRAND_SCAN_JS = """
(brand) => {
  const norm = s => (s || '').normalize('NFKC').replace(/[\\s\\-_./()]+/g, '').toLowerCase();
  const target = norm(brand);
  const modal = [...document.querySelectorAll('.modal')].filter(m => m.offsetParent !== null || m.classList.contains('in')).pop();
  if (!modal) return { found: false, reason: 'no-modal', rows: [] };
  const radios = [...modal.querySelectorAll('input[type=radio], input[type=checkbox]')];
  const rows = radios.map((r, i) => {
    const holder = r.closest('tr') || r.closest('label') || r.closest('li') || r.parentElement;
    const text = holder ? holder.innerText || holder.textContent : '';
    return { i, text: (text || '').trim() };
  });
  let idx = rows.findIndex(r => norm(r.text) === target);
  if (idx < 0) idx = rows.findIndex(r => r.text.split(/[\\n\\t]+/).some(t => norm(t) === target));
  if (idx < 0) idx = rows.findIndex(r => target && norm(r.text).includes(target));
  return { found: idx >= 0, index: idx, rows: rows.map(r => r.text).slice(0, 200) };
}
"""

_MODAL_BUTTON_JS = """
(labels) => {
  const modal = [...document.querySelectorAll('.modal')].filter(m => m.offsetParent !== null || m.classList.contains('in')).pop();
  if (!modal) return false;
  const btns = [...modal.querySelectorAll('button, input[type=button], input[type=submit], a.btn')];
  const skip = ['닫기', '취소', '×', 'x'];
  for (const label of labels) {
    const b = btns.find(el => {
      const t = (el.innerText || el.value || '').trim();
      return t === label && !skip.includes(t);
    });
    if (b) { b.click(); return true; }
  }
  return false;
}
"""


def select_brand(page: Page, brand: str, warnings: list[str], debug_dir: Optional[Path]) -> None:
    if not brand:
        return
    page.click(SEL["brand_name"])
    try:
        page.wait_for_selector(".modal.in, .modal[style*='display: block']", timeout=config.UI_TIMEOUT_MS)
    except PWTimeout:
        warnings.append("브랜드 선택 창이 열리지 않음")
        return
    page.wait_for_timeout(600)

    def scan() -> dict:
        return page.evaluate(_BRAND_SCAN_JS, brand)

    res = scan()
    if not res.get("found"):
        # 검색창이 있으면 브랜드명으로 검색 후 재시도
        search = page.locator(".modal.in input[type='text'], .modal[style*='display: block'] input[type='text']").first
        try:
            if search.count() and search.is_visible():
                search.fill(brand)
                search.press("Enter")
                page.wait_for_timeout(1500)
                if not page.evaluate(_BRAND_SCAN_JS, brand).get("found"):
                    page.evaluate(_MODAL_BUTTON_JS, ["검색"])
                    page.wait_for_timeout(1500)
                res = scan()
        except Exception:
            pass

    if not res.get("found"):
        if debug_dir:
            debug_dir.mkdir(parents=True, exist_ok=True)
            html = page.evaluate(
                "() => { const m=[...document.querySelectorAll('.modal')].pop(); return m ? m.outerHTML : ''; }"
            )
            (debug_dir / f"brand-layer-{_slug(brand)}.html").write_text(html, encoding="utf-8")
        _close_modal(page)
        warnings.append(f"브랜드 미매칭: '{brand}' (고도몰 브랜드 목록에 없음)")
        return

    page.evaluate(
        """(i) => {
            const modal = [...document.querySelectorAll('.modal')].filter(m => m.offsetParent !== null || m.classList.contains('in')).pop();
            const r = [...modal.querySelectorAll('input[type=radio], input[type=checkbox]')][i];
            r.click(); r.checked = true; r.dispatchEvent(new Event('change', {bubbles: true}));
        }""",
        res["index"],
    )
    clicked = page.evaluate(_MODAL_BUTTON_JS, ["선택", "적용", "확인", "등록", "저장"])
    if not clicked:
        warnings.append("브랜드 선택 창의 적용 버튼을 찾지 못함")
        _close_modal(page)
        return
    page.wait_for_timeout(800)
    value = page.input_value(SEL["brand_name"])
    if not value or _norm(brand) not in _norm(value) and _norm(value) not in _norm(brand):
        warnings.append(f"브랜드 적용 확인 실패 (입력값: '{value}')")


def _close_modal(page: Page) -> None:
    try:
        page.evaluate(_MODAL_BUTTON_JS, ["닫기", "취소"])
        page.wait_for_timeout(300)
        if page.query_selector(".modal.in"):
            page.keyboard.press("Escape")
    except Exception:
        pass


def set_prices(page: Page, item: Item, mall: Mall, warnings: list[str]) -> None:
    if mall.key == "retail":
        if item.price_retail_regular is not None:
            fill_text(page, SEL["fixed_price"], _price_text(item.price_retail_regular))
        fill_text(page, SEL["goods_price"], _price_text(item.price_retail))
        return
    # 도매몰: 정가 = 소매몰 가격, 미승인(goodsPrice) = 베이직(없으면 소매몰 가격), 마스터 = 없으면 베이직
    basic = item.price_wholesale if item.price_wholesale is not None else item.price_retail
    master = item.price_wholesale_master if item.price_wholesale_master is not None else basic
    if item.price_wholesale is None:
        warnings.append("도매 베이직 가격 없음 → 소매몰 가격 사용")
    if item.price_wholesale_master is None:
        warnings.append("도매 마스터 가격 없음 → 베이직 가격 사용")
    if item.price_retail is not None:
        fill_text(page, SEL["fixed_price"], _price_text(item.price_retail))
    else:
        warnings.append("소매몰 가격 없음 → 정가 미입력")
    fill_text(page, SEL["goods_price"], _price_text(basic))
    page.wait_for_timeout(200)
    fields = config.WHOLESALE_GROUP_PRICE_FIELDS
    fill_text(page, fields["basic"], _price_text(basic))
    fill_text(page, fields["master"], _price_text(master))
    # 가입거절 회원가: 페이지가 자동으로 채우지 않으면 미승인가와 동일하게
    rejected = page.input_value(fields["rejected"]).replace(",", "").strip()
    if not rejected or rejected == "0":
        fill_text(page, fields["rejected"], _price_text(basic))


def download_thumbnail(item: Item, tmp_dir: Path) -> Optional[Path]:
    thumb = item.thumbnail
    url = item.thumbnail_url
    if not url:
        return None
    src_name = os.path.basename(thumb.get("path") or thumb.get("originalName") or url.split("?")[0])
    ext = os.path.splitext(src_name)[1].lower()
    if ext not in config.ALLOWED_IMAGE_EXT:
        mime = (thumb.get("mimeType") or "").lower()
        ext = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}.get(mime, ".jpg")
    if _ascii_safe(src_name) and os.path.splitext(src_name)[1].lower() in config.ALLOWED_IMAGE_EXT:
        name = src_name
    else:
        name = f"{_slug(item.brand)}-{_slug(item.model or item.name_own)}{ext}"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    dest = tmp_dir / f"{item.id}-{name}"
    r = requests.get(url, timeout=60, allow_redirects=False)
    r.raise_for_status()
    if 300 <= r.status_code < 400:
        raise RegisterError("썸네일 리다이렉트는 허용하지 않습니다. 최종 이미지 주소를 저장하세요.")
    if not (r.headers.get("content-type") or "").startswith("image/"):
        raise RegisterError(f"썸네일 응답이 이미지가 아님: {r.headers.get('content-type')} ({url})")
    dest.write_bytes(r.content)
    return dest


def set_thumbnail(page: Page, file_path: Path) -> None:
    resize = page.locator(SEL["image_resize_original"]).first
    if not resize.is_checked():
        resize.check()  # onclick → 확대/상세/썸네일/리스트 자동 리사이즈 모두 체크
    inp = page.locator(SEL["image_original"]).first
    inp.set_input_files(str(file_path))
    # 실제로 파일이 붙었는지 확인 (bootstrap-filestyle 표시용 텍스트도 갱신)
    attached = page.evaluate(
        """(sel) => {
            const el = document.querySelector(sel);
            if (!el || !el.files || !el.files.length) return '';
            el.dispatchEvent(new Event('change', {bubbles: true}));
            return el.files[0].name;
        }""",
        SEL["image_original"],
    )
    if not attached:
        raise RegisterError("원본 이미지 input에 파일이 붙지 않았습니다.")
    _log(f"썸네일 파일: {attached}")


def set_description(page: Page, html: str) -> None:
    got = page.evaluate(
        """(html) => {
            const ed = oEditors.getById['editor'];
            if (typeof ed.setIR === 'function') ed.setIR(html);
            else ed.exec('SET_IR', [html]);
            ed.exec('UPDATE_CONTENTS_FIELD', []);
            return document.querySelector('textarea#editor').value;
        }""",
        html,
    )
    if "<img" in html and "<img" not in (got or ""):
        raise RegisterError("상세설명 에디터에 HTML이 반영되지 않았습니다.")


def fill_form(page: Page, item: Item, mall: Mall, tmp_dir: Path, debug_dir: Optional[Path]) -> list[str]:
    """폼을 채우고 경고 목록을 반환. 치명 오류는 RegisterError."""
    warnings: list[str] = []
    _attach_dialog_collector(page)

    _log("카테고리")
    set_category(page, item.category_code(mall.key), warnings)

    _log("노출 상태: PC/모바일 노출 안 함")
    set_display(page)

    _log("상품명")
    fill_text(page, SEL["goods_name"], item.name_own)

    _log("브랜드 / 제조사 / 원산지")
    select_brand(page, item.brand, warnings, debug_dir)
    fill_text(page, SEL["maker"], item.brand)
    if item.origin:
        fill_text(page, SEL["origin"], item.origin)

    _log("가격")
    set_prices(page, item, mall, warnings)

    if item.thumbnail_url:
        _log("썸네일")
        try:
            path = download_thumbnail(item, tmp_dir)
            if path:
                set_thumbnail(page, path)
        except Exception as e:  # 이미지 실패는 경고로만
            warnings.append(f"썸네일 업로드 실패: {e}")

    if item.detail_html:
        _log("상세설명(HTML)")
        set_description(page, item.detail_html)

    return warnings


# ---------------------------------------------------------------- 저장/검증
def submit_and_verify(page: Page, item: Item, mall: Mall) -> Result:
    dialogs = _attach_dialog_collector(page)
    seen = len(dialogs)
    start_url = page.url
    frame_before = _iframe_text(page)

    page.click(SEL["submit"])
    deadline = time.time() + config.SAVE_TIMEOUT
    while time.time() < deadline:
        page.wait_for_timeout(500)
        new_msgs = dialogs[seen:]
        for m in new_msgs:
            if any(h in m for h in config.SAVE_FAIL_HINTS) and not any(h in m for h in config.SAVE_OK_HINTS):
                return Result(False, error=f"저장 실패 alert: {m}", dialogs=list(new_msgs))
        try:
            navigated = page.url != start_url
        except Exception:
            navigated = True
        frame_text = _iframe_text(page)
        frame_changed = frame_text and frame_text != frame_before
        if navigated or frame_changed:
            page.wait_for_timeout(1000)
            goods_no = _extract_goods_no(page.url) or _extract_goods_no(frame_text or "")
            if any("실패" in m or "오류" in m for m in dialogs[seen:]):
                return Result(False, error="; ".join(dialogs[seen:]), dialogs=list(dialogs[seen:]))
            return Result(True, goods_no=goods_no, dialogs=list(dialogs[seen:]))
    # 시간 내 반응 없음: 폼 유효성 오류 표시 확인
    errs = page.evaluate(
        "() => [...document.querySelectorAll('label.error, .error:not(input)')].filter(e => e.offsetParent !== null).map(e => e.innerText.trim()).filter(Boolean)"
    )
    detail = "; ".join(errs or dialogs[seen:]) or "저장 후 응답 없음"
    return Result(False, error=f"저장 결과 확인 실패: {detail}", dialogs=list(dialogs[seen:]))


def _iframe_text(page: Page) -> str:
    try:
        f = page.frame(name="ifrmProcess")
        if not f:
            return ""
        return f.evaluate("() => document.documentElement ? document.documentElement.outerHTML : ''") or ""
    except Exception:
        return ""


def _extract_goods_no(text: str) -> Optional[str]:
    m = re.search(r"goodsNo=(\d+)", text or "")
    return m.group(1) if m else None


def find_goods_no(page: Page, mall: Mall, name: str) -> Optional[str]:
    """저장 후 상품 리스트에서 같은 상품명의 상품번호를 찾는다(최선 노력)."""
    try:
        page.goto(mall.list_url, wait_until="domcontentloaded")
        page.wait_for_timeout(1500)
        return page.evaluate(
            """(name) => {
                const rows = [...document.querySelectorAll('table tr')].filter(tr => (tr.innerText || '').includes(name));
                for (const tr of rows) {
                    const cb = tr.querySelector('input[name="goodsNo[]"], input[name="chk[]"], input[name="goodsNoData[]"]');
                    if (cb && /^\\d+$/.test(cb.value)) return cb.value;
                    const a = [...tr.querySelectorAll('a[href*="goodsNo="]')][0];
                    if (a) { const m = a.href.match(/goodsNo=(\\d+)/); if (m) return m[1]; }
                }
                return null;
            }""",
            name,
        )
    except Exception:
        return None
