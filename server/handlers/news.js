import { yahooFinance } from "../lib/yahooFinance.js";
import { errorResponse, jsonResponse, requireParams } from "../lib/response.js";

export async function fetchNews(params, corsOrigin) {
  const missing = requireParams(params, ["symbol"], corsOrigin);
  if (missing) return missing;

  try {
    const result = await yahooFinance.search(
      params.symbol,
      {
        lang: "en-US",
        region: "US",
        quotesCount: 6,
        newsCount: 20,
      },
      { validateResult: false },
    );

    const news = (result?.news ?? []).map((item) => ({
      id: item.uuid,
      title: item.title,
      publisher: item.publisher,
      link: item.link,
      // v3 returns a Date for providerPublishTime; older shape was unix-seconds.
      date:
        item.providerPublishTime instanceof Date
          ? item.providerPublishTime.toISOString()
          : typeof item.providerPublishTime === "number"
            ? new Date(item.providerPublishTime * 1000).toISOString()
            : new Date(item.providerPublishTime).toISOString(),
      thumbnail: item.thumbnail,
    }));

    return jsonResponse(200, news, corsOrigin);
  } catch (err) {
    console.error("news error:", err);
    return errorResponse(502, err.message, corsOrigin);
  }
}
