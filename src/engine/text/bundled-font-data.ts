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

import cyrillicExtItalic from '@fontsource-variable/inter/files/inter-cyrillic-ext-wght-italic.woff2?inline';
import cyrillicExtNormal from '@fontsource-variable/inter/files/inter-cyrillic-ext-wght-normal.woff2?inline';
import cyrillicItalic from '@fontsource-variable/inter/files/inter-cyrillic-wght-italic.woff2?inline';
import cyrillicNormal from '@fontsource-variable/inter/files/inter-cyrillic-wght-normal.woff2?inline';
import greekExtItalic from '@fontsource-variable/inter/files/inter-greek-ext-wght-italic.woff2?inline';
import greekExtNormal from '@fontsource-variable/inter/files/inter-greek-ext-wght-normal.woff2?inline';
import greekItalic from '@fontsource-variable/inter/files/inter-greek-wght-italic.woff2?inline';
import greekNormal from '@fontsource-variable/inter/files/inter-greek-wght-normal.woff2?inline';
import latinExtItalic from '@fontsource-variable/inter/files/inter-latin-ext-wght-italic.woff2?inline';
import latinExtNormal from '@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2?inline';
import latinItalic from '@fontsource-variable/inter/files/inter-latin-wght-italic.woff2?inline';
import latinNormal from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?inline';
import vietnameseItalic from '@fontsource-variable/inter/files/inter-vietnamese-wght-italic.woff2?inline';
import vietnameseNormal from '@fontsource-variable/inter/files/inter-vietnamese-wght-normal.woff2?inline';

/**
 * Bundled font files as base64 data URLs, by file name. Kept in its own module so the fonts load
 * as a separate, lazily imported chunk (app code never uses the network, not even same-origin fetch).
 */
export const FONT_DATA: Readonly<Record<string, string>> = {
  'inter-latin-wght-normal.woff2': latinNormal,
  'inter-latin-wght-italic.woff2': latinItalic,
  'inter-latin-ext-wght-normal.woff2': latinExtNormal,
  'inter-latin-ext-wght-italic.woff2': latinExtItalic,
  'inter-cyrillic-wght-normal.woff2': cyrillicNormal,
  'inter-cyrillic-wght-italic.woff2': cyrillicItalic,
  'inter-cyrillic-ext-wght-normal.woff2': cyrillicExtNormal,
  'inter-cyrillic-ext-wght-italic.woff2': cyrillicExtItalic,
  'inter-greek-wght-normal.woff2': greekNormal,
  'inter-greek-wght-italic.woff2': greekItalic,
  'inter-greek-ext-wght-normal.woff2': greekExtNormal,
  'inter-greek-ext-wght-italic.woff2': greekExtItalic,
  'inter-vietnamese-wght-normal.woff2': vietnameseNormal,
  'inter-vietnamese-wght-italic.woff2': vietnameseItalic,
};
