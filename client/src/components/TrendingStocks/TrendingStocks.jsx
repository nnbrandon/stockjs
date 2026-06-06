import { useRef, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import CheckIcon from "@mui/icons-material/Check";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import useTrendingStocks from "../../hooks/useTrendingStocks";
import { addSymbolToWatchlist } from "../../utils/addSymbolToWatchlist";
import { formatDollars } from "../../utils/computePositionMetrics";
import { useSnackbar } from "../SnackbarProvider";
import styles from "./TrendingStocks.module.css";

function dollarChange(price, changePercent) {
  if (!Number.isFinite(price) || !Number.isFinite(changePercent)) return null;
  return (price * changePercent) / (100 + changePercent);
}

function TickerTile({ stock, inWatchlist, isAdding, onSelect }) {
  const isUp = stock.changePercent >= 0;
  const hasChange = Number.isFinite(stock.changePercent);
  const change = dollarChange(stock.price, stock.changePercent);
  const sign = isUp ? "+" : "−";

  return (
    <button
      type="button"
      className={`${styles.tile} ${inWatchlist ? styles.tileWatching : ""}`}
      onClick={() => onSelect(stock.symbol)}
      disabled={isAdding}
      aria-label={
        inWatchlist
          ? `View ${stock.symbol}${stock.name ? `, ${stock.name}` : ""}`
          : `Add ${stock.symbol}${stock.name ? `, ${stock.name}` : ""} to watchlist`
      }
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
      {inWatchlist && (
        <CheckIcon className={styles.tileCheck} aria-hidden sx={{ fontSize: 12 }} />
      )}
      {isAdding && <span className={styles.tileSpinner} aria-hidden />}
    </button>
  );
}

function TickerStrip({ stocks, watchlistSymbols, addingSymbol, onSelect }) {
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
          <TickerTile
            key={stock.symbol}
            stock={stock}
            inWatchlist={watchlistSymbols.includes(stock.symbol)}
            isAdding={addingSymbol === stock.symbol}
            onSelect={onSelect}
          />
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

function TrendingCard({ stock, inWatchlist, isAdding, onSelect }) {
  const isUp = stock.changePercent >= 0;
  const sign = isUp ? "+" : "−";
  const hasChange = Number.isFinite(stock.changePercent);

  return (
    <button
      type="button"
      className={`${styles.card} ${inWatchlist ? styles.inWatchlist : ""}`}
      onClick={() => onSelect(stock.symbol)}
      disabled={isAdding}
      aria-label={
        inWatchlist
          ? `View ${stock.symbol}`
          : `Add ${stock.symbol} to watchlist`
      }
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
        {isAdding ? (
          <span className={styles.spinner} aria-hidden />
        ) : inWatchlist ? (
          <span className={styles.badge}>
            <CheckIcon className={styles.checkIcon} />
            Watching
          </span>
        ) : (
          <span className={styles.addBtn} aria-hidden>
            <AddIcon sx={{ fontSize: 14 }} />
          </span>
        )}
      </div>
    </button>
  );
}

export default function TrendingStocks({
  watchlistSymbols,
  onSelectSymbol,
  onWatchlistChange,
  compact = false,
  hideHeader = false,
}) {
  const showSnackbar = useSnackbar();
  const { data: stocks = [], isLoading, error, refetch } = useTrendingStocks();
  const [addingSymbol, setAddingSymbol] = useState(null);

  const handleSelect = async (symbol) => {
    if (watchlistSymbols.includes(symbol)) {
      onSelectSymbol(symbol);
      return;
    }

    setAddingSymbol(symbol);
    try {
      await addSymbolToWatchlist(symbol);
      onWatchlistChange();
      onSelectSymbol(symbol);
    } catch (err) {
      showSnackbar(`Error adding ${symbol}: ${err.message}`, "error");
    } finally {
      setAddingSymbol(null);
    }
  };

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
            <button
              type="button"
              className={styles.retryBtn}
              onClick={() => refetch()}
            >
              Try again
            </button>
          </div>
        )}

        {!isLoading && !error && stocks.length > 0 && (
          <TickerStrip
            stocks={stocks}
            watchlistSymbols={watchlistSymbols}
            addingSymbol={addingSymbol}
            onSelect={handleSelect}
          />
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
            Popular on Yahoo Finance right now. Click a ticker to add it to your
            watchlist and open the chart.
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
            <button
              type="button"
              className={styles.retryBtn}
              onClick={() => refetch()}
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {!isLoading && !error && stocks.length > 0 && (
        <div className={styles.grid}>
          {stocks.map((stock) => (
            <TrendingCard
              key={stock.symbol}
              stock={stock}
              inWatchlist={watchlistSymbols.includes(stock.symbol)}
              isAdding={addingSymbol === stock.symbol}
              onSelect={handleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
