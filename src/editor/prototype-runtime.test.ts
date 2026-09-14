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
import { instanceToChange, runReaction, startPlayer } from '@/core/prototype/player';
import { destinationCandidates, variantSetOf } from '@/core/prototype/reactions';
import type { Reaction, SceneNode } from '@/core/schema/document';
import { BUILTIN_COMMANDS } from './commands/builtin';
import { insertInstance } from './commands/insert-instance';
import { Editor } from './editor';
import { changeVariant } from './prototype-runtime';

let editor: Editor;

/** A main component named `name` wrapping a rectangle at (x, 0). */
function component(x: number, name: string): string {
  const rect = editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(editor.doc, editor.pageId) }, name: 'Shape', x, y: 0, width: 60, height: 20 }));
    return id;
  });
  editor.state.select([rect]);
  editor.commands.run('object.createComponent');
  const id = editor.selection[0]!;
  editor.history.run('Rename', (tx) => tx.set(id, 'name', name));
  return id;
}

const main = (id: string, doc = editor.doc) => (doc.getOrThrow(id) as SceneNode & { instance?: { mainId: string } }).instance?.mainId;

beforeEach(() => {
  const ids = new IdGenerator('e');
  editor = new Editor({ doc: createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.commands.register(...BUILTIN_COMMANDS);
});

describe('interactive components', () => {
  test('a Change to on a variant carries to its instances and switches the instance in a copy of the document', () => {
    const off = component(0, 'State=Off');
    const on = component(200, 'State=On');
    editor.state.select([off, on]);
    editor.commands.run('object.combineAsVariants');
    const set = editor.selection[0]!;
    const toggle: Reaction = { trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', navigation: 'CHANGE_TO', destinationId: on, transition: { type: 'INSTANT' } }] };
    editor.history.run('Interaction', (tx) => tx.set(off, 'reactions', [toggle]));

    insertInstance(editor, off, { x: 600, y: 400 });
    const instance = editor.selection[0]!;
    expect(main(instance)).toBe(off);
    // The instance has the variant's interaction.
    expect((editor.doc.getOrThrow(instance) as SceneNode).reactions).toEqual([toggle]);

    expect(variantSetOf(editor.doc, instance)).toBe(set);
    expect(variantSetOf(editor.doc, off)).toBe(set);
    expect(destinationCandidates(editor.doc, instance, 'CHANGE_TO').sort()).toEqual([off, on].sort());
    expect(instanceToChange(editor.doc, instance, on)).toBe(instance);

    const state = startPlayer(editor.doc, editor.pageId, instance)!;
    const step = runReaction(editor.doc, state, toggle, instance);
    expect(step.effects).toEqual([{ type: 'changeTo', instanceId: instance, variantId: on, transition: { type: 'INSTANT' } }]);
    expect(step.state).toBe(state);

    const runtime = changeVariant(editor.doc, editor.pageId, instance, on)!;
    expect(main(instance, runtime.doc)).toBe(on);
    expect(runtime.index.worldBounds(instance)).not.toBeNull();
    // The file itself is unchanged.
    expect(main(instance)).toBe(off);
  });
});
