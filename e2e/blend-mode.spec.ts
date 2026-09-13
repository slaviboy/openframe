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

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

test('layer blend mode: choose, undo/redo, and persist', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 420, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 520, box.y + 400, { steps: 5 });
  await page.mouse.up();

  const blend = page.getByRole('combobox', { name: 'Layer blend mode' });
  await expect(blend).toHaveValue('PASS_THROUGH');
  await blend.selectOption({ label: 'Multiply' });
  await expect(blend).toHaveValue('MULTIPLY');

  const canvasPoint = { x: box.x + 900, y: box.y + 650 };
  await page.mouse.click(canvasPoint.x, canvasPoint.y);
  await page.keyboard.press(`${mod}+z`);
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await expect(blend).toHaveValue('PASS_THROUGH');
  await page.mouse.click(canvasPoint.x, canvasPoint.y);
  await page.keyboard.press(`${mod}+Shift+z`);
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await expect(blend).toHaveValue('MULTIPLY');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await expect(page.getByRole('combobox', { name: 'Layer blend mode' })).toHaveValue('MULTIPLY');
});
