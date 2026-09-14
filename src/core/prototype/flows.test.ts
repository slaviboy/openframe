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
import type { PageNode, Reaction, SceneNode } from '@/core/schema/document';
import { Editor } from '@/editor/editor';
import { addFlowStartingPoint, addInteraction, removeFlowStartingPoint, setOverlaySettings, updateFlowStartingPoint, updateInteraction } from '@/editor/commands/prototype';
import { flowsOf, isOverlayDestination, nextFlowName, overlayOrigin } from './flows';

let editor: Editor;
let page: string;
const flows = () => (editor.doc.getOrThrow(page) as PageNode).flowStartingPoints;
const navigate = (destinationId: string, navigation: 'NAVIGATE' | 'OVERLAY' = 'NAVIGATE'): Reaction => ({ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', navigation, destinationId, transition: { type: 'INSTANT' } }] });

beforeEach(() => {
  const ids = new IdGenerator('m');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  page = editor.pageId;
  const init = (id: string, parent: string) => ({ id, parent: { id: parent, key: keyOnTop(editor.doc, parent) }, name: id, x: 0, y: 0, width: 10, height: 10 });
  editor.history.run('Build', (tx) => {
    tx.create(makeFrame(init('home', page)));
    tx.create(makeRectangle(init('button', 'home')));
    tx.create(makeFrame(init('about', page)));
    tx.create(makeFrame(init('menu', page)));
    tx.create(makeFrame(init('cart', page)));
    tx.create(makeRectangle(init('buy', 'cart')));
  });
});

describe('flows and overlays', () => {
  test('connecting two frames without connections starts a flow at the first one', () => {
    addInteraction(editor, ['button']);
    // No destination yet: no flow.
    expect(flows()).toBeUndefined();
    updateInteraction(editor, ['button'], 0, navigate('about'));
    expect(flows()).toEqual([{ nodeId: 'home', name: 'Flow 1' }]);
    // About is connected now: a connection from it doesn't start another flow.
    addInteraction(editor, ['about'], 'menu');
    expect(flows()).toHaveLength(1);
    // Two frames without connections: a second flow.
    addInteraction(editor, ['buy'], 'menu');
    expect(flows()).toHaveLength(1);
    editor.history.undo();
    editor.history.undo();
    addInteraction(editor, ['buy'], 'menu');
    expect(flows()).toEqual([
      { nodeId: 'home', name: 'Flow 1' },
      { nodeId: 'cart', name: 'Flow 2' },
    ]);
  });

  test('flow starting points are added, renamed, described and removed on top-level frames only', () => {
    expect(addFlowStartingPoint(editor, 'button')).toBe(false);
    expect(addFlowStartingPoint(editor, 'about')).toBe(true);
    expect(addFlowStartingPoint(editor, 'about')).toBe(false);
    updateFlowStartingPoint(editor, 'about', { name: 'Checkout', description: ' Buy a thing ' });
    expect(flowsOf(editor.doc, page)).toEqual([{ nodeId: 'about', name: 'Checkout', description: 'Buy a thing' }]);
    updateFlowStartingPoint(editor, 'about', { name: '  ', description: '' });
    expect(flowsOf(editor.doc, page)).toEqual([{ nodeId: 'about', name: 'Checkout' }]);
    expect(nextFlowName([{ nodeId: 'x', name: 'Flow 1' }, { nodeId: 'y', name: 'Flow 3' }])).toBe('Flow 2');
    removeFlowStartingPoint(editor, 'about');
    expect(flows()).toBeUndefined();
    // A deleted starting frame drops out of the flows.
    addFlowStartingPoint(editor, 'cart');
    editor.history.run('Delete', (tx) => tx.delete('buy'));
    editor.history.run('Delete', (tx) => tx.delete('cart'));
    expect(flowsOf(editor.doc, page)).toEqual([]);
  });

  test('overlay destinations, settings and positions', () => {
    expect(isOverlayDestination(editor.doc, page, 'menu')).toBe(false);
    addInteraction(editor, ['button']);
    updateInteraction(editor, ['button'], 0, navigate('menu', 'OVERLAY'));
    expect(isOverlayDestination(editor.doc, page, 'menu')).toBe(true);
    setOverlaySettings(editor, 'menu', { position: 'BOTTOM_CENTER', closeOnClickOutside: true });
    expect((editor.doc.getOrThrow('menu') as SceneNode).overlay).toEqual({ position: 'BOTTOM_CENTER', closeOnClickOutside: true, background: null });
    const screen = { width: 400, height: 300 };
    const overlay = { width: 200, height: 100 };
    expect(overlayOrigin('CENTER', screen, overlay)).toEqual({ x: 100, y: 100 });
    expect(overlayOrigin('BOTTOM_CENTER', screen, overlay)).toEqual({ x: 100, y: 200 });
    expect(overlayOrigin('TOP_RIGHT', screen, overlay)).toEqual({ x: 200, y: 0 });
  });
});
