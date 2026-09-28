const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeOAuthScopes, normalizeAuthorizationDetails } = require('./oauth-consent.js');

test('OAuth scope text becomes a stable, human-readable list', () => {
  assert.deepEqual(normalizeOAuthScopes('openid email profile'), ['openid', 'email', 'profile']);
  assert.deepEqual(normalizeOAuthScopes('email   profile email'), ['email', 'profile']);
});

test('OAuth authorization details keep only consent-safe display fields', () => {
  assert.deepEqual(normalizeAuthorizationDetails({
    authorization_id: 'auth-123',
    client: { name: '  Partner Portal ', uri: 'https://partner.example' },
    redirect_uri: 'https://partner.example/callback',
    scope: 'openid email'
  }), {
    authorizationId: 'auth-123',
    clientName: 'Partner Portal',
    clientUri: 'https://partner.example',
    redirectUri: 'https://partner.example/callback',
    scopes: ['openid', 'email']
  });
});
