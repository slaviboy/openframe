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

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 5 });
  await page.mouse.up();
}

test('Suggest auto layout turns two rows of layers into nested auto layout frames', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('f');
  await drag(page, [300, 200], [600, 420]);
  for (const [x, y] of [
    [320, 220],
    [440, 220],
    [320, 320],
    [440, 320],
  ] as const) {
    await page.keyboard.press('r');
    await drag(page, [x, y], [x + 100, y + 80]);
  }
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.getByRole('menu', { name: 'Main menu' }).getByRole('menuitem', { name: /^Object/ }).click();
  await page.getByRole('menu', { name: 'Object' }).getByRole('menuitem', { name: /Suggest auto layout/ }).click();

  await expect(page.getByRole('button', { name: 'Vertical layout' })).toHaveAttribute('aria-pressed', 'true');
  // The frame now holds two row frames, each laid out horizontally.
  await expect(page.getByRole('treeitem', { name: /Frame 1/ })).toBeVisible();
  const rows = page.getByRole('treeitem', { name: /^(Expand |Collapse )?Frame$/ });
  await expect(rows).toHaveCount(2);
  await rows.first().click();
  await expect(page.getByRole('button', { name: 'Horizontal layout' })).toHaveAttribute('aria-pressed', 'true');
});
