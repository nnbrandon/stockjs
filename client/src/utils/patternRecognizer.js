// Pattern recognition functions for candlestick chart analysis

// Hammer pattern: indicates lots of selling but also a lot of buyback to push closing price up
function isHammer(candle) {
  const body = Math.abs(candle.open - candle.close);
  const wick = candle.high - candle.low;

  if (body > 0 && candle.open === candle.low && candle.close === candle.high) {
    const ratio = body / wick;
    if (ratio <= 0.2) {
      return true;
    }
  }
  return false;
}

// Bearish is a red candlestick, price went down
function isBearishCandlestick(candle) {
  return parseFloat(candle.close) < parseFloat(candle.open);
}

// Bullish is a green candlestick, price went up
function isBullishCandlestick(candle) {
  return parseFloat(candle.close) > parseFloat(candle.open);
}

// Bullish engulfing pattern
function isBullishEngulfing(candles, index) {
  const currentDay = candles[index];
  const previousDay = candles[index - 1];

  if (
    isBearishCandlestick(previousDay) &&
    parseFloat(currentDay.close) > parseFloat(previousDay.open) &&
    parseFloat(currentDay.open) < parseFloat(previousDay.close)
  ) {
    return true;
  }
  return false;
}

// Doji pattern - small body relative to the range
// Doji's are not always perfect, using a +/- 0.5% range
function isDoji(candles, index) {
  const currentDay = candles[index];
  const open = parseFloat(currentDay.open);
  const close = parseFloat(currentDay.close);

  // Check if open and close are within 0.5% of each other
  if (open * 0.995 <= close && close <= open * 1.005) {
    return true;
  }
  return false;
}

// Three line strike pattern
function isThreeLineStrike(candles, index) {
  if (index < 3) return false; // Need at least 4 candles

  const currentDay = candles[index];
  const previousDay = candles[index - 1];
  const previousDay2 = candles[index - 2];
  const previousDay3 = candles[index - 3];

  // Check if current day opens below previous day's close
  // and the previous three days are all bearish
  if (
    parseFloat(currentDay.open) < parseFloat(previousDay.close) &&
    isBearishCandlestick(previousDay) &&
    isBearishCandlestick(previousDay2) &&
    isBearishCandlestick(previousDay3)
  ) {
    return true;
  }
  return false;
}

// Main function to find patterns in the data
function findPatterns(candles) {
  const patterns = [];

  for (let i = 1; i < candles.length; i++) {
    const candle = candles[i];
    const patternsFound = [];
    const _isBullishEngulfing = isBullishEngulfing(candles, i);
    const _isDoji = isDoji(candles, i);
    const _isThreeLineStrike = isThreeLineStrike(candles, i);

    if (_isBullishEngulfing) {
      patternsFound.push("Bullish engulfing");
    }

    // if (_isDoji) {
    //   patternsFound.push("Doji");
    // }

    // if (_isThreeLineStrike) {
    //   patternsFound.push("Three Line Strike");
    // }

    if (patternsFound.length > 0) {
      patterns.push({
        ...candle,
        isBullishEngulfing: _isBullishEngulfing,
        // isDoji: _isDoji, // do not include for now
        // isThreeLineStrike: _isThreeLineStrike, // do not include for now
      });
    }
  }

  return patterns;
}

// Function to analyze patterns from CSV data URL
function analyzePatternsFromStockData(stockData) {
  return findPatterns(stockData).sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );
}

// Export functions for use in other modules (ES6 modules)
export {
  isHammer,
  isBearishCandlestick,
  isBullishCandlestick,
  isBullishEngulfing,
  isDoji,
  isThreeLineStrike,
  findPatterns,
  analyzePatternsFromStockData,
};
