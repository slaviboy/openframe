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

test('text placed on a vector path follows it, and can be flipped or moved along it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // A sketched path to put text on.
  await page.keyboard.press('Shift+P');
  await page.mouse.move(box.x + 380, box.y + 320);
  await page.mouse.down();
  await page.mouse.move(box.x + 700, box.y + 320, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name: /Vector 1/ })).toBeVisible();

  // Text on a path, from the Type tools menu: clicking the path starts a text layer that follows it.
  const toolbar = page.getByRole('toolbar', { name: 'Tools' });
  await toolbar.getByRole('button', { name: 'Type tools' }).click();
  await page.getByRole('menuitemradio', { name: /Text on a path/ }).click();
  await page.mouse.click(box.x + 500, box.y + 320);
  await page.keyboard.type('Curved');
  await page.keyboard.press('Escape');

  const text = page.getByRole('treeitem', { name: /Curved/ });
  await expect(text).toBeVisible();
  // It sits where the path sits, so the path's own coordinates lay it out.
  await page.getByRole('treeitem', { name: /Vector 1/ }).click();
  const pathX = await page.getByTestId('field-x').inputValue();
  await text.click();
  await expect(page.getByTestId('field-x')).toHaveValue(pathX);

  // The handle on the path drags the text along it.
  const start = page.getByRole('slider', { name: 'Text start on path' });
  await expect(start).toHaveValue('0');
  await page.mouse.move(box.x + 380, box.y + 320);
  await page.mouse.down();
  await page.mouse.move(box.x + 560, box.y + 320, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Number(await start.inputValue())).toBeGreaterThan(20);
  await page.keyboard.press('ControlOrMeta+Z');
  await expect.poll(async () => Number(await start.inputValue())).toBe(0);

  // The path controls belong to text on a path only.
  const flip = page.getByRole('checkbox', { name: 'Flip text orientation' });
  await expect(flip).not.toBeChecked();
  await start.fill('30');
  await flip.check();

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Curved/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Flip text orientation' })).toBeChecked();
  await expect(page.getByRole('slider', { name: 'Text start on path' })).toHaveValue('30');

  // A plain text layer has no path controls.
  await page.keyboard.press('Escape');
  await page.keyboard.press('t');
  await page.mouse.click(box.x + 420, box.y + 560);
  await page.keyboard.type('Plain');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('checkbox', { name: 'Flip text orientation' })).toHaveCount(0);
});
