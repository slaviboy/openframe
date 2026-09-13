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

test('type settings and typography shortcuts', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('t');
  await page.mouse.click(box.x + 500, box.y + 300);
  await page.keyboard.type('Settings');
  await page.keyboard.press('Escape');
  const width = async () => Number(await page.getByTestId('field-w').inputValue());
  const plain = await width();

  await page.getByRole('button', { name: 'Type settings' }).click();
  await page.getByRole('button', { name: 'Underline' }).click();
  await expect(page.getByRole('button', { name: 'Underline' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Letter case').selectOption('UPPER');
  await expect.poll(width).toBeGreaterThan(plain);

  // Shortcuts on the selected layer (select it on the canvas so keys go to the canvas).
  await page.mouse.click(box.x + 505, box.y + 300);
  await page.keyboard.press(`${mod}+Shift+Period`);
  await expect(page.getByTestId('field-font-size')).toHaveValue('13');
  await page.keyboard.press(`${mod}+Alt+Period`);
  await expect(page.getByLabel('Font style')).toHaveValue('Medium');
  await page.keyboard.press('Alt+Shift+Period');
  await expect(page.getByTestId('field-line-height')).not.toHaveValue('Auto');
  await page.keyboard.press('Alt+Comma');
  await expect(page.getByTestId('field-letter-spacing')).toHaveValue('-0.1%');
  await page.keyboard.press(`${mod}+Shift+x`);
  // Type settings is still open from before.
  await expect(page.getByRole('button', { name: 'Strikethrough' })).toHaveAttribute('aria-pressed', 'true');

  // Max lines on auto height text cuts the text off.
  await page.getByTestId('field-w').fill('40');
  await page.getByTestId('field-w').press('Enter');
  const wrapped = Number(await page.getByTestId('field-h').inputValue());
  await page.getByTestId('field-max-lines').fill('1');
  await page.getByTestId('field-max-lines').press('Enter');
  await expect.poll(async () => Number(await page.getByTestId('field-h').inputValue())).toBeLessThan(wrapped);

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Settings/ }).click();
  await page.getByRole('button', { name: 'Type settings' }).click();
  await expect(page.getByLabel('Letter case')).toHaveValue('UPPER');
  await expect(page.getByRole('button', { name: 'Strikethrough' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('field-max-lines')).toHaveValue('1');
});
