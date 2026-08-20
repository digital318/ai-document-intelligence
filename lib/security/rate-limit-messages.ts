/** HTTP body for application rate-limit responses. Safe to send to the browser. */
export const RATE_LIMIT_HTTP_MESSAGE =
  "Too many requests. Please try again later.";

/** Restrained UI copy. Do not present rate limiting as an application crash. */
export const RATE_LIMIT_USER_MESSAGE =
  "You've reached the temporary request limit. Please try again later.";
