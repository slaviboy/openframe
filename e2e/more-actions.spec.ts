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

test("More actions resets one changed property of an instance, and detaches it", async ({ page }) => {
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

  // Change the instance's opacity, then reset just that property.
  const opacity = page.getByLabel('Opacity', { exact: true });
  await opacity.fill('50');
  await opacity.press('Enter');
  await expect(opacity).toHaveValue(/50/);

  const more = page.getByRole('button', { name: 'More actions' });
  await more.click();
  await page.getByRole('menuitem', { name: 'Reset', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Reset opacity' }).click();
  await expect(opacity).toHaveValue(/100/);

  // Detach instance from the same menu.
  await more.click();
  await page.getByRole('menuitem', { name: /Detach instance/ }).click();
  await expect(page.getByTestId('type-label')).toHaveText('Frame');
});
