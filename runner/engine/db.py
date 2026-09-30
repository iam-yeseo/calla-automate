"""Supabase 조회 및 등록 상태 갱신."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from . import config

CHANNELS = ("retail", "wholesale")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_int(v: Any) -> Optional[int]:
    if v is None or v == "":
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


@dataclass
class Item:
    id: str
    list_id: str
    seq: int
    brand: str
    name_own: str
    model: str
    need_retail: str
    need_wholesale: str
    price_retail: Optional[int]
    price_wholesale: Optional[int]          # 베이직
    price_wholesale_master: Optional[int]   # 마스터
    done: bool
    price_retail_regular: Optional[int] = None  # 소매 정가; None이면 기존 관리자 기본값 유지
    automation: dict = field(default_factory=dict)
    image_url: str = ""
    origin: str = ""
    registrations: dict[str, dict] = field(default_factory=dict)

    @classmethod
    def from_row(cls, r: dict) -> "Item":
        auto = r.get("automation") or {}
        if isinstance(auto, str):
            try:
                auto = json.loads(auto)
            except json.JSONDecodeError:
                auto = {}
        # 원산지: 추후 웹툴에 추가될 예정. 컬럼 또는 automation.origin 어느 쪽이든 읽음.
        origin = (r.get("origin") or auto.get("origin") or "").strip()
        return cls(
            id=r["id"],
            list_id=r["list_id"],
            seq=int(r.get("seq") or 0),
            brand=(r.get("brand") or "").strip(),
            name_own=(r.get("name_own") or "").strip(),
            model=(r.get("model") or "").strip(),
            need_retail=(r.get("need_retail") or "").strip(),
            need_wholesale=(r.get("need_wholesale") or "").strip(),
            price_retail=_to_int(r.get("price_retail")),
            price_retail_regular=_to_int(r.get("price_retail_regular")),
            price_wholesale=_to_int(r.get("price_wholesale")),
            price_wholesale_master=_to_int(r.get("price_wholesale_master")),
            done=bool(r.get("done")),
            automation=auto if isinstance(auto, dict) else {},
            image_url=(r.get("image_url") or "").strip(),
            origin=origin,
        )

    # ----- 파생 값 -----
    @property
    def display_name(self) -> str:
        return f"{self.brand} {self.model or self.name_own}".strip()

    def needs(self, channel: str) -> bool:
        return (self.need_retail if channel == "retail" else self.need_wholesale) == "필요"

    def category_code(self, channel: str) -> str:
        codes = self.automation.get("categoryCodes") or {}
        return str(codes.get(channel) or "").strip()

    @property
    def thumbnail(self) -> dict:
        t = self.automation.get("thumbnail")
        return t if isinstance(t, dict) else {}

    @property
    def thumbnail_url(self) -> str:
        """DB의 automation.thumbnail에는 url 없이 Storage path만 저장됨. 공개 URL을 만들어 반환."""
        t = self.thumbnail
        if t.get("url"):
            return str(t["url"])
        path = (t.get("path") or "").lstrip("/")
        if path and config.SUPABASE_URL:
            return f"{config.SUPABASE_URL.rstrip('/')}/storage/v1/object/public/{config.THUMBNAIL_BUCKET}/{path}"
        return (self.image_url or "").strip()

    @property
    def detail_html(self) -> str:
        return (self.automation.get("detailHtml") or "").strip()

    def status(self, channel: str) -> str:
        return (self.registrations.get(channel) or {}).get("status") or "pending"

    def is_pending(self, channel: str) -> bool:
        """이 채널에 등록이 필요하고 아직 성공하지 않은 상품인지."""
        return (not self.done) and self.needs(channel) and self.status(channel) != "success"


