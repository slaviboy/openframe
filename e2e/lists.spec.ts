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

test('bulleted and numbered lists', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const width = async () => Number(await page.getByTestId('field-w').inputValue());

  // A plain two-line text for comparison.
  await page.keyboard.press('t');
  await page.mouse.click(box.x + 500, box.y + 200);
  await page.keyboard.type('Apples');
  await page.keyboard.press('Escape');
  const plain = await width();

  // "- " starts a bulleted list; Return continues it.
  await page.keyboard.press('t');
  await page.mouse.click(box.x + 500, box.y + 320);
  await page.keyboard.type('- Apples');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Pears');
  await page.getByRole('button', { name: 'Type settings' }).click();
  await expect(page.getByLabel('List style')).toHaveValue('UNORDERED');
  // Tab indents the item.
  await page.getByTestId('text-input').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('treeitem', { name: /Apples/ })).toHaveCount(2);
  await expect.poll(width).toBeGreaterThan(plain + 20);

  // ⌘⇧7 makes the selected layer a numbered list.
  await page.mouse.click(box.x + 530, box.y + 320);
  await page.keyboard.press(`${mod}+Shift+Digit7`);
  await expect(page.getByLabel('List style')).toHaveValue('ORDERED');
  await page.getByTestId('field-list-spacing').fill('6');
  await page.getByTestId('field-list-spacing').press('Enter');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.mouse.click(box.x + 530, box.y + 320);
  await page.getByRole('button', { name: 'Type settings' }).click();
  await expect(page.getByLabel('List style')).toHaveValue('ORDERED');
  await expect(page.getByTestId('field-list-spacing')).toHaveValue('6');
});
