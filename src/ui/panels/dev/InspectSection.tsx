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

import { useState, type ReactNode } from 'react';
import { Icon } from '../../icons/Icon';
import styles from './InspectSection.module.css';

/**
 * Which sections are folded away. Kept here rather than in `viewPrefs`, which is a flat record of
 * booleans and numbers and has no room for a per-section map. So a fold survives selection changes and
 * re-mounts for as long as the tab is open, and is forgotten on reload — recorded in docs/UI_REFERENCE.md.
 */
const folded = new Map<string, boolean>();

interface InspectSectionProps {
  /** Identifies the section for the folded-away set; not rendered. */
  readonly id: string;
  readonly title: string;
  /**
   * `top` is a section of the panel: it folds, and its title is the button that folds it. `sub` is a
   * block inside one — the reference draws it with a lighter title and a caret's worth of space where
   * the caret would be, so its heading lines up with the section above it.
   */
  readonly level?: 'top' | 'sub';
  /** Buttons that sit at the right of the title row, as the reference's copy actions do. */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

/** A section of the inspect panel, drawn the way the reference draws one. */
export function InspectSection({ id, title, level = 'top', actions, children }: InspectSectionProps) {
  const [open, setOpen] = useState(() => !folded.get(id));
  const fold = (next: boolean) => {
    folded.set(id, !next);
    setOpen(next);
  };
  const heading = <h3 className={styles.title}>{title}</h3>;
  return (
    <section className={level === 'sub' ? `${styles.section} ${styles.sub}` : styles.section} aria-label={title}>
      <div className={level === 'sub' ? `${styles.titleRow} ${styles.snug}` : styles.titleRow}>
        {level === 'sub' ? (
          <div className={styles.titleText}>
            {/* The caret's space is kept so a sub-section's heading lines up with the section holding it. */}
            <span className={styles.caretSpace} aria-hidden="true" />
            {heading}
          </div>
        ) : (
          <button type="button" className={`${styles.titleText} ${styles.foldable}`} aria-expanded={open} onClick={() => fold(!open)}>
            <Icon name={open ? 'caretDown' : 'caretRight'} size={16} />
            {heading}
          </button>
        )}
        {actions !== undefined && <div className={styles.actions}>{actions}</div>}
      </div>
      {(level === 'sub' || open) && children}
    </section>
  );
}
