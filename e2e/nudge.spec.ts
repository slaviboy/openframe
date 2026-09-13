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

test('Preferences → Nudge amount changes arrow-key distances and persists', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');

  await page.keyboard.press(`${mod}+k`);
  await page.getByRole('combobox', { name: 'Search commands' }).fill('nudge amount');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Nudge amount' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Small nudge').fill('0');
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  await dialog.getByLabel('Small nudge').fill('5');
  await dialog.getByLabel('Big nudge').fill('50');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);

  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 420, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 480, box.y + 360, { steps: 5 });
  await page.mouse.up();
  const x = Number(await page.getByTestId('field-x').inputValue());
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('field-x')).toHaveValue(String(x + 5));
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.getByTestId('field-x')).toHaveValue(String(x + 55));

  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press(`${mod}+k`);
  await page.getByRole('combobox', { name: 'Search commands' }).fill('nudge amount');
  await page.keyboard.press('Enter');
  await expect(dialog.getByLabel('Small nudge')).toHaveValue('5');
  await expect(dialog.getByLabel('Big nudge')).toHaveValue('50');
});
