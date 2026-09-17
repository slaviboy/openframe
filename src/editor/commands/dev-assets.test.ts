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
import { createEmptyDocument, keyOnTop, makeEllipse, makeRectangle, makeText } from '@/core/document/factory';
import { IdGenerator } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import { Editor } from '../editor';
import { assetSetting, devAssets, looksLikeIcon } from './dev-assets';

let editor: Editor;

beforeEach(() => {
  const ids = new IdGenerator('x');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
});

/** Puts a layer on the page and hands back its id. */
const place = (make: (init: { id: string; parent: { id: string; key: string }; name: string; x: number; y: number; width: number; height: number }) => SceneNode, name: string, width: number, height: number) =>
  editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(make({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name, x: 0, y: 0, width, height }));
    return id;
  });

const node = (id: string) => editor.doc.getOrThrow(id) as SceneNode;

describe('what Dev Mode has to hand over', () => {
  test('a small square drawing is taken for an icon; a big one or a text layer is not', () => {
    const icon = place(makeEllipse, 'Star', 24, 24);
    const banner = place(makeEllipse, 'Banner', 400, 300);
    const label = place(makeText, 'Label', 24, 24);

    expect(looksLikeIcon(editor, node(icon))).toBe(true);
    expect(looksLikeIcon(editor, node(banner))).toBe(false);
    expect(looksLikeIcon(editor, node(label))).toBe(false);
  });

  test('a long thin layer is not an icon, however small', () => {
    expect(looksLikeIcon(editor, node(place(makeEllipse, 'Rule', 48, 4)))).toBe(false);
  });

  test('a drawing goes out as SVG and everything else as a PNG', () => {
    expect(assetSetting(node(place(makeEllipse, 'Star', 24, 24))).format).toBe('SVG');
    expect(assetSetting(node(place(makeRectangle, 'Tile', 24, 24))).format).toBe('PNG');
  });

  test('the page lists the icons it holds, and a layer set up for export as it was set up', () => {
    place(makeEllipse, 'Star', 24, 24);
    const banner = place(makeRectangle, 'Banner', 400, 300);
    editor.history.run('export', (tx) => tx.set(banner, 'exportSettings', [{ format: 'JPG', constraint: { type: 'SCALE', value: 2 }, suffix: '@2x' }]));

    const assets = devAssets(editor);
    expect(assets.map((asset) => asset.name).sort()).toEqual(['Banner', 'Star']);
    expect(assets.find((asset) => asset.name === 'Star')!.detected).toBe(true);
    // A layer configured by hand keeps its own configuration rather than being guessed at.
    const configured = assets.find((asset) => asset.name === 'Banner')!;
    expect(configured.detected).toBe(false);
    expect(configured.setting.format).toBe('JPG');
  });

  test('a page with nothing to hand over lists nothing', () => {
    place(makeText, 'Label', 200, 40);
    expect(devAssets(editor)).toEqual([]);
  });
});
