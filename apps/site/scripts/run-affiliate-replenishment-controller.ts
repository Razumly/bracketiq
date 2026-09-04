import dotenv from 'dotenv';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const gatewayUrl = (): string => {
  const address = requiredEnvironment('AFFILIATE_AGENT_GATEWAY_ADDRESS').replace(/\/+$/, '');
  let prefix = (process.env.AFFILIATE_AGENT_GATEWAY_PATH_PREFIX || '/v1/affiliate-agent').trim();
  if (!prefix.startsWith('/')) prefix = `/${prefix}`;
  prefix = prefix.replace(/\/+$/, '') || '/';
  return `${address}${prefix === '/' ? '' : prefix}/replenishment`;
};

const main = async (): Promise<void> => {
  const response = await fetch(gatewayUrl(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-affiliate-gateway-replenishment-token': requiredEnvironment(
        'AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN',
      ),
    },
    body: '{}',
  });
  const payload = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    throw new Error(`Gateway replenishment response was not valid JSON (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(`Gateway replenishment request failed (HTTP ${response.status}): ${JSON.stringify(parsed)}`);
  }
  if (
    typeof parsed !== 'object'
    || parsed === null
    || !('result' in parsed)
  ) {
    throw new Error('Gateway replenishment response did not contain a result.');
  }
  console.log(JSON.stringify(parsed.result, null, 2));
};

main().catch((error: unknown) => {
  console.error('[affiliate:replenishment:controller] failed', error);
  process.exitCode = 1;
});
