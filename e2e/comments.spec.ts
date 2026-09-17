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

test('C leaves a comment on the canvas, which is replied to, settled and taken away', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // Comment mode takes the right panel over.
  await page.keyboard.press('c');
  const panel = page.getByRole('region', { name: 'Comments' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('No comments yet');

  // Clicking the canvas starts a comment pinned there.
  await page.mouse.click(box.x + 400, box.y + 300);
  const write = panel.getByRole('textbox', { name: 'Write a comment' });
  await expect(write).toBeVisible();
  await write.fill('Needs more contrast');
  await panel.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(panel.getByRole('list', { name: 'Comment threads' })).toContainText('Needs more contrast');

  // Opening the thread shows its messages, and a reply joins them.
  await panel.getByRole('button', { name: /^Open comment Needs more contrast/ }).click();
  const reply = panel.getByRole('textbox', { name: 'Write a reply' });
  await reply.fill('Agreed, I will darken it');
  await panel.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(panel).toContainText('Agreed, I will darken it');
  await expect(panel).toContainText('2 messages');

  // A message is rewritten, and says so.
  await panel.getByRole('button', { name: 'Edit message Agreed, I will darken it' }).click();
  const editBox = panel.getByRole('textbox', { name: 'Edit message' });
  await editBox.fill('Agreed, darkening it now');
  await editBox.press('Enter');
  await expect(panel).toContainText('Agreed, darkening it now');
  await expect(panel).toContainText('edited');

  // Settled threads leave the list until they are asked for.
  await panel.getByRole('button', { name: 'Resolve' }).click();
  await expect(panel.getByRole('list', { name: 'Comment threads' })).toHaveCount(0);
  await panel.getByRole('checkbox', { name: 'Show resolved comments' }).check();
  await expect(panel).toContainText('Resolved');

  // It belongs to the file.
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('c');
  const reloaded = page.getByRole('region', { name: 'Comments' });
  await reloaded.getByRole('checkbox', { name: 'Show resolved comments' }).check();
  await expect(reloaded).toContainText('Needs more contrast');

  await reloaded.getByRole('button', { name: /^Open comment Needs more contrast/ }).click();
  await reloaded.getByRole('button', { name: 'Delete thread' }).click();
  await expect(reloaded).toContainText('No comments yet');
});

test('a comment is drawn over a region, is searched for, and hides from the canvas with ⇧C', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  await page.keyboard.press('c');
  const panel = page.getByRole('region', { name: 'Comments' });

  // Dragging marks a region rather than a point.
  await page.mouse.move(box.x + 300, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 420, box.y + 330, { steps: 6 });
  await page.mouse.up();
  await expect(panel).toContainText('On a region');
  await panel.getByRole('textbox', { name: 'Write a comment' }).fill('This whole block');
  await panel.getByRole('button', { name: 'Comment', exact: true }).click();

  // A second comment, so searching has something to sift.
  await page.mouse.click(box.x + 600, box.y + 400);
  await panel.getByRole('textbox', { name: 'Write a comment' }).fill('Spacing here');
  await panel.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(panel.getByRole('list', { name: 'Comment threads' }).getByRole('listitem')).toHaveCount(2);

  await panel.getByRole('searchbox', { name: 'Search comments' }).fill('spacing');
  await expect(panel.getByRole('list', { name: 'Comment threads' }).getByRole('listitem')).toHaveCount(1);
  await panel.getByRole('searchbox', { name: 'Search comments' }).fill('');
  // A shortcut does not reach the canvas while a field has the keyboard, so the search box gives it up first.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  // ⇧C keeps them off the canvas; the list still has them.
  await page.keyboard.press('Shift+C');
  await expect(panel.getByRole('button', { name: 'Show on canvas' })).toBeVisible();
  await expect(panel.getByRole('list', { name: 'Comment threads' }).getByRole('listitem')).toHaveCount(2);
  await page.keyboard.press('Shift+C');
  await expect(panel.getByRole('button', { name: 'Hide on canvas' })).toBeVisible();
});

test('a comment carries formatting, and is dragged clear of the design', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  await page.keyboard.press('c');
  const panel = page.getByRole('region', { name: 'Comments' });
  await page.mouse.click(box.x + 400, box.y + 300);
  await panel.getByRole('textbox', { name: 'Write a comment' }).fill('Use **bold** and `code` and https://example.com/spec');
  await panel.getByRole('button', { name: 'Comment', exact: true }).click();
  await panel.getByRole('button', { name: /^Open comment/ }).click();

  // The marks become elements rather than being left as characters.
  const thread = panel.getByRole('list', { name: 'Comment threads' });
  await expect(thread.locator('strong')).toHaveText('bold');
  await expect(thread.locator('code')).toHaveText('code');
  await expect(thread.getByRole('link', { name: 'https://example.com/spec' })).toHaveAttribute('href', 'https://example.com/spec');
  await expect(thread).not.toContainText('**bold**');

  // Dragging the pin takes the comment somewhere else; it is still the same thread.
  await page.mouse.move(box.x + 410, box.y + 290);
  await page.mouse.down();
  await page.mouse.move(box.x + 600, box.y + 420, { steps: 8 });
  await page.mouse.up();
  await expect(thread.getByRole('listitem')).toHaveCount(1);

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('c');
  await expect(page.getByRole('region', { name: 'Comments' })).toContainText('Use bold and code');
});

test('a comment left in Motion remembers the moment, and going back to it moves the playhead', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 460, box.y + 310, { steps: 5 });
  await page.mouse.up();

  // In Motion, with the playhead part way along.
  await page.getByRole('radio', { name: 'Motion' }).check();
  const timeline = page.getByRole('region', { name: 'Timeline' });
  const current = timeline.getByRole('textbox', { name: 'Current time' });
  await current.fill('750');
  await current.press('Enter');
  // The timing field keeps the keyboard until it is given up, so the shortcut would be typed into it.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  await page.keyboard.press('c');
  const panel = page.getByRole('region', { name: 'Comments' });
  await page.mouse.click(box.x + 500, box.y + 350);
  await panel.getByRole('textbox', { name: 'Write a comment' }).fill('Too fast here');
  await panel.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(panel).toContainText('At 750 ms');

  // Moving the playhead and then opening the comment takes it back to the moment.
  await current.fill('0');
  await current.press('Enter');
  await expect(current).toHaveValue('0');
  await panel.getByRole('button', { name: /^Open comment Too fast here/ }).click();
  await expect(current).toHaveValue('750');
});
