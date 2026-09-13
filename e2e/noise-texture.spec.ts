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

test('noise and texture effects are configurable and persist', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 420, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 520, box.y + 400, { steps: 5 });
  await page.mouse.up();

  const add = page.getByRole('button', { name: 'Add effect' });
  await add.click();
  await page.getByLabel('Effect 1 type').selectOption('NOISE');
  await expect(page.getByLabel('Effect 1 noise type')).toHaveValue('MONOTONE');
  await expect(page.getByRole('button', { name: 'Effect 1 secondary color' })).toHaveCount(0);
  await page.getByLabel('Effect 1 noise type').selectOption('DUOTONE');
  await expect(page.getByRole('button', { name: 'Effect 1 secondary color' })).toBeVisible();
  const density = page.getByLabel('Effect 1 density');
  await density.fill('30');
  await density.press('Enter');

  await add.click();
  await page.getByLabel('Effect 2 type').selectOption('TEXTURE');
  await page.getByLabel('Effect 2 texture radius').fill('12');
  await page.getByLabel('Effect 2 texture radius').press('Enter');
  const clip = page.getByRole('checkbox', { name: 'Clip to shape' });
  await expect(clip).not.toBeChecked();
  await clip.check();
  // A layer can have one texture.
  await expect(page.getByLabel('Effect 1 type').locator('option[value="TEXTURE"]')).toBeDisabled();

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await expect(page.getByLabel('Effect 1 noise type')).toHaveValue('DUOTONE');
  await expect(page.getByLabel('Effect 1 density')).toHaveValue(/^30/);
  await expect(page.getByLabel('Effect 2 texture radius')).toHaveValue(/^12/);
  await expect(page.getByRole('checkbox', { name: 'Clip to shape' })).toBeChecked();
});
