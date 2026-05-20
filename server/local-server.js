import http from "http";
import { handler } from "./index.js";

const PORT = 3001;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Convert to Lambda event format
  const event = {
    httpMethod: req.method,
    headers: {
      origin: req.headers.origin || "http://localhost:5173",
    },
    queryStringParameters: Object.fromEntries(url.searchParams),
  };

  const response = await handler(event);

  res.writeHead(response.statusCode, response.headers);
  res.end(response.body);
});

server.listen(PORT, () => {
  console.log(`Local Lambda server running at http://localhost:${PORT}`);
  console.log(`\nTest URLs:`);
  console.log(
    `  http://localhost:${PORT}/?action=prices&symbol=AAPL&start=2024-01-01&end=2024-01-31`,
  );
  console.log(`  http://localhost:${PORT}/?action=news&symbol=AAPL`);
});
