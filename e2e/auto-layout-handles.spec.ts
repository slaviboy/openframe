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

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 5 });
  await page.mouse.up();
}

test('on-canvas handles change an auto layout frame’s padding and gap', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('f');
  await drag(page, [300, 200], [700, 500]);
  // Two rectangles stacked 20 px apart, 40 px from the frame's top and left edges.
  await page.keyboard.press('r');
  await drag(page, [340, 240], [400, 300]);
  await page.keyboard.press('r');
  await drag(page, [340, 320], [400, 380]);
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.getByRole('menu', { name: 'Main menu' }).getByRole('menuitem', { name: /^Object/ }).click();
  await page.getByRole('menu', { name: 'Object' }).getByRole('menuitem', { name: /Add auto layout/ }).click();
  await expect(page.getByRole('button', { name: 'Vertical layout' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Gap between items')).toHaveValue('20');
  await page.getByRole('button', { name: 'Individual padding' }).click();
  await expect(page.getByLabel('Top padding')).toHaveValue('40');
  const width = Number(await page.getByTestId('field-w').inputValue());

  // The top padding handle sits in the middle of the top padding band: drag it 10 px inward.
  await drag(page, [300 + width / 2, 220], [300 + width / 2, 230]);
  await expect(page.getByLabel('Top padding')).toHaveValue('50');

  // With ⌥, the left handle sets the left and right padding together.
  await page.keyboard.down('Alt');
  await drag(page, [320, 350], [330, 350]);
  await page.keyboard.up('Alt');
  await expect(page.getByLabel('Left padding')).toHaveValue('50');
  await expect(page.getByLabel('Right padding')).toHaveValue('50');

  // The gap handle between the rectangles: 10 px along the flow grows the gap by 10.
  const gapHandle: [number, number] = [300 + 50 + 30, 200 + 50 + 60 + 10];
  await drag(page, gapHandle, [gapHandle[0], gapHandle[1] + 10]);
  await expect(page.getByLabel('Gap between items')).toHaveValue('30');
});
