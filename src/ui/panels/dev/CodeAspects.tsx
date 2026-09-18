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

import type { MouseEvent } from 'react';
import { generateCodeAspects, type CodeOptions } from '@/core/dev/code-gen';
import { tokenizeLine } from '@/core/dev/code-tokens';
import type { SceneNode } from '@/core/schema/document';
import { IconButton } from '../../primitives/IconButton';
import styles from './CodeAspects.module.css';

const copy = (text: string) => void navigator.clipboard?.writeText(text).catch(() => undefined);

/** One generated line: a row of coloured spans, with the wrapping indent the reference gives them. */
function Line({ text, language }: { text: string; language: CodeOptions['language'] }) {
  return (
    <div className={styles.line}>
      <span className={styles.lineText}>
        {tokenizeLine(text, language).map((token, index) =>
          token.kind === 'chit' ? (
            <span key={index} className={`${styles.token} ${styles.chit}`} style={{ background: token.swatch }} aria-hidden={true} />
          ) : (
            <span key={index} className={`${styles.token} ${styles[token.kind]}`}>
              {token.text}
            </span>
          ),
        )}
      </span>
    </div>
  );
}

/**
 * The code that builds the selected layer, split into the named blocks the reference shows it in —
 * Layout and Typography for CSS, Modifier, Layout and Text for Compose — each with its own title, its own
 * copy button and a well with a line-number gutter.
 *
 * Holding shift while copying copies every block at once, which is what the reference's tooltip promises
 * and what "Copy as code" hands over.
 */
export function CodeAspects({ node, options }: { node: SceneNode; options: CodeOptions }) {
  const aspects = generateCodeAspects(node, options);
  const all = aspects.flatMap((aspect) => aspect.lines).join('\n');
  return (
    <div className={styles.sections} data-testid="inspect-code">
      {aspects.map((aspect) => (
        <div key={aspect.name} className={styles.sectionContainer} data-testid={`code-panel-${aspect.name}`}>
          <div className={styles.header}>
            <h3 className={styles.title}>{aspect.name}</h3>
            <div className={styles.actions}>
              <IconButton
                icon="copy"
                label={`Copy ${aspect.name}, press shift to copy all code`}
                onClick={(event: MouseEvent<HTMLButtonElement>) => copy(event.shiftKey ? all : aspect.lines.join('\n'))}
              />
            </div>
          </div>
          <div className={styles.well}>
            <div className={styles.lineNumbers} aria-hidden={true}>
              {aspect.lines.map((_, index) => (
                <div key={index} className={styles.lineNumber}>
                  {index + 1}
                </div>
              ))}
            </div>
            <div className={styles.wellContent}>
              <code className={styles.generated} data-lang={options.language.toLowerCase()}>
                {aspect.lines.map((text, index) => (
                  <Line key={index} text={text} language={options.language} />
                ))}
              </code>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
