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

import { expect, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 420, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 520, box.y + 400, { steps: 5 });
  await page.mouse.up();
});

test('effect limits disable types at their limit; effects reorder by keyboard and drag', async ({ page }) => {
  const add = page.getByRole('button', { name: 'Add effect' });
  await add.click();
  await add.click();
  await page.getByLabel('Effect 2 type').selectOption('LAYER_BLUR');
  // A layer can have one layer blur, so the first effect cannot become one too.
  await expect(page.getByLabel('Effect 1 type').locator('option[value="LAYER_BLUR"]')).toBeDisabled();
  await expect(page.getByLabel('Effect 1 type').locator('option[value="INNER_SHADOW"]')).toBeEnabled();

  // Keyboard: move the layer blur up.
  await page.getByRole('button', { name: 'Reorder effect 2' }).focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByLabel('Effect 1 type')).toHaveValue('LAYER_BLUR');
  await expect(page.getByLabel('Effect 2 type')).toHaveValue('DROP_SHADOW');

  // Drag: move it back below the shadow.
  const handle = page.getByRole('button', { name: 'Reorder effect 1' });
  const row2 = await page.getByLabel('Effect 2 type').boundingBox();
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, row2!.y + row2!.height / 2, { steps: 4 });
  await page.mouse.move(h.x + h.width / 2, row2!.y + row2!.height + 4, { steps: 2 });
  await page.mouse.up();
  await expect(page.getByLabel('Effect 1 type')).toHaveValue('DROP_SHADOW');
  await expect(page.getByLabel('Effect 2 type')).toHaveValue('LAYER_BLUR');

  // Undo reverts the drag as one step.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByLabel('Effect 1 type')).toHaveValue('LAYER_BLUR');
});

test('fills reorder with their handles', async ({ page }) => {
  await page.getByRole('button', { name: 'Add fill' }).click();
  const top = page.getByLabel('Fill 2 hex', { exact: true });
  await top.fill('FF0000');
  await top.press('Enter');
  await expect(page.getByLabel('Fill 1 hex', { exact: true })).toHaveValue('D9D9D9');
  // Fills are numbered from the top of the list: Fill 2 is the bottom fill; moving it up makes it the top one.
  await page.getByRole('button', { name: 'Reorder fill 2' }).focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByLabel('Fill 1 hex', { exact: true })).toHaveValue('FF0000');
  await expect(page.getByLabel('Fill 2 hex', { exact: true })).toHaveValue('D9D9D9');
});
