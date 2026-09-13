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

test('paragraph spacing and indent', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('t');
  await page.mouse.click(box.x + 500, box.y + 300);
  await page.keyboard.type('One');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Two');
  await page.keyboard.press('Escape');
  const size = async (id: string) => Number(await page.getByTestId(id).inputValue());
  const height = await size('field-h');
  const width = await size('field-w');

  await page.getByRole('button', { name: 'Type settings' }).click();
  await page.getByTestId('field-paragraph-spacing').fill('20');
  await page.getByTestId('field-paragraph-spacing').press('Enter');
  await expect.poll(() => size('field-h')).toBeCloseTo(height + 20, 0);

  await page.getByTestId('field-paragraph-indent').fill('16');
  await page.getByTestId('field-paragraph-indent').press('Enter');
  await expect.poll(() => size('field-w')).toBeCloseTo(width + 16, 0);

  // Centered text isn't indented, so the field is disabled.
  await page.getByRole('button', { name: 'Align center' }).click();
  await expect(page.getByTestId('field-paragraph-indent')).toBeDisabled();

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /One/ }).click();
  await page.getByRole('button', { name: 'Type settings' }).click();
  await expect(page.getByTestId('field-paragraph-spacing')).toHaveValue('20');
  await expect(page.getByTestId('field-paragraph-indent')).toHaveValue('16');
});
