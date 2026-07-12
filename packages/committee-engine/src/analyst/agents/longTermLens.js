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

  // Margin drift across the window: quietly rising or eroding profitability
  // over years says more about the business than any single quarter.
  const marginOf = (r) =>
    Number.isFinite(r.netIncome) && r.totalRevenue
      ? (r.netIncome / r.totalRevenue) * 100
      : null;
  const newest = marginOf(rows[0]);
  const oldest = marginOf(rows[rows.length - 1]);
  let drift = null;
  if (Number.isFinite(newest) && Number.isFinite(oldest)) {
    drift = newest - oldest;
    metrics.marginDriftYears = drift;
  }
  const driftUp = drift != null && drift >= 3;
  const driftDown = drift != null && drift <= -3;

  // Growth, profit record, and margin drift collapse into one bullet when
  // they all lean the same way — the "steady compounder" (or its opposite)
  // is one story, not three.
  const allGrew = upYears === pairs;
  const grewLittle = upYears <= pairs / 2;
  const allProfitable =
    profitRows.length >= 3 && profitableYears === profitRows.length;
  const someLosses =
    profitRows.length >= 3 && profitableYears < profitRows.length;
  const lossYears = profitRows.length - profitableYears;
  let driftMerged = false;

  if (allGrew && allProfitable) {
    let text = `Sales have grown every year for ${years} years and it turned a profit in each — a steady, reliable business`;
    if (driftUp) {
      text += `, keeping ${drift.toFixed(0)}¢ more per sales dollar than ${years} years ago`;
      driftMerged = true;
    }
    findings.push(bull(text, 2));
  } else if (grewLittle && someLosses) {
    let text = `Sales grew in only ${upYears} of the last ${pairs} years and it lost money in ${lossYears} of ${profitRows.length} — unreliable growth and profits`;
    if (driftDown) {
      text += `, keeping ${Math.abs(drift).toFixed(0)}¢ less per sales dollar than ${years} years ago`;
      driftMerged = true;
    }
    findings.push(bear(text, 2));
  } else {
    if (allGrew) {
      findings.push(
        bull(
          `Sales have grown every year for ${years} years — a steady grower, not a one-quarter story`,
          2,
        ),
      );
    } else if (grewLittle) {
      findings.push(
        bear(
          `Sales grew in only ${upYears} of the last ${pairs} years — growth has been unreliable for a while`,
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
    if (allProfitable) {
      findings.push(
        bull(
          `Profitable in each of the last ${profitRows.length} years — reliably earns money`,
          1,
        ),
      );
    } else if (someLosses) {
      findings.push(
        bear(
          `Lost money in ${lossYears} of the last ${profitRows.length} years — profits here come and go`,
          1,
        ),
      );
    }
  }

  if (!driftMerged) {
    if (driftUp) {
      findings.push(
        bull(
          `Profitability improving over the years — keeps ${drift.toFixed(0)}¢ more per sales dollar than ${years} years ago`,
          1,
        ),
      );
    } else if (driftDown) {
      findings.push(
        bear(
          `Profitability eroding for years — keeps ${Math.abs(drift).toFixed(0)}¢ less per sales dollar than ${years} years ago`,
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
          `Buying back its own shares — count down ${Math.abs(totalChangePct).toFixed(1)}% over ${spanLabel}, so each share you own is a growing slice`,
          Math.abs(perYearPct) >= 2 ? 2 : 1,
        ),
      );
    } else if (perYearPct >= 2) {
      findings.push(
        bear(
          `Keeps issuing new shares — count up ${totalChangePct.toFixed(1)}% over ${spanLabel}, so each share you own becomes a thinner slice (dilution)`,
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

  // Direction: is the dividend growing? Compare the two most recent full
  // years of payments. Computed first so it can share the affordability
  // bullet below when both lean the same way.
  let growth = null;
  const aRows = annualDesc.filter((r) => divPaidOf(r) != null);
  if (aRows.length >= 2) {
    const [thisYear, lastYear] = aRows.map(divPaidOf);
    if (lastYear > 0) {
      growth = ((thisYear - lastYear) / lastYear) * 100;
      metrics.dividendGrowthYoY = growth;
    }
  }
  const growing = growth != null && growth >= 4;
  const shrinking = growth != null && growth <= -4;
  let growthMerged = false;

  if (Number.isFinite(fcf)) {
    if (fcf <= 0) {
      components.push(18);
      findings.push(
        bear(
          `Pays a dividend (${yieldBit}) while burning cash — payouts like this often get cut`,
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
            growing
              ? `Pays ${yieldBit}, comfortably afforded (only ${payoutPct.toFixed(0)}% of its spare cash) — and growing, payouts up ${growth.toFixed(0)}% vs. the prior year`
              : `Pays ${yieldBit} and can comfortably afford it (only ${payoutPct.toFixed(0)}% of its spare cash)`,
            1,
          ),
        );
        growthMerged = growing;
      } else if (payoutPct <= 95) {
        findings.push(
          neutral(
            `Pays ${yieldBit} — uses ${payoutPct.toFixed(0)}% of its spare cash, so affordable but little room to grow`,
            1,
          ),
        );
      } else {
        components.push(25);
        findings.push(
          bear(
            shrinking
              ? `Pays ${yieldBit}, but the payout costs more than the spare cash it generates and is already shrinking (down ${Math.abs(growth).toFixed(0)}% vs. the prior year) — dividends like this sometimes get cut`
              : `Pays ${yieldBit}, but the payout costs more than the spare cash it generates — dividends like this sometimes get cut`,
            2,
          ),
        );
        growthMerged = shrinking;
      }
    }
  } else {
    findings.push(neutral(`Pays ${yieldBit}`, 1));
  }

  if (!growthMerged) {
    if (growing) {
      findings.push(
        bull(
          `Dividend growing — payouts up ${growth.toFixed(0)}% vs. the prior year`,
          1,
        ),
      );
    } else if (shrinking) {
      findings.push(
        bear(
          `Dividend shrinking — payouts down ${Math.abs(growth).toFixed(0)}% vs. the prior year`,
          1,
        ),
      );
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
