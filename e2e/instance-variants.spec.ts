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

test('an instance of a variant is configured from its properties in the right sidebar', async ({ page }) => {
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

  // The Assets tab lists the component set once, named after the set (the first component).
  await page.keyboard.press('Alt+2');
  const assets = page.getByRole('list', { name: 'Local components' }).getByRole('button');
  await expect(assets).toHaveCount(1);
  await assets.filter({ hasText: 'Component 1' }).click();
  await page.getByRole('dialog', { name: 'Component 1' }).getByRole('button', { name: 'Insert instance' }).click();
  await expect(page.getByTestId('type-label')).toHaveText('Instance');
  const variant = page.getByRole('combobox', { name: 'Variant', exact: true });
  await expect(variant).toHaveValue('Component 1');

  await variant.selectOption('Component 2');
  await expect(variant).toHaveValue('Component 2');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(variant).toHaveValue('Component 1');
});
