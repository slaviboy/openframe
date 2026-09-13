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

test('a progressive blur can be set up, moved on the canvas, and persists', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 420, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 620, box.y + 400, { steps: 5 });
  await page.mouse.up();

  await page.getByRole('button', { name: 'Add effect' }).click();
  await page.getByLabel('Effect 1 type').selectOption('LAYER_BLUR');
  await page.getByLabel('Effect 1 blur type').selectOption('PROGRESSIVE');
  const startBlur = page.getByLabel('Effect 1 start blur');
  await expect(startBlur).toHaveValue(/^0/);
  await expect(page.getByLabel('Effect 1 end Y')).toHaveValue(/^100/);

  // Handles: the end sits at the bottom center of the layer (520, 400).
  const edit = page.getByRole('button', { name: 'Edit effect 1 blur on canvas' });
  await edit.click();
  await expect(edit).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(box.x + 520, box.y + 400);
  await page.mouse.down();
  await page.mouse.move(box.x + 520, box.y + 375, { steps: 3 });
  await page.mouse.move(box.x + 520, box.y + 350, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByLabel('Effect 1 end Y')).toHaveValue(/^50/);
  await page.keyboard.press('Escape');
  await expect(edit).toHaveAttribute('aria-pressed', 'false');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await expect(page.getByLabel('Effect 1 blur type')).toHaveValue('PROGRESSIVE');
  await expect(page.getByLabel('Effect 1 end Y')).toHaveValue(/^50/);
});
