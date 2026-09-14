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

import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures';

/** Selects text in a rich text editor: from the start of `from` to the end of `to` (or of `from`). */
async function select(text: Locator, from: string, to = from) {
  await text.evaluate(
    (root, [start, end]) => {
      const find = (needle: string) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const at = node.textContent!.indexOf(needle);
          if (at >= 0) return { node, at };
        }
        throw new Error(`No text ${needle}`);
      };
      const a = find(start!);
      const b = find(end!);
      const range = document.createRange();
      range.setStart(a.node, a.at);
      range.setEnd(b.node, b.at + end!.length);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    },
    [from, to],
  );
}

test('a flow description is edited as formatted text, with bold text, lists and links, and shows formatted everywhere', async ({ page }) => {
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
  const text = editor.getByRole('textbox', { name: 'Flow description' });
  await text.click();
  await text.pressSequentially('Tap Buy now');
  await text.press('Enter');
  await text.pressSequentially('Open the cart');
  await text.press('Enter');
  await text.pressSequentially('Pay');
  await text.press('Enter');
  await text.pressSequentially('Guide');
  await expect(editor).toHaveAttribute('data-description', 'Tap Buy now\nOpen the cart\nPay\nGuide');

  // Bold: "Buy now".
  await select(text, 'Buy now');
  await editor.getByRole('button', { name: 'Bold' }).click();
  await expect(text.locator('b, strong')).toHaveText('Buy now');
  await expect(editor).toHaveAttribute('data-description', 'Tap **Buy now**\nOpen the cart\nPay\nGuide');
  // A bulleted list of the next two lines.
  await select(text, 'Open the cart', 'Pay');
  await editor.getByRole('button', { name: 'Bulleted list' }).click();
  await expect(text.getByRole('listitem')).toHaveText(['Open the cart', 'Pay']);
  await expect(editor).toHaveAttribute('data-description', 'Tap **Buy now**\n- Open the cart\n- Pay\nGuide');
  // A link on "Guide" (selecting the address field keeps the text's selection).
  await select(text, 'Guide');
  await editor.getByLabel('Link address').fill('https://example.com/guide');
  await editor.getByRole('button', { name: 'Add link' }).click();
  await expect(text.getByRole('link', { name: 'Guide' })).toHaveAttribute('href', 'https://example.com/guide');
  await expect(editor).toHaveAttribute('data-description', 'Tap **Buy now**\n- Open the cart\n- Pay\n[Guide](https://example.com/guide)');
  await editor.getByRole('button', { name: 'Close description' }).click();
  await expect(editor).toHaveCount(0);

  // Opened again, it shows formatted.
  await panel.getByRole('button', { name: 'Edit description' }).click();
  await expect(text.locator('strong')).toHaveText('Buy now');
  await expect(text.getByRole('listitem')).toHaveText(['Open the cart', 'Pay']);
  await expect(editor).toHaveAttribute('data-description', 'Tap **Buy now**\n- Open the cart\n- Pay\n[Guide](https://example.com/guide)');
  await editor.getByRole('button', { name: 'Close description' }).click();

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
