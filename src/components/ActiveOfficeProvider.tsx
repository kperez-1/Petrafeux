"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Office } from "@/lib/types";
import {
  getStoredActiveOfficeId,
  officesForUser,
  resolveActiveOffice,
  setStoredActiveOfficeId,
} from "@/lib/active-office";
import { resolveCurrentUser } from "@/lib/current-user";
import { useDb } from "@/components/DbProvider";

interface ActiveOfficeContextValue {
  office: Office;
  officeId: string;
  offices: Office[];
  setOfficeId: (id: string) => void;
}

const ActiveOfficeContext = createContext<ActiveOfficeContextValue | null>(null);

export function ActiveOfficeProvider({ children }: { children: React.ReactNode }) {
  const { db, loading } = useDb();
  const user = resolveCurrentUser(db);
  const offices = useMemo(() => officesForUser(db, user), [db, user]);
  const resolved = resolveActiveOffice(db, user) ?? offices[0];

  const [officeId, setOfficeIdState] = useState<string>(() => resolved?.id ?? "");

  useEffect(() => {
    if (loading || !resolved) return;
    const stored = getStoredActiveOfficeId();
    const valid = stored && offices.some((o) => o.id === stored);
    setOfficeIdState(valid ? stored : resolved.id);
  }, [loading, resolved?.id, offices]);

  const setOfficeId = useCallback(
    (id: string) => {
      if (!offices.some((o) => o.id === id)) return;
      setOfficeIdState(id);
      setStoredActiveOfficeId(id);
    },
    [offices]
  );

  const office = offices.find((o) => o.id === officeId) ?? resolved ?? offices[0];

  if (!office) {
    return <>{children}</>;
  }

  return (
    <ActiveOfficeContext.Provider
      value={{ office, officeId: office.id, offices, setOfficeId }}
    >
      {children}
    </ActiveOfficeContext.Provider>
  );
}

export function useActiveOffice() {
  const ctx = useContext(ActiveOfficeContext);
  if (!ctx) throw new Error("useActiveOffice must be used inside ActiveOfficeProvider");
  return ctx;
}
