import Modal from "@mui/material/Modal";
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
          <button
            type="button"
            className={modalStyles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon fontSize="small" />
          </button>
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
                <span className={styles.pillarWeight}>40%</span>
                <span className={styles.pillarLabel}>Price trend</span>
              </div>
              <div className={styles.pillar}>
                <span className={styles.pillarWeight}>35%</span>
                <span className={styles.pillarLabel}>Company finances</span>
              </div>
              <div className={styles.pillar}>
                <span className={styles.pillarWeight}>25%</span>
                <span className={styles.pillarLabel}>News mood</span>
              </div>
            </div>
            <p style={{ marginTop: 10 }}>
              Price trend covers momentum, moving averages, RSI, and volatility.
              Company finances covers revenue, earnings, margins, and valuation.
              News mood comes from article sentiment (see below).
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
              <li>Bear — stress-tests the bullish case</li>
              <li>
                Devil&apos;s Advocate — pulls confidence toward neutral when
                signals conflict
              </li>
              <li>Portfolio Manager — final buy / hold / sell call</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>News &amp; FinBERT scoring</h3>
            <p>
              News sentiment is scored exclusively by FinBERT — an on-device
              neural model that classifies each article as positive, negative, or
              neutral. Articles without a FinBERT score do not contribute to the
              news pillar until they are analyzed.
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
              The composite score maps to a verdict: strong buy and buy above ~64,
              hold between ~40–64, sell below ~40. Whether you already hold the
              stock changes the explanation (e.g. &ldquo;consider adding&rdquo;
              vs. &ldquo;consider starting a position&rdquo;) but does not change
              the score itself.
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
