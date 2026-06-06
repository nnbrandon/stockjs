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
    return quotes
      .filter((item) => item.close != null)
      .map((item) => ({
        name: data.meta.shortName,
        symbol: symbol,
        ...item,
      }));
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
}

export default new LambdaService();
