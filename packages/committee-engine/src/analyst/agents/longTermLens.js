import { scaleClamp } from "../indicators";
import { avg, bear, bull, neutral, sortByDateDesc } from "./helpers";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// The long-term lens: the checks a buy-and-hold investor cares about that a
// single quarter can't answer. Three reads, all from data already saved:
//   1. Consistency — has the business grown and stayed profitable for YEARS,
//      or did it just have one good quarter? (annual statements)
//   2. Share count — is the company buying back its own shares (your slice
//      grows) or issuing new ones (your slice shrinks)? (quarterly/annual)
//   3. Dividends — does it pay one, and can it actually afford it?
//      (cash-flow statements)
// Returns { metrics, findings, components } merged into the Data Scout's
// fundamental score, or null when there's nothing multi-year to judge.

// ---- 1. Multi-year consistency ----
function analyzeConsistency(annualDesc) {
  const rows = annualDesc
    .filter((r) => Number.isFinite(r.totalRevenue) && r.totalRevenue !== 0)
    .slice(0, 5);
  if (rows.length < 3) return null;

  const years = rows.length;
  const pairs = years - 1;
  let upYears = 0;
  for (let i = 0; i < pairs; i++) {
    if (rows[i].totalRevenue > rows[i + 1].totalRevenue) upYears++;
  }

  const profitRows = rows.filter((r) => Number.isFinite(r.netIncome));
  const profitableYears = profitRows.filter((r) => r.netIncome > 0).length;

  const metrics = {
    consistencyYears: years,
    revenueUpYears: upYears,
    profitableYears: profitRows.length ? profitableYears : null,
  };

  const findings = [];
  const growthScore = scaleClamp(upYears / pairs, 0.25, 1, 20, 90);
  const profitScore = profitRows.length
    ? scaleClamp(profitableYears / profitRows.length, 0.25, 1, 15, 85)
    : null;
  const components = [avg([growthScore, profitScore])].filter(Number.isFinite);

  if (upYears === pairs) {
    findings.push(
      bull(
        `Sales have grown every year for the last ${years} years — a steady grower, not a one-quarter story`,
        2,
      ),
    );
  } else if (upYears <= pairs / 2) {
    findings.push(
      bear(
        `Sales grew in only ${upYears} of the last ${pairs} years — growth has been unreliable for a while, not just recently`,
        2,
      ),
    );
  } else {
    findings.push(
      neutral(
        `Sales grew in ${upYears} of the last ${pairs} years — decent, but not a straight line`,
        1,
      ),
    );
  }

  if (profitRows.length >= 3) {
    if (profitableYears === profitRows.length) {
      findings.push(
        bull(
          `Made a profit in each of the last ${profitRows.length} years — a business that reliably earns money`,
          1,
        ),
      );
    } else if (profitableYears < profitRows.length) {
      const lossYears = profitRows.length - profitableYears;
      findings.push(
        bear(
          `Lost money in ${lossYears} of the last ${profitRows.length} years — profits here come and go`,
          1,
        ),
      );
    }
  }

  // Margin drift across the window: quietly rising or eroding profitability
  // over years says more about the business than any single quarter.
  const marginOf = (r) =>
    Number.isFinite(r.netIncome) && r.totalRevenue
      ? (r.netIncome / r.totalRevenue) * 100
      : null;
  const newest = marginOf(rows[0]);
  const oldest = marginOf(rows[rows.length - 1]);
  if (Number.isFinite(newest) && Number.isFinite(oldest)) {
    const drift = newest - oldest;
    metrics.marginDriftYears = drift;
    if (drift >= 3) {
      findings.push(
        bull(
          `Profitability has improved over the years — keeps ${drift.toFixed(0)} cents more of each sales dollar than ${years} years ago`,
          1,
        ),
      );
    } else if (drift <= -3) {
      findings.push(
        bear(
          `Profitability has been eroding for years — keeps ${Math.abs(drift).toFixed(0)} cents less of each sales dollar than ${years} years ago`,
          1,
        ),
      );
    }
  }

  return { metrics, findings, components };
}

// ---- 2. Share count: buybacks vs. dilution ----
const sharesOf = (r) =>
  [r.dilutedAverageShares, r.basicAverageShares].find(
    (s) => Number.isFinite(s) && s > 0,
  ) ?? null;

function analyzeShareCount(quarterlyDesc, annualDesc) {
  // Prefer the quarterly series (denser); fall back to annual.
  for (const rows of [quarterlyDesc, annualDesc]) {
    const withShares = rows.filter((r) => sharesOf(r) != null);
    if (withShares.length < 2) continue;

    const latest = withShares[0];
    const latestT = new Date(latest.date).getTime();
    if (!Number.isFinite(latestT)) continue;

    // The row closest to two years back; anything at least ~10 months old
    // still works, scaled to a per-year rate so the wording stays honest.
    let past = null;
    let bestDiff = Infinity;
    for (const r of withShares) {
      const t = new Date(r.date).getTime();
      if (!Number.isFinite(t)) continue;
      const age = latestT - t;
      if (age < 300 * 24 * 60 * 60 * 1000) continue;
      const diff = Math.abs(age - 2 * YEAR_MS);
      if (diff < bestDiff) {
        bestDiff = diff;
        past = r;
      }
    }
    if (!past) continue;

    const yearsSpanned =
      (latestT - new Date(past.date).getTime()) / YEAR_MS;
    const totalChangePct =
      ((sharesOf(latest) - sharesOf(past)) / sharesOf(past)) * 100;
    const perYearPct = totalChangePct / yearsSpanned;

    const metrics = { shareCountChangePerYearPct: perYearPct };
    const findings = [];
    // Falling share count scores high, rising scores low.
    const components = [scaleClamp(perYearPct, 5, -4, 20, 88)];

    const spanLabel =
      yearsSpanned >= 1.5
        ? `${Math.round(yearsSpanned)} years`
        : "the past year";

    if (perYearPct <= -0.75) {
      findings.push(
        bull(
          `Buying back its own shares — the share count fell ${Math.abs(totalChangePct).toFixed(1)}% over ${spanLabel}, so each share you own is a growing slice of the company`,
          Math.abs(perYearPct) >= 2 ? 2 : 1,
        ),
      );
    } else if (perYearPct >= 2) {
      findings.push(
        bear(
          `Keeps issuing new shares — the share count grew ${totalChangePct.toFixed(1)}% over ${spanLabel}, so each share you own becomes a thinner slice (dilution)`,
          perYearPct >= 5 ? 2 : 1,
        ),
      );
    }

    return { metrics, findings, components };
  }
  return null;
}

// ---- 3. Dividends ----
// Yahoo reports dividends paid as a negative cash-flow number; non-payers
// usually have no field at all. Silence when there's no data — never claim
// "pays no dividend" on a missing field, and never penalize a growth company
// for not paying one.
const divPaidOf = (r) => {
  const v = r.cashDividendsPaid ?? r.commonStockDividendPaid;
  return Number.isFinite(v) ? Math.abs(v) : null;
};

function analyzeDividends(quarterlyDesc, annualDesc, price) {
  const qRows = quarterlyDesc.filter((r) => divPaidOf(r) != null).slice(0, 4);
  if (qRows.length < 4) return null;
  const ttmDiv = qRows.reduce((s, r) => s + divPaidOf(r), 0);
  if (!(ttmDiv > 0)) return null;

  const metrics = { dividendsPaidTTM: ttmDiv };
  const findings = [];
  const components = [];

  // Rough yield: dividends paid over the year, per share, against the price.
  const sharesRow = quarterlyDesc.find((r) => sharesOf(r) != null);
  const shares = sharesRow ? sharesOf(sharesRow) : null;
  const yieldPct =
    shares && Number.isFinite(price) && price > 0
      ? (ttmDiv / shares / price) * 100
      : null;
  if (Number.isFinite(yieldPct)) metrics.dividendYieldPct = yieldPct;
  const yieldBit = Number.isFinite(yieldPct)
    ? `about ${yieldPct.toFixed(1)}% a year at today's price`
    : "a regular dividend";

  // Affordability: the same four quarters of free cash flow must cover the
  // payout, or the dividend is living on borrowed time.
  const paired = quarterlyDesc
    .filter((r) => divPaidOf(r) != null && Number.isFinite(r.freeCashFlow))
    .slice(0, 4);
  const fcf =
    paired.length === 4
      ? paired.reduce((s, r) => s + r.freeCashFlow, 0)
      : null;

  if (Number.isFinite(fcf)) {
    if (fcf <= 0) {
      components.push(18);
      findings.push(
        bear(
          `Pays a dividend (${yieldBit}) while the business burns cash — payouts like this often get cut`,
          2,
        ),
      );
    } else {
      const payoutPct = (ttmDiv / fcf) * 100;
      metrics.dividendPayoutOfCashPct = payoutPct;
      if (payoutPct <= 60) {
        components.push(78);
        findings.push(
          bull(
            `Pays ${yieldBit} and can comfortably afford it — the payout uses only ${payoutPct.toFixed(0)}% of the spare cash the business generates`,
            1,
          ),
        );
      } else if (payoutPct <= 95) {
        findings.push(
          neutral(
            `Pays ${yieldBit}, but the payout uses ${payoutPct.toFixed(0)}% of its spare cash — affordable, with little room to grow it`,
            1,
          ),
        );
      } else {
        components.push(25);
        findings.push(
          bear(
            `Pays ${yieldBit}, but the payout costs more than the spare cash the business generates — dividends like this sometimes get cut`,
            2,
          ),
        );
      }
    }
  } else {
    findings.push(neutral(`Pays ${yieldBit}`, 1));
  }

  // Direction: is the dividend growing? Compare the two most recent full
  // years of payments.
  const aRows = annualDesc.filter((r) => divPaidOf(r) != null);
  if (aRows.length >= 2) {
    const [thisYear, lastYear] = aRows.map(divPaidOf);
    if (lastYear > 0) {
      const growth = ((thisYear - lastYear) / lastYear) * 100;
      metrics.dividendGrowthYoY = growth;
      if (growth >= 4) {
        findings.push(
          bull(
            `The dividend is growing — total payouts rose ${growth.toFixed(0)}% versus the prior year`,
            1,
          ),
        );
      } else if (growth <= -4) {
        findings.push(
          bear(
            `The dividend has been shrinking — total payouts fell ${Math.abs(growth).toFixed(0)}% versus the prior year`,
            1,
          ),
        );
      }
    }
  }

  return { metrics, findings, components };
}

/**
 * @param {Array} quarterly merged quarterly statement rows (any order)
 * @param {Array} annual    merged annual statement rows (any order)
 * @param {number} price    latest close, for the dividend-yield estimate
 */
export function analyzeLongTermLens(quarterly = [], annual = [], price = null) {
  const q = sortByDateDesc(quarterly);
  const a = sortByDateDesc(annual);

  const parts = [
    analyzeConsistency(a),
    analyzeShareCount(q, a),
    analyzeDividends(q, a, price),
  ].filter(Boolean);
  if (!parts.length) return null;

  return {
    metrics: Object.assign({}, ...parts.map((p) => p.metrics)),
    findings: parts.flatMap((p) => p.findings),
    components: parts.flatMap((p) => p.components),
  };
}
