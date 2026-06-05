const LAMBDA_URL =
  "https://fwedwy4in5lnbkpm5yuczew6gm0vnfmj.lambda-url.us-east-1.on.aws/";
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
    return quotes.map((item) => ({
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
