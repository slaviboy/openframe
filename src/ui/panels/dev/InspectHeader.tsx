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

import { layerKind } from '@/core/scene/canvas-outline';
import type { SceneNode } from '@/core/schema/document';
import { Icon } from '../../icons/Icon';
import { layerIcon } from '../../icons/layer-icons';
import { IconButton } from '../../primitives/IconButton';
import { useEditor } from '../../hooks/useEditor';
import styles from './InspectHeader.module.css';

/** The name a layer's main component goes by, when it has one to name. */
function mainComponentName(editor: ReturnType<typeof useEditor>, node: SceneNode): string | null {
  if (node.type !== 'FRAME' || !node.instance) return null;
  const main = editor.doc.get(node.instance.mainId);
  return main && 'name' in main ? main.name : null;
}

/**
 * The top of the inspect panel, as the reference draws it: the layer's name as a button that copies it,
 * the actions that apply to it, and a line saying what the layer is.
 *
 * The reference also carries "Copy URL for selected layer". Openframe has no per-layer URL to copy, so
 * that button is left out rather than drawn dead — recorded in docs/UI_REFERENCE.md.
 */
export function InspectHeader({ node }: { node: SceneNode }) {
  const editor = useEditor();
  const main = mainComponentName(editor, node);
  // `layerKind` speaks in lower case, as prose does; the reference capitalises it as a label.
  const plain = layerKind(node);
  const kind = plain.charAt(0).toUpperCase() + plain.slice(1);
  return (
    <header className={styles.header}>
      <div className={styles.nameRow}>
        <button
          type="button"
          className={styles.name}
          aria-label={`Click to copy layer name: ${node.name}`}
          onClick={() => void navigator.clipboard?.writeText(node.name).catch(() => undefined)}
        >
          {node.name}
        </button>
        <div className={styles.actions}>
          {node.type === 'FRAME' && node.instance && (
            <IconButton icon="component" label="Go to main component" onClick={() => editor.commands.run('object.goToMainComponent')} />
          )}
          <IconButton icon="more" label="More actions" onClick={() => editor.commands.run('view.commandPalette')} />
        </div>
      </div>
      <div className={styles.kindRow}>
        <span className={styles.kindIcon} role="img" aria-label={kind}>
          <Icon name={layerIcon(node)} size={16} />
        </span>
        <span className={styles.kind}>{main === null ? kind : `${kind} (${main})`}</span>
      </div>
    </header>
  );
}
