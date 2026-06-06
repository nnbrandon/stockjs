/**
 * Plain-language framing for what BUY/HOLD/SELL means given whether the
 * user holds the symbol. Does not change the committee score.
 */
export function getVerdictContext(action, { hasPosition } = {}) {
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
    return "You hold this symbol — the committee suggests considering trimming or exiting your position.";
  }
  return "You hold this symbol — the committee suggests maintaining your current position.";
}
