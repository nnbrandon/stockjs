import { useRef } from "react";
import Button from "@mui/material/Button";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import useTrendingStocks from "../../hooks/useTrendingStocks";
import { formatDollars } from "../../utils/computePositionMetrics";
import styles from "./TrendingStocks.module.css";

const retryBtnSx = {
  mt: "10px",
  fontSize: 12.5,
  backgroundColor: "var(--palette-bg-elevated)",
  border: "1px solid var(--palette-divider)",
  color: "var(--palette-text-primary)",
  "&:hover": { backgroundColor: "var(--palette-bg-hover)" },
};

// Trending tiles are pure navigation: tapping one opens the stock's detail
// page (data is seeded there on demand). Adding to the watchlist is an
// explicit action on the detail page — browsing never mutates the watchlist.
function dollarChange(price, changePercent) {
  if (!Number.isFinite(price) || !Number.isFinite(changePercent)) return null;
  return (price * changePercent) / (100 + changePercent);
}

function TickerTile({ stock, onSelect }) {
  const isUp = stock.changePercent >= 0;
  const hasChange = Number.isFinite(stock.changePercent);
  const change = dollarChange(stock.price, stock.changePercent);
  const sign = isUp ? "+" : "−";

  return (
    <button
      type="button"
      className={styles.tile}
      onClick={() => onSelect(stock.symbol)}
      aria-label={`View ${stock.symbol}${stock.name ? `, ${stock.name}` : ""}`}
    >
      <div className={styles.tileSymbol}>{stock.symbol}</div>
      {stock.name && <div className={styles.tileName}>{stock.name}</div>}
      <div className={styles.tilePrice}>{formatDollars(stock.price)}</div>
      {hasChange && (
        <div className={`${styles.tileChange} ${isUp ? styles.up : styles.down}`}>
          {formatDollars(change, { signed: true })}{" "}
          {sign}
          {Math.abs(stock.changePercent).toFixed(2)}%
        </div>
      )}
    </button>
  );
}

function TickerStrip({ stocks, onSelect }) {
  const scrollRef = useRef(null);

  const scroll = (direction) => {
    scrollRef.current?.scrollBy({
      left: direction * 240,
      behavior: "smooth",
    });
  };

  return (
    <div className={styles.strip}>
      <div className={styles.stripLabel}>Trending</div>
      <button
        type="button"
        className={styles.scrollBtn}
        onClick={() => scroll(-1)}
        aria-label="Scroll trending left"
      >
        <ChevronLeftIcon fontSize="small" />
      </button>
      <div className={styles.stripScroll} ref={scrollRef}>
        {stocks.map((stock) => (
          <TickerTile key={stock.symbol} stock={stock} onSelect={onSelect} />
        ))}
      </div>
      <button
        type="button"
        className={styles.scrollBtn}
        onClick={() => scroll(1)}
        aria-label="Scroll trending right"
      >
        <ChevronRightIcon fontSize="small" />
      </button>
    </div>
  );
}

function TrendingCard({ stock, onSelect }) {
  const isUp = stock.changePercent >= 0;
  const sign = isUp ? "+" : "−";
  const hasChange = Number.isFinite(stock.changePercent);

  return (
    <button
      type="button"
      className={styles.card}
      onClick={() => onSelect(stock.symbol)}
      aria-label={`View ${stock.symbol}`}
    >
      <div className={styles.row}>
        <span className={styles.symbol}>{stock.symbol}</span>
        <span className={styles.price}>{stock.price.toFixed(2)}</span>
      </div>
      <div className={styles.name}>{stock.name}</div>
      <div className={styles.footer}>
        {hasChange ? (
          <span
            className={`${styles.change} ${isUp ? styles.up : styles.down}`}
          >
            {sign}
            {Math.abs(stock.changePercent).toFixed(2)}%
          </span>
        ) : (
          <span />
        )}
      </div>
    </button>
  );
}

export default function TrendingStocks({
  onSelectSymbol,
  compact = false,
  hideHeader = false,
}) {
  const { data: stocks = [], isLoading, error, refetch } = useTrendingStocks();

  if (compact) {
    return (
      <section className={styles.stripSection} aria-label="Trending stocks">
        {isLoading && (
          <div className={styles.strip}>
            <div className={styles.stripLabel}>Trending</div>
            <div className={styles.stripScroll}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className={styles.skeletonTile} />
              ))}
            </div>
          </div>
        )}

        {!isLoading && error && (
          <div className={styles.stripError}>
            {error.message || "Could not load trending stocks"}
            <Button
              variant="outlined"
              sx={retryBtnSx}
              onClick={() => refetch()}
            >
              Try again
            </Button>
          </div>
        )}

        {!isLoading && !error && stocks.length > 0 && (
          <TickerStrip stocks={stocks} onSelect={onSelectSymbol} />
        )}
      </section>
    );
  }

  return (
    <div className={`${styles.panel} ${hideHeader ? styles.panelEmbedded : ""}`}>
      {!hideHeader && (
        <div className={styles.header}>
          <h2 className={styles.title}>Trending stocks</h2>
          <p className={styles.subtitle}>
            Popular on Yahoo Finance right now. Tap a ticker to open its detail
            page.
          </p>
        </div>
      )}

      {isLoading && (
        <div className={styles.skeletonGrid}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard} />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className={styles.error}>
          {error.message || "Could not load trending stocks"}
          <div>
            <Button
              variant="outlined"
              sx={retryBtnSx}
              onClick={() => refetch()}
            >
              Try again
            </Button>
          </div>
        </div>
      )}

      {!isLoading && !error && stocks.length > 0 && (
        <div className={styles.grid}>
          {stocks.map((stock) => (
            <TrendingCard
              key={stock.symbol}
              stock={stock}
              onSelect={onSelectSymbol}
            />
          ))}
        </div>
      )}
    </div>
  );
}
