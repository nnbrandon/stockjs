// Production points at the AWS Lambda Function URL, injected at build time via
// the VITE_LAMBDA_URL env var (set as a GitHub Actions repository variable).
// Dev always talks to the local server (npm run dev in /server).
const LAMBDA_URL = import.meta.env.VITE_LAMBDA_URL || "";
const LOCAL_URL = "http://localhost:3001";

class LambdaService {
  API_URL = import.meta.env.DEV ? LOCAL_URL : LAMBDA_URL;

  async fetchHistoricalData(symbol, start, end) {
    let data = [];

    try {
      const response = await fetch(
        `${this.API_URL}?symbol=${symbol}&start=${start}&end=${end}&action=prices`,
      );
      data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Error fetching stock data");
      }
    } catch (error) {
      console.error("Error fetching stock data:", error);
      throw error;
    }

    const quotes = data.quotes;
    // Yahoo's chart meta tags the instrument (EQUITY, ETF, MUTUALFUND, INDEX,
    // …). Persisting it lets the AI Committee skip funds, which have no company
    // financials to analyze. Stamped on every candle so it survives in IDB.
    const instrumentType = data.meta?.instrumentType ?? null;
    return quotes
      .filter((item) => item.close != null)
      .map((item) => ({
        name: data.meta.shortName,
        symbol: symbol,
        instrumentType,
        ...item,
      }));
  }

  // Batch extended-hours (pre/post-market) quotes for the whole watchlist in
  // one request. Returns [] for an empty input without hitting the network.
  async fetchQuotes(symbols) {
    if (!symbols?.length) return [];

    const param = encodeURIComponent(symbols.join(","));
    try {
      const response = await fetch(
        `${this.API_URL}?action=quote&symbols=${param}`,
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Error fetching quotes");
      }
      return data;
    } catch (error) {
      console.error("Error fetching quotes:", error);
      throw error;
    }
  }

  async fetchFundamentals(symbol, start, end) {
    let data = {};

    try {
      const response = await fetch(
        `${this.API_URL}?symbol=${symbol}&start=${start}&end=${end}&action=fundamentals`,
      );

      data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Error fetching stock data");
      }
    } catch (error) {
      console.error("Error fetching stock data:", error);
      throw error;
    }

    return data;
  }

  // Forward-looking analyst data (estimate revisions, forward P/E, targets).
  // Best-effort: thin coverage is normal, so failures resolve to null rather
  // than breaking the refresh that requested it.
  async fetchAnalysis(symbol) {
    try {
      const response = await fetch(
        `${this.API_URL}?action=analysis&symbol=${encodeURIComponent(symbol)}`,
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Error fetching analysis");
      }
      return data;
    } catch (error) {
      console.error("Error fetching analysis:", error);
      return null;
    }
  }

  async searchSymbols(query) {
    const q = query?.trim();
    if (!q) return [];

    try {
      const response = await fetch(
        `${this.API_URL}?action=search&q=${encodeURIComponent(q)}`,
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Error searching symbols");
      }
      return data;
    } catch (error) {
      console.error("Error searching symbols:", error);
      throw error;
    }
  }

  async fetchTrending() {
    try {
      const response = await fetch(`${this.API_URL}?action=trending`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Error fetching trending stocks");
      }
      return data;
    } catch (error) {
      console.error("Error fetching trending stocks:", error);
      throw error;
    }
  }

  async fetchNews(symbol) {
    let data = [];

    try {
      const response = await fetch(
        `${this.API_URL}?symbol=${symbol}&action=news`,
      );
      data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Error fetching news data");
      }
    } catch (error) {
      console.error("Error fetching news data:", error);
      throw error;
    }

    return data;
  }

  // Fetch + extract an article's readable text server-side (the browser can't
  // do this directly because publishers omit CORS headers). Best-effort:
  // resolves to `{ ok: false }` on any failure rather than throwing, so the
  // enrichment pipeline can keep going.
  async fetchArticleText(url) {
    try {
      const response = await fetch(
        `${this.API_URL}?action=article&url=${encodeURIComponent(url)}`,
      );
      const data = await response.json();
      if (!response.ok) return { url, ok: false };
      return data;
    } catch {
      return { url, ok: false };
    }
  }

  // Fetch many article bodies in a single request. The server fans out to the
  // publishers concurrently, sidestepping the browser's ~6-connection-per-host
  // cap that throttles one-request-per-article crawling. Always resolves to a
  // result-per-URL array (in input order) so callers never have to special-case
  // a failed batch.
  async fetchArticlesBatch(urls) {
    try {
      const response = await fetch(`${this.API_URL}?action=articles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data?.results)) {
        return urls.map((url) => ({ url, ok: false }));
      }
      return data.results;
    } catch {
      return urls.map((url) => ({ url, ok: false }));
    }
  }

  // Unsubscribe: delete this email's portfolio from S3 so the daily report
  // stops covering it. Same credentials as syncPortfolio; re-syncing later
  // turns the report back on.
  async removePortfolio(token, email) {
    try {
      const response = await fetch(`${this.API_URL}?action=removePortfolio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { ok: false, error: data.error || "Could not stop the report" };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || "Could not stop the report" };
    }
  }

  // Ask the server to email a fresh sync token to `email`. Resolves to
  // { ok, tokenSent?, verificationSent?, error? } — verificationSent means
  // the address first has to click the AWS verification link, then request
  // the token again.
  async requestSyncToken(email) {
    try {
      const response = await fetch(`${this.API_URL}?action=requestToken`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { ok: false, error: data.error || "Could not send the token" };
      }
      return {
        ok: true,
        tokenSent: Boolean(data.tokenSent),
        verificationSent: Boolean(data.verificationSent),
      };
    } catch (err) {
      return { ok: false, error: err?.message || "Could not send the token" };
    }
  }

  // Push imported holdings to S3 so the scheduled daily email tracks the UI.
  // Authenticated with the SYNC_TOKEN from setup-daily-report.sh; the email
  // address is the identity the portfolio is stored under (and where the
  // daily report is sent).
  async syncPortfolio(token, email, positions) {
    try {
      const response = await fetch(`${this.API_URL}?action=portfolioSync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email, positions }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { ok: false, error: data.error || "Sync failed" };
      }
      return {
        ok: true,
        count: data.count,
        updatedAt: data.updatedAt,
        // true | false | null(unknown) — false means the user still has to
        // click the AWS verification link before reports can be delivered.
        emailVerified: data.emailVerified ?? null,
      };
    } catch (err) {
      return { ok: false, error: err?.message || "Sync failed" };
    }
  }
}

export default new LambdaService();
