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

test('emoji search and smart quotes/symbols', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const list = page.getByRole('listbox', { name: 'Emoji' });

  // ":" and a name lists matching emoji; Return inserts the highlighted one.
  await page.keyboard.press('t');
  await page.mouse.click(box.x + 500, box.y + 150);
  await page.keyboard.type('I :grinn');
  await expect(list.getByRole('option').first()).toContainText(':grinning:');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await expect(list.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(list).toHaveCount(0);
  // Esc closes the list and keeps editing.
  await page.keyboard.type(' :hea');
  await expect(list).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(list).toHaveCount(0);
  await expect(page.getByTestId('text-input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('treeitem', { name: /I 😀 :hea/ })).toHaveCount(1);

  // Preferences › Use smart quotes/symbols converts sequences while typing.
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.getByRole('menu', { name: 'Main menu' }).getByRole('menuitem', { name: /^Preferences/ }).click();
  await page.getByRole('menuitemcheckbox', { name: /Use smart quotes\/symbols/ }).click();
  await page.keyboard.press('t');
  await page.mouse.click(box.x + 500, box.y + 260);
  await page.keyboard.type('Go -> "Acme(tm)"');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('treeitem', { name: /Go → “Acme™”/ })).toHaveCount(1);
});

/**
 * An emoji is ordinary text: typing one has to give a picture, not the missing-glyph box. Its own
 * subset of Noto Color Emoji is read out of the library for it — see docs/FONTS.md.
 *
 * The box is the yardstick. A private-use character is one nothing can ever draw, and every missing
 * glyph has the same advance, so a line of them measures exactly what a line of undrawn emoji would.
 */
test('an emoji is drawn, not left as the missing-glyph box', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const input = page.getByTestId('text-input');
  // Built from its code point: a character no editor shows can be dropped from a file silently.
  const undrawable = String.fromCodePoint(0xe000).repeat(8);

  const write = async (characters: string, y: number) => {
    await page.mouse.click(box.x + 900, box.y + 600);
    await page.keyboard.press('t');
    await page.mouse.click(box.x + 500, box.y + y);
    await expect(input).toBeFocused();
    await page.keyboard.type(characters);
    await page.keyboard.press('Escape');
    await expect(input).not.toBeFocused();
    return Number(await page.getByTestId('field-w').inputValue());
  };

  const boxes = await write(undrawable, 150);
  expect(boxes).toBeGreaterThan(0);
  await write('😭😭😭😭😭😭😭😭', 280);
  // The subset is read when the first emoji is typed, so the line widens once it arrives.
  await expect.poll(async () => Number(await page.getByTestId('field-w').inputValue()) !== boxes).toBe(true);
});
