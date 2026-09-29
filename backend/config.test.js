import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSupabaseConfig } from './config.js';

test('requires the service-role key for employee invitations', () => {
  assert.throws(() => loadSupabaseConfig({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'publishable-key'
  }), /SUPABASE_SERVICE_ROLE_KEY is required for employee invitations/);
});

test('loads the Supabase admin provisioning configuration', () => {
  assert.deepEqual(loadSupabaseConfig({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key'
  }), {
    url: 'https://example.supabase.co',
    publishableKey: 'publishable-key',
    serviceRoleKey: 'service-role-key'
  });
});
