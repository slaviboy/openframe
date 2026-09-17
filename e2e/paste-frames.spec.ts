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

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

async function point(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  return { x: box.x + x, y: box.y + y };
}

async function draw(page: Page, key: string, from: [number, number], to: [number, number]) {
  const a = await point(page, ...from);
  const b = await point(page, ...to);
  await page.keyboard.press(key);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
}

test('⌘V with several frames selected pastes a copy into each at the same relative position', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  await draw(page, 'f', [400, 150], [600, 350]);
  await draw(page, 'f', [650, 150], [850, 350]);
  await draw(page, 'r', [420, 180], [470, 230]);
  await expect(page.getByTestId('field-x')).toHaveValue('20');
  await page.keyboard.press(`${mod}+c`);

  // Rows with children include their caret's label ("Collapse Frame 1") in the accessible name.
  await page.getByRole('treeitem', { name: /Frame 1$/ }).click();
  await page.getByRole('treeitem', { name: /Frame 2$/ }).click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('inspector')).toContainText('2 layers');
  await page.keyboard.press(`${mod}+v`);

  await expect(page.getByRole('treeitem', { name: /^Rectangle 1/ })).toHaveCount(3);
  await expect(page.getByTestId('inspector')).toContainText('2 layers');

  // The copy in Frame 2 sits 20, 30 from that frame's corner, like the original. Clicked away from its center,
  // where the two copies' smart selection puts a ring that marks rather than selects.
  const inFrame2 = await point(page, 678, 188);
  await page.mouse.click(inFrame2.x, inFrame2.y);
  await expect(page.getByTestId('field-x')).toHaveValue('20');
  await expect(page.getByTestId('field-y')).toHaveValue('30');
});
