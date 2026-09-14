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

test('a change on an instance can be reset to the main component', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 400, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press('ControlOrMeta+Alt+K');
  await page.keyboard.press('ControlOrMeta+D');
  await expect(page.getByText('Instance', { exact: true })).toBeVisible();

  const reset = page.getByRole('button', { name: 'Reset all changes' });
  await expect(reset).toHaveCount(0);
  // The component frame has no fill; giving the instance one is an override.
  const fill = page.getByRole('region', { name: 'Fill' });
  await fill.getByRole('button', { name: 'Add fill' }).click();
  await expect(fill.getByRole('listitem')).toHaveCount(1);
  await expect(reset).toBeVisible();

  await reset.click();
  await expect(fill.getByRole('listitem')).toHaveCount(0);
  await expect(reset).toHaveCount(0);
});
