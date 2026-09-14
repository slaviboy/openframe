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

test('⌥⌘K creates a component from the selection; undo and redo, and it persists', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 400, { steps: 5 });
  await page.mouse.up();

  await expect(page.getByRole('button', { name: 'Create component' })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+Alt+K');
  const component = page.getByRole('treeitem', { name: /Component 1/ });
  await expect(component).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Create component' })).toHaveCount(0);

  // One undo step: undo removes the component frame, redo brings it back.
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(component).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await expect(component).toHaveCount(1);

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('treeitem', { name: /Component 1/ })).toHaveCount(1);
});
