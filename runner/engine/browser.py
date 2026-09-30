"""자동화용 Chrome 실행/접속.

일반 Chrome에는 자동화가 붙을 수 없으므로, 전용 프로필 폴더로 Chrome을
원격 디버깅 포트와 함께 띄우고 Playwright가 CDP로 접속합니다.
전용 프로필이라 한 번 로그인하면 다음 실행에도 로그인이 유지됩니다.
"""
from __future__ import annotations

import os
import socket
import subprocess
import time
from urllib.parse import urlparse
from typing import Optional

from playwright.sync_api import Browser, Page, Playwright

from . import config

CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def _port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def ensure_chrome() -> bool:
    """디버깅 포트가 열린 Chrome이 없으면 새로 띄운다. 반환값: 새로 띄웠는지."""
    if _port_open(config.CHROME_DEBUG_PORT):
        return False
    if not os.path.exists(CHROME_BIN):
        raise RuntimeError("Google Chrome이 /Applications 에 설치되어 있어야 합니다.")
    os.makedirs(config.CHROME_PROFILE_DIR, exist_ok=True)
    subprocess.Popen(
        [
            CHROME_BIN,
            f"--remote-debugging-port={config.CHROME_DEBUG_PORT}",
            f"--user-data-dir={config.CHROME_PROFILE_DIR}",
            "--no-first-run",
            "--no-default-browser-check",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    for _ in range(60):
        if _port_open(config.CHROME_DEBUG_PORT):
            return True
        time.sleep(0.5)
    raise RuntimeError("Chrome 디버깅 포트가 열리지 않았습니다. Chrome을 모두 종료한 뒤 다시 시도하세요.")


def connect(pw: Playwright) -> Browser:
    return pw.chromium.connect_over_cdp(f"http://127.0.0.1:{config.CHROME_DEBUG_PORT}")


def all_pages(browser: Browser) -> list[Page]:
    pages: list[Page] = []
    for ctx in browser.contexts:
        pages.extend(ctx.pages)
    return pages


def find_mall_page(browser: Browser, admin_host: str, must_be_register: bool = False) -> Optional[Page]:
    """해당 몰 관리자 탭을 찾는다. must_be_register면 상품 등록 화면 탭만."""
    best: Optional[Page] = None
    for p in all_pages(browser):
        url = p.url or ""
        if urlparse(url).hostname != admin_host:
            continue
        if "goods_register.php" in url:
            return p
        if not must_be_register and best is None:
            best = p
    return best


def open_page(browser: Browser, url: str) -> Page:
    ctx = browser.contexts[0] if browser.contexts else browser.new_context()
    page = ctx.new_page()
    page.goto(url, wait_until="domcontentloaded")
    return page
