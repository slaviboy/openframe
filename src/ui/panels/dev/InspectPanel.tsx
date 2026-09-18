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
import { CODE_LANGUAGE_LABELS, CODE_UNITS, DEFAULT_UNIT_SCALE, generateCode, type CodeLanguage, type CodeUnit } from '@/core/dev/code-gen';
import { viewPrefs } from '../../view/view-prefs';
import { shownAnimation } from '@/editor/commands/motion';
import { addDevResource, boundVariablesOf, deleteDevResource, devResources, suggestedVariables } from '@/editor/commands/dev-resources';
import { deleteMeasurement, measurementsOf, setMeasurementLabel } from '@/editor/commands/measurements';
import { rotationDegrees } from '@/editor/commands/properties';
import type { SceneNode } from '@/core/schema/document';
import { type ReactNode, useState, useSyncExternalStore } from 'react';
import { useDocumentRevision, useEditor, useEditorState } from '../../hooks/useEditor';
import { formatNumber } from '../../primitives/math';
import primitives from '../../primitives/primitives.module.css';
import { Icon } from '../../icons/Icon';
import { layerIcon } from '../../icons/layer-icons';
import { AnnotationsSection } from './AnnotationsSection';
import { CompareSection } from './CompareSection';
import { DevAssetsPanel } from './DevAssetsPanel';
import { PlaygroundSection } from './PlaygroundSection';
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
    <section className={styles.group} aria-label={title}>
      <h3 className={styles.groupTitle}>{title}</h3>
      {children}
    </section>
  );
}

/** The padding an auto-layout frame holds, as the shorthand Dev Mode shows. */
function padding(node: SceneNode): string | null {
  if (node.type !== 'FRAME' || !node.layoutMode) return null;
  const { paddingTop: t = 0, paddingRight: r = 0, paddingBottom: b = 0, paddingLeft: l = 0 } = node;
  if (t === r && r === b && b === l) return px(t);
  if (t === b && l === r) return `${px(t)} ${px(r)}`;
  return `${px(t)} ${px(r)} ${px(b)} ${px(l)}`;
}

/**
 * The handoff status of a design, and the buttons that set it. Marking a design that has changed since it was last
 * marked is what settles it again.
 */
export function DevStatusControl({ node }: { node: DevStatusNode }) {
  const editor = useEditor();
  const status = node.devStatus;
  return (
    <section className={styles.group} aria-label="Status">
      <h3 className={styles.groupTitle}>Status</h3>
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
    </section>
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
  const radius = ('cornerRadius' in node ? node.cornerRadius : 0) ?? 0;
  const gap = node.type === 'FRAME' && node.layoutMode ? (node.itemSpacing ?? 0) : null;
  const pad = padding(node);

  return (
    <div className={styles.panel} data-testid="inspect-panel">
      <header className={styles.header}>
        <Icon name={layerIcon(node)} size={16} />
        <button type="button" className={styles.name} aria-label={`Copy layer name: ${node.name}`} onClick={() => void navigator.clipboard?.writeText(node.name).catch(() => undefined)}>
          {node.name}
        </button>
      </header>

      {canHaveDevStatus(node) && <DevStatusControl node={node} />}

      {/* Inspect reads the design either as a list of measurements or as the code that builds it. */}
      <div className={styles.tabs} role="tablist" aria-label="Inspect view">
        {(['list', 'code'] as const).map((value) => (
          <button key={value} type="button" role="tab" className={styles.tab} aria-selected={view === value} data-selected={view === value || undefined} onClick={() => setView(value)}>
            {value === 'list' ? 'List' : 'Code'}
          </button>
        ))}
      </div>

      {view === 'code' ? (
        <CodeSection node={node} />
      ) : (
        <>
          <Group title="Position">
            <Row label="X" value={px(node.transform[4])} />
            <Row label="Y" value={px(node.transform[5])} />
            {rotation !== 0 && <Row label="Rotation" value={`${formatNumber(rotation, 2)}°`} />}
          </Group>

          <Group title="Size">
            <Row label="Width" value={px(node.size.width)} />
            <Row label="Height" value={px(node.size.height)} />
            {radius > 0 && <Row label="Corner radius" value={px(radius)} />}
          </Group>

          {(pad !== null || gap !== null) && (
            <Group title="Layout">
              {node.type === 'FRAME' && node.layoutMode && <Row label="Direction" value={node.layoutMode === 'HORIZONTAL' ? 'Row' : node.layoutMode === 'VERTICAL' ? 'Column' : 'Grid'} />}
              {pad !== null && <Row label="Padding" value={pad} />}
              {gap !== null && <Row label="Gap" value={px(gap)} />}
            </Group>
          )}

          <Group title="Appearance">
            <Row label="Opacity" value={`${formatNumber(node.opacity * 100, 0)}%`} />
            <Row label="Blend mode" value={node.blendMode.toLowerCase().replace(/_/g, ' ')} />
          </Group>
          <PlaygroundSection node={node} />
          <MotionSection node={node} />
          <VariablesSection node={node} />
          <DevResourcesSection node={node} />
          <AnnotationsSection node={node} />
          <MeasurementsSection />
          <DevAssetsPanel />
          <CompareSection />
        </>
      )}
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
    <section className={styles.group} aria-label="Motion">
      <h3 className={styles.groupTitle}>Motion</h3>
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
    </section>
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
    <section className={styles.group} aria-label="Variables">
      <h3 className={styles.groupTitle}>Variables</h3>
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
    </section>
  );
}

/** The links left on the layer pointing at what a developer needs, and the box that adds one. */
function DevResourcesSection({ node }: { node: SceneNode }) {
  const editor = useEditor();
  useDocumentRevision();
  const [draft, setDraft] = useState('');
  const links = devResources(editor, node.id);
  return (
    <section className={styles.group} aria-label="Dev resources">
      <h3 className={styles.groupTitle}>Dev resources</h3>
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
    </section>
  );
}

/** The measurements saved on the page: what each reads, and the button that takes it away. */
function MeasurementsSection() {
  const editor = useEditor();
  useDocumentRevision();
  const saved = measurementsOf(editor);
  if (saved.length === 0) return null;
  return (
    <section className={styles.group} aria-label="Measurements">
      <h3 className={styles.groupTitle}>Measurements</h3>
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
    </section>
  );
}

/** The code that builds the selected layer, in the language and unit chosen. */
function CodeSection({ node }: { node: SceneNode }) {
  // Kept per device, so the choice survives a reload and Copy as code uses the same language and unit.
  const prefs = useSyncExternalStore(viewPrefs.subscribe, () => viewPrefs.getSnapshot());
  const language: CodeLanguage = prefs.codeLanguage;
  const unit: CodeUnit = prefs.codeUnit;
  const scale = prefs.codeScale > 0 ? prefs.codeScale : null;
  const setLanguage = (next: CodeLanguage) => viewPrefs.set({ codeLanguage: next });
  const setUnit = (next: CodeUnit) => viewPrefs.set({ codeUnit: next });
  const setScale = (next: number | null) => viewPrefs.set({ codeScale: next ?? 0 });
  const units = CODE_UNITS[language];
  const chosen = units.includes(unit) ? unit : units[0]!;
  const code = generateCode(node, { language, unit: chosen, ...(scale === null ? {} : { scale }) });

  return (
    <section className={styles.group} aria-label="Code">
      <div className={styles.codeControls}>
        <select
          className={primitives.select}
          aria-label="Code language"
          value={language}
          onChange={(e) => {
            const next = e.target.value as CodeLanguage;
            setLanguage(next);
            setUnit(CODE_UNITS[next][0]!);
            setScale(null);
          }}
        >
          {(Object.keys(CODE_LANGUAGE_LABELS) as CodeLanguage[]).map((value) => (
            <option key={value} value={value}>
              {CODE_LANGUAGE_LABELS[value]}
            </option>
          ))}
        </select>
        <select className={primitives.select} aria-label="Code unit" value={chosen} onChange={(e) => setUnit(e.target.value as CodeUnit)}>
          {units.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
      {/* The unit scale: a root font size for rems, a scale factor for points and density-independent pixels. */}
      <label className={styles.scale}>
        <span>Unit scale</span>
        <input
          type="number"
          className={primitives.textInput}
          aria-label="Unit scale"
          min={0.01}
          step={0.5}
          value={scale ?? DEFAULT_UNIT_SCALE[chosen]}
          onChange={(e) => {
            const next = Number(e.target.value);
            setScale(Number.isFinite(next) && next > 0 ? next : null);
          }}
        />
      </label>
      <pre className={styles.code} data-testid="inspect-code">
        {code}
      </pre>
      <button type="button" className={primitives.button} onClick={() => void navigator.clipboard?.writeText(code).catch(() => undefined)}>
        Copy code
      </button>
    </section>
  );
}
