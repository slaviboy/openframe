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

/**
 * Arrows, maths and dingbats. The bundled Inter Latin subset carries ↑ and ↓ but not ← or →, so
 * these shaped as the missing-glyph box until the symbol fallbacks were loaded for them.
 *
 * The box is the tell: every missing glyph has the *same* advance, so a line of arrows and a line
 * of stars measured exactly alike. Once the fallbacks arrive they are real glyphs, of their own
 * widths. See docs/FONTS.md.
 */
test('symbols are drawn with a fallback font, not as the missing-glyph box', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const input = page.getByTestId('text-input');

  const write = async (characters: string, y: number) => {
    // Away from any layer, so the Text tool starts a new one rather than editing the selected row.
    await page.mouse.click(box.x + 900, box.y + 600);
    await page.keyboard.press('t');
    await page.mouse.click(box.x + 500, box.y + y);
    await expect(input).toBeFocused();
    await page.keyboard.type(characters);
    await page.keyboard.press('Escape');
    await expect(input).not.toBeFocused();
    return Number(await page.getByTestId('field-w').inputValue());
  };

  await write('←←←←←←←←', 150);
  await write('★★★★★★★★', 260);
  await expect(page.getByRole('treeitem', { name: /★/ })).toBeVisible();

  // The fallback is read the moment a character needs it, so the widths settle just after typing.
  const widthOf = async (name: RegExp) => {
    await page.getByRole('treeitem', { name }).first().click();
    return Number(await page.getByTestId('field-w').inputValue());
  };
  await expect.poll(async () => (await widthOf(/←/)) === (await widthOf(/★/))).toBe(false);
  const arrows = await widthOf(/←/);

  // Smart quotes/symbols types that same arrow from "<-", so it has to draw as one too.
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.getByRole('menu', { name: 'Main menu' }).getByRole('menuitem', { name: /^Preferences/ }).click();
  await page.getByRole('menuitemcheckbox', { name: /Use smart quotes\/symbols/ }).click();
  const typed = await write('<-<-<-<-<-<-<-<-', 370);
  await expect(page.getByRole('treeitem', { name: /←←←←←←←←/ })).toHaveCount(2);
  expect(typed).toBeCloseTo(arrows, 1);
});
