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

import { apply, invert } from '@/core/math/matrix';
import type { Vec2 } from '@/core/math/vec';
import type { Rect } from '@/core/math/rect';
import type { Id } from '@/core/ids/ids';
import { isSceneNode, type Comment, type PageNode } from '@/core/schema/document';
import type { Editor } from '../editor';

/** The comments on a page, in the order they were written. */
export function commentsOf(editor: Editor, pageId: Id = editor.pageId): readonly Comment[] {
  const page = editor.doc.get(pageId);
  return page?.type === 'PAGE' ? (page.comments ?? []) : [];
}

/** Writes the page's comments, as one undo step; an empty list takes the field off again. */
function write(editor: Editor, label: string, next: readonly Comment[], pageId: Id = editor.pageId): boolean {
  const page = editor.doc.get(pageId) as PageNode | undefined;
  if (page?.type !== 'PAGE') return false;
  editor.history.run(label, (tx) => tx.set(pageId, 'comments', next.length === 0 ? undefined : next));
  return true;
}

/**
 * The top-level frame a point falls in, which a comment put there hangs from. Only the frames, components and groups
 * sitting straight on the page count: a comment never hangs from something nested inside one.
 */
export function commentAnchorAt(editor: Editor, world: Vec2): Id | null {
  editor.scene.ensure(editor.pageId);
  for (const id of [...editor.doc.children(editor.pageId)].reverse()) {
    const node = editor.doc.get(id);
    if (!node || !isSceneNode(node) || node.visible === false) continue;
    if (node.type !== 'FRAME' && node.type !== 'GROUP') continue;
    const bounds = editor.scene.worldBounds(id);
    if (bounds && world.x >= bounds.x && world.x <= bounds.x + bounds.width && world.y >= bounds.y && world.y <= bounds.y + bounds.height) return id;
  }
  return null;
}

/** Where a comment sits in the world now: hanging from its frame, or where it was left on the page. */
export function commentRect(editor: Editor, comment: Comment): Rect {
  const size = { width: comment.width ?? 0, height: comment.height ?? 0 };
  if (comment.anchorId === undefined || editor.doc.get(comment.anchorId) === undefined) return { x: comment.x, y: comment.y, ...size };
  editor.scene.ensure(editor.pageId);
  const world = editor.scene.computeWorld(comment.anchorId);
  const at = apply(world, { x: comment.x, y: comment.y });
  return { x: at.x, y: at.y, ...size };
}

/** A comment's place written the way it is stored: inside its frame when it has one. */
function place(editor: Editor, world: Vec2, anchorId: Id | null): Vec2 {
  if (anchorId === null) return world;
  editor.scene.ensure(editor.pageId);
  const toLocal = invert(editor.scene.computeWorld(anchorId));
  return toLocal ? apply(toLocal, world) : world;
}

/** Leaves a comment on the page: a pin, or a region when a size is given. Empty text writes nothing. */
export function addComment(editor: Editor, world: Vec2, text: string, size?: { readonly width: number; readonly height: number }): string | null {
  const said = text.trim();
  if (said === '') return null;
  const anchorId = commentAnchorAt(editor, world);
  const at = place(editor, world, anchorId);
  const id = editor.ids.next();
  const comment: Comment = {
    id,
    x: at.x,
    y: at.y,
    ...(size && size.width > 0 && size.height > 0 ? { width: size.width, height: size.height } : {}),
    ...(anchorId === null ? {} : { anchorId }),
    messages: [{ id: editor.ids.next(), text: said, at: new Date().toISOString() }],
  };
  return write(editor, 'Add comment', [...commentsOf(editor), comment]) ? id : null;
}

/** Changes one comment, leaving the rest as they are. */
function edit(editor: Editor, label: string, id: string, change: (comment: Comment) => Comment | null): boolean {
  let found = false;
  const next: Comment[] = [];
  for (const comment of commentsOf(editor)) {
    if (comment.id !== id) {
      next.push(comment);
      continue;
    }
    found = true;
    const changed = change(comment);
    if (changed) next.push(changed);
  }
  return found && write(editor, label, next);
}

/** Adds a reply to a thread. */
export function replyToComment(editor: Editor, id: string, text: string): boolean {
  const said = text.trim();
  if (said === '') return false;
  return edit(editor, 'Reply to comment', id, (comment) => ({ ...comment, messages: [...comment.messages, { id: editor.ids.next(), text: said, at: new Date().toISOString() }] }));
}

/** Rewrites a message, which is then marked as edited. Emptying it is not a way to delete it. */
export function editCommentMessage(editor: Editor, id: string, messageId: string, text: string): boolean {
  const said = text.trim();
  if (said === '') return false;
  return edit(editor, 'Edit comment', id, (comment) => ({
    ...comment,
    messages: comment.messages.map((message) => (message.id === messageId ? { ...message, text: said, edited: true as const } : message)),
  }));
}

/** Removes one message from a thread; taking the first away takes the whole thread with it. */
export function deleteCommentMessage(editor: Editor, id: string, messageId: string): boolean {
  return edit(editor, 'Delete comment', id, (comment) => {
    const kept = comment.messages.filter((message) => message.id !== messageId);
    return kept.length === 0 ? null : { ...comment, messages: kept };
  });
}

/** Removes a whole thread. */
export function deleteComment(editor: Editor, id: string): boolean {
  return edit(editor, 'Delete comment', id, () => null);
}

/** Marks a thread settled, or opens it again. */
export function setCommentResolved(editor: Editor, id: string, resolved: boolean): boolean {
  return edit(editor, resolved ? 'Resolve comment' : 'Unresolve comment', id, (comment) => {
    const { resolved: _was, ...rest } = comment;
    return resolved ? { ...rest, resolved: true as const } : rest;
  });
}

/** Moves a comment to another place on the canvas, which is how one is dragged clear of the design. */
export function moveComment(editor: Editor, id: string, world: Vec2): boolean {
  return edit(editor, 'Move comment', id, (comment) => {
    const anchorId = comment.anchorId !== undefined && editor.doc.get(comment.anchorId) !== undefined ? comment.anchorId : null;
    const at = place(editor, world, anchorId);
    return { ...comment, x: at.x, y: at.y };
  });
}
