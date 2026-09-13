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

test('fill and effect blend modes are editable and persist', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 420, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 520, box.y + 400, { steps: 5 });
  await page.mouse.up();

  // Solid fills: the blend mode lives in the color picker.
  await page.getByRole('button', { name: 'Fill 1 color' }).click();
  const fillBlend = page.getByRole('dialog', { name: 'Fill 1 picker' }).getByLabel('Fill 1 blend mode');
  await expect(fillBlend).toHaveValue('NORMAL');
  await fillBlend.selectOption('MULTIPLY');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Fill 1 picker' })).toHaveCount(0);

  // Effects: shadows have their own blend mode.
  await page.getByRole('button', { name: 'Add effect' }).click();
  const effectBlend = page.getByRole('combobox', { name: 'Effect 1 blend mode' });
  await expect(effectBlend).toHaveValue('NORMAL');
  await effectBlend.selectOption('SCREEN');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await expect(page.getByRole('combobox', { name: 'Effect 1 blend mode' })).toHaveValue('SCREEN');
  await page.getByRole('button', { name: 'Fill 1 color' }).click();
  await expect(page.getByRole('dialog', { name: 'Fill 1 picker' }).getByLabel('Fill 1 blend mode')).toHaveValue('MULTIPLY');
});
