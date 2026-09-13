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

test('add a drop shadow, edit it, switch to a blur, and persist', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 420, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 560, box.y + 400, { steps: 5 });
  await page.mouse.up();

  const effects = page.getByRole('region', { name: 'Effects' });
  await effects.getByRole('button', { name: 'Add effect' }).click();
  const type = effects.getByRole('combobox', { name: 'Effect 1 type' });
  await expect(type).toHaveValue('DROP_SHADOW');
  await expect(page.getByTestId('field-effect-0-y')).toHaveValue('4');
  await page.getByTestId('field-effect-0-y').fill('12');
  await page.getByTestId('field-effect-0-y').press('Enter');
  await page.getByTestId('field-effect-0-blur').fill('20');
  await page.getByTestId('field-effect-0-blur').press('Enter');
  await effects.getByRole('checkbox', { name: 'Show behind transparent areas' }).check();

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  const reloaded = page.getByRole('region', { name: 'Effects' });
  await expect(page.getByTestId('field-effect-0-y')).toHaveValue('12');
  await expect(page.getByTestId('field-effect-0-blur')).toHaveValue('20');
  await expect(reloaded.getByRole('checkbox', { name: 'Show behind transparent areas' })).toBeChecked();

  await reloaded.getByRole('combobox', { name: 'Effect 1 type' }).selectOption('LAYER_BLUR');
  await expect(page.getByTestId('field-effect-0-y')).toHaveCount(0);
  await expect(page.getByTestId('field-effect-0-blur')).toHaveValue('20');
  await reloaded.getByRole('button', { name: 'Remove effect 1' }).click();
  await expect(reloaded.getByRole('combobox', { name: 'Effect 1 type' })).toHaveCount(0);
});
