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

import { boxModelOf } from '@/core/dev/box-model';
import type { SceneNode } from '@/core/schema/document';
import { formatNumber } from '../../primitives/math';
import { useEditor } from '../../hooks/useEditor';
import styles from './BoxModel.module.css';

const show = (value: number) => formatNumber(value, 2);
const copy = (text: string) => void navigator.clipboard?.writeText(text).catch(() => undefined);

/** One number in the diagram: a button that copies it, or a dash where the layer has none. */
function Value({ value, label, testId }: { value: number | null; label: string; testId?: string }) {
  if (value === null) {
    return (
      <span className={styles.cell}>
        <span className={styles.none}>-</span>
      </span>
    );
  }
  const text = show(value);
  return (
    <button type="button" className={`${styles.cell} ${styles.copyable}`} {...(testId ? { 'data-testid': testId } : {})} aria-label={`Copy ${label}: ${text}`} onClick={() => copy(text)}>
      {text}
    </button>
  );
}

/** A corner's radius, which sits over the corner it rounds. */
function Corner({ value, label, corner, testId }: { value: number | null; label: string; corner: string; testId: string }) {
  if (value === null || value === 0) return <span className={`${styles.cell} ${styles[corner]!}`} />;
  const text = show(value);
  return (
    <button type="button" className={`${styles.cell} ${styles.copyable} ${styles[corner]!}`} data-testid={testId} aria-label={`Copy ${label}: ${text}`} onClick={() => copy(text)}>
      {text}
    </button>
  );
}

/** The distance from one of the layer's edges to the same edge of what holds it. */
function Distance({ value, edge, vertical, testId }: { value: number | null; edge: string; vertical?: boolean; testId: string }) {
  if (value === null) return <span />;
  const text = show(value);
  return (
    <div className={`${styles.gap} ${vertical === true ? styles.gapVertical : styles.gapHorizontal}`}>
      <div className={styles.gapLine} />
      <button type="button" className={styles.gapValue} data-testid={testId} aria-label={`Copy distance to ${edge} container edge: ${text}`} onClick={() => copy(text)}>
        {text}
      </button>
    </div>
  );
}

/**
 * The layer drawn as the box it occupies: what holds it, the border around it, the padding inside that,
 * and its own size in the middle — every number copyable, as the reference has them.
 */
export function BoxModel({ node }: { node: SceneNode }) {
  const editor = useEditor();
  const it = boxModelOf(editor.doc, editor.scene, node);
  const radii = it.radii;
  return (
    <div className={styles.gapBox} role="img" aria-label="The layer's size, and the border, padding and space around it">
      <span />
      <span />
      <span />
      <Distance value={it.distance.left} edge="left" testId="layoutGapLeft" />
      <div className={styles.borderBox} style={{ borderRadius: `${Math.min(radii?.topLeft ?? 0, 12)}px` }}>
        <Corner value={radii?.topLeft ?? null} label="top left border radius" corner="topLeft" testId="layoutBorderRadiusTopLeft" />
        <span className={styles.labelled}>
          <span className={styles.label}>Border</span>
          <Value value={it.border.top} label="top border" />
        </span>
        <Corner value={radii?.topRight ?? null} label="top right border radius" corner="topRight" testId="layoutBorderRadiusTopRight" />

        <Value value={it.border.left} label="left border" />
        <div className={styles.paddingBox}>
          <span />
          <span className={styles.labelled}>
            <span className={styles.label}>Padding</span>
            <Value value={it.padding.top} label="top padding" />
          </span>
          <span />

          <Value value={it.padding.left} label="left padding" />
          <div className={styles.innerSizeBox}>
            <button type="button" className={styles.size} data-testid="layoutWidth" aria-label={`Copy width: ${show(it.width)}`} onClick={() => copy(show(it.width))}>
              {show(it.width)}
            </button>
            <span className={styles.times} aria-hidden="true">
              ×
            </span>
            <button type="button" className={styles.size} data-testid="layoutHeight" aria-label={`Copy height: ${show(it.height)}`} onClick={() => copy(show(it.height))}>
              {show(it.height)}
            </button>
          </div>
          <Value value={it.padding.right} label="right padding" />

          <span />
          <Value value={it.padding.bottom} label="bottom padding" />
          <span />
        </div>
        <Value value={it.border.right} label="right border" />

        <Corner value={radii?.bottomLeft ?? null} label="bottom left border radius" corner="bottomLeft" testId="layoutBorderRadiusBottomLeft" />
        <Value value={it.border.bottom} label="bottom border" />
        <Corner value={radii?.bottomRight ?? null} label="bottom right border radius" corner="bottomRight" testId="layoutBorderRadiusBottomRight" />
      </div>
      <Distance value={it.distance.right} edge="right" testId="layoutGapRight" />
      <span />
      <Distance value={it.distance.bottom} edge="bottom" vertical testId="layoutGapBottom" />
      <span />
    </div>
  );
}
