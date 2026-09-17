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

import { beforeEach, describe, expect, test } from 'vitest';
import { createEmptyDocument, keyOnTop, makeFrame } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { Editor } from '../editor';
import {
  addComment,
  commentAnchorAt,
  commentRect,
  commentsOf,
  deleteComment,
  deleteCommentMessage,
  editCommentMessage,
  moveComment,
  replyToComment,
  setCommentResolved,
} from './comments';

let editor: Editor;
let frame: string;

/** A frame at (100, 100), 200 × 200, which comments inside it hang from. */
beforeEach(() => {
  const ids = new IdGenerator('c');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  frame = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeFrame({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Screen', x: 100, y: 100, width: 200, height: 200 }));
    return id;
  });
});

const only = () => commentsOf(editor)[0]!;

describe('a comment', () => {
  test('is pinned where it was left, and says what was written', () => {
    const id = addComment(editor, { x: 500, y: 500 }, '  Needs more contrast  ');
    expect(id).not.toBeNull();
    expect(only().messages.map((message) => message.text)).toEqual(['Needs more contrast']);
    expect(commentRect(editor, only())).toEqual({ x: 500, y: 500, width: 0, height: 0 });
    // Nothing to say is no comment at all.
    expect(addComment(editor, { x: 0, y: 0 }, '   ')).toBeNull();
    expect(commentsOf(editor)).toHaveLength(1);
  });

  test('a region is a comment with a size', () => {
    addComment(editor, { x: 500, y: 500 }, 'This block', { width: 120, height: 60 });
    expect(commentRect(editor, only())).toEqual({ x: 500, y: 500, width: 120, height: 60 });
  });

  test('one left inside a frame hangs from it and travels with it', () => {
    expect(commentAnchorAt(editor, { x: 150, y: 150 })).toBe(frame);
    expect(commentAnchorAt(editor, { x: 900, y: 900 })).toBeNull();

    addComment(editor, { x: 150, y: 150 }, 'Inside');
    expect(only().anchorId).toBe(frame);
    expect(commentRect(editor, only())).toMatchObject({ x: 150, y: 150 });

    // Moving the frame takes the comment along.
    editor.history.run('move', (tx) => tx.set(frame, 'transform', [1, 0, 0, 1, 400, 100]));
    expect(commentRect(editor, only())).toMatchObject({ x: 450, y: 150 });
  });

  test('a thread takes replies, and a message is rewritten or taken away', () => {
    const id = addComment(editor, { x: 0, y: 0 }, 'First')!;
    expect(replyToComment(editor, id, 'Second')).toBe(true);
    expect(replyToComment(editor, id, '   ')).toBe(false);
    expect(only().messages).toHaveLength(2);

    const [first, second] = only().messages;
    editCommentMessage(editor, id, first!.id, 'First, rewritten');
    expect(only().messages[0]!.text).toBe('First, rewritten');
    expect(only().messages[0]!.edited).toBe(true);

    deleteCommentMessage(editor, id, second!.id);
    expect(only().messages).toHaveLength(1);
    // Taking the last message away takes the thread with it.
    deleteCommentMessage(editor, id, first!.id);
    expect(commentsOf(editor)).toHaveLength(0);
  });

  test('is settled and opened again, and deleted outright', () => {
    const id = addComment(editor, { x: 0, y: 0 }, 'Question')!;
    setCommentResolved(editor, id, true);
    expect(only().resolved).toBe(true);
    setCommentResolved(editor, id, false);
    expect(only().resolved).toBeUndefined();

    expect(deleteComment(editor, id)).toBe(true);
    expect(deleteComment(editor, id)).toBe(false);
    expect((editor.doc.getOrThrow(editor.pageId) as { comments?: unknown }).comments).toBeUndefined();
  });

  test('is dragged clear of the design, keeping the frame it hangs from', () => {
    const id = addComment(editor, { x: 150, y: 150 }, 'Inside')!;
    moveComment(editor, id, { x: 260, y: 160 });
    expect(only().anchorId).toBe(frame);
    expect(commentRect(editor, only())).toMatchObject({ x: 260, y: 160 });
  });
});
