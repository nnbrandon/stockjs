import { createContext, useContext, useMemo } from "react";

import usePortfolioCommittee from "../../hooks/usePortfolioCommittee";

// Owns the portfolio AI Committee state at a level that survives in-app
// navigation. Analysis happens server-side (single source of truth — the
// same stored run feeds the daily email); the panel only mounts on the home
// view, so if it owned this state directly a pending server run would be
// dropped the instant the user opened a ticker.
const PortfolioCommitteeContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export function usePortfolioCommitteeContext() {
  const ctx = useContext(PortfolioCommitteeContext);
  if (!ctx) {
    throw new Error(
      "usePortfolioCommitteeContext must be used within a PortfolioCommitteeProvider",
    );
  }
  return ctx;
}

export function PortfolioCommitteeProvider({ positions, children }) {
  const committee = usePortfolioCommittee(positions);

  const value = useMemo(() => ({ ...committee }), [committee]);

  return (
    <PortfolioCommitteeContext.Provider value={value}>
      {children}
    </PortfolioCommitteeContext.Provider>
  );
}
