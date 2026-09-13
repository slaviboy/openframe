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

test('a glass effect is configurable, limited to one per layer, and persists', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 420, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 520, box.y + 400, { steps: 5 });
  await page.mouse.up();

  await page.getByRole('button', { name: 'Add effect' }).click();
  await page.getByLabel('Effect 1 type').selectOption('GLASS');
  const frost = page.getByLabel('Effect 1 frost');
  await frost.fill('12');
  await frost.press('Enter');
  const refraction = page.getByLabel('Effect 1 refraction');
  await refraction.fill('40');
  await refraction.press('Enter');
  const angle = page.getByLabel('Effect 1 light angle');
  await angle.fill('-30');
  await angle.press('Enter');

  await page.getByRole('button', { name: 'Add effect' }).click();
  await expect(page.getByLabel('Effect 2 type').locator('option[value="GLASS"]')).toBeDisabled();

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await expect(page.getByLabel('Effect 1 type')).toHaveValue('GLASS');
  await expect(page.getByLabel('Effect 1 frost')).toHaveValue(/^12/);
  await expect(page.getByLabel('Effect 1 refraction')).toHaveValue(/^40/);
  await expect(page.getByLabel('Effect 1 light angle')).toHaveValue(/^-30/);
});
