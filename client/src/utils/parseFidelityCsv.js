function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseMoney(value) {
  if (!value) return null;
  const cleaned = value.replace(/[$,+]/g, "").replace(/,/g, "").trim();
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parseQuantity(value) {
  if (!value) return null;
  const num = Number.parseFloat(String(value).replace(/,/g, "").trim());
  return Number.isFinite(num) && num > 0 ? num : null;
}

function normalizeSymbol(raw) {
  if (!raw) return null;
  const symbol = raw.replace(/\*+$/, "").trim().toUpperCase();
  return symbol || null;
}

const TICKER_PATTERN = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;

/** Fidelity exports CUSIPs (9-char IDs) for mutual funds, bonds, etc. with no ticker. */
export function isTradeableTickerSymbol(symbol) {
  if (!symbol) return false;
  if (/^[0-9A-Z]{9}$/.test(symbol)) return false;
  return TICKER_PATTERN.test(symbol);
}

function skipReason({ symbol, quantity }) {
  if (!symbol) return null;
  if (!quantity) return "Missing quantity";
  if (symbol === "SPAXX") return "Cash sweep";
  if (!isTradeableTickerSymbol(symbol)) {
    return "No ticker symbol (mutual fund, bond, or CUSIP)";
  }
  return null;
}

function mergePosition(existing, next) {
  const totalQty = existing.quantity + next.quantity;
  const weightedAvg =
    (existing.quantity * existing.averageCostBasis +
      next.quantity * next.averageCostBasis) /
    totalQty;

  return {
    ...existing,
    quantity: totalQty,
    averageCostBasis: weightedAvg,
    accountName: existing.accountName || next.accountName,
  };
}

/**
 * Parse a Fidelity "Portfolio Positions" CSV export.
 * Returns equity rows with quantity + average cost basis (cost basis total is derived).
 */
export function parseFidelityCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('"'));

  if (lines.length < 2) {
    return { positions: [], skipped: [{ reason: "No data rows found" }] };
  }

  // Match headers case-insensitively \u2014 Fidelity's export uses sentence case
  // ("Average cost basis", "Account name") that doesn't match a literal
  // title-cased lookup.
  const headers = parseCsvLine(lines[0]).map((h) =>
    h.replace(/^\uFEFF/, "").trim().toLowerCase(),
  );
  const headerIdx = (name) => headers.indexOf(name.toLowerCase());
  const symbolIdx = headerIdx("Symbol");
  const quantityIdx = headerIdx("Quantity");
  const avgCostIdx = headerIdx("Average Cost Basis");
  const accountIdx = headerIdx("Account Name");

  if (symbolIdx === -1 || quantityIdx === -1 || avgCostIdx === -1) {
    throw new Error(
      "Unrecognized Fidelity CSV format. Expected Symbol, Quantity, and Average Cost Basis columns.",
    );
  }

  const bySymbol = new Map();
  const skipped = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const symbol = normalizeSymbol(cols[symbolIdx]);
    const quantity = parseQuantity(cols[quantityIdx]);
    const averageCostBasis = parseMoney(cols[avgCostIdx]);
    const accountName = cols[accountIdx] ?? "";

    const reason = skipReason({ symbol, quantity });
    if (reason) {
      if (symbol) skipped.push({ symbol, reason });
      continue;
    }

    if (!averageCostBasis) {
      skipped.push({ symbol, reason: "Missing average cost basis" });
      continue;
    }

    const row = {
      symbol,
      quantity,
      averageCostBasis,
      accountName: accountName || undefined,
      importedAt: new Date().toISOString(),
      source: "fidelity",
    };

    if (bySymbol.has(symbol)) {
      bySymbol.set(symbol, mergePosition(bySymbol.get(symbol), row));
    } else {
      bySymbol.set(symbol, row);
    }
  }

  return { positions: [...bySymbol.values()], skipped };
}
