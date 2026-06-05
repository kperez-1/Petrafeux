"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Db } from "@/lib/types";
import { EMPTY_DB } from "@/lib/db-defaults";
import { loadLocal, saveLocal, loadRemote, saveRemote, isRemote } from "@/lib/storage";
import { fetchBundledHaulRates } from "@/lib/haul-rates-seed";
import { hydrateLocalDbFromServer } from "@/lib/db-hydrate";

interface DbContextValue {
  db: Db;
  save: (db: Db) => Promise<void>;
  loading: boolean;
  error: string | null;
  remote: boolean;
}

const DbContext = createContext<DbContextValue | null>(null);

export function DbProvider({ children }: { children: React.ReactNode }) {
  const remote = isRemote();
  const [db, setDb] = useState<Db>({ ...EMPTY_DB });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        let data = remote ? await loadRemote() : loadLocal();
        if (!remote) {
          const hydrated = await hydrateLocalDbFromServer(data);
          if (hydrated !== data) {
            data = hydrated;
            saveLocal(data);
          }
        }
        if (!data.haulRates?.length) {
          try {
            const haulRates = await fetchBundledHaulRates();
            data = { ...data, haulRates };
            if (!remote) saveLocal(data);
          } catch {
            /* user can load from Settings */
          }
        }
        setDb(data);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [remote]);

  const save = useCallback(
    async (next: Db) => {
      setDb(next);
      if (remote) {
        await saveRemote(next);
      } else {
        saveLocal(next);
      }
    },
    [remote]
  );

  return (
    <DbContext.Provider value={{ db, save, loading, error, remote }}>
      {children}
    </DbContext.Provider>
  );
}

export function useDb() {
  const ctx = useContext(DbContext);
  if (!ctx) throw new Error("useDb must be used inside DbProvider");
  return ctx;
}
