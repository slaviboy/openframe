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

test('color picker edits hex and alpha as one undo step', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 420, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 520, box.y + 400, { steps: 5 });
  await page.mouse.up();

  const hex = page.getByRole('textbox', { name: 'Fill 1 hex' });
  const opacity = page.getByRole('textbox', { name: 'Fill 1 opacity' });
  await expect(hex).toHaveValue('D9D9D9');

  await page.getByRole('button', { name: 'Fill 1 color' }).click();
  const picker = page.getByRole('dialog', { name: 'Fill 1 picker' });
  await expect(picker).toBeVisible();
  await expect(picker.getByLabel('Color format')).toHaveValue('hex');
  await picker.getByRole('textbox', { name: 'Hex' }).fill('FF0000');
  await picker.getByRole('textbox', { name: 'Hex' }).press('Enter');
  await expect(hex).toHaveValue('FF0000');

  await picker.getByLabel('Color format').selectOption('rgb');
  await expect(picker.getByRole('textbox', { name: 'R' })).toHaveValue('255');
  await picker.getByRole('textbox', { name: 'G' }).fill('128');
  await picker.getByRole('textbox', { name: 'G' }).press('Enter');
  await expect(hex).toHaveValue('FF8000');

  await picker.getByRole('slider', { name: 'Alpha' }).fill('50');
  await expect(opacity).toHaveValue('50%');
  await picker.getByRole('slider', { name: 'Alpha' }).press('Escape');
  await expect(picker).toHaveCount(0);

  await page.keyboard.press(`${mod}+z`);
  await expect(hex).toHaveValue('D9D9D9');
  await expect(opacity).toHaveValue('100%');
});
