/*
 * Copyright (C) 2026 Stanislav Georgiev
 * https://github.com/slaviboy
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function drawFrame(page: Page, x: number, y: number, name: string) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('f');
  await page.mouse.move(box.x + x, box.y + y);
  await page.mouse.down();
  await page.mouse.move(box.x + x + 140, box.y + y + 120, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name })).toBeVisible();
}

test('Share prototype › Copy link in presentation view copies the address of the flow selected', async ({ page, context, browserName }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await drawFrame(page, 350, 200, 'Frame 1');
  await drawFrame(page, 650, 200, 'Frame 2');
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Frame 2' });
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const present = await popup;
  await expect(present.getByTestId('presentation')).toHaveAttribute('data-ready', 'true');
  await present.getByRole('button', { name: 'Share prototype' }).click();
  await present.getByRole('menuitem', { name: 'Copy link' }).click();
  await expect(present.getByText('Link copied')).toBeVisible();
  if (browserName === 'chromium') {
    const link = await present.evaluate(() => navigator.clipboard.readText());
    const url = new URL(link);
    expect(url.searchParams.get('present')).toBe('1');
    expect(url.searchParams.get('node')).toBeTruthy();
    expect(url.searchParams.get('file')).toBe(new URL(present.url()).searchParams.get('file'));
  }
});
