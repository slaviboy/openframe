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

test('grid auto layout: columns from the arrangement, column count, spans, and persistence', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('f');
  await drag(page, [300, 200], [600, 500]);
  for (const [x, y] of [
    [320, 220],
    [440, 220],
    [320, 340],
    [440, 340],
  ] as const) {
    await page.keyboard.press('r');
    await drag(page, [x, y], [x + 100, y + 100]);
  }

  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await page.getByRole('button', { name: 'Grid layout' }).click();
  await expect(page.getByRole('button', { name: 'Grid layout' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Number of columns')).toHaveValue('2');
  await expect(page.getByLabel('Gap between columns')).toHaveValue('20');
  await expect(page.getByLabel('Gap between rows')).toHaveValue('20');

  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  const x1 = await page.getByTestId('field-x').inputValue();
  await expect(page.getByLabel('Column span')).toHaveValue('1');
  await expect(page.getByRole('group', { name: 'Cell alignment' })).toBeVisible();

  // One column: the fourth rectangle moves under the first.
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await page.getByLabel('Number of columns').fill('1');
  await page.getByLabel('Number of columns').press('Enter');
  await page.getByRole('treeitem', { name: /Rectangle 4/ }).click();
  await expect(page.getByTestId('field-x')).toHaveValue(x1);

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await expect(page.getByRole('button', { name: 'Grid layout' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Number of columns')).toHaveValue('1');
});
