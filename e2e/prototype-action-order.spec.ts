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

test('actions are reordered by dragging or with the arrow keys, and dragged into a Conditional', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('f');
  await page.mouse.move(box.x + 350, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 490, box.y + 320, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name: 'Frame 1' })).toBeVisible();

  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  // Actions: Open link, then Back.
  await panel.getByRole('combobox', { name: 'Action', exact: true }).selectOption({ label: 'Open link' });
  await panel.getByRole('button', { name: 'Add action' }).click();
  await panel.getByRole('combobox', { name: 'Action 2', exact: true }).selectOption({ label: 'Back' });
  const summary = panel.getByRole('button', { name: /^On click:/ });
  await expect(summary).toHaveText('On click: Open link No link +1');

  // Dragging Back onto Open link puts it first.
  await panel.getByRole('button', { name: 'Move action 2', exact: true }).dragTo(panel.getByRole('group', { name: 'Action settings', exact: true }));
  await expect(summary).toHaveText('On click: Back +1');
  await expect(panel.getByRole('combobox', { name: 'Action 2', exact: true })).toHaveValue('URL');
  // ↓ on the first action's handle moves it back down.
  await panel.getByRole('button', { name: 'Move action', exact: true }).press('ArrowDown');
  await expect(summary).toHaveText('On click: Open link No link +1');

  // A Conditional as the third action; Open link is dragged into its Else block.
  await panel.getByRole('button', { name: 'Add action' }).click();
  await panel.getByRole('combobox', { name: 'Action 3', exact: true }).selectOption({ label: 'Conditional' });
  await panel.getByRole('button', { name: 'Move action', exact: true }).dragTo(panel.getByRole('button', { name: 'Add else action' }));
  await expect(summary).toHaveText('On click: Back +1');
  await expect(panel.getByRole('group', { name: 'Else 2' }).getByRole('combobox', { name: 'Action 2 else 1', exact: true })).toHaveValue('URL');
});
