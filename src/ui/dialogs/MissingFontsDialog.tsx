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

import { useState, useSyncExternalStore } from 'react';
import type { FontName } from '@/core/schema/document';
import { missingFonts, type MissingFont } from '@/core/text/missing-fonts';
import type { FontFamilyInfo } from '@/core/text/text-layout';
import { replaceFonts } from '@/editor/commands/text';
import type { Editor } from '@/editor/editor';
import { useDocumentRevision, useEditor, useEditorState } from '../hooks/useEditor';
import { Icon } from '../icons/Icon';
import styles from './Dialog.module.css';

const keyOf = (font: FontName) => `${font.family}\n${font.style}`;

/** The fonts the file uses that aren't available, once the text engine can tell (re-evaluated as fonts and the document change). */
export function useMissingFonts(): { missing: MissingFont[]; available: readonly FontFamilyInfo[] } {
  const editor = useEditor();
  const ready = useEditorState((s) => s.textLayoutReady);
  useDocumentRevision();
  useSyncExternalStore(
    (listener) => editor.fonts.subscribe(listener),
    () => editor.fonts.revision,
  );
  const available = ready ? (editor.textLayout?.availableFonts() ?? []) : [];
  return { missing: ready ? missingFonts(editor.doc.nodes(), available) : [], available };
}

/** File notification at the bottom of the navigation bar while the file uses fonts that aren't available. */
export function MissingFontsNotice({ className }: { className?: string | undefined }) {
  const editor = useEditor();
  const { missing } = useMissingFonts();
  if (missing.length === 0) return null;
  const label = `Missing fonts: ${missing.length}`;
  return (
    <button type="button" className={className} title={label} aria-label={label} onClick={() => editor.state.openDialog('missingFonts')}>
      <Icon name="text" />
    </button>
  );
}

/** A replacement style: the same style when the family has it, else Regular, else the family's first style. */
function styleFor(family: FontFamilyInfo | undefined, wanted: string): string {
  if (!family) return wanted;
  return family.styles.includes(wanted) ? wanted : family.styles.includes('Regular') ? 'Regular' : (family.styles[0] ?? wanted);
}

/**
 * Missing fonts: every font the file uses that isn't available (family or style), with the layers
 * using it and a replacement family and style for each. Replace fonts swaps them in every text layer
 * and mixed-style run as one undo step; fonts left unchanged keep showing as missing.
 */
export function MissingFontsDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const { missing, available } = useMissingFonts();
  const fallback = available.find((f) => f.family === 'Inter') ?? available[0];
  const [choices, setChoices] = useState<Readonly<Record<string, FontName>>>({});
  const choiceFor = (font: MissingFont): FontName => choices[keyOf(font)] ?? { family: fallback?.family ?? font.family, style: styleFor(fallback, font.style) };

  const replace = () => {
    const replacements = missing.map((font) => ({ from: { family: font.family, style: font.style }, to: choiceFor(font) }));
    editor.history.run('Replace fonts', (tx) => replaceFonts(tx, replacements));
    onClose();
  };

  return (
    <div
      className={styles.backdrop}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="missing-fonts-title"
        className={styles.dialog}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <h2 id="missing-fonts-title" className={styles.title}>
          Missing fonts
        </h2>
        <div className={styles.body}>
          {missing.length === 0 ? (
            <p>Every font in this file is available.</p>
          ) : (
            <p>These fonts aren&apos;t available on this device. Text using them is drawn with a fallback font and can&apos;t be shaped as designed until you add the fonts or replace them.</p>
          )}
          {missing.map((font, index) => {
            const choice = choiceFor(font);
            const family = available.find((f) => f.family === choice.family);
            const name = `${font.family} ${font.style}`;
            return (
              <div key={keyOf(font)} className={styles.field} role="group" aria-label={name}>
                <span>
                  {name} · {font.layers} {font.layers === 1 ? 'layer' : 'layers'}
                </span>
                <div className={styles.row}>
                  <select
                    className={styles.input}
                    aria-label={`Replacement family for ${name}`}
                    autoFocus={index === 0}
                    value={choice.family}
                    onChange={(e) => {
                      const next = available.find((f) => f.family === e.target.value);
                      setChoices((c) => ({ ...c, [keyOf(font)]: { family: e.target.value, style: styleFor(next, choice.style) } }));
                    }}
                  >
                    {available.map((f) => (
                      <option key={f.family} value={f.family}>
                        {f.family}
                      </option>
                    ))}
                  </select>
                  <select className={styles.input} aria-label={`Replacement style for ${name}`} value={choice.style} onChange={(e) => setChoices((c) => ({ ...c, [keyOf(font)]: { family: choice.family, style: e.target.value } }))}>
                    {(family?.styles ?? [choice.style]).map((style) => (
                      <option key={style} value={style}>
                        {style}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
        <footer className={styles.footer}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            {missing.length === 0 ? 'Close' : 'Cancel'}
          </button>
          {missing.length > 0 && (
            <button type="button" className={styles.primary} onClick={replace}>
              Replace fonts
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
