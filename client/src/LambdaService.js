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
}

export default new LambdaService();
