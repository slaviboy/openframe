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

test('the eyedropper (I) applies a color sampled from the canvas to the selection', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await drawRect(page, [420, 300], [500, 380]);
  const hex = page.getByLabel('Fill 1 hex', { exact: true });
  await hex.fill('E03E1A');
  await hex.press('Enter');
  await drawRect(page, [540, 300], [620, 380]);
  await expect(hex).toHaveValue('D9D9D9');

  await page.getByTestId('canvas').focus();
  await page.keyboard.press('i');
  await page.mouse.move(box.x + 460, box.y + 340);
  await page.mouse.click(box.x + 460, box.y + 340);
  await expect(hex).toHaveValue('E03E1A');
  // The second rectangle stays selected and the Move tool is back.
  await expect(page.getByRole('treeitem', { name: /Rectangle 2/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: /^Move \(/ })).toHaveAttribute('aria-pressed', 'true');
});
