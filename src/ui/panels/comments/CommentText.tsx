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

import type { ReactNode } from 'react';
import styles from './CommentsPanel.module.css';

/** The marks a message can carry, in the order they are looked for. */
const MARKS: readonly (readonly [RegExp, (inner: string, key: string) => ReactNode])[] = [
  [/`([^`]+)`/, (inner, key) => <code key={key}>{inner}</code>],
  [/\*\*([^*]+)\*\*/, (inner, key) => <strong key={key}>{inner}</strong>],
  [/\*([^*]+)\*/, (inner, key) => <em key={key}>{inner}</em>],
  [/_([^_]+)_/, (inner, key) => <em key={key}>{inner}</em>],
  [/~~([^~]+)~~/, (inner, key) => <s key={key}>{inner}</s>],
];

/** A web address, which is made a link only when it is one a browser may follow. */
const LINK = /https?:\/\/[^\s<>]+/;

/**
 * One line of a message, with its marks turned into elements. Nothing is turned into HTML: the text is put in as
 * text, so a message can say what it likes without being able to do anything.
 */
function inline(text: string, key: string): ReactNode[] {
  for (const [pattern, wrap] of MARKS) {
    const found = pattern.exec(text);
    if (!found) continue;
    const before = text.slice(0, found.index);
    const after = text.slice(found.index + found[0].length);
    return [...inline(before, `${key}b`), wrap(found[1] ?? '', `${key}m`), ...inline(after, `${key}a`)];
  }
  const link = LINK.exec(text);
  if (link) {
    const before = text.slice(0, link.index);
    const after = text.slice(link.index + link[0].length);
    return [
      ...inline(before, `${key}b`),
      <a key={`${key}l`} href={link[0]} target="_blank" rel="noreferrer noopener">
        {link[0]}
      </a>,
      ...inline(after, `${key}a`),
    ];
  }
  return text === '' ? [] : [text];
}

/** A message with its marks taken off, for the one-line preview a list or a pin shows. */
export function plainComment(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A message as it reads: its lines, with bold, italic, strikethrough, code and links picked out. */
export function CommentText({ text }: { text: string }) {
  return (
    <p className={styles.text}>
      {text.split('\n').map((line, index) => (
        <span key={index}>
          {index > 0 && <br />}
          {inline(line, `${index}`)}
        </span>
      ))}
    </p>
  );
}
