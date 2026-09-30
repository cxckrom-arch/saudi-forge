export const LOOPBACK_HOST = "127.0.0.1";

export function createNetworkPolicy(publicHost = "") {
  const extra = publicHost.trim();
  const allowed = [
    LOOPBACK_HOST,
    "localhost",
    "[::1]",
    ...(extra ? [extra] : [])
  ];

  return {
    host: LOOPBACK_HOST,
    allowedHosts: [...allowed],
    allowedOrigins: [...allowed]
  };
}
