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

test('a flow description is formatted with bold text, lists and links, in the Prototype tab and presentation view', async ({ page }) => {
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
  await panel.getByRole('button', { name: 'Add starting point' }).click();
  await panel.getByRole('button', { name: 'Edit description' }).click();
  const editor = panel.getByRole('group', { name: 'Description' });
  const text = editor.getByLabel('Flow description');
  await text.fill('Tap Buy now\nOpen the cart\nPay');
  // Bold: "Buy now".
  await text.evaluate((area: HTMLTextAreaElement) => area.setSelectionRange(4, 11));
  await editor.getByRole('button', { name: 'Bold' }).click();
  await expect(text).toHaveValue('Tap **Buy now**\nOpen the cart\nPay');
  // A bulleted list of the last two lines.
  await text.evaluate((area: HTMLTextAreaElement) => area.setSelectionRange(16, 33));
  await editor.getByRole('button', { name: 'Bulleted list' }).click();
  await expect(text).toHaveValue('Tap **Buy now**\n- Open the cart\n- Pay');
  // A link.
  await text.evaluate((area: HTMLTextAreaElement) => area.setSelectionRange(37, 37));
  await text.press('Enter');
  await text.pressSequentially('Guide');
  await text.evaluate((area: HTMLTextAreaElement) => area.setSelectionRange(38, 43));
  await editor.getByLabel('Link address').fill('https://example.com/guide');
  await editor.getByRole('button', { name: 'Add link' }).click();
  await expect(text).toHaveValue('Tap **Buy now**\n- Open the cart\n- Pay\n[Guide](https://example.com/guide)');
  const preview = editor.getByRole('group', { name: 'Description preview' });
  await expect(preview.locator('strong')).toHaveText('Buy now');
  await expect(preview.getByRole('listitem')).toHaveText(['Open the cart', 'Pay']);
  await editor.getByRole('button', { name: 'Close description' }).click();
  await expect(editor).toHaveCount(0);

  // The Flows section, with nothing selected, shows it formatted.
  await page.keyboard.press('Escape');
  const listed = panel.getByRole('group', { name: 'Flow 1 description' });
  await expect(listed.locator('strong')).toHaveText('Buy now');
  await expect(listed.getByRole('link', { name: 'Guide' })).toHaveAttribute('href', 'https://example.com/guide');

  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const present = await popup;
  await expect(present.getByTestId('presentation')).toHaveAttribute('data-ready', 'true');
  await present.getByRole('button', { name: 'Flows', exact: true }).click();
  const sidebar = present.getByRole('group', { name: 'Flow 1 description' });
  await expect(sidebar.getByRole('listitem')).toHaveText(['Open the cart', 'Pay']);
  await expect(sidebar.getByRole('link', { name: 'Guide' })).toHaveAttribute('href', 'https://example.com/guide');
});
