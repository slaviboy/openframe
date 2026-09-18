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

import { useEffect, useState } from "react";
import { placeSvgs } from "@/editor/commands/import-svg";
import { visibleWorldRect } from "@/editor/viewport/viewport";
import { parseSvgMarkup } from "../../import/svg-files";
import { importSvg } from "@/core/import/svg-import";
import {
  loadMaterialSymbols,
  materialFamily,
  readMaterialFont,
  readMaterialIcon,
  searchMaterialIcons,
  type MaterialIcon,
  type MaterialStyle,
} from "../../icons/material-symbols";
import { useEditor } from "../../hooks/useEditor";
import styles from "./IconPicker.module.css";

const STYLES: readonly {
  readonly id: MaterialStyle;
  readonly label: string;
}[] = [
  { id: "outlined", label: "Outlined" },
  { id: "rounded", label: "Rounded" },
  { id: "sharp", label: "Sharp" },
];

/**
 * Material Symbols, which ship with Openframe (see docs/ICONS.md). Searching looks at an icon's name, its
 * tags and its category. Picking one places it as a vector layer, so it can be recoloured and reshaped like
 * anything else drawn here; the set's font can be added instead, for text with an icon in it.
 */
export function IconPicker() {
  const editor = useEditor();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [style, setStyle] = useState<MaterialStyle>("outlined");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The index lists every icon and is loaded once, when the section is first opened — the Assets panel
  // should not read it, or draw a few hundred icons, for someone who came here for components.
  useEffect(() => {
    if (!open) return;
    void loadMaterialSymbols().then((set) => {
      setReady(true);
      if (set.icons.length === 0)
        setError("The icon set has not been fetched. Run npm run icons:fetch.");
    });
  }, [open]);
  const icons = open && ready ? searchMaterialIcons(query) : [];

  /** Places an icon as a vector layer in the middle of what is on screen. */
  const place = async (icon: MaterialIcon) => {
    setError(null);
    try {
      const markup = await readMaterialIcon(icon.name, style);
      const root = markup === null ? null : parseSvgMarkup(markup);
      const svg = root && importSvg(root);
      if (!svg) throw new Error(`${icon.name} could not be read.`);
      const view = visibleWorldRect(
        editor.state.viewport,
        editor.canvasSize.width,
        editor.canvasSize.height,
      );
      placeSvgs(editor, [{ name: icon.name, svg }], {
        x: view.x + view.width / 2,
        y: view.y + view.height / 2,
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "That icon could not be placed.",
      );
    }
  };

  /** Adds the set's font, so its glyphs can be typed into a text layer. */
  const addFont = async () => {
    setError(null);
    try {
      await editor.fonts.add(await readMaterialFont(style));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The icon font could not be added.",
      );
    }
  };

  return (
    <section className={styles.icons} aria-label="Icons">
      <button
        type="button"
        className={styles.disclosure}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Icons
      </button>
      {!open ? null : (
        <>
          <div className={styles.controls}>
            <input
              className={styles.search}
              type="search"
              aria-label="Search icons"
              placeholder="Search icons"
              value={query}
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className={styles.style}
              aria-label="Icon style"
              value={style}
              onChange={(e) => setStyle(e.target.value as MaterialStyle)}
            >
              {STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <ul className={styles.grid} aria-label="Material Symbols">
            {icons.map((icon) => (
              <li key={icon.name}>
                <button
                  type="button"
                  className={styles.icon}
                  aria-label={icon.name}
                  title={icon.name}
                  onClick={() => void place(icon)}
                >
                  <img
                    src={`icons/material/${icon.styles[style] ?? icon.styles.outlined ?? ""}`}
                    alt=""
                    width={24}
                    height={24}
                  />
                </button>
              </li>
            ))}
            {ready && icons.length === 0 && (
              <li className={styles.empty}>No icons found</li>
            )}
          </ul>
          <button
            type="button"
            className={styles.action}
            onClick={() => void addFont()}
          >
            Add {materialFamily(style) ?? "the icon font"}
          </button>
        </>
      )}
    </section>
  );
}
