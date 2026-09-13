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

test('styling selected characters makes mixed styles that persist', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('t');
  await page.mouse.click(box.x + 500, box.y + 300);
  await page.keyboard.type('Hello world');
  const plain = Number(await page.getByTestId('field-w').inputValue());

  // Select "world" and make it bold: the style shows the selection's font style.
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press(`${mod}+b`);
  await expect(page.getByLabel('Font style')).toHaveValue('Bold');
  // A size for the selected characters only.
  await page.getByTestId('field-font-size').fill('20');
  await page.getByTestId('field-font-size').press('Enter');
  await expect.poll(async () => Number(await page.getByTestId('field-w').inputValue())).toBeGreaterThan(plain);

  // With the whole layer selected, style and size are mixed.
  await page.getByTestId('text-input').focus();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Font style')).toHaveValue('');
  await expect(page.getByTestId('field-font-size')).toHaveValue('');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  // Select it on the canvas (keyboard focus stays on the canvas, so Return edits the text).
  await page.mouse.click(box.x + 510, box.y + 300);
  await expect(page.getByRole('treeitem', { name: /Hello world/ })).toBeVisible();
  await expect(page.getByLabel('Font style')).toHaveValue('');

  // Editing with everything selected, bold applies to the whole layer.
  await page.keyboard.press('Enter');
  await page.keyboard.press(`${mod}+b`);
  await expect(page.getByLabel('Font style')).toHaveValue('Bold');
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Font style')).toHaveValue('Bold');
});
