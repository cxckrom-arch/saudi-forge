export const LOOPBACK_HOST = "127.0.0.1";

export function createNetworkPolicy(publicHost = "") {
  const extras = publicHost
    .split(/[\s,]+/)
    .map(host => host.trim())
    .filter(Boolean);
  const allowed = [
    LOOPBACK_HOST,
    "localhost",
    "[::1]",
    ...extras
  ];

  return {
    host: LOOPBACK_HOST,
    allowedHosts: [...allowed],
    allowedOrigins: [...allowed]
  };
}
