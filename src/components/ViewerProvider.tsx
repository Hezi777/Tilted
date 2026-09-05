"use client";

import { createContext, useContext } from "react";
import type { PersonSummary } from "@/lib/api";

/**
 * The signed-in Person, resolved once on the server and handed to the tree (build plan
 * M10). Replaces the localStorage device identity: the client no longer decides who it
 * is, it is told.
 */
const ViewerContext = createContext<PersonSummary | null>(null);

export function ViewerProvider({
  viewer,
  children,
}: {
  viewer: PersonSummary | null;
  children: React.ReactNode;
}) {
  return (
    <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>
  );
}

export function useViewer(): PersonSummary | null {
  return useContext(ViewerContext);
}
