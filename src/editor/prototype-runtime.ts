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
import { hasVariableChanges, NO_VARIABLES, type PrototypeVariables } from '@/core/prototype/variables-runtime';
import { SceneIndex } from '@/core/scene/scene-index';
import { swapInstanceFor } from './commands/swap-instance';
import { setExplicitVariableMode, setVariableValue } from './commands/variables';
import { Editor } from './editor';

/** The document a prototype plays after interactive components switched variants or interactions set variables, with its scene index. */
export interface RuntimeDocument {
  readonly doc: DocumentStore;
  readonly index: SceneIndex;
}

/** What a prototype changed while playing: instances switched to variants (in order), and variables and modes. */
export interface RuntimeChanges {
  readonly variants: ReadonlyArray<readonly [instanceId: Id, variantId: Id]>;
  readonly variables: PrototypeVariables;
}

/**
 * The document with a prototype's changes applied, as the editor would apply them: instances swapped to their variants
 * (keeping their changes on matching layers), the page's variable modes switched, and variables given their values —
 * so the layers bound to them follow. The file isn't changed: this happens on a copy (nodes are immutable, so the copy
 * shares them). Null when there is nothing to change.
 */
export function buildRuntime(source: DocumentStore, pageId: Id, changes: RuntimeChanges, textLayout?: Editor['textLayout']): RuntimeDocument | null {
  if (changes.variants.length === 0 && !hasVariableChanges(changes.variables)) return null;
  const doc = new DocumentStore(source.meta, [...source.nodes()]);
  const scratch = new Editor({ doc, ids: new IdGenerator('prototype'), pageId });
  if (textLayout) scratch.setTextLayout(textLayout);
  for (const [instanceId, variantId] of changes.variants) swapInstanceFor(scratch, instanceId, variantId);
  for (const [collectionId, modeId] of Object.entries(changes.variables.pageModes)) setExplicitVariableMode(scratch, [pageId], collectionId, modeId);
  for (const [variableId, modes] of Object.entries(changes.variables.values)) {
    for (const [modeId, value] of Object.entries(modes)) setVariableValue(scratch, variableId, modeId, value);
  }
  const index = new SceneIndex(doc);
  index.ensure(pageId);
  return { doc, index };
}

/** Interactive components: the document with one instance switched to another variant of its component set. */
export function changeVariant(source: DocumentStore, pageId: Id, instanceId: Id, variantId: Id, textLayout?: Editor['textLayout']): RuntimeDocument | null {
  return buildRuntime(source, pageId, { variants: [[instanceId, variantId]], variables: NO_VARIABLES }, textLayout);
}
