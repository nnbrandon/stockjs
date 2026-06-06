export const allowedOrigins = [
  "http://localhost:5173",
  "https://nnbrandon.github.io",
];

const corsHeaders = (corsOrigin) => ({
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": corsOrigin,
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "*",
  Vary: "Origin",
});

export const jsonResponse = (statusCode, body, corsOrigin) => ({
  statusCode,
  headers: corsHeaders(corsOrigin),
  body: JSON.stringify(body),
});

export const errorResponse = (statusCode, message, corsOrigin) =>
  jsonResponse(statusCode, { error: message }, corsOrigin);

export const requireParams = (params, keys, corsOrigin) => {
  for (const key of keys) {
    if (!params[key]) {
      return errorResponse(400, `Missing ${key} query param`, corsOrigin);
    }
  }
  return null;
};

export const resolveCorsOrigin = (headers = {}) => {
  const origin = headers.origin || headers.Origin;
  return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
};

export const corsPreflightResponse = (corsOrigin) => ({
  statusCode: 200,
  headers: {
    ...corsHeaders(corsOrigin),
    "Access-Control-Max-Age": "86400",
  },
});
