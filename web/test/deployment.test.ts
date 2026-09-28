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

  it('declares the web service and browser-safe API URL in Render config', () => {
    const render = readFileSync(resolve(root, 'render.yaml'), 'utf8');
    expect(render).toContain('name: relo-web');
    expect(render).toContain('dockerfilePath: ./web/Dockerfile');
    expect(render).toContain('key: VITE_RELO_API_URL');
    const webService = render.split('  - type: web')[1]?.split('  - type: web')[0] || '';
    expect(webService).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|service_role|client_secret/i);
  });

  it('declares a separate worker service built from the worker package', () => {
    const dockerfile = readFileSync(resolve(root, 'worker/Dockerfile'), 'utf8');
    const render = readFileSync(resolve(root, 'render.yaml'), 'utf8');
    expect(dockerfile).toContain('npm run build --workspace worker');
    expect(dockerfile).toContain('"--workspace", "worker", "run", "start"');
    expect(render).toContain('type: worker');
    expect(render).toContain('name: relo-worker');
    expect(render).toContain('dockerfilePath: ./worker/Dockerfile');
    expect(render).not.toMatch(/name: relo-worker[\s\S]*?SUPABASE_SERVICE_ROLE_KEY/);
  });
});
