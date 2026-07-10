import { useRef, useState } from "react";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Modal from "@mui/material/Modal";
import CloseIcon from "@mui/icons-material/Close";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";

import { runBacktest } from "../../utils/backtest";
import modalStyles from "../AddTickerModal/AddTickerModal.module.css";
import styles from "./CommitteeBacktestModal.module.css";

// "Does the committee actually work?" — the walk-forward backtest, made
// beginner-readable and housed in a modal. The panel shows only a trigger
// button; the intro, progress, and results all live in the dialog. Test
// state lives out here in the trigger component, so closing the modal
// mid-run or after a run loses nothing.

const triggerBtnSx = {
  width: "100%",
  marginTop: "14px",
  padding: "8px 12px",
  fontSize: 11.5,
  justifyContent: "flex-start",
  gap: "8px",
  border: "1px solid var(--palette-divider)",
  color: "var(--palette-text-secondary)",
  "&:hover": {
    backgroundColor: "var(--palette-bg-hover)",
    color: "var(--palette-text-primary)",
  },
};

const testBtnSx = {
  padding: "7px 12px",
  fontSize: 11.5,
  border: "1px solid var(--palette-divider)",
  color: "var(--palette-text-secondary)",
  "&:hover": {
    backgroundColor: "var(--palette-bg-hover)",
    color: "var(--palette-text-primary)",
  },
};

const fmtRet = (n) =>
  Number.isFinite(n) ? `${n > 0 ? "+" : ""}${n.toFixed(1)}%` : "—";

const fmtPrice = (n) =>
  Number.isFinite(n)
    ? `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";

// One worked example, arithmetic on display. `ex` comes from buildExamples:
// the MEDIAN outcome for its tier, so it's typical rather than cherry-picked.
function WorkedExample({ ex }) {
  const beat = Number.isFinite(ex.spyRetPct) ? ex.retPct - ex.spyRetPct : null;
  return (
    <div className={styles.example}>
      <div className={styles.exampleHead}>
        {ex.symbol} — rated &ldquo;{ex.tier}&rdquo; on {ex.date} at{" "}
        {fmtPrice(ex.entryClose)}
      </div>
      <div className={styles.exampleLine}>
        Six months later ({ex.exitDate}) it closed at {fmtPrice(ex.exitClose)}.
      </div>
      <div className={styles.exampleMath}>
        ({fmtPrice(ex.exitClose)} − {fmtPrice(ex.entryClose)}) ÷{" "}
        {fmtPrice(ex.entryClose)} = {fmtRet(ex.retPct)}
      </div>
      {Number.isFinite(ex.spyRetPct) && (
        <div className={styles.exampleLine}>
          An S&amp;P 500 fund over those same dates: {fmtRet(ex.spyRetPct)} →{" "}
          {fmtRet(ex.retPct)} − ({fmtRet(ex.spyRetPct)}) means this verdict{" "}
          {beat >= 0 ? "beat" : "lagged"} the market by{" "}
          {Math.abs(beat).toFixed(1)} points.
        </div>
      )}
    </div>
  );
}

// n-weighted average of the 6-month mean across a set of tier rows.
function weightedFwd6m(rows) {
  const usable = rows.filter((r) => Number.isFinite(r.fwd6mMean) && r.n > 0);
  const total = usable.reduce((s, r) => s + r.n, 0);
  if (!total) return null;
  return usable.reduce((s, r) => s + r.fwd6mMean * r.n, 0) / total;
}

// The one-sentence takeaway: did the stocks it said to buy actually do
// better than the stocks it said to sell?
function buildTakeaway(byTier) {
  const buys = byTier.filter((r) => r.tier === "Strong Buy" || r.tier === "Buy");
  const sells = byTier.filter((r) => r.tier === "Reduce" || r.tier === "Sell");
  const holds = byTier.filter((r) => r.tier === "Hold");
  const buyAvg = weightedFwd6m(buys);
  const sellAvg = weightedFwd6m(sells);
  const holdAvg = weightedFwd6m(holds);

  if (Number.isFinite(buyAvg) && Number.isFinite(sellAvg)) {
    return buyAvg > sellAvg
      ? {
          good: true,
          text: `Good sign: the stocks it said to buy went on to do better than the stocks it said to sell. Six months after a Buy verdict, prices were up ${fmtRet(buyAvg)} on average; after a Sell verdict, ${fmtRet(sellAvg)}. That's what useful advice should look like.`,
        }
      : {
          good: false,
          text: `Warning: the stocks it said to buy did NOT do better than the stocks it said to sell (${fmtRet(buyAvg)} vs. ${fmtRet(sellAvg)} six months later). On your stocks, its advice hasn't been adding value — take its verdicts with a grain of salt.`,
        };
  }
  if (Number.isFinite(buyAvg) && Number.isFinite(holdAvg)) {
    return buyAvg > holdAvg
      ? {
          good: true,
          text: `Good sign: the stocks it said to buy went on to do better (${fmtRet(buyAvg)} over 6 months, on average) than the ones it said to just hold (${fmtRet(holdAvg)}).`,
        }
      : {
          good: false,
          text: `The stocks it said to buy (${fmtRet(buyAvg)} over 6 months, on average) did no better than the ones it said to just hold (${fmtRet(holdAvg)}) — its Buy verdicts haven't added much on your stocks.`,
        };
  }
  return null;
}

// "vs the market": how the stock did compared with simply buying an S&P 500
// index fund on the same day. In a rising market everything floats up, so
// "up 8%" only impresses if the market didn't do better.
function marketBit(vsSpy6m) {
  if (!Number.isFinite(vsSpy6m)) return "";
  const abs = Math.abs(vsSpy6m).toFixed(1);
  return vsSpy6m >= 0
    ? ` · beat the whole market by ${abs}%`
    : ` · lagged the whole market by ${abs}%`;
}

const CAVEATS = [
  "It can only test stocks you already follow — and since people tend to keep their winners, that flatters the results.",
  "Old news headlines aren't saved, so the committee's news-reading skill sits this test out.",
  "The same stock is re-tested every week, so the results overlap — hundreds of verdicts is really a handful of independent bets.",
  "Past results don't promise future ones. Treat this as a sanity check, not proof.",
];

export default function CommitteeBacktestModal() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ phase: "idle" });
  const busyRef = useRef(false);

  const handleRun = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setState({ phase: "running", progress: null });
    try {
      const report = await runBacktest({
        log: false,
        onProgress: (progress) =>
          setState({ phase: "running", progress }),
      });
      setState({ phase: "done", report });
    } catch (err) {
      setState({ phase: "error", message: err?.message ?? String(err) });
    } finally {
      busyRef.current = false;
    }
  };

  const { phase } = state;
  const report = phase === "done" ? state.report : null;
  const takeaway = report?.byTier?.length ? buildTakeaway(report.byTier) : null;

  return (
    <>
      <Button
        variant="outlined"
        sx={triggerBtnSx}
        onClick={() => setOpen(true)}
        startIcon={<ScienceOutlinedIcon sx={{ fontSize: 16 }} />}
      >
        Does the committee actually work? Test it
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        aria-labelledby="committee-backtest-title"
        slotProps={{ backdrop: { className: modalStyles.backdrop } }}
      >
        <div className={styles.dialog}>
          <div className={styles.header}>
            <div className={modalStyles.titleGroup}>
              <h2 id="committee-backtest-title" className={modalStyles.title}>
                Does the committee actually work?
              </h2>
              <p className={modalStyles.subtitle}>
                Test its past verdicts against what prices really did — using
                the data saved on this device.
              </p>
            </div>
            <IconButton
              className={modalStyles.closeBtn}
              onClick={() => setOpen(false)}
              aria-label="Close"
              size="small"
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </div>

          <div className={styles.body}>
            {phase === "idle" && (
              <>
                <p className={styles.text}>
                  A <strong>verdict</strong> is the committee&apos;s bottom
                  line for a stock — Strong Buy, Buy, Hold, Reduce, or Sell:
                  the same badge you see on each holding. This test checks
                  whether those verdicts have actually been worth listening
                  to, using the price history saved on this device. No black
                  box — here&apos;s the whole procedure:
                </p>
                <ol className={styles.steps}>
                  <li>
                    <strong>Rewind.</strong> Pick a week in the past — say, a
                    Monday 18 months ago.
                  </li>
                  <li>
                    <strong>Ask for a verdict, honestly.</strong> The committee
                    runs its normal rules, but it&apos;s only shown data that
                    existed by that Monday: prices up to that day and financial
                    reports published by then. It cannot peek at the future.
                  </li>
                  <li>
                    <strong>Wait 6 months (on paper).</strong> Look up the
                    stock&apos;s actual price 6 months after that Monday and
                    compute the change: (later price − price that day) ÷ price
                    that day.
                  </li>
                  <li>
                    <strong>Compare to doing nothing clever.</strong> Compute
                    the same change for an S&amp;P 500 index fund over the
                    exact same dates. If the stock rose 13% but the index fund
                    rose 8%, the verdict &ldquo;beat the market&rdquo; by 5
                    points — that&apos;s all that phrase means.
                  </li>
                  <li>
                    <strong>Repeat and average.</strong> Do this for every week
                    and every stock — hundreds of verdicts — then average the
                    results for each verdict type. Buys should beat Sells.
                  </li>
                </ol>
                <p className={styles.text}>
                  After the test runs, you&apos;ll see the actual arithmetic
                  for real examples from your own stocks.
                </p>
                <Button variant="outlined" sx={testBtnSx} onClick={handleRun}>
                  Test it on my stocks
                </Button>
              </>
            )}

            {phase === "running" && (
              <div className={styles.progressRow}>
                <CircularProgress size={16} />
                <span className={styles.text}>
                  {state.progress
                    ? `Testing ${state.progress.symbol} (${state.progress.done + 1} of ${state.progress.total})…`
                    : "Loading your saved history…"}
                </span>
              </div>
            )}

            {phase === "error" && (
              <>
                <p className={styles.text}>
                  The test couldn&apos;t finish: {state.message}
                </p>
                <Button variant="outlined" sx={testBtnSx} onClick={handleRun}>
                  Try again
                </Button>
              </>
            )}

            {phase === "done" && report && report.recordCount === 0 && (
              <>
                <p className={styles.text}>
                  Not enough saved history yet. The test needs about 2 years of
                  daily prices per stock — open a stock&apos;s chart on a
                  longer time range to save more history, then try again.
                </p>
                <Button variant="outlined" sx={testBtnSx} onClick={handleRun}>
                  Try again
                </Button>
              </>
            )}

            {phase === "done" && report && report.recordCount > 0 && (
              <>
                {takeaway && (
                  <p
                    className={`${styles.takeaway} ${takeaway.good ? styles.takeawayGood : styles.takeawayBad}`}
                  >
                    {takeaway.text}
                  </p>
                )}
                <p className={styles.text}>
                  How prices moved in the 6 months after each kind of verdict,
                  on average. Tested {report.recordCount.toLocaleString()}{" "}
                  times across {report.symbols.length} of your stock
                  {report.symbols.length === 1 ? "" : "s"}:
                </p>
                <ul className={styles.tierList}>
                  {report.byTier.map((row) => (
                    <li key={row.tier} className={styles.tierRow}>
                      <span className={styles.tierName}>
                        After &ldquo;{row.tier}&rdquo;
                      </span>
                      <span
                        className={
                          Number.isFinite(row.fwd6mMean) && row.fwd6mMean >= 0
                            ? styles.retPos
                            : styles.retNeg
                        }
                      >
                        {fmtRet(row.fwd6mMean)}
                      </span>
                      <span className={styles.tierMeta}>
                        {row.n.toLocaleString()} verdicts
                        {report.hasBenchmark ? marketBit(row.vsSpy6m) : ""}
                        {row.smallSample
                          ? " · too few to draw conclusions"
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                {report.hasBenchmark && (
                  <p className={styles.finePrint}>
                    &ldquo;The whole market&rdquo; means putting the same money
                    in an S&amp;P 500 index fund on the same day instead. In a
                    rising market everything floats up — beating the market is
                    the real test.
                  </p>
                )}
                {report.examples?.length > 0 && (
                  <div className={styles.exampleSection}>
                    <span className={styles.caveatsTitle}>
                      Show the math — real examples from your data
                    </span>
                    <p className={styles.finePrint}>
                      One example per verdict type, chosen as the
                      middle-of-the-pack outcome (not the best one). Every
                      average above is exactly this calculation, repeated and
                      averaged.
                    </p>
                    {report.examples.map((ex) => (
                      <WorkedExample key={`${ex.tier}-${ex.symbol}-${ex.date}`} ex={ex} />
                    ))}
                  </div>
                )}
                <div className={styles.caveats}>
                  <span className={styles.caveatsTitle}>
                    Read the fine print before trusting it
                  </span>
                  <ul className={styles.caveatList}>
                    {CAVEATS.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
                <Button variant="outlined" sx={testBtnSx} onClick={handleRun}>
                  Run it again
                </Button>
              </>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
