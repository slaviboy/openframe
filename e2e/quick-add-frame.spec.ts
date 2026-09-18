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

test('the + beside a hovered frame copies it to that side and pushes the others along', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // A frame from 300 to 500 on the canvas.
  await page.keyboard.press('f');
  await page.mouse.move(box.x + 300, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 400, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name: /Frame 1/ })).toHaveCount(1);

  // With the Frame tool in hand, hovering the frame shows a + on each side; the right one is just past its edge.
  await page.keyboard.press('f');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.move(box.x + 512, box.y + 300);
  await page.mouse.down();
  await page.mouse.up();

  await expect(page.getByRole('treeitem', { name: /Frame/ })).toHaveCount(2);
  // The copy is selected and sits a frame and a gap to the right.
  await expect(page.getByTestId('inspector')).toContainText('Frame');
  const x = Number(await page.getByTestId('field-x').inputValue());
  expect(x).toBe(500);

  await page.keyboard.press(`${mod}+z`);
  await expect(page.getByRole('treeitem', { name: /Frame/ })).toHaveCount(1);
});
