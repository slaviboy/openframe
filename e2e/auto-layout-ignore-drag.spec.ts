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

test('Control-dragging a layer into an auto layout frame adds it with Ignore auto layout', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('f');
  await drag(page, [300, 200], [700, 500]);
  await page.keyboard.press('r');
  await drag(page, [340, 240], [400, 300]);
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.getByRole('menu', { name: 'Main menu' }).getByRole('menuitem', { name: /^Object/ }).click();
  await page.getByRole('menu', { name: 'Object' }).getByRole('menuitem', { name: /Add auto layout/ }).click();
  await expect(page.getByRole('button', { name: 'Vertical layout' })).toHaveAttribute('aria-pressed', 'true');

  // A second rectangle on the page, dragged into the frame with Control held: it keeps its drop position.
  await page.keyboard.press('r');
  await drag(page, [800, 240], [860, 300]);
  await page.mouse.move(box.x + 830, box.y + 270);
  await page.mouse.down();
  await page.mouse.move(box.x + 700, box.y + 350, { steps: 3 });
  await page.keyboard.down('Control');
  await page.mouse.move(box.x + 600, box.y + 420, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Control');

  await expect(page.getByRole('button', { name: 'Ignore auto layout' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Horizontal constraint')).toBeVisible();
});
