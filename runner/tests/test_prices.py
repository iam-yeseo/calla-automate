"""Form mapping tests use fake locators; Playwright/requests are not installed or launched."""
import importlib
import sys
import types
import unittest
from unittest.mock import patch
from runner.engine.db import Item
from runner.engine.config import MALLS, SEL, WHOLESALE_GROUP_PRICE_FIELDS


def form_module():
    requests = types.ModuleType('requests')
    api = types.ModuleType('playwright.sync_api')
    api.Page = object
    api.TimeoutError = TimeoutError
    playwright = types.ModuleType('playwright')
    playwright.sync_api = api
    with patch.dict(sys.modules, {'requests': requests, 'playwright': playwright, 'playwright.sync_api': api}):
        return importlib.import_module('runner.engine.godomall')


class FakeLocator:
    def __init__(self, page, selector):
        self.page, self.selector = page, selector
    @property
    def first(self):
        return self
    def fill(self, value):
        self.page.values[self.selector] = value
    def dispatch_event(self, event):
        self.page.events.append((self.selector, event))


class FakePage:
    def __init__(self):
        self.values = {}
        self.events = []
    def locator(self, selector):
        return FakeLocator(self, selector)
    def wait_for_timeout(self, _):
        pass
    def input_value(self, selector):
        return self.values.get(selector, '0')


class PriceMappingTests(unittest.TestCase):
    def item(self, **values):
        return Item.from_row({'id': 'item', 'list_id': 'list', 'seq': 1, 'name_own': '상품',
                              'price_retail': 1000, 'price_wholesale': 900,
                              'price_wholesale_master': 800, **values})
    def test_retail_regular_uses_existing_fixed_price_selector(self):
        page = FakePage()
        form_module().set_prices(page, self.item(price_retail_regular=2000), MALLS['retail'], [])
        self.assertEqual(SEL['fixed_price'], 'input[name="fixedPrice"]')
        self.assertEqual(page.values[SEL['fixed_price']], '2000')
        self.assertEqual(page.values[SEL['goods_price']], '1000')
        self.assertIn((SEL['fixed_price'], 'change'), page.events)
    def test_null_or_missing_retail_regular_does_not_touch_the_field(self):
        for values in ({}, {'price_retail_regular': None}, {'price_retail_regular': ''}):
            page = FakePage()
            form_module().set_prices(page, self.item(**values), MALLS['retail'], [])
            self.assertNotIn(SEL['fixed_price'], page.values)
            self.assertEqual(page.values[SEL['goods_price']], '1000')
    def test_zero_retail_regular_is_explicitly_written(self):
        page = FakePage()
        item = self.item(price_retail_regular=0)
        self.assertEqual(item.price_retail_regular, 0)
        form_module().set_prices(page, item, MALLS['retail'], [])
        self.assertEqual(page.values[SEL['fixed_price']], '0')
    def test_wholesale_keeps_retail_sale_price_as_fixed_price(self):
        page = FakePage()
        form_module().set_prices(page, self.item(price_retail_regular=2000), MALLS['wholesale'], [])
        self.assertEqual(page.values[SEL['fixed_price']], '1000')
        self.assertEqual(page.values[SEL['goods_price']], '900')
        self.assertEqual(page.values[WHOLESALE_GROUP_PRICE_FIELDS['master']], '800')


if __name__ == '__main__':
    unittest.main()
