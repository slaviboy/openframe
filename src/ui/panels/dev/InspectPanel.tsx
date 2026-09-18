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

import { canHaveDevStatus, devStatusLabel, setDevStatus, type DevStatusNode } from '@/editor/commands/dev-status';
import { ANIMATION_CODE_LABELS, generateAnimationCode, type AnimationCodeFormat } from '@/core/dev/animation-code';
import { CODE_LANGUAGE_LABELS, CODE_UNITS, DEFAULT_UNIT_SCALE, type CodeLanguage, type CodeUnit } from '@/core/dev/code-gen';
import { viewPrefs } from '../../view/view-prefs';
import { shownAnimation } from '@/editor/commands/motion';
import { addDevResource, boundVariablesOf, deleteDevResource, devResources, suggestedVariables } from '@/editor/commands/dev-resources';
import { deleteMeasurement, measurementsOf, setMeasurementLabel } from '@/editor/commands/measurements';
import { rotationDegrees } from '@/editor/commands/properties';
import type { SceneNode } from '@/core/schema/document';
import { type ReactNode, useState } from 'react';
import { useDocumentRevision, useEditor, useEditorState } from '../../hooks/useEditor';
import { formatNumber } from '../../primitives/math';
import primitives from '../../primitives/primitives.module.css';
import { AnnotationsSection } from './AnnotationsSection';
import { CompareSection } from './CompareSection';
import { DevAssetsPanel } from './DevAssetsPanel';
import { PlaygroundSection } from './PlaygroundSection';
import { BoxModel } from './BoxModel';
import { CodeAspects } from './CodeAspects';
import { ComponentInfoSection } from './ComponentInfoSection';
import { TextContentSection } from './TextContentSection';
import { TypographyPreview } from './TypographyPreview';
import { McpSection } from './McpSection';
import { InspectHeader } from './InspectHeader';
import { InspectSection } from './InspectSection';
import { useCodePrefs } from './use-code-prefs';
import styles from './InspectPanel.module.css';

/** A measurement as Dev Mode reads it: whole pixels where it can, two decimals where it cannot. */
const px = (value: number) => `${formatNumber(value, 2)}`;

/** One property and its value, which clicking copies. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <button type="button" className={styles.value} aria-label={`Copy ${label}: ${value}`} onClick={() => void navigator.clipboard?.writeText(value).catch(() => undefined)}>
        {value}
      </button>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <InspectSection id={title} title={title}>
      <div className={styles.groupBody}>{children}</div>
    </InspectSection>
  );
}

/**
 * The handoff status of a design, and the buttons that set it. Marking a design that has changed since it was last
 * marked is what settles it again.
 */
export function DevStatusControl({ node }: { node: DevStatusNode }) {
  const editor = useEditor();
  const status = node.devStatus;
  return (
    <InspectSection id="Status" title="Status">
      <div className={styles.groupBody}>
        {status && (
          <p className={styles.status} data-changed={status.changed || undefined}>
            {devStatusLabel(status)}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={primitives.button} onClick={() => setDevStatus(editor, [node.id], 'READY_FOR_DEV')}>
            {status?.state === 'READY_FOR_DEV' && status.changed ? 'Mark as ready again' : 'Mark as ready for dev'}
          </button>
          <button type="button" className={primitives.button} onClick={() => setDevStatus(editor, [node.id], 'COMPLETED')}>
            Mark as completed
          </button>
          {status && (
            <button type="button" className={primitives.button} onClick={() => setDevStatus(editor, [node.id], null)}>
              Remove status
            </button>
          )}
        </div>
      </div>
    </InspectSection>
  );
}

/**
 * Dev Mode's Inspect panel: what a layer is, and the measurements a developer builds it from. Beside the status,
 * nothing here changes the file — Dev Mode reads the design rather than editing it.
 */
export function InspectPanel() {
  const editor = useEditor();
  const [view, setView] = useState<'list' | 'code'>('list');
  const selection = useEditorState((s) => s.selection);
  useDocumentRevision();
  const nodes = selection.map((id) => editor.doc.get(id)).filter((node): node is SceneNode => node !== undefined && node.type !== 'PAGE' && node.type !== 'DOCUMENT');
  const node = nodes.length === 1 ? nodes[0] : undefined;

  if (!node) {
    return (
      <div className={styles.panel} data-testid="inspect-panel">
        <p className={styles.empty}>{nodes.length === 0 ? 'Select a layer to inspect it.' : 'Select a single layer to inspect it.'}</p>
        <DevAssetsPanel />
        <CompareSection />
        <MeasurementsSection />
      </div>
    );
  }

  const rotation = rotationDegrees(node);
  const gap = node.type === 'FRAME' && node.layoutMode ? (node.itemSpacing ?? 0) : null;

  return (
    <div className={styles.panel} data-testid="inspect-panel">
      <InspectHeader node={node} />

      {/* The reference opens with MCP, then Component information when the layer stands for one. */}
      <McpSection node={node} />
      <ComponentInfoSection node={node} />

      {/* Layer properties holds the box, the View switch and then either the rows or the code — the
          reference nests them, and it hides nothing outside this section when the view changes. */}
      <InspectSection id="Layer properties" title="Layer properties">
        {/* The reference swaps the box model for a type sample when the layer is text. */}
        {node.type === 'TEXT' ? <TypographyPreview node={node} /> : <BoxModel node={node} />}
        <div className={styles.preferencesRow}>
          <div className={styles.preferencesLeft}>
            <span className={styles.viewLabel}>View</span>
            <div className={styles.tabs} role="tablist" aria-label="Inspect view">
              {(['list', 'code'] as const).map((value) => (
                <button key={value} type="button" role="tab" className={styles.tab} aria-selected={view === value} data-selected={view === value || undefined} onClick={() => setView(value)}>
                  {value === 'list' ? 'List' : 'Code'}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.preferencesRight}>
            <CodePreferences />
          </div>
        </div>
        {view === 'code' ? (
          <CodeSection node={node} />
        ) : (
          <div className={styles.groupBody}>
            <Row label="X" value={px(node.transform[4])} />
            <Row label="Y" value={px(node.transform[5])} />
            {rotation !== 0 && <Row label="Rotation" value={`${formatNumber(rotation, 2)}°`} />}
            {node.type === 'FRAME' && node.layoutMode && <Row label="Direction" value={node.layoutMode === 'HORIZONTAL' ? 'Row' : node.layoutMode === 'VERTICAL' ? 'Column' : 'Grid'} />}
            {gap !== null && <Row label="Gap" value={px(gap)} />}
          </div>
        )}
      </InspectSection>

      {/* The reference's own order from here: the variable modes and colours, Motion, Text content, Assets. */}
      <VariablesSection node={node} />
      <MotionSection node={node} />
      <TextContentSection node={node} />
      <DevAssetsPanel />

      {/* Openframe's own sections, below the ones the reference has, so its order reads unchanged. */}
      {canHaveDevStatus(node) && <DevStatusControl node={node} />}
      <Group title="Appearance">
        <Row label="Opacity" value={`${formatNumber(node.opacity * 100, 0)}%`} />
        <Row label="Blend mode" value={node.blendMode.toLowerCase().replace(/_/g, ' ')} />
      </Group>
      <PlaygroundSection node={node} />
      <DevResourcesSection node={node} />
      <AnnotationsSection node={node} />
      <MeasurementsSection />
      <CompareSection />
    </div>
  );
}

/** The animation a layer carries, as the code that rebuilds it, with a read-only timeline to watch it in. */
function MotionSection({ node }: { node: SceneNode }) {
  const editor = useEditor();
  const inTimeline = useEditorState((s) => s.devTimeline);
  useDocumentRevision();
  const [format, setFormat] = useState<AnimationCodeFormat>('CSS');
  const animation = shownAnimation(editor);
  const code = generateAnimationCode(animation, node.id, node.name, format);
  if (code === null) return null;

  return (
    <InspectSection id="Motion" title="Motion">
      <div className={styles.groupBody}>
        <div className={styles.codeControls}>
          <select className={primitives.select} aria-label="Animation code format" value={format} onChange={(e) => setFormat(e.target.value as AnimationCodeFormat)}>
            {(Object.keys(ANIMATION_CODE_LABELS) as AnimationCodeFormat[]).map((value) => (
              <option key={value} value={value}>
                {ANIMATION_CODE_LABELS[value]}
              </option>
            ))}
          </select>
          <button type="button" className={primitives.button} aria-pressed={inTimeline} onClick={() => editor.state.setDevTimeline(!inTimeline)}>
            {inTimeline ? 'Hide timeline view' : 'Show in timeline view'}
          </button>
        </div>
        <pre className={styles.code} data-testid="animation-code">
          {code}
        </pre>
        <button type="button" className={primitives.button} onClick={() => void navigator.clipboard?.writeText(code).catch(() => undefined)}>
          Copy animation code
        </button>
      </div>
    </InspectSection>
  );
}

/** The variables the layer's properties are bound to, which is what a developer writes in code. */
function VariablesSection({ node }: { node: SceneNode }) {
  const editor = useEditor();
  useDocumentRevision();
  const bound = boundVariablesOf(node);
  const suggested = suggestedVariables(editor, node);
  if (bound.length === 0 && suggested.length === 0) return null;
  return (
    <InspectSection id="Variables" title="Variables">
      <div className={styles.groupBody}>
        {bound.map(({ field, variableId }) => {
          const variable = editor.doc.get(variableId);
          const name = variable?.name ?? 'Missing variable';
          const code = variable?.type === 'VARIABLE' ? (variable.codeSyntax?.WEB ?? null) : null;
          return <Row key={`${field}:${variableId}`} label={field} value={code ?? name} />;
        })}
        {/* A value the layer holds outright that a variable already carries: worth naming rather than repeating. */}
        {suggested.length > 0 && <p className={styles.label}>Suggested</p>}
        {suggested.map((suggestion) => (
          <Row key={`suggested:${suggestion.field}:${suggestion.variableId}`} label={suggestion.field} value={suggestion.name} />
        ))}
      </div>
    </InspectSection>
  );
}

/** The links left on the layer pointing at what a developer needs, and the box that adds one. */
function DevResourcesSection({ node }: { node: SceneNode }) {
  const editor = useEditor();
  useDocumentRevision();
  const [draft, setDraft] = useState('');
  const links = devResources(editor, node.id);
  return (
    <InspectSection id="Dev resources" title="Dev resources">
      <div className={styles.groupBody}>
        {links.map((resource) => (
          <div key={resource.id} className={styles.row}>
            <a className={styles.link} href={resource.url} target="_blank" rel="noreferrer noopener">
              {resource.name ?? resource.url}
            </a>
            {resource.inherited ? (
              <span className={styles.label}>From component</span>
            ) : (
              <button type="button" className={primitives.button} aria-label={`Delete link ${resource.name ?? resource.url}`} onClick={() => deleteDevResource(editor, node.id, resource.id)}>
                Delete link
              </button>
            )}
          </div>
        ))}
        <div className={styles.codeControls}>
          <input
            className={primitives.textInput}
            aria-label="Add a dev resource link"
            placeholder="Paste a link"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key !== 'Enter') return;
              if (addDevResource(editor, node.id, draft) !== null) setDraft('');
            }}
          />
        </div>
      </div>
    </InspectSection>
  );
}

/** The measurements saved on the page: what each reads, and the button that takes it away. */
function MeasurementsSection() {
  const editor = useEditor();
  useDocumentRevision();
  const saved = measurementsOf(editor);
  if (saved.length === 0) return null;
  return (
    <InspectSection id="Measurements" title="Measurements">
      <div className={styles.groupBody}>
        {saved.map((measurement, index) => (
          <div key={measurement.id} className={styles.row}>
            <input
              className={primitives.textInput}
              aria-label={`Measurement ${index + 1} label`}
              defaultValue={measurement.label ?? ''}
              placeholder="Distance"
              onBlur={(e) => setMeasurementLabel(editor, measurement.id, e.currentTarget.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
            <button type="button" className={primitives.button} aria-label={`Delete measurement ${index + 1}`} onClick={() => deleteMeasurement(editor, measurement.id)}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </InspectSection>
  );
}

/**
 * The language, unit and scale the code is written in. The reference keeps these beside the View switch
 * rather than inside the code itself, so changing them reads as a preference of the panel.
 */
function CodePreferences() {
  const { language, unit, units, scale } = useCodePrefs();
  const setScale = (next: number | null) => viewPrefs.set({ codeScale: next ?? 0 });
  return (
    <>
      <select
        className={primitives.select}
        aria-label="Code language"
        value={language}
        onChange={(e) => {
          const next = e.target.value as CodeLanguage;
          viewPrefs.set({ codeLanguage: next, codeUnit: CODE_UNITS[next][0]!, codeScale: 0 });
        }}
      >
        {(Object.keys(CODE_LANGUAGE_LABELS) as CodeLanguage[]).map((value) => (
          <option key={value} value={value}>
            {CODE_LANGUAGE_LABELS[value]}
          </option>
        ))}
      </select>
      <select className={primitives.select} aria-label="Code unit" value={unit} onChange={(e) => viewPrefs.set({ codeUnit: e.target.value as CodeUnit })}>
        {units.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      {/* The unit scale: a root font size for rems, a scale factor for points and density-independent pixels. */}
      <input
        type="number"
        className={`${primitives.textInput} ${styles.scaleInput}`}
        aria-label="Unit scale"
        min={0.01}
        step={0.5}
        value={scale ?? DEFAULT_UNIT_SCALE[unit]}
        onChange={(e) => {
          const next = Number(e.target.value);
          setScale(Number.isFinite(next) && next > 0 ? next : null);
        }}
      />
    </>
  );
}

/** The code that builds the selected layer, in the language and unit chosen. */
function CodeSection({ node }: { node: SceneNode }) {
  const { options } = useCodePrefs();
  return <CodeAspects node={node} options={options} />;
}
