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

import type { SceneNode } from '@/core/schema/document';
import { IconButton } from '../../primitives/IconButton';
import { InspectSection } from './InspectSection';
import styles from './DevSections.module.css';

/** The words a text layer carries, in a well of their own with a button that copies them — the reference's Text content. */
export function TextContentSection({ node }: { node: SceneNode }) {
  if (node.type !== 'TEXT') return null;
  const text = node.characters;
  return (
    <InspectSection
      id="Text content"
      title="Text content"
      actions={<IconButton icon="copy" label="Copy text content" onClick={() => void navigator.clipboard?.writeText(text).catch(() => undefined)} />}
    >
      <div className={styles.textWell} dir="auto" data-testid="textContent">
        {text}
      </div>
    </InspectSection>
  );
}
