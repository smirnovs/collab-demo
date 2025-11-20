// src/shared/collabClient.ts
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

const documentName = 'demo-document-1';
const hocuspocusUrl = 'ws://localhost:1234';
// const hocuspocusUrl = 'wss://peace-mask-liked-categories.trycloudflare.com';

let ydocSingleton: Y.Doc | null = null;
let providerSingleton: HocuspocusProvider | null = null;

export function getCollabDoc(): {
  ydoc: Y.Doc;
  provider: HocuspocusProvider;
} {
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
