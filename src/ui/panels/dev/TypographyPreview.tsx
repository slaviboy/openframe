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

import { withUnit } from '@/core/dev/code-gen';
import type { TextNode } from '@/core/schema/document';
import { useCodePrefs } from './use-code-prefs';
import styles from './TypographyPreview.module.css';

/** The line height in pixels, whatever the layer states it in; auto reads as 1.2 times the size, as it is drawn. */
function lineHeightPx(node: TextNode): number {
  if (node.lineHeight.unit === 'PIXELS') return node.lineHeight.value;
  if (node.lineHeight.unit === 'PERCENT') return (node.lineHeight.value / 100) * node.fontSize;
  return node.fontSize * 1.2;
}

/**
 * The height the drawn line box is scaled to, so the sample fills the reference's 140px well whatever the
 * type's real size — the reference draws a 32sp line at 64.5px, which is this. The labels keep the real
 * measurements; only the drawing is scaled, and never past these bounds.
 */
const LINE_BOX = 64;
const MIN_SCALE = 0.5;
const MAX_SCALE = 4;

const copy = (text: string) => void navigator.clipboard?.writeText(text).catch(() => undefined);

/**
 * What the reference draws inside Layer properties for a text layer, in place of the box model: a sample
 * of the type with its font size measured down the left and its line height down the right, and the font
 * named under it. Both measurements are buttons that copy, as the reference's are.
 *
 * The reference's sample is a picture the server renders; ours is the text itself, set in the layer's own
 * font — recorded in docs/UI_REFERENCE.md.
 */
export function TypographyPreview({ node }: { node: TextNode }) {
  const { options } = useCodePrefs();
  const height = lineHeightPx(node);
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, LINE_BOX / Math.max(height, 1)));
  const lineBox = height * scale;
  const sizeBox = node.fontSize * scale;
  const size = withUnit(node.fontSize, options);
  const line = withUnit(height, options);
  return (
    <div className={styles.well}>
      <div className={styles.row} role="img" aria-label="Visual representation of typography properties including font size and line height">
        <div className={styles.measureSide}>
          <div className={`${styles.measure} ${styles.left}`} style={{ height: `${sizeBox}px` }}>
            <button type="button" className={styles.value} aria-label={`Copy font size: ${size}`} onClick={() => copy(size)}>
              {size}
            </button>
            <span className={styles.dash} aria-hidden="true" />
          </div>
        </div>
        <div className={styles.sample} style={{ height: `${lineBox}px` }}>
          <span className={styles.sampleLine} style={{ top: `${(lineBox - sizeBox) / 2}px` }} aria-hidden="true" />
          <span className={styles.sampleLine} style={{ top: `${(lineBox + sizeBox) / 2}px` }} aria-hidden="true" />
          <span className={styles.sampleText} style={{ fontFamily: `"${node.fontName.family}", var(--font-ui)`, fontSize: `${sizeBox}px`, lineHeight: `${lineBox}px` }}>
            Ag
          </span>
        </div>
        <div className={styles.measureSide}>
          <div className={`${styles.measure} ${styles.right}`} style={{ height: `${lineBox}px` }}>
            <button type="button" className={styles.value} aria-label={`Copy line height: ${line}`} onClick={() => copy(line)}>
              {line}
            </button>
            <span className={styles.dash} aria-hidden="true" />
          </div>
        </div>
      </div>
      <button type="button" className={styles.styleName} aria-label="Style" onClick={() => copy(`${node.fontName.family} ${node.fontName.style}`)}>
        {node.fontName.family} {node.fontName.style}
      </button>
    </div>
  );
}
