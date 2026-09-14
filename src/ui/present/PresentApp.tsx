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

import { useEffect, useState } from 'react';
import { openPresentation, type PresentationSession, type PresentParams } from '@/app/present';
import { StorageError } from '@/platform/idb/persistence';
import { PresentationView } from './PresentationView';

type LoadState = { kind: 'loading' } | { kind: 'ready'; session: PresentationSession } | { kind: 'error'; message: string };

/** The presentation tab: opens the file read-only and plays its prototype. */
export function PresentApp({ params }: { params: PresentParams }) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let session: PresentationSession | null = null;
    let canceled = false;
    openPresentation(params).then(
      (opened) => {
        if (canceled) {
          opened.dispose();
          return;
        }
        session = opened;
        document.title = `${opened.fileName} – Presentation`;
        setLoad({ kind: 'ready', session: opened });
      },
      (error: unknown) => setLoad({ kind: 'error', message: error instanceof StorageError ? error.message : 'The prototype could not be opened.' }),
    );
    return () => {
      canceled = true;
      session?.dispose();
    };
  }, [params]);

  if (load.kind === 'loading') return <div className="app-status" aria-busy="true" />;
  if (load.kind === 'error') {
    return (
      <div className="app-status" role="alert">
        {load.message}
      </div>
    );
  }
  return <PresentationView session={load.session} startNodeId={params.nodeId} hideUi={params.hideUi} />;
}
