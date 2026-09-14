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

test('multi-edit text layers', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  for (const [y, text] of [
    [150, 'Button label'],
    [300, 'Another label'],
  ] as const) {
    await page.keyboard.press('t');
    await page.mouse.click(box.x + 500, box.y + y);
    await page.keyboard.type(text);
    await page.keyboard.press('Escape');
  }

  // One text layer selected: no multi-edit button.
  const multiEdit = page.getByRole('button', { name: 'Multi-edit text' });
  await expect(multiEdit).toHaveCount(0);
  await page.getByRole('treeitem', { name: /Button label/ }).click();
  await page.getByRole('treeitem', { name: /Another label/ }).click({ modifiers: ['Shift'] });
  await multiEdit.click();
  await page.keyboard.type('Save');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('treeitem', { name: /^Save/ })).toHaveCount(2);

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('treeitem', { name: /^Save/ })).toHaveCount(2);
});
