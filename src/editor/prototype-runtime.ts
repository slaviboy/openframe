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

import { DocumentStore } from '@/core/document/store';
import { IdGenerator, type Id } from '@/core/ids/ids';
import { SceneIndex } from '@/core/scene/scene-index';
import { swapInstanceFor } from './commands/swap-instance';
import { Editor } from './editor';

/** The document a prototype plays after interactive components switched variants, with its scene index. */
export interface RuntimeDocument {
  readonly doc: DocumentStore;
  readonly index: SceneIndex;
}

/**
 * Interactive components: the document with an instance switched to another variant of its component set, as the
 * variant swap does in the editor (keeping the instance's changes on matching layers). The file itself isn't changed:
 * the swap happens on a copy (nodes are immutable, so copying shares them). Null when the instance can't switch.
 */
export function changeVariant(source: DocumentStore, pageId: Id, instanceId: Id, variantId: Id, textLayout?: Editor['textLayout']): RuntimeDocument | null {
  const doc = new DocumentStore(source.meta, [...source.nodes()]);
  const scratch = new Editor({ doc, ids: new IdGenerator('prototype'), pageId });
  if (textLayout) scratch.setTextLayout(textLayout);
  if (!swapInstanceFor(scratch, instanceId, variantId)) return null;
  const index = new SceneIndex(doc);
  index.ensure(pageId);
  return { doc, index };
}
