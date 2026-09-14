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

test('constraints move children when their frame is resized', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('f');
  await drag(page, [300, 200], [600, 500]);
  await page.keyboard.press('r');
  await drag(page, [500, 300], [560, 360]);

  // The rectangle keeps its distance to the right edge.
  await page.getByRole('treeitem', { name: /Rectangle/ }).click();
  const x = Number(await page.getByTestId('field-x').inputValue());
  await page.getByLabel('Horizontal constraint').selectOption('MAX');
  await expect(page.getByLabel('Horizontal constraint')).toHaveValue('MAX');

  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  const width = Number(await page.getByTestId('field-w').inputValue());
  await page.getByTestId('field-w').fill(String(width + 100));
  await page.getByTestId('field-w').press('Enter');

  await page.getByRole('treeitem', { name: /Rectangle/ }).click();
  await expect(page.getByTestId('field-x')).toHaveValue(String(x + 100));

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Frame 1/ }).getByRole('button', { name: 'Expand' }).click();
  await page.getByRole('treeitem', { name: /Rectangle/ }).click();
  await expect(page.getByLabel('Horizontal constraint')).toHaveValue('MAX');
  await expect(page.getByLabel('Vertical constraint')).toHaveValue('MIN');
});
