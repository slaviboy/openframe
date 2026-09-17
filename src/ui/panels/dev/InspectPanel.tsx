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

import { rotationDegrees } from '@/editor/commands/properties';
import type { SceneNode } from '@/core/schema/document';
import type { ReactNode } from 'react';
import { useDocumentRevision, useEditor, useEditorState } from '../../hooks/useEditor';
import { formatNumber } from '../../primitives/math';
import { Icon } from '../../icons/Icon';
import { layerIcon } from '../../icons/layer-icons';
import styles from './InspectPanel.module.css';

/** A measurement as Dev Mode reads it: whole pixels where it can, two decimals where it cannot. */
const px = (value: number) => `${formatNumber(value, 2)}`;

/** One property and its value, which clicking copies. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <button
        type="button"
        className={styles.value}
        aria-label={`Copy ${label}: ${value}`}
        onClick={() => void navigator.clipboard?.writeText(value).catch(() => undefined)}
      >
        {value}
      </button>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.group} aria-label={title}>
      <h3 className={styles.groupTitle}>{title}</h3>
      {children}
    </section>
  );
}

/** The padding an auto-layout frame holds, as the shorthand Dev Mode shows. */
function padding(node: SceneNode): string | null {
  if (node.type !== 'FRAME' || !node.layoutMode) return null;
  const { paddingTop: t = 0, paddingRight: r = 0, paddingBottom: b = 0, paddingLeft: l = 0 } = node;
  if (t === r && r === b && b === l) return px(t);
  if (t === b && l === r) return `${px(t)} ${px(r)}`;
  return `${px(t)} ${px(r)} ${px(b)} ${px(l)}`;
}

/**
 * Dev Mode's Inspect panel: what a layer is, and the measurements a developer builds it from. Nothing here changes the
 * file — Dev Mode reads the design rather than editing it.
 */
export function InspectPanel() {
  const editor = useEditor();
  const selection = useEditorState((s) => s.selection);
  useDocumentRevision();
  const nodes = selection.map((id) => editor.doc.get(id)).filter((node): node is SceneNode => node !== undefined && node.type !== 'PAGE' && node.type !== 'DOCUMENT');
  const node = nodes.length === 1 ? nodes[0] : undefined;

  if (!node) {
    return (
      <div className={styles.panel} data-testid="inspect-panel">
        <p className={styles.empty}>{nodes.length === 0 ? 'Select a layer to inspect it.' : 'Select a single layer to inspect it.'}</p>
      </div>
    );
  }

  const rotation = rotationDegrees(node);
  const radius = ('cornerRadius' in node ? node.cornerRadius : 0) ?? 0;
  const gap = node.type === 'FRAME' && node.layoutMode ? (node.itemSpacing ?? 0) : null;
  const pad = padding(node);

  return (
    <div className={styles.panel} data-testid="inspect-panel">
      <header className={styles.header}>
        <Icon name={layerIcon(node)} size={16} />
        <button type="button" className={styles.name} aria-label={`Copy layer name: ${node.name}`} onClick={() => void navigator.clipboard?.writeText(node.name).catch(() => undefined)}>
          {node.name}
        </button>
      </header>

      <Group title="Position">
        <Row label="X" value={px(node.transform[4])} />
        <Row label="Y" value={px(node.transform[5])} />
        {rotation !== 0 && <Row label="Rotation" value={`${formatNumber(rotation, 2)}°`} />}
      </Group>

      <Group title="Size">
        <Row label="Width" value={px(node.size.width)} />
        <Row label="Height" value={px(node.size.height)} />
        {radius > 0 && <Row label="Corner radius" value={px(radius)} />}
      </Group>

      {(pad !== null || gap !== null) && (
        <Group title="Layout">
          {node.type === 'FRAME' && node.layoutMode && <Row label="Direction" value={node.layoutMode === 'HORIZONTAL' ? 'Row' : node.layoutMode === 'VERTICAL' ? 'Column' : 'Grid'} />}
          {pad !== null && <Row label="Padding" value={pad} />}
          {gap !== null && <Row label="Gap" value={px(gap)} />}
        </Group>
      )}

      <Group title="Appearance">
        <Row label="Opacity" value={`${formatNumber(node.opacity * 100, 0)}%`} />
        <Row label="Blend mode" value={node.blendMode.toLowerCase().replace(/_/g, ' ')} />
      </Group>
    </div>
  );
}
