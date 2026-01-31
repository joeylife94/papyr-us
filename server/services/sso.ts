/**
 * SSO (Single Sign-On) Service
 * 
 * Supports multiple authentication providers:
 * - OIDC (OpenID Connect) - Google, Azure AD, Okta, Auth0
 * - SAML 2.0 (Enterprise SSO)
 * - OAuth 2.0 (GitHub, etc.)
 */

import { Router, type Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import logger from './logger.js';

// SSO Provider Configuration
export interface SSOProviderConfig {
  id: string;
  name: string;
  type: 'oidc' | 'saml' | 'oauth2';
  enabled: boolean;
  
  // OIDC/OAuth2 settings
  clientId?: string;
  clientSecret?: string;
  issuer?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  userInfoUrl?: string;
  jwksUri?: string;
  scopes?: string[];
  
  // SAML settings
  entryPoint?: string;
  cert?: string;
  issuerName?: string;
  
  // Mapping settings
  emailClaim?: string;
  nameClaim?: string;
  roleClaim?: string;
  
  // Optional settings
  allowedDomains?: string[];
  defaultRole?: string;
  autoCreateUser?: boolean;
}

// Supported providers with default configurations
const defaultProviders: Record<string, Partial<SSOProviderConfig>> = {
  google: {
    name: 'Google',
    type: 'oidc',
    issuer: 'https://accounts.google.com',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
    scopes: ['openid', 'email', 'profile'],
    emailClaim: 'email',
    nameClaim: 'name',
  },
  azure: {
    name: 'Microsoft Azure AD',
    type: 'oidc',
    // Tenant-specific URLs will be constructed
    scopes: ['openid', 'email', 'profile'],
    emailClaim: 'email',
    nameClaim: 'name',
  },
  github: {
    name: 'GitHub',
    type: 'oauth2',
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    scopes: ['user:email', 'read:user'],
    emailClaim: 'email',
    nameClaim: 'name',
  },
  okta: {
    name: 'Okta',
    type: 'oidc',
    scopes: ['openid', 'email', 'profile'],
    emailClaim: 'email',
    nameClaim: 'name',
  },
  auth0: {
    name: 'Auth0',
    type: 'oidc',
    scopes: ['openid', 'email', 'profile'],
    emailClaim: 'email',
    nameClaim: 'name',
  },
};

// SSO State store (in production, use Redis)
const stateStore = new Map<string, { 
  provider: string; 
  redirectUri: string; 
  createdAt: number;
  nonce?: string;
}>();

// Clean up expired states
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(stateStore.entries());
  for (const [state, data] of entries) {
    if (now - data.createdAt > 10 * 60 * 1000) { // 10 minutes
      stateStore.delete(state);
    }
  }
}, 60 * 1000);

/**
 * Load SSO providers from environment
 */
export function loadSSOProviders(): SSOProviderConfig[] {
  const providers: SSOProviderConfig[] = [];

  // Google
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push({
      ...defaultProviders.google,
      id: 'google',
      enabled: true,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      autoCreateUser: true,
    } as SSOProviderConfig);
  }

  // GitHub
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.push({
      ...defaultProviders.github,
      id: 'github',
      enabled: true,
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      autoCreateUser: true,
    } as SSOProviderConfig);
  }

  // Azure AD
  if (process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET && process.env.AZURE_AD_TENANT_ID) {
    const tenantId = process.env.AZURE_AD_TENANT_ID;
    providers.push({
      ...defaultProviders.azure,
      id: 'azure',
      enabled: true,
      clientId: process.env.AZURE_AD_CLIENT_ID,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
      issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
      authorizationUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
      tokenUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
      autoCreateUser: true,
      allowedDomains: process.env.AZURE_AD_ALLOWED_DOMAINS?.split(','),
    } as SSOProviderConfig);
  }

  // Okta
  if (process.env.OKTA_CLIENT_ID && process.env.OKTA_CLIENT_SECRET && process.env.OKTA_DOMAIN) {
    const domain = process.env.OKTA_DOMAIN;
    providers.push({
      ...defaultProviders.okta,
      id: 'okta',
      enabled: true,
      clientId: process.env.OKTA_CLIENT_ID,
      clientSecret: process.env.OKTA_CLIENT_SECRET,
      issuer: `https://${domain}`,
      authorizationUrl: `https://${domain}/oauth2/v1/authorize`,
      tokenUrl: `https://${domain}/oauth2/v1/token`,
      userInfoUrl: `https://${domain}/oauth2/v1/userinfo`,
      jwksUri: `https://${domain}/oauth2/v1/keys`,
      autoCreateUser: true,
    } as SSOProviderConfig);
  }

  // Auth0
  if (process.env.AUTH0_CLIENT_ID && process.env.AUTH0_CLIENT_SECRET && process.env.AUTH0_DOMAIN) {
    const domain = process.env.AUTH0_DOMAIN;
    providers.push({
      ...defaultProviders.auth0,
      id: 'auth0',
      enabled: true,
      clientId: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      issuer: `https://${domain}/`,
      authorizationUrl: `https://${domain}/authorize`,
      tokenUrl: `https://${domain}/oauth/token`,
      userInfoUrl: `https://${domain}/userinfo`,
      jwksUri: `https://${domain}/.well-known/jwks.json`,
      autoCreateUser: true,
    } as SSOProviderConfig);
  }

  // Generic OIDC provider
  if (process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET && process.env.OIDC_ISSUER) {
    providers.push({
      id: 'oidc',
      name: process.env.OIDC_PROVIDER_NAME || 'SSO',
      type: 'oidc',
      enabled: true,
      clientId: process.env.OIDC_CLIENT_ID,
      clientSecret: process.env.OIDC_CLIENT_SECRET,
      issuer: process.env.OIDC_ISSUER,
      authorizationUrl: process.env.OIDC_AUTHORIZATION_URL,
      tokenUrl: process.env.OIDC_TOKEN_URL,
      userInfoUrl: process.env.OIDC_USERINFO_URL,
      jwksUri: process.env.OIDC_JWKS_URI,
      scopes: (process.env.OIDC_SCOPES || 'openid,email,profile').split(','),
      emailClaim: process.env.OIDC_EMAIL_CLAIM || 'email',
      nameClaim: process.env.OIDC_NAME_CLAIM || 'name',
      autoCreateUser: process.env.OIDC_AUTO_CREATE_USER !== 'false',
    } as SSOProviderConfig);
  }

  logger.info('SSO providers loaded', { 
    providers: providers.map(p => ({ id: p.id, name: p.name, type: p.type })) 
  });

  return providers;
}

/**
 * Generate random state for CSRF protection
 */
function generateState(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate nonce for OIDC
 */
function generateNonce(): string {
  return generateState();
}

/**
 * Build authorization URL for OIDC/OAuth2 provider
 */
export function buildAuthorizationUrl(
  provider: SSOProviderConfig,
  redirectUri: string,
  state: string,
  nonce?: string
): string {
  const params = new URLSearchParams({
    client_id: provider.clientId!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: (provider.scopes || ['openid', 'email', 'profile']).join(' '),
    state,
  });

  // Add nonce for OIDC
  if (provider.type === 'oidc' && nonce) {
    params.set('nonce', nonce);
  }

  // GitHub requires different response type
  if (provider.id === 'github') {
    params.delete('scope');
    params.set('scope', (provider.scopes || ['user:email']).join(' '));
  }

  return `${provider.authorizationUrl}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(
  provider: SSOProviderConfig,
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; idToken?: string; refreshToken?: string }> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: provider.clientId!,
    client_secret: provider.clientSecret!,
    code,
    redirect_uri: redirectUri,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  // GitHub requires Accept header for JSON response
  if (provider.id === 'github') {
    headers['Accept'] = 'application/json';
  }

  const response = await fetch(provider.tokenUrl!, {
    method: 'POST',
    headers,
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Token exchange failed', { 
      provider: provider.id, 
      status: response.status,
      error: errorText 
    });
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    idToken: data.id_token,
    refreshToken: data.refresh_token,
  };
}

/**
 * Get user info from provider
 */
async function getUserInfo(
  provider: SSOProviderConfig,
  accessToken: string
): Promise<{ email: string; name: string; picture?: string; sub?: string }> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
  };

  // GitHub uses different auth header
  if (provider.id === 'github') {
    headers['Authorization'] = `token ${accessToken}`;
    headers['Accept'] = 'application/json';
  }

  const response = await fetch(provider.userInfoUrl!, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to get user info: ${response.status}`);
  }

  const data = await response.json();

  // Handle GitHub's different response format
  if (provider.id === 'github') {
    // GitHub doesn't return email in user endpoint, need to fetch separately
    let email = data.email;
    if (!email) {
      const emailResponse = await fetch('https://api.github.com/user/emails', { headers });
      if (emailResponse.ok) {
        const emails = await emailResponse.json();
        const primaryEmail = emails.find((e: any) => e.primary);
        email = primaryEmail?.email || emails[0]?.email;
      }
    }
    return {
      email,
      name: data.name || data.login,
      picture: data.avatar_url,
      sub: String(data.id),
    };
  }

  return {
    email: data[provider.emailClaim || 'email'],
    name: data[provider.nameClaim || 'name'],
    picture: data.picture,
    sub: data.sub,
  };
}

/**
 * Create SSO router
 */
export function createSSORouter(
  providers: SSOProviderConfig[],
  callbacks: {
    findUserByEmail: (email: string) => Promise<any>;
    createUser: (user: { email: string; name: string; provider: string; providerId?: string }) => Promise<any>;
    updateUser?: (userId: number, updates: any) => Promise<any>;
  }
): Router {
  const router = Router();

  // List available SSO providers
  router.get('/providers', (req, res) => {
    const enabledProviders = providers
      .filter(p => p.enabled)
      .map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
      }));

    res.json({ providers: enabledProviders });
  });

  // Initiate SSO login
  router.get('/login/:providerId', (req, res) => {
    const { providerId } = req.params;
    const provider = providers.find(p => p.id === providerId && p.enabled);

    if (!provider) {
      return res.status(404).json({ message: 'SSO provider not found' });
    }

    const state = generateState();
    const nonce = provider.type === 'oidc' ? generateNonce() : undefined;
    
    // Determine redirect URI
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${baseUrl}/api/sso/callback/${providerId}`;

    // Store state for verification
    stateStore.set(state, {
      provider: providerId,
      redirectUri,
      createdAt: Date.now(),
      nonce,
    });

    const authUrl = buildAuthorizationUrl(provider, redirectUri, state, nonce);
    
    logger.info('SSO login initiated', { provider: providerId });
    res.redirect(authUrl);
  });

  // SSO callback
  router.get('/callback/:providerId', async (req, res) => {
    const { providerId } = req.params;
    const { code, state, error, error_description } = req.query;

    // Check for OAuth error
    if (error) {
      logger.warn('SSO callback error', { provider: providerId, error, error_description });
      return res.redirect(`/login?error=${encodeURIComponent(String(error_description || error))}`);
    }

    // Validate state
    const storedState = stateStore.get(String(state));
    if (!storedState || storedState.provider !== providerId) {
      logger.warn('SSO state mismatch', { provider: providerId });
      return res.redirect('/login?error=invalid_state');
    }

    stateStore.delete(String(state));

    const provider = providers.find(p => p.id === providerId);
    if (!provider) {
      return res.redirect('/login?error=provider_not_found');
    }

    try {
      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(provider, String(code), storedState.redirectUri);

      // Get user info
      const userInfo = await getUserInfo(provider, tokens.accessToken);

      if (!userInfo.email) {
        logger.warn('SSO user has no email', { provider: providerId });
        return res.redirect('/login?error=no_email');
      }

      // Check allowed domains
      if (provider.allowedDomains && provider.allowedDomains.length > 0) {
        const emailDomain = userInfo.email.split('@')[1];
        if (!provider.allowedDomains.includes(emailDomain)) {
          logger.warn('SSO email domain not allowed', { provider: providerId, domain: emailDomain });
          return res.redirect('/login?error=domain_not_allowed');
        }
      }

      // Find or create user
      let user = await callbacks.findUserByEmail(userInfo.email);

      if (!user) {
        if (provider.autoCreateUser) {
          user = await callbacks.createUser({
            email: userInfo.email,
            name: userInfo.name || userInfo.email.split('@')[0],
            provider: providerId,
            providerId: userInfo.sub,
          });
          logger.info('SSO user created', { provider: providerId, email: userInfo.email });
        } else {
          logger.warn('SSO user not found and auto-create disabled', { provider: providerId });
          return res.redirect('/login?error=user_not_found');
        }
      }

      // Determine role
      const role = config.adminEmails.includes(userInfo.email.toLowerCase()) ? 'admin' : 'user';

      // Issue JWT tokens
      const accessToken = jwt.sign(
        { id: user.id, email: user.email, role },
        config.jwtSecret,
        { expiresIn: '7d' }
      );
      const refreshToken = jwt.sign(
        { id: user.id, type: 'refresh' },
        config.jwtSecret,
        { expiresIn: '30d' }
      );

      logger.info('SSO login successful', { provider: providerId, userId: user.id });

      // Redirect to frontend with tokens
      const frontendUrl = process.env.FRONTEND_URL || '/';
      res.redirect(`${frontendUrl}?accessToken=${accessToken}&refreshToken=${refreshToken}`);
    } catch (err) {
      logger.error('SSO callback error', { provider: providerId, error: err });
      res.redirect('/login?error=sso_failed');
    }
  });

  return router;
}

export { SSOProviderConfig as SSOProvider };
