import { expect, type Locator } from '@playwright/test';

export async function chooseOption(control: Locator, value: string | { label: string }) {
  await control.click();
  const panelId = await control.getAttribute('aria-controls');
  expect(panelId).toBeTruthy();
  const panel = control.page().locator(`[id=${JSON.stringify(panelId)}]`);
  const option = typeof value === 'string'
    ? panel.locator(`[role="option"][data-value=${JSON.stringify(value)}]`)
    : panel.getByRole('option', { name: value.label, exact: true });
  await option.click();
  await expect(control).toHaveAttribute('aria-expanded', 'false');
}
