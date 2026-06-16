// The AI Committee analyzes individual companies (price trend + financials +
// earnings + news). Funds, ETFs, and indexes track a basket of holdings and
// have no company financials, so a buy/hold/sell verdict and a single-stock
// risk plan don't apply — the committee should refuse to run for them.
//
// Detection uses Yahoo's `instrumentType`, which we stamp onto every cached
// candle (see LambdaService.fetchHistoricalData). It cleanly separates EQUITY
// from fund-like instruments; it does NOT distinguish index-tracking ETFs from
// active ETFs (that would need a curated symbol list), so every fund-like type
// is treated the same.
const FUND_INSTRUMENT_TYPES = new Set([
  "ETF",
  "MUTUALFUND",
  "INDEX",
  "MONEYMARKET",
]);

export function isFundInstrumentType(instrumentType) {
  return (
    Boolean(instrumentType) &&
    FUND_INSTRUMENT_TYPES.has(String(instrumentType).toUpperCase())
  );
}

// Data-driven fallback for candles cached before we stamped instrumentType.
// Mutual funds are priced once a day by NAV: zero volume and no intraday range
// (open == high == low == close). We require several recent sessions to agree
// so a one-off halted/illiquid day on a real stock can't trip it. (This only
// catches NAV-priced funds; ETFs trade with volume, so they rely on
// instrumentType, populated on the next price refresh.)
function looksLikeNavFund(candles = []) {
  const recent = candles
    .filter((c) => c && Number.isFinite(Number(c.close)))
    .slice(-8);
  if (recent.length < 5) return false;

  return recent.every((c) => {
    const vol = Number(c.volume);
    const noVolume = !Number.isFinite(vol) || vol === 0;
    if (!noVolume) return false;

    // A real stock that's merely halted still prints an intraday range, so a
    // genuine high≠low rules out a fund even with zero volume.
    const o = Number(c.open);
    const h = Number(c.high);
    const l = Number(c.low);
    const close = Number(c.close);
    const hasFullOhlc = [o, h, l, close].every(Number.isFinite);
    const flat = hasFullOhlc && o === close && h === close && l === close;
    return flat || !hasFullOhlc;
  });
}

/**
 * True when the cached candles belong to a fund/ETF/index the committee
 * shouldn't score. Prefers Yahoo's instrumentType; when it's absent (data
 * cached before we began stamping it) it falls back to a NAV/zero-volume
 * heuristic so existing mutual-fund holdings are caught without a refresh.
 *
 * @param {Array<{instrumentType?: string, volume?: number, open?: number, high?: number, low?: number, close?: number}>} candles
 */
export function isFundSymbol(candles = []) {
  const stamped = candles.find((c) => c?.instrumentType)?.instrumentType;
  if (stamped) return isFundInstrumentType(stamped);
  return looksLikeNavFund(candles);
}
