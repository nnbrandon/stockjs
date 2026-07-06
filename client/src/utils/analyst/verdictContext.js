/**
 * Plain-language framing for what BUY/HOLD/SELL means given whether the
 * user holds the symbol. Does not change the committee score.
 */
export function getVerdictContext(action, { hasPosition, tier } = {}) {
  if (!hasPosition) {
    if (action === "BUY") {
      return "You don't hold this symbol — the committee sees a favorable setup to consider starting a position.";
    }
    if (action === "SELL") {
      return "You don't hold this symbol — the committee flags elevated risk; avoid initiating a position.";
    }
    return "You don't hold this symbol — the committee sees no strong entry or exit signal right now.";
  }

  if (action === "BUY") {
    return "You hold this symbol — the committee supports maintaining or adding to your position.";
  }
  if (action === "SELL") {
    return tier === "Reduce"
      ? "You hold this symbol — the committee suggests trimming the position; see the Portfolio Manager for why and what to do with the proceeds."
      : "You hold this symbol — the committee suggests exiting the position; see the Portfolio Manager for why and what to do with the proceeds.";
  }
  return "You hold this symbol — the committee suggests maintaining your current position.";
}
