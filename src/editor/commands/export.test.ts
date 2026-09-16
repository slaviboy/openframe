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
import { createEmptyDocument, keyOnTop, makeRectangle } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { BUILTIN_COMMANDS } from './builtin';
import { addExportSetting, layersWithExports, removeExportSetting, renderExports, updateExportSetting } from './export';

let editor: Editor;
let icon: string;
let other: string;
const rendered: Array<{ id: string; scale: number; format: string }> = [];

const node = (id: string) => editor.doc.getOrThrow(id) as SceneNode;

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
  [icon, other] = editor.history.run('create', (tx) => {
    const make = (name: string, x: number, width: number) => {
      const id = editor.ids.next();
      tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name, x, y: 0, width, height: 50 }));
      return id;
    };
    return [make('icons/close', 0, 100), make('icons/close', 200, 25)];
  });
  rendered.length = 0;
  editor.setThumbnails({
    thumbnail: () => null,
    fileThumbnail: () => null,
    exportImage: (_store, _index, _pageId, id, scale, format) => {
      rendered.push({ id, scale, format });
      return new Uint8Array([1]);
    },
  });
});

describe('export settings on layers', () => {
  test('are added, changed and removed on the selected layers', () => {
    expect(addExportSetting(editor, [icon, other])).toBe(true);
    expect(node(icon).exportSettings).toEqual([{ format: 'PNG', suffix: '', constraint: { type: 'SCALE', value: 1 } }]);
    addExportSetting(editor, [icon]);
    expect(updateExportSetting(editor, [icon], 1, { format: 'JPG', suffix: '@2x', constraint: { type: 'SCALE', value: 2 } })).toBe(true);
    expect(node(icon).exportSettings![1]).toEqual({ format: 'JPG', suffix: '@2x', constraint: { type: 'SCALE', value: 2 } });
    expect(updateExportSetting(editor, [other], 1, { format: 'JPG' })).toBe(false);
    expect(layersWithExports(editor)).toEqual([icon, other]);

    expect(removeExportSetting(editor, [other], 0)).toBe(true);
    expect(node(other).exportSettings).toBeUndefined();
    expect(layersWithExports(editor)).toEqual([icon]);
  });

  test('render into files named from the layer names, at the scale the constraint gives', () => {
    addExportSetting(editor, [icon, other]);
    updateExportSetting(editor, [icon, other], 0, { constraint: { type: 'WIDTH', value: 50 } });
    addExportSetting(editor, [icon]);
    updateExportSetting(editor, [icon], 1, { format: 'WEBP', suffix: '@2x', constraint: { type: 'SCALE', value: 2 } });

    const assets = renderExports(editor, [icon, other])!;
    expect(assets.map((a) => [a.path, a.type])).toEqual([
      ['icons/close.png', 'image/png'],
      ['icons/close@2x.webp', 'image/webp'],
      ['icons/close 2.png', 'image/png'],
    ]);
    // 50w: the 100-wide icon at half size, the 25-wide one at double.
    expect(rendered).toEqual([
      { id: icon, scale: 0.5, format: 'PNG' },
      { id: icon, scale: 2, format: 'WEBP' },
      { id: other, scale: 2, format: 'PNG' },
    ]);
    expect(renderExports(editor, [icon], new Set([`${icon}:1`]))!.map((a) => a.path)).toEqual(['icons/close@2x.webp']);

    editor.setThumbnails(null);
    expect(renderExports(editor, [icon])).toBeNull();
  });
});

describe('SVG exports', () => {
  test('are written by the SVG exporter at 1x, without the rendering engine, with what they left out', () => {
    addExportSetting(editor, [icon]);
    updateExportSetting(editor, [icon], 0, { format: 'SVG', constraint: { type: 'SCALE', value: 3 } });
    const [asset] = renderExports(editor, [icon])!;
    expect(asset).toMatchObject({ path: 'icons/close.svg', type: 'image/svg+xml', skipped: [] });
    expect(new TextDecoder().decode(asset!.bytes)).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"');
    expect(rendered).toEqual([]);

    editor.setThumbnails(null);
    expect(renderExports(editor, [icon])!.map((a) => a.path)).toEqual(['icons/close.svg']);
  });
});

describe('GIF exports', () => {
  const gifBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

  const fillWithGif = (id: string, mime = 'image/gif') => {
    void editor.images.add({ hash: 'gif-hash', bytes: gifBytes, mime, width: 80, height: 45 });
    editor.history.run('fill', (tx) => tx.set(id, 'fills', [{ type: 'IMAGE', imageHash: 'gif-hash', imageSize: { width: 80, height: 45 }, scaleMode: 'FILL', opacity: 1, visible: true, blendMode: 'NORMAL' }]));
  };

  test('write the layer’s own GIF, so its frame delays and loop count are kept, without the rendering engine', () => {
    fillWithGif(icon);
    addExportSetting(editor, [icon]);
    updateExportSetting(editor, [icon], 0, { format: 'GIF', constraint: { type: 'SCALE', value: 3 } });

    const [asset] = renderExports(editor, [icon])!;
    expect(asset).toMatchObject({ path: 'icons/close.gif', type: 'image/gif' });
    expect(asset!.bytes).toEqual(gifBytes);
    expect(rendered).toEqual([]);

    editor.setThumbnails(null);
    expect(renderExports(editor, [icon])!.map((a) => a.path)).toEqual(['icons/close.gif']);
  });

  test('are skipped for a layer whose fill is not an animated GIF', () => {
    fillWithGif(icon, 'image/png');
    addExportSetting(editor, [icon]);
    updateExportSetting(editor, [icon], 0, { format: 'GIF' });
    expect(renderExports(editor, [icon])).toEqual([]);
  });
});
