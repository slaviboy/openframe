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

test('Combine as variants puts the selected components in a component set that persists', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const component = async (x: number) => {
    await page.keyboard.press('r');
    await page.mouse.move(box.x + x, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + x + 80, box.y + 380, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.press('ControlOrMeta+Alt+K');
  };
  await component(300);
  await component(500);
  await page.keyboard.press('ControlOrMeta+A');

  await page.getByRole('button', { name: 'Combine as variants' }).click();
  await expect(page.getByTestId('type-label')).toHaveText('Component set');
  // The set is named after the first component; its variants are listed once its row is expanded.
  const rows = (name: RegExp) => page.getByRole('treeitem', { name });
  await expect(rows(/(Expand|Collapse) Component 1/)).toHaveCount(1);
  await page.getByRole('button', { name: 'Expand', exact: true }).first().click();
  await expect(rows(/Variant=Component 1/)).toHaveCount(1);
  await expect(rows(/Variant=Component 2/)).toHaveCount(1);

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(rows(/(Expand|Collapse) Component 1/)).toHaveCount(1);
  await expect(rows(/(Expand|Collapse) Component 2/)).toHaveCount(0);
});
