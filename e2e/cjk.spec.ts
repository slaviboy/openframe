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

test('CJK text uses the bundled Noto Sans fonts', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('t');
  await page.mouse.click(box.x + 500, box.y + 200);
  await page.keyboard.insertText('日本語のテキスト');
  await page.keyboard.press('Escape');
  // Once the Japanese subsets load, the auto-width box refits: each character is about one em wide.
  const fontSize = Number(await page.getByTestId('field-font-size').inputValue());
  await expect.poll(async () => Number(await page.getByTestId('field-w').inputValue())).toBeGreaterThan(fontSize * 7);

  // The Noto Sans CJK families can be picked.
  await page.getByLabel('Font family').click();
  const picker = page.getByRole('dialog', { name: 'Font picker' });
  const fonts = picker.getByRole('listbox', { name: 'Fonts' });
  // Searched one at a time: "Noto Sans" matches a hundred of the library's families, and the list
  // only renders the rows in view.
  for (const family of ['Noto Sans SC', 'Noto Sans TC', 'Noto Sans JP', 'Noto Sans KR']) {
    await picker.getByLabel('Search fonts').fill(family);
    await expect(fonts.getByRole('option', { name: family })).toBeVisible();
  }
  await fonts.getByRole('option', { name: 'Noto Sans KR' }).click();
  await expect(page.getByLabel('Font family')).toHaveText('Noto Sans KR');
  await page.getByLabel('Font family').click();
  await picker.getByLabel('Search fonts').fill('Noto Sans JP');
  await fonts.getByRole('option', { name: 'Noto Sans JP' }).click();
  await expect(page.getByLabel('Font family')).toHaveText('Noto Sans JP');
});
