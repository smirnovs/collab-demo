// composables/useCollabDoc.client.ts
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

const documentName = 'demo-document-1';

let ydocSingleton: Y.Doc | null = null;
let providerSingleton: HocuspocusProvider | null = null;

export function useCollabDoc(): {
  ydoc: Y.Doc;
  provider: HocuspocusProvider;
} {
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
