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

import { Fragment } from 'react';
import { parseDescription, type DescriptionInline } from '@/core/prototype/description';
import styles from './FlowDescription.module.css';

function Inlines({ inlines }: { inlines: readonly DescriptionInline[] }) {
  return (
    <>
      {inlines.map((inline, index) => {
        const content =
          inline.type === 'link' ? (
            <a href={inline.href} target="_blank" rel="noopener noreferrer">
              {inline.text}
            </a>
          ) : (
            inline.text
          );
        return inline.bold ? <strong key={index}>{content}</strong> : <Fragment key={index}>{content}</Fragment>;
      })}
    </>
  );
}

/** A flow description, formatted: paragraphs, bold text, bulleted and numbered lists, and links (opening in a new tab). */
export function FlowDescription({ text, className, label }: { text: string; className?: string | undefined; label?: string | undefined }) {
  return (
    <div className={className ? `${styles.description} ${className}` : styles.description} {...(label ? { role: 'group', 'aria-label': label } : {})}>
      {parseDescription(text).map((block, index) => {
        if (block.type === 'paragraph') {
          return (
            <p key={index}>
              <Inlines inlines={block.inlines} />
            </p>
          );
        }
        const items = block.items.map((item, i) => (
          <li key={i}>
            <Inlines inlines={item} />
          </li>
        ));
        return block.ordered ? <ol key={index}>{items}</ol> : <ul key={index}>{items}</ul>;
      })}
    </div>
  );
}
