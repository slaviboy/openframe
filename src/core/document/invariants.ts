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

import { ROOT_ID } from '../ids/ids';
import { canParent } from './containment';
import type { DocumentStore } from './store';

export class InvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvariantError';
  }
}

/**
 * Structural invariants of a document. Run after every commit in development and
 * test builds, and after loading or migrating a document in all builds.
 */
export function assertDocumentInvariants(store: DocumentStore): void {
  const root = store.get(ROOT_ID);
  if (!root || root.type !== 'DOCUMENT') throw new InvariantError('missing DOCUMENT root');
  if (store.pages().length === 0) throw new InvariantError('document has no pages');

  for (const node of store.nodes()) {
    if (node.type === 'DOCUMENT') {
      const docId: string = node.id;
      if (docId !== ROOT_ID) throw new InvariantError(`extra DOCUMENT node ${docId}`);
      continue;
    }
    const parent = store.get(node.parent.id);
    if (!parent) throw new InvariantError(`${node.id}: parent ${node.parent.id} does not exist`);
    if (node.type === 'PAGE') {
      if (parent.type !== 'DOCUMENT') throw new InvariantError(`page ${node.id} must be a child of the root`);
      continue;
    }
    if (node.type === 'STYLE') {
      if (parent.type !== 'DOCUMENT') throw new InvariantError(`style ${node.id} must be a child of the root`);
      continue;
    }
    if (parent.type === 'DOCUMENT') throw new InvariantError(`${node.id}: scene nodes cannot be children of the root`);
    if (parent.type !== 'PAGE' && parent.type !== 'FRAME' && parent.type !== 'GROUP' && parent.type !== 'BOOLEAN_OPERATION' && parent.type !== 'SECTION') {
      throw new InvariantError(`${node.id}: parent ${parent.id} (${parent.type}) cannot have children`);
    }
    if (!canParent(parent.type, node.type)) {
      throw new InvariantError(`${node.id}: a ${node.type} cannot be inside a ${parent.type} (${parent.id})`);
    }
    if ((node.type === 'GROUP' || node.type === 'BOOLEAN_OPERATION') && store.children(node.id).length === 0) {
      throw new InvariantError(`group ${node.id} is empty`);
    }
    // Cycle check: walking up must reach the root within `size` steps.
    let steps = 0;
    for (let cur = store.parentOf(node.id); cur !== null; cur = store.parentOf(cur)) {
      if (++steps > store.size) throw new InvariantError(`${node.id}: parent cycle`);
    }
  }
}
