import Modal from "@mui/material/Modal";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";

import modalStyles from "../AddTickerModal/AddTickerModal.module.css";
import styles from "./AiCommitteeHelpModal.module.css";

export default function AiCommitteeHelpModal({ open, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby="ai-committee-help-title"
      slotProps={{ backdrop: { className: modalStyles.backdrop } }}
    >
      <div className={styles.dialog}>
        <div className={styles.header}>
          <div className={modalStyles.titleGroup}>
            <h2 id="ai-committee-help-title" className={modalStyles.title}>
              How the AI Committee works
            </h2>
            <p className={modalStyles.subtitle}>
              On-device analysis from your saved market data — not investment
              advice.
            </p>
          </div>
          <IconButton
            className={modalStyles.closeBtn}
            onClick={onClose}
            aria-label="Close"
            size="small"
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </div>

        <div className={styles.body}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>What it does</h3>
            <p>
              The AI Committee reads cached price history, company financials,
              and news for a symbol, then produces a buy / hold / sell verdict
              with a 0–100 score. Everything runs locally in your browser — no
              cloud LLM calls.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>The score (three pillars)</h3>
            <p>
              A composite score blends three pillars. Each is scored 0–100
              independently, then weighted:
            </p>
            <div className={styles.pillars}>
              <div className={styles.pillar}>
                <span className={styles.pillarWeight}>45%</span>
                <span className={styles.pillarLabel}>Company finances</span>
              </div>
              <div className={styles.pillar}>
                <span className={styles.pillarWeight}>35%</span>
                <span className={styles.pillarLabel}>Price trend</span>
              </div>
              <div className={styles.pillar}>
                <span className={styles.pillarWeight}>20%</span>
                <span className={styles.pillarLabel}>News mood</span>
              </div>
            </div>
            <p style={{ marginTop: 10 }}>
              Price trend covers momentum, moving averages, RSI, and volatility.
              Company finances covers revenue, earnings, margins, and valuation,
              plus financial strength (free cash flow, debt load, return on
              equity) and expectations — whether analysts are raising or cutting
              their forecasts, and forward valuation. Analyst price targets are
              shown for context but never scored. News mood comes from article
              sentiment (see below). The weighting is built for long-term
              investing — the business counts more than the chart — and a strong
              business trading well below its 52-week high gets a small
              &ldquo;quality on sale&rdquo; boost instead of being punished for
              the dip.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>The committee</h3>
            <p>
              Five specialist agents review the data and debate before a final
              verdict:
            </p>
            <ul className={styles.list}>
              <li>Data Scout — quantitative price and fundamental metrics</li>
              <li>Sentiment Analyst — aggregates news mood</li>
              <li>
                Bear — argues the downside and runs a checklist of classic sell
                signals (broken trend, negative momentum, shrinking sales,
                eroding margins, earnings misses, negative news)
              </li>
              <li>
                Devil&apos;s Advocate — flags contradictions between the signals
                (which pull the score toward neutral) and data gaps (which only
                lower confidence)
              </li>
              <li>
                Portfolio Manager — final call plus a game plan: entry, exit,
                and position size for a Buy; reasons, an exit level, and
                reinvestment options for a Sell
              </li>
            </ul>
            <p style={{ marginTop: 10 }}>
              The committee thinks like a long-term position investor, not a day
              trader: trends are judged on 50- and 200-day averages, an
              &ldquo;oversold&rdquo; stock in a downtrend is treated as a
              warning rather than a bargain, and fundamentals like margin
              erosion matter as much as price.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Thesis tracking</h3>
            <p>
              The committee remembers its own past scores (one snapshot per
              symbol per day, stored on your device). The single-symbol view
              shows the score&apos;s trajectory over time, verdicts display a
              &ldquo;was Buy on&hellip;&rdquo; chip when the tier changes, and
              the portfolio review has a <em>Changed</em> filter. A score
              that&apos;s been sliding for weeks also nudges today&apos;s
              verdict slightly downward (and vice versa) — deterioration in the
              evidence is itself a signal.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>News &amp; FinBERT scoring</h3>
            <p>
              News sentiment is scored exclusively by FinBERT — an on-device
              neural model that classifies each article as positive, negative,
              or neutral. Articles without a FinBERT score do not contribute to
              the news pillar until they are analyzed.
            </p>
            <p>
              On a single symbol, use the <em>News intelligence agent</em> on
              the AI Committee tab to crawl article text and run FinBERT. For a
              full portfolio, <em>Deep review</em> batches crawling and FinBERT
              scoring across all holdings before running each verdict.{" "}
              <em>Quick review</em> uses only articles already scored from a
              prior session.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Buy / hold / sell</h3>
            <p>
              The composite score maps to five tiers: Strong Buy (78+), Buy
              (64–77), Hold (45–63), Reduce (33–44, consider trimming), and Sell
              (below 33, consider exiting). Whether you already hold the stock
              changes the explanation (e.g. &ldquo;consider adding&rdquo; vs.
              &ldquo;consider starting a position&rdquo;) but does not change
              the score itself.
            </p>
            <p>
              On a Sell or Reduce, the Portfolio Manager explains why (which
              sell signals triggered), names the price at which the committee
              would reconsider, and offers options for the proceeds — holding
              cash, moving toward your Buy-rated holdings, or a broad index
              fund.
            </p>
            <p>
              A 🔥 <strong>Fire Sale</strong> badge can appear on Buy or Hold
              verdicts. It means the stock looks priced low rather than broken:
              the company&apos;s finances score at least 62/100 while the price
              sits 25%+ below its 52-week high and the news isn&apos;t alarming.
              The committee reads that as a discount on a healthy business — one
              with room to bounce back — not decay, and gives the score a small
              lift. It never appears on Reduce or Sell verdicts, and a discount
              can keep discounting: the exit line still applies.
            </p>
            <p>
              Each fire sale carries its own High / Moderate / Low confidence,
              graded on how far the finances clear the bar, whether the news
              backs the &ldquo;not broken&rdquo; read, whether the price has
              started turning back up, and whether the markdown is so deep it
              might signal a real problem. The reasoning behind the grade is
              listed on the holding&apos;s card and in the Portfolio
              Manager&apos;s notes.
            </p>
          </section>

          <section className={styles.section}>
            <p className={styles.disclaimer}>
              This is an automated summary for learning and exploration. It is
              not financial advice. Scores depend on what data you have cached —
              refresh tickers and run FinBERT on news for the most complete
              picture.
            </p>
          </section>
        </div>
      </div>
    </Modal>
  );
}
