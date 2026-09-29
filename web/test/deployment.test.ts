import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd());

describe('web deployment wiring', () => {
  it('builds and serves the web workspace from its own Docker image', () => {
    const dockerfile = readFileSync(resolve(root, 'web/Dockerfile'), 'utf8');
    expect(dockerfile).toContain('npm run build --workspace web');
    expect(dockerfile).toContain('nginx');
    expect(dockerfile).toContain('USER nginx');
    expect(dockerfile).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|service_role|client_secret/i);
  });

  it('deploys the Fastify API workspace instead of the legacy backend service', () => {
    const dockerfile = readFileSync(resolve(root, 'api/Dockerfile'), 'utf8');
    const render = readFileSync(resolve(root, 'render.yaml'), 'utf8');
    expect(dockerfile).toContain('npm run build --workspace api');
    expect(dockerfile).toContain('COPY tsconfig.base.json tsconfig.base.json');
    expect(dockerfile).toContain('CMD ["node", "api/dist/server.js"]');
    expect(render).toContain('name: relo-api');
    expect(render).toContain('dockerfilePath: ./api/Dockerfile');
    expect(render).not.toContain('dockerfilePath: ./backend/Dockerfile');
    expect(render).not.toContain('name: relo-backend');
  });

  it('declares the web service and browser-safe API URL in Render config', () => {
    const render = readFileSync(resolve(root, 'render.yaml'), 'utf8');
    expect(render).toContain('name: relo-web');
    expect(render).toContain('dockerfilePath: ./web/Dockerfile');
    expect(render).toContain('key: VITE_RELO_API_URL');
    expect(render).toContain('value: https://relo-api-ernh.onrender.com');
    expect(render).toContain('value: https://relo-web-ernh.onrender.com');
    const webService = render.split('  - type: web')[1]?.split('  - type: web')[0] || '';
    expect(webService).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|service_role|client_secret/i);
  });

  it('allows the deployed API in the web Content Security Policy', () => {
    const nginx = readFileSync(resolve(root, 'web/nginx.conf'), 'utf8');
    expect(nginx).toContain('connect-src \'self\' https://relo-api-ernh.onrender.com');
  });

  it('declares a separate free-plan worker boundary with health-only web compatibility', () => {
    const dockerfile = readFileSync(resolve(root, 'worker/Dockerfile'), 'utf8');
    const render = readFileSync(resolve(root, 'render.yaml'), 'utf8');
    expect(dockerfile).toContain('npm run build --workspace worker');
    expect(dockerfile).toContain('CMD ["node", "worker/dist/main.js"]');
    expect(dockerfile).not.toContain('"--workspace", "worker", "run", "start"');
    expect(render).toContain('type: web');
    expect(render).toContain('name: relo-worker');
    expect(render).toContain('dockerfilePath: ./worker/Dockerfile');
    expect(render).toContain('WORKER_HTTP_PORT');
    expect(render).toContain('healthCheckPath: /healthz');
    expect(render).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('enables gzip compression in the actual Nginx config', () => {
    const nginx = readFileSync(resolve(root, 'web/nginx.conf'), 'utf8');
    expect(nginx).toContain('gzip on;');
    expect(nginx).toContain('gzip_types');
    expect(nginx).toContain('application/javascript');
  });
});
