/**
 * SSO (Single Sign-On) Service
 *
 * Supports multiple authentication providers:
 * - OIDC (OpenID Connect) - Google, Azure AD, Okta, Auth0
 * - SAML 2.0 (Enterprise SSO)
 * - OAuth 2.0 (GitHub, etc.)
 */

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
  if (
    process.env.AZURE_AD_CLIENT_ID &&
    process.env.AZURE_AD_CLIENT_SECRET &&
    process.env.AZURE_AD_TENANT_ID
  ) {
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
    providers: providers.map((p) => ({ id: p.id, name: p.name, type: p.type })),
  });

  return providers;
}

export { SSOProviderConfig as SSOProvider };
