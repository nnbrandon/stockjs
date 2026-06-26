import { createContext, useContext, useMemo } from "react";

import useFinbert from "../../hooks/useFinbert";
import usePortfolioCommittee from "../../hooks/usePortfolioCommittee";

// Owns the portfolio AI Committee run lifecycle — the FinBERT Web Worker and the
// committee state — at a level that survives in-app navigation. The committee
// panel only mounts on the home view, so if it owned this state directly, the
// worker would be torn down (and a long "deep review" stalled) the instant the
// user opened a ticker. Mounting this provider above the view switch lets a
// review keep running in the background while the user moves around the app.
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
  const finbert = useFinbert();
  const committee = usePortfolioCommittee(positions);

  const value = useMemo(
    () => ({ finbert, ...committee }),
    [finbert, committee],
  );

  return (
    <PortfolioCommitteeContext.Provider value={value}>
      {children}
    </PortfolioCommitteeContext.Provider>
  );
}
