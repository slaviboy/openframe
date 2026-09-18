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

import { generateCode } from '@/core/dev/code-gen';
import type { SceneNode } from '@/core/schema/document';
import { useEditor } from '../../hooks/useEditor';
import primitives from '../../primitives/primitives.module.css';
import { InspectSection } from './InspectSection';
import { useCodePrefs } from './use-code-prefs';
import styles from './DevSections.module.css';

/**
 * Roughly how many tokens a piece of text costs a model. Four characters to the token is the estimate the
 * major tokenizers agree on to within a few per cent for source code, and it is worked out here rather
 * than asked for, so the number is honest about being an estimate.
 */
const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

/** Where the layer sits, written the way a prompt would name it. */
function layerPath(editor: ReturnType<typeof useEditor>, node: SceneNode): string {
  const names = editor.doc
    .ancestors(node.id)
    .map((id) => editor.doc.get(id))
    .filter((parent) => parent !== undefined && 'name' in parent && parent.type !== 'DOCUMENT')
    .map((parent) => (parent as { name: string }).name)
    .reverse();
  return [...names, node.name].join(' / ');
}

/**
 * The reference's MCP section, with Openframe's own answers in it.
 *
 * The reference's MCP server hands a selection to a coding agent over the network. Openframe is offline and runs
 * no server, so **Not sent** is simply the truth here rather than a state that might change, and the
 * section says so in as many words instead of drawing a switch that does nothing. What it can do, it
 * does: the token estimate is computed from the code this panel generates, and the prompt is real text
 * that the button really copies.
 *
 * "Open help" and "Set up third-party agents for the reference MCP" are left out — there is no help page and no
 * agent to set up. See docs/UI_REFERENCE.md.
 */
export function McpSection({ node }: { node: SceneNode }) {
  const editor = useEditor();
  const { options } = useCodePrefs();
  const path = layerPath(editor, node);
  const prompt = `Implement this design from Openframe.\n\n@${path}\n\n${generateCode(node, options)}`;
  return (
    <InspectSection id="MCP" title="MCP">
      <div className={styles.mcp}>
        <span className={styles.mcpHeading}>Selection details</span>
        <div className={styles.mcpSettings}>
          <div className={styles.mcpRow}>
            <span className={styles.mcpLabel}>Session activity</span>
            <span className={styles.mcpValue}>Not sent</span>
          </div>
          <div className={styles.mcpRow}>
            <span className={styles.mcpLabel}>Estimated tokens</span>
            <span className={styles.mcpValue}>{estimateTokens(prompt)}</span>
          </div>
        </div>
        <div className={styles.mcpPrompt}>
          <button type="button" className={styles.promptWell} aria-label={`Implement this design from Openframe. @${path}`} onClick={() => void navigator.clipboard?.writeText(prompt).catch(() => undefined)}>
            <span className={styles.promptText}>Implement this design from Openframe.</span>
            <span className={styles.promptLink}>@{path}</span>
          </button>
          <button type="button" className={`${primitives.button} ${primitives.buttonFill}`} onClick={() => void navigator.clipboard?.writeText(prompt).catch(() => undefined)}>
            Copy example prompt
          </button>
        </div>
        <p className={styles.mcpNote}>Openframe works offline and runs no MCP server, so nothing leaves this device. Copy the prompt and paste it into your agent.</p>
      </div>
    </InspectSection>
  );
}
