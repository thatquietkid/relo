function normalizeOAuthScopes(scope) {
  return [...new Set(String(scope || '').trim().split(/\s+/).filter(Boolean))];
}

function normalizeAuthorizationDetails(details = {}) {
  const client = details.client || {};
  return {
    authorizationId: String(details.authorization_id || ''),
    clientName: String(client.name || 'Relo-connected application').trim(),
    clientUri: String(client.uri || '').trim(),
    redirectUri: String(details.redirect_uri || '').trim(),
    scopes: normalizeOAuthScopes(details.scope)
  };
}

const oauthConsent = { normalizeOAuthScopes, normalizeAuthorizationDetails };

if (typeof module !== 'undefined' && module.exports) module.exports = oauthConsent;
if (typeof window !== 'undefined') window.ReloOAuth = oauthConsent;
