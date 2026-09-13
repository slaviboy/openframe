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

async function drawRect(page: Page, from: [number, number], to: [number, number]) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 5 });
  await page.mouse.up();
}

test('a pattern fill takes its source from a layer picked on the canvas and persists', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await drawRect(page, [420, 300], [440, 320]);
  await drawRect(page, [520, 300], [720, 420]);

  await page.getByLabel('Fill 1 type').selectOption('PATTERN');
  await expect(page.getByLabel('Fill 1 pattern source')).toHaveText('No source');

  // Escape cancels picking.
  await page.getByRole('button', { name: 'Select source' }).click();
  await expect(page.getByTestId('tool-hint')).toContainText('pattern source');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tool-hint')).toHaveCount(0);
  await expect(page.getByLabel('Fill 1 pattern source')).toHaveText('No source');

  await page.getByRole('button', { name: 'Select source' }).click();
  await page.mouse.click(box.x + 430, box.y + 310);
  await expect(page.getByLabel('Fill 1 pattern source')).toHaveText('Rectangle 1');
  // Picking a source keeps the pattern layer selected.
  await expect(page.getByRole('treeitem', { name: /Rectangle 2/ })).toHaveAttribute('aria-selected', 'true');

  await page.getByLabel('Fill 1 tile type').selectOption('HORIZONTAL_HEXAGONAL');
  const scale = page.getByLabel('Fill 1 pattern scale');
  await scale.fill('50');
  await scale.press('Enter');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Rectangle 2/ }).click();
  await expect(page.getByLabel('Fill 1 pattern source')).toHaveText('Rectangle 1');
  await expect(page.getByLabel('Fill 1 tile type')).toHaveValue('HORIZONTAL_HEXAGONAL');
  await expect(page.getByLabel('Fill 1 pattern scale')).toHaveValue(/^50/);
});
