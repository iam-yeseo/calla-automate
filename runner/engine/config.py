"""몰별 URL·셀렉터·기본값. 고도몰 등록 화면 구조가 바뀌면 이 파일만 고치면 됩니다."""
from __future__ import annotations

import os
from dataclasses import dataclass, field

SUPABASE_URL = ""  # Public thumbnail URL is supplied by the authenticated Worker context.
CHROME_DEBUG_PORT = int(os.environ.get("CALLA_CHROME_DEBUG_PORT", "9223"))
THUMBNAIL_BUCKET = "product-thumbnails"
CHROME_PROFILE_DIR = os.path.expanduser(os.environ.get("CALLA_CHROME_PROFILE_DIR", "~/.calla-automate-runner/chrome"))

# 등록 시 노출 상태 (y=노출함, n=노출 안 함). 등록 직후에는 둘 다 노출 안 함.
DISPLAY_PC = "n"
DISPLAY_MOBILE = "n"

# 상품 간 대기 시간(초). 연속 등록 시 서버 부하를 줄이기 위함.
DELAY_BETWEEN_ITEMS = 2.0
# 저장 후 결과(리다이렉트/alert)를 기다리는 최대 시간(초)
SAVE_TIMEOUT = 60.0
# 브랜드 선택 레이어 등 UI 대기 시간(밀리초)
UI_TIMEOUT_MS = 15000


@dataclass(frozen=True)
class Mall:
    key: str              # 'retail' | 'wholesale'
    label: str            # 소매몰 / 도매몰
    admin_host: str       # 관리자 도메인
    need_field: str       # product_items.need_retail / need_wholesale
    login_hint: str

    @property
    def register_url(self) -> str:
        return f"http://{self.admin_host}/goods/goods_register.php"

    @property
    def list_url(self) -> str:
        return f"http://{self.admin_host}/goods/goods_list.php"


MALLS: dict[str, Mall] = {
    "retail": Mall(
        key="retail",
        label="소매몰",
        admin_host="gdadmin.callamedia.kr",
        need_field="need_retail",
        login_hint="칼라미디어 관리자",
    ),
    "wholesale": Mall(
        key="wholesale",
        label="도매몰",
        admin_host="gdadmin.callamedia1.godomall.com",
        need_field="need_wholesale",
        login_hint="칼라미디어 B2B 관리자",
    ),
}

# 도매몰 회원등급별 판매가 input name. 미승인 등급은 goodsPrice(기본 판매가)를 씀.
WHOLESALE_GROUP_PRICE_FIELDS = {
    "basic": 'input[name="groupPrice[5]"]',     # 베이직
    "master": 'input[name="groupPrice[9]"]',    # 마스터
    "rejected": 'input[name="groupPrice[10]"]', # 가입거절
}

# 공통 셀렉터
SEL = {
    "form": "#frmGoods",
    "goods_name": 'input[name="goodsNm"]',
    # 노출 상태: 등록 시 PC/모바일 모두 '노출 안 함'(n). 판매 상태는 건드리지 않음.
    "display_pc": 'input[name="goodsDisplayFl"][value="{value}"]',
    "display_mobile": 'input[name="goodsDisplayMobileFl"][value="{value}"]',
    "maker": 'input[name="makerNm"]',
    "origin": 'input[name="originNm"]',
    "brand_name": 'input[name="brandCdNm"]',
    "brand_button": 'button:has-text("브랜드 선택")',
    "fixed_price": 'input[name="fixedPrice"]',
    "goods_price": 'input[name="goodsPrice"]',
    "cate_select": "#cateGoods{depth}",       # depth 1~4
    "cate_apply": "#btn_category_select",
    "cate_row": "#cateGoodsInfo{code}",
    "cate_radio": 'input[name="cateCd"][value="{code}"]',
    "image_resize_original": 'input[name="imageResize[original]"]',
    "image_original": 'input[name="image[imageOriginal][]"]',
    "description_textarea": "textarea#editor",
    "submit": '#frmGoods input[type="submit"][value="저장"]',
    "modal": ".modal-dialog",
    "modal_close": ".bootstrap-dialog-close-button, .modal .close",
}

# 저장 결과 판정용 문구
SAVE_FAIL_HINTS = ("실패", "오류", "없습니다", "입력하", "확인해", "선택해", "불가")
SAVE_OK_HINTS = ("저장", "등록")

# 파일명 생성용 (썸네일 파일명이 영문이 아닐 때)
ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
