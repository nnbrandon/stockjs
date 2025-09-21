class LambdaService {
  API_URL =
    "https://fwedwy4in5lnbkpm5yuczew6gm0vnfmj.lambda-url.us-east-1.on.aws/";

  async fetchHistoricalData(symbol, start, end) {
    let data = [];

    try {
      const response = await fetch(
        `${this.API_URL}?symbol=${symbol}&start=${start}&end=${end}&action=prices`
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
        `${this.API_URL}?symbol=${symbol}&start=${start}&end=${end}&action=fundamentals`
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
}

export default new LambdaService();
