"""Thin adapter. Importing the bridge does not launch Chrome or import Playwright."""
from pathlib import Path
from urllib.parse import urlparse
import os


class NativeEngine:
    def __init__(self, state_dir, ui):
        self.state_dir, self.ui = Path(state_dir), ui
        self.pw = None

    def __enter__(self):
        from playwright.sync_api import sync_playwright
        from .engine import browser, godomall, config
        self.browser, self.godomall, self.config = browser, godomall, config
        godomall.LOG = self.ui.log
        browser.ensure_chrome()
        self.pw = sync_playwright().start()
        try:
            self.br = browser.connect(self.pw)
        except Exception:
            self.pw.stop()
            self.pw = None
            raise
        return self

    def __exit__(self, *args):
        self.godomall.LOG = print
        if self.pw:
            self.pw.stop()  # Disconnect; preserve the user's authenticated Chrome.

    def prepare(self, item, channel):
        mall = self.config.MALLS[channel]
        errors, warnings = self.godomall.validate_item(item, mall)
        if errors:
            raise ValueError('; '.join(errors))
        url = item.thumbnail_url
        if url:
            parsed = urlparse(url)
            extra = set(filter(None, os.environ.get('CALLA_IMAGE_HOSTS', '').split(',')))
            host = parsed.hostname or ''
            if parsed.scheme != 'https' or parsed.username or parsed.password or not (
                host.endswith('.supabase.co') or host == 'calla.hgodo.com' or host in extra
            ):
                raise ValueError('허용된 HTTPS 썸네일 주소가 아닙니다. CALLA_IMAGE_HOSTS 설정을 확인하세요.')
        page = self.browser.find_mall_page(self.br, mall.admin_host, True)
        if page is None:
            page = self.browser.find_mall_page(self.br, mall.admin_host)
            if page is None:
                page = self.browser.open_page(self.br, mall.register_url)
            else:
                page.goto(mall.register_url, wait_until='domcontentloaded')
        page.bring_to_front()
        while urlparse(page.url).hostname != mall.admin_host or 'goods_register.php' not in page.url or not page.query_selector(self.config.SEL['form']):
            self.ui.wait('waiting_login', f'{mall.label}에 로그인하고 상품 등록 화면을 연 뒤 계속을 누르세요.')
            found = self.browser.find_mall_page(self.br, mall.admin_host, True)
            if found:
                page = found
        self.ui.check_stop()
        self.godomall.open_register_form(page, mall)
        tmp = self.state_dir / 'tmp' / self.ui.job_id
        tmp.mkdir(parents=True, exist_ok=True, mode=0o700)
        warnings += self.godomall.fill_form(page, item, mall, tmp, None)
        evidence = {"url": page.url, "frame": self.godomall._iframe_text(page), "dialogs": len(getattr(page, "_godo_dialogs", []))}
        return page, mall, warnings, evidence

    def review_changed(self, prepared):
        page, _, _, evidence = prepared
        return (page.url != evidence["url"] or self.godomall._iframe_text(page) != evidence["frame"] or
                len(getattr(page, "_godo_dialogs", [])) != evidence["dialogs"])

    def submit(self, prepared, item):
        page, mall, warnings = prepared[:3]
        result = self.godomall.submit_and_verify(page, item, mall)
        # A changed iframe / URL alone cannot identify the created product.
        # Never guess by searching the first product with a matching name.
        return {'ok': result.ok, 'goodsNo': result.goods_no,
                'error': result.error, 'warnings': warnings}
