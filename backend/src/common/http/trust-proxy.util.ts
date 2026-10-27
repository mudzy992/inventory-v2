/**
 * Deployment automation for the "proxy chain" MANUAL item. Express only
 * trusts `X-Forwarded-For` up to this many hops; a wrong value either lets a
 * client spoof its IP (too many hops) or makes every rate-limit bucket share
 * the proxy IP (too few). The value is explicit and validated at boot.
 */
export const DEFAULT_TRUST_PROXY_HOPS = 1;
export const MAX_TRUST_PROXY_HOPS = 8;

export const resolveTrustProxyHops = (
  env: NodeJS.ProcessEnv = process.env,
): number => {
  const raw = (env.TRUST_PROXY_HOPS ?? '').trim();
  if (raw === '') return DEFAULT_TRUST_PROXY_HOPS;
  if (!/^\d+$/u.test(raw)) {
    throw new Error('TRUST_PROXY_HOPS must be a non-negative integer (0 = no proxy)');
  }
  const hops = Number(raw);
  if (!Number.isSafeInteger(hops) || hops > MAX_TRUST_PROXY_HOPS) {
    throw new Error(`TRUST_PROXY_HOPS must be 0..${MAX_TRUST_PROXY_HOPS}`);
  }
  return hops;
};
