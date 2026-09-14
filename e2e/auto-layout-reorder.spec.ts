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
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 8 });
  await page.mouse.up();
}

test('auto layout children reorder with arrow keys and by dragging', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('f');
  await drag(page, [300, 200], [700, 500]);
  for (const x of [340, 440, 540]) {
    await page.keyboard.press('r');
    await drag(page, [x, 240], [x + 60, 300]);
  }
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.getByRole('menu', { name: 'Main menu' }).getByRole('menuitem', { name: /^Object/ }).click();
  await page.getByRole('menu', { name: 'Object' }).getByRole('menuitem', { name: /Add auto layout/ }).click();
  await expect(page.getByRole('button', { name: 'Horizontal layout' })).toHaveAttribute('aria-pressed', 'true');

  // Deselect the frame, then select the first rectangle on the canvas; → moves it one position along the flow.
  await page.mouse.click(box.x + 900, box.y + 600);
  await page.mouse.click(box.x + 370, box.y + 270);
  await expect(page.getByTestId('inspector')).toContainText('Rectangle');
  const x = Number(await page.getByTestId('field-x').inputValue());
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('field-x')).toHaveValue(String(x + 100));
  // ↓ is across a horizontal flow: nothing moves.
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('field-x')).toHaveValue(String(x + 100));

  // Dragging it past the last rectangle puts it at the end.
  await drag(page, [470, 270], [640, 270]);
  await expect(page.getByTestId('field-x')).toHaveValue(String(x + 200));
  const rows = page.getByRole('treeitem', { name: /Rectangle/ });
  await expect(rows).toHaveCount(3);
});
