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

import { keyOnTop } from '@/core/document/factory';
import { instantiate, isMainComponent } from '@/core/document/instances';
import { defaultVariant, isComponentSet } from '@/core/document/variants';
import type { Id } from '@/core/ids/ids';
import type { Vec2 } from '@/core/math/vec';
import { isSceneNode, type SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';

/** Drag data type of a component dragged from the Assets tab (its value is the main component's id). */
export const COMPONENT_DRAG_TYPE = 'application/x-openframe-component';

/** A main component offered in the Assets tab. */
export interface LocalComponent {
  readonly id: Id;
  readonly name: string;
  /** The component's description (The reference searches it too). */
  readonly description: string | undefined;
  readonly pageId: Id;
}

/** The main components in this file, from every page, in name order. */
export function localComponents(editor: Editor): LocalComponent[] {
  const found: LocalComponent[] = [];
  for (const pageId of editor.doc.pages()) {
    for (const id of editor.doc.descendants(pageId, false)) {
      const node = editor.doc.get(id);
      if (!node || !isSceneNode(node) || node.type !== 'FRAME') continue;
      if (node.componentSet) {
        // A component set is listed once, by its default variant (the one in its top-left corner).
        const main = defaultVariant(editor.doc, id);
        if (main) found.push({ id: main.id, name: node.name, description: node.componentSet.description, pageId });
      } else if (isMainComponent(node) && !isComponentSet(editor.doc.get(node.parent.id) as SceneNode | undefined)) {
        found.push({ id, name: node.name, description: node.component?.description, pageId });
      }
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Inserts an instance of a main component on the current page: centered on `at` (a drop point in world
 * space), or otherwise just to the right of the main component. The instance is selected and brought
 * into view; one undo step.
 */
export function insertInstance(editor: Editor, mainId: Id, at?: Vec2): Id | null {
  const main = editor.doc.get(mainId);
  if (!main || !isSceneNode(main) || !isMainComponent(main)) return null;
  editor.scene.ensure(editor.pageId);
  const bounds = editor.scene.worldBounds(mainId);
  const { width, height } = main.size;
  const x = at ? at.x - width / 2 : (bounds ? bounds.x + bounds.width + 40 : 0);
  const y = at ? at.y - height / 2 : (bounds ? bounds.y : 0);
  const id = editor.history.run('Insert instance', (tx) => {
    const created = instantiate(tx, mainId, editor.pageId, keyOnTop(tx.store, editor.pageId), () => editor.ids.next());
    tx.set(created, 'transform', [1, 0, 0, 1, Math.round(x), Math.round(y)] satisfies SceneNode['transform']);
    return created;
  });
  editor.state.select([id]);
  editor.revealRect(editor.selectionBounds([id]));
  return id;
}
