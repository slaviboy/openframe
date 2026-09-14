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

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { descriptionHtml, inlineText, type DescriptionInline } from '@/core/prototype/description';
import descriptionStyles from '../../present/FlowDescription.module.css';
import { IconButton } from '../../primitives/IconButton';
import primitives from '../../primitives/primitives.module.css';
import styles from './PrototypePanel.module.css';

/** Links a description can hold: web pages and email. */
const LINK_ADDRESS = /^(https?:\/\/\S+|mailto:\S+)$/i;
const BLOCKS: ReadonlySet<string> = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE']);
const stopKeys = (e: KeyboardEvent) => e.stopPropagation();

/** Whether an element's text is bold: `b` and `strong` are, a font weight it sets decides (a normal weight turns bold off), or else as around it. */
const boldIn = (element: HTMLElement, around: boolean) => {
  if (element.tagName === 'B' || element.tagName === 'STRONG') return true;
  const weight = element.style.fontWeight;
  if (!weight) return around;
  return weight === 'bold' || weight === 'bolder' || Number(weight) >= 600;
};

/**
 * The rich text editor's content as a description's text: a line for each block and line break, list items marked
 * (`- ` or `1. `), and bold runs and links written out.
 */
function textOf(root: HTMLElement): string {
  const lines: string[] = [];
  let current: DescriptionInline[] = [];
  let open = false;
  const endLine = () => {
    lines.push(inlineText(current));
    current = [];
    open = false;
  };
  const walk = (node: Node, bold: boolean, href: string | null, inItem = false) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\n/g, ' ');
      if (!text) return;
      open = true;
      current.push(href ? { type: 'link', text, href, bold } : { type: 'text', text, bold });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === 'BR') {
      // Inside a list item a line break is only a placeholder some browsers add (WebKit ends each item with one).
      if (!inItem) endLine();
      return;
    }
    if (BLOCKS.has(node.tagName)) {
      if (open) endLine();
      const before = lines.length;
      node.childNodes.forEach((child) => walk(child, bold, href, inItem));
      // A block is a line of its own (an empty one holds a line break, which ended it already).
      if (open || lines.length === before) endLine();
      return;
    }
    if (node.tagName === 'UL' || node.tagName === 'OL') {
      if (open) endLine();
      let number = 0;
      node.childNodes.forEach((item) => {
        if (!(item instanceof HTMLElement) || item.tagName !== 'LI') return;
        number += 1;
        item.childNodes.forEach((child) => walk(child, bold, href, true));
        lines.push(`${node.tagName === 'OL' ? `${number}.` : '-'} ${inlineText(current)}`);
        current = [];
        open = false;
      });
      return;
    }
    const link = node.tagName === 'A' ? node.getAttribute('href') : null;
    node.childNodes.forEach((child) => walk(child, boldIn(node, bold), link ?? href, inItem));
  };
  root.childNodes.forEach((child) => walk(child, false, null));
  if (open) endLine();
  return lines.join('\n').replace(/\n+$/, '');
}

/**
 * Edit description: the flow's description as formatted text — Bold, Bulleted list, Numbered list and Add link (with its
 * address) format the selected text — saved when the panel is closed (X).
 */
export function DescriptionEditor({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [href, setHref] = useState('https://');
  const area = useRef<HTMLDivElement>(null);
  // The selection in the text, kept while focus is elsewhere (a button, or the link address field).
  const range = useRef<Range | null>(null);

  // Opened, the description shows formatted.
  useLayoutEffect(() => {
    if (open && area.current) area.current.innerHTML = descriptionHtml(value);
  }, [open, value]);
  useEffect(() => {
    if (!open) return;
    const remember = () => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && area.current?.contains(selection.anchorNode)) range.current = selection.getRangeAt(0).cloneRange();
    };
    document.addEventListener('selectionchange', remember);
    return () => document.removeEventListener('selectionchange', remember);
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        className={styles.textButton}
        onClick={() => {
          setDraft(value);
          range.current = null;
          setOpen(true);
        }}
      >
        Edit description
      </button>
    );
  }

  const read = () => {
    if (area.current) setDraft(textOf(area.current));
  };
  /**
   * Puts focus back in the text with its selection, to format it: the selection as it is when it's still in the text
   * (a formatting button keeps it there), or else the one kept while focus was elsewhere (the link address field).
   */
  const restore = () => {
    const element = area.current;
    const selection = window.getSelection();
    if (!element || !selection) return null;
    const live = selection.rangeCount > 0 && element.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null;
    const kept = live ?? (range.current && element.contains(range.current.commonAncestorContainer) ? range.current : null);
    element.focus();
    if (kept) {
      selection.removeAllRanges();
      selection.addRange(kept);
    }
    return selection;
  };
  const format = (command: 'bold' | 'insertUnorderedList' | 'insertOrderedList') => {
    if (!restore()) return;
    document.execCommand(command);
    read();
  };
  const addLink = () => {
    const address = href.trim();
    const selection = restore();
    if (!selection || !area.current) return;
    if (selection.rangeCount > 0 && !selection.isCollapsed) {
      document.execCommand('createLink', false, address);
    } else {
      // Nothing selected: the address itself becomes a link, where the caret is (or at the end).
      const anchor = document.createElement('a');
      anchor.href = address;
      anchor.textContent = address;
      if (selection.rangeCount > 0 && area.current.contains(selection.anchorNode)) {
        const at = selection.getRangeAt(0);
        at.insertNode(anchor);
        at.setStartAfter(anchor);
        at.collapse(true);
        selection.removeAllRanges();
        selection.addRange(at);
      } else {
        area.current.append(anchor);
      }
    }
    read();
  };
  // Formatting buttons keep the text's focus and selection.
  const keepSelection = (e: MouseEvent) => e.preventDefault();

  return (
    <div className={styles.details} role="group" aria-label="Description" data-description={draft}>
      <div className={styles.row}>
        <button type="button" className={styles.textButton} onMouseDown={keepSelection} onClick={() => format('bold')}>
          Bold
        </button>
        <button type="button" className={styles.textButton} onMouseDown={keepSelection} onClick={() => format('insertUnorderedList')}>
          Bulleted list
        </button>
        <button type="button" className={styles.textButton} onMouseDown={keepSelection} onClick={() => format('insertOrderedList')}>
          Numbered list
        </button>
        <IconButton
          icon="close"
          label="Close description"
          onClick={() => {
            const text = area.current ? textOf(area.current) : draft;
            if (text !== value) onSave(text);
            setOpen(false);
          }}
        />
      </div>
      <div
        ref={area}
        className={`${primitives.textInput} ${descriptionStyles.description}`}
        // A normal weight to start from: Firefox reads the text's weight to decide whether Bold adds or removes it.
        style={{ height: 'auto', minHeight: 96, alignItems: 'stretch', fontWeight: 400 }}
        role="textbox"
        aria-multiline="true"
        aria-label="Flow description"
        contentEditable
        suppressContentEditableWarning
        onInput={read}
        // New lines are blocks (divs) in every browser, as the text reads them.
        onFocus={() => document.execCommand('defaultParagraphSeparator', false, 'div')}
        onKeyDown={stopKeys}
        onPaste={(e) => {
          // Pasted text comes in as plain text.
          e.preventDefault();
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
          read();
        }}
      />
      <div className={styles.row}>
        <input className={primitives.textInput} aria-label="Link address" value={href} spellCheck={false} onChange={(e) => setHref(e.target.value)} onKeyDown={stopKeys} />
        <button type="button" className={styles.textButton} disabled={!LINK_ADDRESS.test(href.trim())} onClick={addLink}>
          Add link
        </button>
      </div>
    </div>
  );
}
