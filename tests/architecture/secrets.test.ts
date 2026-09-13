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

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { repoFiles, ROOT } from './files';

/** Credential formats that must never be committed. */
const PATTERNS: readonly (readonly [string, RegExp])[] = [
  ['private key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY( BLOCK)?-----/],
  ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{50,}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['npm token', /\bnpm_[A-Za-z0-9]{36}\b/],
  ['assigned secret', /\b(?:api[_-]?key|secret|access[_-]?token|auth[_-]?token|password)\b\s*[:=]\s*['"][^'"\s]{12,}['"]/i],
];

/** Text files worth scanning; binaries (images, wasm, fonts) are skipped. */
const TEXT_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.css', '.json', '.yml', '.yaml', '.md', '.html', '.webmanifest', '.svg', '.txt', ''];
const MAX_BYTES = 2_000_000;

describe('secrets', () => {
  test('no credentials are present in the repository', () => {
    const findings: string[] = [];
    for (const file of repoFiles(TEXT_EXTENSIONS)) {
      if (file.startsWith('tests/architecture/') || file === 'package-lock.json') continue;
      const path = join(ROOT, file);
      if (statSync(path).size > MAX_BYTES) continue;
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          for (const [name, pattern] of PATTERNS) if (pattern.test(line)) findings.push(`${file}:${i + 1} ${name}`);
        });
    }
    expect(findings).toEqual([]);
  });
});
