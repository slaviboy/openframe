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

test('a layer drawn inside a main component appears in its instances, and undo removes it from both', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 380, box.y + 380, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('ControlOrMeta+Alt+K');
  await page.keyboard.press('ControlOrMeta+D');
  await expect(page.getByTestId('type-label')).toHaveText('Instance');

  // Move the instance away from its main component.
  const x = page.getByLabel('X position', { exact: true });
  await x.fill('1000');
  await x.press('Enter');

  // Draw an ellipse inside the main component.
  await page.keyboard.press('o');
  await page.mouse.move(box.x + 310, box.y + 310);
  await page.mouse.down();
  await page.mouse.move(box.x + 340, box.y + 340, { steps: 4 });
  await page.mouse.up();

  const components = page.getByRole('treeitem', { name: /Component 1/ });
  await expect(components).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    const row = components.nth(i);
    if ((await row.getAttribute('aria-expanded')) === 'false') await row.getByRole('button', { name: 'Expand', exact: true }).click();
  }
  const ellipses = page.getByRole('treeitem', { name: /Ellipse/ });
  await expect(ellipses).toHaveCount(2);

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(ellipses).toHaveCount(0);
});
