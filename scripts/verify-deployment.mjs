export async function verifyDeployment({ webUrl, apiUrl, fetchImpl = fetch }) {
  const web = webUrl.replace(/\/$/, ''); const api = apiUrl.replace(/\/$/, '');
  const page = await fetchImpl(web, { headers: { 'Accept-Encoding': 'gzip' } });
  if (!page.ok) throw new Error(`Web page failed: ${page.status}`);
  const webHealth = await fetchImpl(`${web}/healthz`); if (!webHealth.ok) throw new Error('Web health failed');
  const health = await fetchImpl(`${api}/healthz`); if (!health.ok) throw new Error('API liveness failed');
  const readiness = await fetchImpl(`${api}/readyz`); if (!readiness.ok) throw new Error('API readiness failed');
  const securityHeaders = ['content-security-policy', 'x-content-type-options', 'x-frame-options'];
  for (const header of securityHeaders) if (!health.headers.get(header)) throw new Error(`Missing security header: ${header}`);
  return { web: page.status, api: health.status, readiness: readiness.status, contentEncoding: page.headers.get('content-encoding') };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => value.startsWith('--') ? [...pairs, [value.slice(2), values[index + 1]]] : pairs, []));
  if (!args.web || !args.api) throw new Error('Usage: node scripts/verify-deployment.mjs --web URL --api URL');
  verifyDeployment({ webUrl: args.web, apiUrl: args.api }).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
