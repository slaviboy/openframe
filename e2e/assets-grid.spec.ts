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

test('the Assets grid view shows a thumbnail of each component', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 380, box.y + 360, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('ControlOrMeta+Alt+K');

  await page.keyboard.press('Alt+2');
  const grid = page.getByRole('button', { name: 'Grid', exact: true });
  await grid.click();
  await expect(grid).toHaveAttribute('aria-pressed', 'true');

  const tile = page.getByRole('list', { name: 'Local components' }).getByRole('button', { name: 'Component 1', exact: true });
  const image = tile.locator('img');
  await expect(image).toHaveAttribute('src', /^data:image\/png;base64,/);
  // The engine drew the component: an 80 × 60 rectangle fits 64 px wide at twice the device pixel ratio or so.
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(tile.locator('img')).toHaveCount(0);
});
