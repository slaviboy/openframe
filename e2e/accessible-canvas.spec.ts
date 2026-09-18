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

test('the canvas is mirrored for screen readers, and says what has been selected', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  await page.keyboard.press('f');
  await page.mouse.move(box.x + 400, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 600, box.y + 340, { steps: 5 });
  await page.mouse.up();
  const layers = page.getByRole('tree', { name: 'Layers' });
  await expect(layers.getByRole('treeitem', { name: /Frame 1/ })).toBeVisible();

  await page.keyboard.press('r');
  await page.mouse.move(box.x + 420, box.y + 220);
  await page.mouse.down();
  await page.mouse.move(box.x + 480, box.y + 260, { steps: 5 });
  await page.mouse.up();

  const outline = page.getByRole('region', { name: 'Canvas contents' });
  // The mirror says what each layer is, the room it takes and where it stands, not only its name.
  await expect(outline.getByText(/Frame 1, frame, 200 by 140/)).toHaveCount(1);
  const rect = outline.getByText(/Rectangle 1, rectangle, 60 by 40/);
  await expect(rect).toHaveCount(1);
  // The rectangle was just drawn, so it is the one marked as current.
  await expect(rect).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('status').filter({ hasText: 'selected' })).toContainText('Rectangle 1, rectangle, 60 by 40');

  // Selecting elsewhere is said out loud too: the live region follows the selection however it was made.
  await layers.getByRole('treeitem', { name: /Frame 1/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'selected' })).toContainText('Frame 1, frame');
});
