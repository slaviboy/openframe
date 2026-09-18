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
import { createEmptyDocument } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { movePage } from './pages';

let editor: Editor;

const names = () => editor.doc.pages().map((id) => editor.doc.getOrThrow(id).name);
const idOf = (name: string) => editor.doc.pages().find((id) => editor.doc.getOrThrow(id).name === name)!;

beforeEach(() => {
  const ids = new IdGenerator('p');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.commands.run('page.add');
  editor.commands.run('page.add');
  expect(names()).toEqual(['Page 1', 'Page 2', 'Page 3']);
});

describe('moving a page in the list', () => {
  test('a page lands in front of the one it is dropped on', () => {
    expect(movePage(editor, idOf('Page 3'), idOf('Page 1'))).toBe(true);
    expect(names()).toEqual(['Page 3', 'Page 1', 'Page 2']);
    editor.history.undo();
    expect(names()).toEqual(['Page 1', 'Page 2', 'Page 3']);
  });

  test('dropping past the end puts the page last', () => {
    expect(movePage(editor, idOf('Page 1'), null)).toBe(true);
    expect(names()).toEqual(['Page 2', 'Page 3', 'Page 1']);
  });

  test('a page moved into the middle lands between its new neighbours', () => {
    expect(movePage(editor, idOf('Page 1'), idOf('Page 3'))).toBe(true);
    expect(names()).toEqual(['Page 2', 'Page 1', 'Page 3']);
  });

  test('a drop that changes nothing leaves no step in the history', () => {
    const before = editor.doc.rev;
    expect(movePage(editor, idOf('Page 2'), idOf('Page 2'))).toBe(false);
    // Dropped in front of the page it already sits in front of.
    expect(movePage(editor, idOf('Page 1'), idOf('Page 2'))).toBe(false);
    expect(movePage(editor, idOf('Page 3'), null)).toBe(false);
    expect(editor.doc.rev).toBe(before);
  });
});
