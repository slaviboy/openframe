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

test('text baseline alignment lines up text of different sizes; B toggles it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  for (const [x, text] of [
    [320, 'Small'],
    [460, 'Big'],
  ] as const) {
    await page.keyboard.press('t');
    await page.mouse.click(box.x + x, box.y + 250);
    await page.keyboard.type(text);
    await page.keyboard.press('Escape');
  }
  await page.getByRole('treeitem', { name: /Big/ }).click();
  await page.getByLabel('Font size').fill('48');
  await page.getByLabel('Font size').press('Enter');

  await page.getByRole('treeitem', { name: /Small/ }).click();
  await page.getByRole('treeitem', { name: /Big/ }).click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.getByRole('menu', { name: 'Main menu' }).getByRole('menuitem', { name: /^Object/ }).click();
  await page.getByRole('menu', { name: 'Object' }).getByRole('menuitem', { name: /Add auto layout/ }).click();
  await expect(page.getByRole('button', { name: 'Horizontal layout' })).toHaveAttribute('aria-pressed', 'true');
  // The new frame's row starts collapsed.
  const frameRow = page.getByRole('treeitem', { name: /Frame 1/ });
  if ((await frameRow.getByRole('button', { name: 'Expand' }).count()) > 0) await frameRow.getByRole('button', { name: 'Expand' }).click();

  await page.getByRole('treeitem', { name: /Small/ }).click();
  const top = Number(await page.getByTestId('field-y').inputValue());

  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await page.getByRole('button', { name: 'Auto layout settings' }).click();
  await page.getByLabel('Text baseline alignment').check();
  await page.getByRole('treeitem', { name: /Small/ }).click();
  await expect.poll(async () => Number(await page.getByTestId('field-y').inputValue())).toBeGreaterThan(top + 5);

  // B in the focused alignment box turns it off again.
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await page.getByRole('group', { name: 'Alignment' }).getByRole('button').first().focus();
  await page.keyboard.press('b');
  await page.getByRole('button', { name: 'Auto layout settings' }).click();
  await expect(page.getByLabel('Text baseline alignment')).not.toBeChecked();
  await page.getByRole('treeitem', { name: /Small/ }).click();
  await expect(page.getByTestId('field-y')).toHaveValue(String(top));
});
