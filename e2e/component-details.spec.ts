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

test('clicking a component in Assets opens its details, where it is inserted', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 380, box.y + 360, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('ControlOrMeta+Alt+K');

  const description = page.getByRole('textbox', { name: 'Component description' });
  await description.fill('Primary call to action');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  await page.keyboard.press('Alt+2');
  await page.getByRole('list', { name: 'Local components' }).getByRole('button', { name: 'Component 1', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Component 1' });
  await expect(dialog).toContainText('Primary call to action');
  await expect(dialog).toContainText('Local components');
  await expect(dialog.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  // Nothing is inserted until asked.
  await expect(page.getByTestId('type-label')).toHaveText('Component');

  await dialog.getByRole('button', { name: 'Insert instance' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('type-label')).toHaveText('Instance');
});
