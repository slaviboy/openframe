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

import { useState } from 'react';
import type { SceneNode } from '@/core/schema/document';
import { isSafeLink } from '@/editor/commands/components';
import { COMPONENT_DRAG_TYPE, componentFolders, insertInstance, type LocalComponent } from '@/editor/commands/insert-instance';
import { useEditor } from '../../hooks/useEditor';
import dialogStyles from '../../dialogs/Dialog.module.css';
import assetStyles from './AssetsPanel.module.css';
import { ComponentThumbnail } from './ComponentThumbnail';

/**
 * Component details, opened from the Assets tab: a preview of the component's default state, its documentation and
 * where it lives. Insert instance inserts it; so does dragging the preview onto the canvas.
 */
export function ComponentDetailsDialog({ component, onClose }: { component: LocalComponent; onClose: () => void }) {
  const editor = useEditor();
  const [dragging, setDragging] = useState(false);
  const titleId = `component-details-${component.id.replace(/[^a-z0-9]/gi, '-')}`;
  // A component set is listed by its default variant; its documentation is the set's.
  const listed = editor.doc.get(component.id) as SceneNode | undefined;
  const parentId = editor.doc.parentOf(component.id);
  const parent = parentId === null ? undefined : (editor.doc.get(parentId) as SceneNode | undefined);
  const owner = parent?.type === 'FRAME' && parent.componentSet ? parent : listed;
  const link = owner?.type === 'FRAME' ? (owner.component ?? owner.componentSet)?.link : undefined;

  const insert = () => {
    insertInstance(editor, component.id);
    onClose();
  };

  return (
    <div
      className={dialogStyles.backdrop}
      // While the preview is dragged, the dialog steps aside so it can be dropped on the canvas.
      style={dragging ? { opacity: 0, pointerEvents: 'none' } : undefined}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={dialogStyles.dialog}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <h2 id={titleId} className={dialogStyles.title}>
          {component.name}
        </h2>
        <div className={dialogStyles.body}>
          <div
            className={assetStyles.detailsPreview}
            draggable
            title="Drag onto the canvas to insert"
            onDragStart={(e) => {
              e.dataTransfer.setData(COMPONENT_DRAG_TYPE, component.id);
              e.dataTransfer.effectAllowed = 'copy';
              setDragging(true);
            }}
            onDragEnd={() => {
              setDragging(false);
              onClose();
            }}
          >
            <ComponentThumbnail component={component} size={200} />
          </div>
          <p>{component.description ?? 'No description'}</p>
          {link && isSafeLink(link) && (
            <a href={link} target="_blank" rel="noreferrer noopener">
              Open documentation
            </a>
          )}
          <p className={assetStyles.location}>Local components · {componentFolders(editor, component).join(' / ')}</p>
        </div>
        <footer className={dialogStyles.footer}>
          <button type="button" className={dialogStyles.secondary} onClick={onClose}>
            Close
          </button>
          <button type="button" className={dialogStyles.primary} autoFocus onClick={insert}>
            Insert instance
          </button>
        </footer>
      </div>
    </div>
  );
}
