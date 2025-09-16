import { addStockData } from "./db";

class LambdaService {
  API_URL =
    "https://fwedwy4in5lnbkpm5yuczew6gm0vnfmj.lambda-url.us-east-1.on.aws/";

  async fetchHistoricalData(symbol, start, end) {
    let data = [];

    try {
      const response = await fetch(
        `${this.API_URL}?symbol=${symbol}&start=${start}&end=${end}`
      );
      data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Error fetching stock data");
      }
    } catch (error) {
      console.error("Error fetching stock data:", error);
      throw error;
    }

    return data.map((item) => ({
      symbol: symbol,
      ...item,
    }));
  }
}

export default new LambdaService();
