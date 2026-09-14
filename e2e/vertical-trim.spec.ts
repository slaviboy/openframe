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

test('vertical trim shrinks a hugging auto layout frame around text without resizing the text', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('t');
  await page.mouse.click(box.x + 400, box.y + 300);
  await page.keyboard.type('Hello');
  await page.keyboard.press('Escape');

  await page.getByRole('treeitem', { name: /Hello/ }).click();
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.getByRole('menu', { name: 'Main menu' }).getByRole('menuitem', { name: /^Object/ }).click();
  await page.getByRole('menu', { name: 'Object' }).getByRole('menuitem', { name: /Add auto layout/ }).click();
  await expect(page.getByLabel('Height sizing')).toHaveValue('HUG');
  const frameHeight = Number(await page.getByTestId('field-h').inputValue());

  const frameRow = page.getByRole('treeitem', { name: /Frame 1/ });
  if ((await frameRow.getByRole('button', { name: 'Expand' }).count()) > 0) await frameRow.getByRole('button', { name: 'Expand' }).click();
  await page.getByRole('treeitem', { name: /Hello/ }).click();
  const textHeight = await page.getByTestId('field-h').inputValue();
  await page.getByRole('button', { name: 'Type settings' }).click();
  await page.getByLabel('Vertical trim').check();
  await expect(page.getByTestId('field-h')).toHaveValue(textHeight);

  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await expect.poll(async () => Number(await page.getByTestId('field-h').inputValue())).toBeLessThan(frameHeight);
});
