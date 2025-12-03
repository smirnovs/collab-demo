// src/shared/collabClient.ts
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

const documentName = 'demo-document-1';

let ydocSingleton: Y.Doc | null = null;
let providerSingleton: HocuspocusProvider | null = null;

export function getCollabDoc(): {
  ydoc: Y.Doc;
  provider: HocuspocusProvider;
} {
  if (!import.meta.client) {
    throw new Error('getCollabDoc() must be called on client side');
  }

  const config = useRuntimeConfig();
  const hocuspocusUrl = config.public.collabWsUrl;
  if (!ydocSingleton || !providerSingleton) {
    const provider = new HocuspocusProvider({
      url: hocuspocusUrl,
      name: documentName,
    });

    const ydoc = provider.document as Y.Doc;

    ydocSingleton = ydoc;
    providerSingleton = provider;
  }

  return {
    ydoc: ydocSingleton,
    provider: providerSingleton,
  };
}
