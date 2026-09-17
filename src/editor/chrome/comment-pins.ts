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

import type { Vec2 } from '@/core/math/vec';
import { commentRect, commentsOf } from '../commands/comments';
import type { Editor } from '../editor';
import { worldToScreen } from '../viewport/viewport';

/** How big a comment pin is on screen, in CSS pixels. */
export const COMMENT_PIN_SIZE = 20;

/** A comment as the canvas shows it: where its pin sits, and the region it covers when it has one. */
export interface DrawnComment {
  readonly id: string;
  readonly pin: Vec2;
  readonly region: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
  readonly resolved: boolean;
  /** The first line of the thread, which the pin shows when hovered. */
  readonly preview: string;
}

/**
 * The comments drawn on the canvas. They are shown unless they have been hidden (⇧C); a settled one is shown only
 * while comment mode is in hand, so a finished thread does not clutter the design.
 */
export function drawnComments(editor: Editor): DrawnComment[] {
  const state = editor.state.getSnapshot();
  if (state.commentsHidden) return [];
  const commenting = state.tool === 'comment';
  const viewport = editor.state.viewport;
  const out: DrawnComment[] = [];
  for (const comment of commentsOf(editor)) {
    const resolved = comment.resolved === true;
    if (resolved && !commenting) continue;
    const rect = commentRect(editor, comment);
    const at = worldToScreen(viewport, { x: rect.x, y: rect.y });
    const far = worldToScreen(viewport, { x: rect.x + rect.width, y: rect.y + rect.height });
    out.push({
      id: comment.id,
      pin: at,
      region: rect.width > 0 && rect.height > 0 ? { x: at.x, y: at.y, width: far.x - at.x, height: far.y - at.y } : null,
      resolved,
      preview: comment.messages[0]?.text ?? '',
    });
  }
  return out;
}

/** The comment under a screen point, if there is one; the last drawn wins, being the one on top. */
export function commentAt(editor: Editor, screen: Vec2): string | null {
  const reach = COMMENT_PIN_SIZE / 2 + 2;
  let hit: string | null = null;
  for (const comment of drawnComments(editor)) {
    // The pin hangs above and to the left of the point it marks, as a speech bubble's tail does.
    const center = { x: comment.pin.x + reach, y: comment.pin.y - reach };
    if (Math.hypot(screen.x - center.x, screen.y - center.y) <= reach) hit = comment.id;
  }
  return hit;
}
