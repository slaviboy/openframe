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

import { Fragment, type ReactNode } from 'react';
import type { DocumentStore } from '@/core/document/store';
import type { Id } from '@/core/ids/ids';
import { accessibleContent, type AccessibleNode, type TextList, type TextPart } from '@/core/prototype/accessibility';
import { layerRects, type PresentedScene } from '@/core/prototype/presentation';
import type { SceneIndex } from '@/core/scene/scene-index';
import styles from './AccessibleContent.module.css';

/** A transparent image: the canvas shows the picture, and screen readers read the alt text. */
const BLANK_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** Text with its links (opening in a new tab). */
function Parts({ parts }: { parts: readonly TextPart[] }) {
  return (
    <>
      {parts.map((part, index) =>
        part.href ? (
          <a key={index} href={part.href} target="_blank" rel="noopener noreferrer">
            {part.text}
          </a>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

/** A bulleted or numbered list, with the lists nested in its items. */
function List({ list }: { list: TextList }) {
  const items = list.items.map((item, index) => (
    <li key={index}>
      <Parts parts={item.parts} />
      {item.lists.map((nested, i) => (
        <List key={i} list={nested} />
      ))}
    </li>
  ));
  return list.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
}

interface AccessibleContentProps {
  readonly doc: DocumentStore;
  readonly index: SceneIndex;
  readonly scene: PresentedScene;
  /** The frames shown: the screen, then its overlays. */
  readonly frameIds: readonly Id[];
  /** A link or button was activated: its layer's On click interaction runs. */
  readonly onActivate: (nodeId: Id) => void;
}

/**
 * Accessibility mode: the content of the frames shown as HTML over the canvas, for screen readers and keyboard
 * navigation (sections, links, buttons, images and text, where their layers are). It is invisible except for the
 * focused element's outline, and the pointer still reaches the prototype.
 */
export function AccessibleContent({ doc, index, scene, frameIds, onActivate }: AccessibleContentProps) {
  const render = (frameId: Id, node: AccessibleNode): ReactNode => {
    if (node.kind === 'section') {
      return (
        <section key={node.nodeId} aria-label={node.label}>
          {node.children.map((child) => render(frameId, child))}
        </section>
      );
    }
    const rect = layerRects(index, scene, frameId, [node.nodeId])[0];
    const style = rect ? { left: rect.x, top: rect.y, width: rect.width, height: rect.height } : undefined;
    if (node.kind === 'text') {
      return (
        <div key={node.nodeId} className={styles.item} style={style}>
          {node.blocks.map((block, index) =>
            block.type === 'paragraph' ? (
              <p key={index}>
                <Parts parts={block.parts} />
              </p>
            ) : (
              <List key={index} list={block.list} />
            ),
          )}
        </div>
      );
    }
    if (node.kind === 'image') return <img key={node.nodeId} className={styles.item} style={style} src={BLANK_IMAGE} alt={node.label} />;
    if (node.kind === 'link') {
      return (
        <a
          key={node.nodeId}
          className={styles.item}
          style={style}
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onActivate(node.nodeId);
          }}
        >
          {node.label}
        </a>
      );
    }
    return (
      <button key={node.nodeId} type="button" className={styles.item} style={style} onClick={() => onActivate(node.nodeId)}>
        {node.label}
      </button>
    );
  };
  return (
    <div className={styles.content} data-testid="accessible-content">
      {frameIds.flatMap((frameId) => accessibleContent(doc, frameId).map((node) => render(frameId, node)))}
    </div>
  );
}

/** The first control on the page, shown only when focused: it turns accessibility mode on. */
export function SkipToContent({ onActivate }: { onActivate: () => void }) {
  return (
    <button type="button" className={styles.skip} onClick={onActivate}>
      Skip to content
    </button>
  );
}

/** A message announced to screen readers, shown for a moment at the bottom of the view (nothing while there is none). */
export function AccessibilityMessage({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p role="status" className={styles.message}>
      {text}
    </p>
  );
}
