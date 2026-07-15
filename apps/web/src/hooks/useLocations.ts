import { useEffect, useState } from 'react';
import { api } from '@marutham/api-client';

type Tree = Record<string, Record<string, string[]>>;

// Module-level cache — the location tree is static, fetch it once per session.
let cache: Tree | null = null;
let inflight: Promise<Tree> | null = null;

function fetchTree(): Promise<Tree> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = api
      .getLocations()
      .then((d) => {
        cache = d.tree || {};
        return cache;
      })
      .catch(() => {
        cache = cache || {};
        return cache;
      });
  }
  return inflight;
}

export interface LocationsApi {
  tree: Tree;
  states: string[];
  districtsOf: (state: string) => string[];
  taluksOf: (state: string, district: string) => string[];
}

export function useLocations(): LocationsApi {
  const [tree, setTree] = useState<Tree>(cache || {});
  useEffect(() => {
    let active = true;
    fetchTree().then((t) => active && setTree(t));
    return () => {
      active = false;
    };
  }, []);

  return {
    tree,
    states: Object.keys(tree).sort(),
    districtsOf: (state) => (tree[state] ? Object.keys(tree[state]).sort() : []),
    taluksOf: (state, district) =>
      tree[state]?.[district] ? [...tree[state][district]].sort() : [],
  };
}
