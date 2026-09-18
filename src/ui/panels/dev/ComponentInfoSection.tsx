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

import type { Id } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import { useEditor } from '../../hooks/useEditor';
import { useLayerThumbnail } from '../../images/useLayerThumbnail';
import primitives from '../../primitives/primitives.module.css';
import { InspectSection, revealInspectSection } from './InspectSection';
import styles from './DevSections.module.css';

/** The size the reference draws the preview at: a 140px well with a 16px margin around the picture. */
const PREVIEW_SIZE = 108;

/** The component a layer stands for: itself when it is one, its main component when it is an instance. */
function componentOf(node: SceneNode): { id: Id; ownId: boolean } | null {
  if (node.type !== 'FRAME') return null;
  if (node.instance) return { id: node.instance.mainId, ownId: false };
  if (node.component || node.componentSet) return { id: node.id, ownId: true };
  return null;
}

/**
 * The reference's Component information: the component the selected layer comes from, drawn, with a way
 * into the playground under it. It sits above Layer properties, as the reference puts it.
 */
export function ComponentInfoSection({ node }: { node: SceneNode }) {
  const editor = useEditor();
  const component = componentOf(node);
  const pageId = editor.state.activePageId;
  // The hook must run whatever the selection is, so a layer with no component asks for a thumbnail of nothing.
  const src = useLayerThumbnail(pageId, component?.id ?? '', PREVIEW_SIZE);
  if (component === null) return null;
  const main = editor.doc.get(component.id);
  const name = main && 'name' in main ? main.name : node.name;
  return (
    <InspectSection id="Component information" title="Component information">
      <div className={styles.previewWell}>
        {src === null ? <span className={styles.previewEmpty}>No preview yet</span> : <img className={styles.previewImage} src={src} alt={`Component thumbnail: ${name}`} />}
      </div>
      <div className={styles.buttonRow}>
        <button type="button" className={`${primitives.button} ${primitives.buttonFill}`} onClick={() => revealInspectSection('Playground')}>
          Explore component behavior
        </button>
      </div>
    </InspectSection>
  );
}
