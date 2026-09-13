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
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { Node, SceneNode } from '@/core/schema/document';
import { parseUntrustedJson, UntrustedJsonError } from '@/core/serialize/safe-json';
import { BUILTIN_COMMANDS } from '../commands/builtin';
import { Editor } from '../editor';
import { pastePayload } from './paste';
import {
  clipboardPlainText,
  ClipboardError,
  createClipboardPayload,
  decodeClipboardHtml,
  encodeClipboardHtml,
  validateClipboardPayload,
  type ClipboardPayload,
} from './payload';

let editor: Editor;

const add = <T extends Node>(build: (id: string, parent: { id: string; key: string }) => T, parent?: string): string =>
  editor.history.run('seed', (tx) => {
    const p = parent ?? editor.pageId;
    const id = editor.ids.next();
    tx.create(build(id, { id: p, key: keyOnTop(editor.doc, p) }));
    return id;
  });
const rect = (x: number, y: number, name = 'R', parent?: string) =>
  add((id, p) => makeRectangle({ id, parent: p, name, x, y, width: 10, height: 10 }), parent);
const bounds = (id: string) => {
  editor.scene.ensure(editor.pageId);
  return editor.scene.worldBounds(id)!;
};
const copy = (ids: string[]): ClipboardPayload => {
  editor.state.select(ids);
  return createClipboardPayload(editor)!;
};

beforeEach(() => {
  const ids = new IdGenerator('c');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  editor.canvasSize = { width: 1000, height: 800 };
  editor.setViewport({ x: 0, y: 0, zoom: 1 });
});

describe('paste', () => {
  test('pastes above the original at the same visible position with fresh ids; one undo step', () => {
    const a = rect(100, 100);
    const payload = copy([a]);
    const [pasted] = pastePayload(editor, payload);
    expect(pasted).not.toBe(a);
    expect(bounds(pasted!)).toEqual(bounds(a));
    expect([...editor.doc.children(editor.pageId)]).toEqual([a, pasted]);
    expect(editor.selection).toEqual([pasted]);
    editor.commands.run('edit.undo');
    expect(editor.doc.has(pasted!)).toBe(false);
  });

  test('content copied off-screen is centered in the view', () => {
    const a = rect(5000, 5000);
    const payload = copy([a]);
    editor.state.clearSelection();
    const [pasted] = pastePayload(editor, payload);
    expect(bounds(pasted!)).toEqual({ x: 495, y: 395, width: 10, height: 10 });
  });

  test('pasting with a frame selected pastes inside it, centered when outside the frame', () => {
    const frame = add((id, p) => makeFrame({ id, parent: p, name: 'F', x: 300, y: 300, width: 200, height: 100 }));
    const a = rect(0, 0);
    const payload = copy([a]);
    editor.state.select([frame]);
    const [pasted] = pastePayload(editor, payload);
    expect(editor.doc.parentOf(pasted!)).toBe(frame);
    expect(bounds(pasted!)).toEqual({ x: 395, y: 345, width: 10, height: 10 });
    expect((editor.doc.getOrThrow(pasted!) as SceneNode).transform.slice(4)).toEqual([95, 45]);
  });

  test('subtrees are remapped and keep internal structure', () => {
    const frame = add((id, p) => makeFrame({ id, parent: p, name: 'F', x: 0, y: 0, width: 100, height: 100 }));
    const child = rect(10, 10, 'Child', frame);
    const payload = copy([frame]);
    const [pasted] = pastePayload(editor, payload);
    const pastedChildren = editor.doc.children(pasted!);
    expect(pastedChildren).toHaveLength(1);
    expect(pastedChildren[0]).not.toBe(child);
    expect(editor.doc.get(pastedChildren[0]!)?.name).toBe('Child');
  });

  test('cut then paste restores layers at the same position', () => {
    const a = rect(40, 40);
    const payload = copy([a]);
    editor.commands.run('edit.delete');
    const [pasted] = pastePayload(editor, payload);
    expect(bounds(pasted!)).toEqual({ x: 40, y: 40, width: 10, height: 10 });
  });

  test('paste over selection centers on the selection; paste to replace swaps layers in place', () => {
    const source = rect(0, 0);
    const target = rect(200, 200);
    const other = rect(400, 0);
    const payload = copy([source]);
    editor.state.select([target]);
    const [over] = pastePayload(editor, payload, 'over-selection');
    expect(bounds(over!)).toEqual({ x: 200, y: 200, width: 10, height: 10 });

    editor.state.select([other]);
    const [replacement] = pastePayload(editor, payload, 'replace');
    expect(editor.doc.has(other)).toBe(false);
    expect(bounds(replacement!)).toEqual({ x: 400, y: 0, width: 10, height: 10 });
    editor.commands.run('edit.undo');
    expect(editor.doc.has(other)).toBe(true);
    expect(editor.doc.has(replacement!)).toBe(false);
  });
});

describe('clipboard encoding and validation', () => {
  test('HTML round trip preserves the payload, including non-ASCII names', () => {
    const a = rect(1, 2, 'Überschrift 🎨 "quotes" <tag>');
    const payload = copy([a]);
    const html = encodeClipboardHtml(payload);
    expect(html).toContain('Überschrift 🎨 &quot;quotes&quot; &lt;tag&gt;');
    expect(decodeClipboardHtml(html)).toEqual(validateClipboardPayload(payload));
    expect(clipboardPlainText(payload)).toBe('Überschrift 🎨 "quotes" <tag>');
  });

  test('non-Openframe HTML is ignored; damaged Openframe HTML is rejected', () => {
    expect(decodeClipboardHtml('<b>hello</b>')).toBeNull();
    expect(() => decodeClipboardHtml('<div data-openframe-clipboard="v1:!!!!">')).toThrow(ClipboardError);
  });

  test('malicious and malformed payloads are rejected', () => {
    const a = rect(0, 0);
    const good = copy([a]);
    const clone = () => JSON.parse(JSON.stringify(good)) as { nodes: Record<string, unknown>[]; roots: string[]; worldTransforms: Record<string, unknown> };

    expect(() => parseUntrustedJson('{"__proto__": {"polluted": true}}')).toThrow(UntrustedJsonError);

    const withPage = clone();
    withPage.nodes.push({ id: 'x:1', type: 'PAGE', name: 'P', parent: { id: '0:0', key: 'V' }, visible: true, locked: false, backgroundColor: { r: 0, g: 0, b: 0, a: 1 } });
    expect(() => validateClipboardPayload(withPage)).toThrow(ClipboardError);

    const dangling = clone();
    dangling.nodes.push({ ...dangling.nodes[0]!, id: 'x:2', parent: { id: 'x:999', key: 'V' } });
    expect(() => validateClipboardPayload(dangling)).toThrow(/missing/);

    const missingRoot = clone();
    missingRoot.roots = ['x:404'];
    expect(() => validateClipboardPayload(missingRoot)).toThrow(ClipboardError);

    const badTransform = clone();
    badTransform.worldTransforms[good.roots[0]!] = [1, 0, 0, 1, 'x', 0];
    expect(() => validateClipboardPayload(badTransform)).toThrow(ClipboardError);

    const cyclic = clone();
    const base = cyclic.nodes[0]!;
    cyclic.nodes.push({ ...base, id: 'x:5', type: 'GROUP', parent: { id: 'x:6', key: 'V' } });
    cyclic.nodes.push({ ...base, id: 'x:6', type: 'GROUP', parent: { id: 'x:5', key: 'V' } });
    expect(() => validateClipboardPayload(cyclic)).toThrow(ClipboardError);
  });
});
