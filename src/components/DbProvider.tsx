"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Db } from "@/lib/types";
import { loadLocal, saveLocal, loadRemote, saveRemote, isRemote } from "@/lib/storage";

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
  const [db, setDb] = useState<Db>({
    projects: [],
    quotes: [],
    contractors: [],
    vendors: [],
    materials: [],
    haulRates: [],
    meta: { quoteCounter: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = remote ? await loadRemote() : loadLocal();
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
