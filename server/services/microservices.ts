/**
 * Microservices Architecture Preparation
 * 
 * This document outlines the strategy for transitioning
 * Papyr.us from a monolith to a microservices architecture.
 * 
 * Key services identified for extraction:
 * 1. Auth Service - Authentication, SSO, JWT management
 * 2. Page Service - Wiki page CRUD, collaboration
 * 3. Search Service - Full-text search, AI-powered search
 * 4. Notification Service - Real-time notifications, email
 * 5. File Service - File uploads, storage, CDN
 * 6. Team Service - Team management, permissions
 */

import type { Express, Request, Response, NextFunction } from 'express';
import logger from './logger.js';

// Service Registry for inter-service communication
export interface ServiceEndpoint {
  name: string;
  baseUrl: string;
  healthCheck: string;
  version: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
}

// Service Discovery (simplified - in production use Consul/etcd)
const serviceRegistry = new Map<string, ServiceEndpoint>();

/**
 * Register a service in the registry
 */
export function registerService(service: Omit<ServiceEndpoint, 'status' | 'lastCheck'>): void {
  serviceRegistry.set(service.name, {
    ...service,
    status: 'healthy',
    lastCheck: new Date(),
  });
  logger.info('Service registered', { service: service.name, url: service.baseUrl });
}

/**
 * Get service endpoint
 */
export function getServiceEndpoint(name: string): ServiceEndpoint | undefined {
  return serviceRegistry.get(name);
}

/**
 * List all registered services
 */
export function listServices(): ServiceEndpoint[] {
  return Array.from(serviceRegistry.values());
}

/**
 * Health check for all registered services
 */
export async function checkAllServicesHealth(): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();

  for (const [name, service] of Array.from(serviceRegistry.entries())) {
    try {
      const response = await fetch(`${service.baseUrl}${service.healthCheck}`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      const isHealthy = response.ok;
      results.set(name, isHealthy);

      // Update registry
      serviceRegistry.set(name, {
        ...service,
        status: isHealthy ? 'healthy' : 'unhealthy',
        lastCheck: new Date(),
      });
    } catch (error) {
      results.set(name, false);
      serviceRegistry.set(name, {
        ...service,
        status: 'unhealthy',
        lastCheck: new Date(),
      });
      logger.warn('Service health check failed', { service: name, error });
    }
  }

  return results;
}

// API Gateway Pattern - Route Definitions
export interface RouteConfig {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'ALL';
  service: string;
  targetPath?: string;
  rateLimit?: { windowMs: number; max: number };
  auth?: boolean;
  timeout?: number;
}

const routeConfigs: RouteConfig[] = [
  // Auth Service Routes
  { path: '/api/auth/*', method: 'ALL', service: 'auth', auth: false },
  { path: '/api/sso/*', method: 'ALL', service: 'auth', auth: false },

  // Page Service Routes
  { path: '/api/pages/*', method: 'ALL', service: 'pages', auth: true },
  { path: '/api/wiki/*', method: 'ALL', service: 'pages', auth: true },

  // Search Service Routes
  { path: '/api/search/*', method: 'ALL', service: 'search', auth: true },
  { path: '/api/ai/*', method: 'ALL', service: 'search', auth: true, timeout: 30000 },

  // Notification Service Routes
  { path: '/api/notifications/*', method: 'ALL', service: 'notifications', auth: true },

  // File Service Routes
  { path: '/api/uploads/*', method: 'ALL', service: 'files', auth: true },
  { path: '/api/files/*', method: 'ALL', service: 'files', auth: true },

  // Team Service Routes
  { path: '/api/teams/*', method: 'ALL', service: 'teams', auth: true },
  { path: '/api/members/*', method: 'ALL', service: 'teams', auth: true },
];

/**
 * API Gateway middleware factory
 * Proxies requests to appropriate microservices
 */
export function createApiGateway(): (req: Request, res: Response, next: NextFunction) => void {
  return async (req: Request, res: Response, next: NextFunction) => {
    const path = req.path;
    const method = req.method as RouteConfig['method'];

    // Find matching route
    const route = routeConfigs.find(r => {
      const pattern = r.path.replace('*', '.*');
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(path) && (r.method === 'ALL' || r.method === method);
    });

    if (!route) {
      // No microservice route matched, continue to local handlers
      return next();
    }

    const service = getServiceEndpoint(route.service);
    if (!service) {
      // Service not registered, continue to local handlers
      logger.debug('Service not registered, using local handler', { service: route.service });
      return next();
    }

    if (service.status === 'unhealthy') {
      logger.warn('Service unhealthy, using local fallback', { service: route.service });
      return next();
    }

    // Proxy request to microservice
    try {
      const targetPath = route.targetPath || path;
      const targetUrl = `${service.baseUrl}${targetPath}`;

      const headers: Record<string, string> = {
        'Content-Type': req.get('Content-Type') || 'application/json',
        'X-Forwarded-For': req.ip || '',
        'X-Request-ID': (req as any).requestId || '',
      };

      // Forward authorization header
      if (req.headers.authorization) {
        headers['Authorization'] = req.headers.authorization;
      }

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
        signal: AbortSignal.timeout(route.timeout || 10000),
      };

      // Add body for non-GET requests
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetch(targetUrl, fetchOptions);

      // Forward response headers
      response.headers.forEach((value, key) => {
        if (!['transfer-encoding', 'connection'].includes(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });

      // Forward response
      const responseData = await response.text();
      res.status(response.status);

      try {
        res.json(JSON.parse(responseData));
      } catch {
        res.send(responseData);
      }
    } catch (error) {
      logger.error('Gateway proxy error', { service: route.service, path, error });
      
      // Fallback to local handler on proxy error
      next();
    }
  };
}

/**
 * Circuit Breaker Pattern
 * Prevents cascade failures by failing fast when a service is unhealthy
 */
interface CircuitBreakerState {
  failures: number;
  lastFailure: Date | null;
  state: 'closed' | 'open' | 'half-open';
  nextRetry: Date | null;
}

const circuitBreakers = new Map<string, CircuitBreakerState>();

const FAILURE_THRESHOLD = 5;
const RECOVERY_TIMEOUT = 30000; // 30 seconds

export function getCircuitState(service: string): CircuitBreakerState {
  if (!circuitBreakers.has(service)) {
    circuitBreakers.set(service, {
      failures: 0,
      lastFailure: null,
      state: 'closed',
      nextRetry: null,
    });
  }
  return circuitBreakers.get(service)!;
}

export function recordSuccess(service: string): void {
  const state = getCircuitState(service);
  state.failures = 0;
  state.state = 'closed';
  state.nextRetry = null;
}

export function recordFailure(service: string): void {
  const state = getCircuitState(service);
  state.failures++;
  state.lastFailure = new Date();

  if (state.failures >= FAILURE_THRESHOLD) {
    state.state = 'open';
    state.nextRetry = new Date(Date.now() + RECOVERY_TIMEOUT);
    logger.warn('Circuit breaker opened', { service, failures: state.failures });
  }
}

export function canMakeRequest(service: string): boolean {
  const state = getCircuitState(service);

  if (state.state === 'closed') {
    return true;
  }

  if (state.state === 'open' && state.nextRetry && new Date() > state.nextRetry) {
    state.state = 'half-open';
    logger.info('Circuit breaker half-open', { service });
    return true;
  }

  return state.state !== 'open';
}

/**
 * Service mesh configuration (for Kubernetes/Istio)
 */
export const serviceMeshConfig = {
  // Retry policy
  retries: {
    attempts: 3,
    perTryTimeout: '5s',
    retryOn: 'connect-failure,refused-stream,unavailable,cancelled,resource-exhausted',
  },

  // Timeout policy
  timeout: '30s',

  // Load balancing
  loadBalancer: 'round_robin',

  // Connection pool
  connectionPool: {
    tcp: {
      maxConnections: 100,
      connectTimeout: '5s',
    },
    http: {
      http1MaxPendingRequests: 100,
      http2MaxRequests: 1000,
    },
  },

  // Outlier detection
  outlierDetection: {
    consecutiveErrors: 5,
    interval: '30s',
    baseEjectionTime: '30s',
    maxEjectionPercent: 50,
  },
};

/**
 * Docker Compose configuration generator for microservices
 */
export function generateDockerCompose(): string {
  return `
version: '3.8'

services:
  # API Gateway
  gateway:
    image: papyrus/gateway:latest
    ports:
      - "5001:5001"
    environment:
      - NODE_ENV=production
      - SERVICE_REGISTRY_URL=http://consul:8500
    depends_on:
      - consul
      - redis
    networks:
      - papyrus-network

  # Auth Service
  auth-service:
    image: papyrus/auth:latest
    ports:
      - "5002:5002"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=\${AUTH_DATABASE_URL}
      - JWT_SECRET=\${JWT_SECRET}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres-auth
      - redis
    networks:
      - papyrus-network

  # Page Service
  page-service:
    image: papyrus/pages:latest
    ports:
      - "5003:5003"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=\${PAGES_DATABASE_URL}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres-pages
      - redis
    networks:
      - papyrus-network

  # Search Service
  search-service:
    image: papyrus/search:latest
    ports:
      - "5004:5004"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=\${SEARCH_DATABASE_URL}
      - OPENAI_API_KEY=\${OPENAI_API_KEY}
    depends_on:
      - elasticsearch
    networks:
      - papyrus-network

  # Notification Service
  notification-service:
    image: papyrus/notifications:latest
    ports:
      - "5005:5005"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=\${NOTIFICATIONS_DATABASE_URL}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres-notifications
      - redis
    networks:
      - papyrus-network

  # File Service
  file-service:
    image: papyrus/files:latest
    ports:
      - "5006:5006"
    environment:
      - NODE_ENV=production
      - S3_BUCKET=\${S3_BUCKET}
      - S3_REGION=\${S3_REGION}
    volumes:
      - file-storage:/app/uploads
    networks:
      - papyrus-network

  # Team Service
  team-service:
    image: papyrus/teams:latest
    ports:
      - "5007:5007"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=\${TEAMS_DATABASE_URL}
    depends_on:
      - postgres-teams
    networks:
      - papyrus-network

  # Infrastructure Services
  consul:
    image: consul:latest
    ports:
      - "8500:8500"
    networks:
      - papyrus-network

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    networks:
      - papyrus-network

  elasticsearch:
    image: elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    ports:
      - "9200:9200"
    volumes:
      - es-data:/usr/share/elasticsearch/data
    networks:
      - papyrus-network

  # Databases (in production, use managed databases)
  postgres-auth:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=papyrus_auth
      - POSTGRES_USER=papyrus
      - POSTGRES_PASSWORD=\${DB_PASSWORD}
    volumes:
      - auth-db-data:/var/lib/postgresql/data
    networks:
      - papyrus-network

  postgres-pages:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=papyrus_pages
      - POSTGRES_USER=papyrus
      - POSTGRES_PASSWORD=\${DB_PASSWORD}
    volumes:
      - pages-db-data:/var/lib/postgresql/data
    networks:
      - papyrus-network

networks:
  papyrus-network:
    driver: bridge

volumes:
  redis-data:
  es-data:
  file-storage:
  auth-db-data:
  pages-db-data:
`.trim();
}

/**
 * Kubernetes deployment template generator
 */
export function generateK8sDeployment(serviceName: string, port: number): string {
  return `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${serviceName}
  labels:
    app: ${serviceName}
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ${serviceName}
  template:
    metadata:
      labels:
        app: ${serviceName}
    spec:
      containers:
      - name: ${serviceName}
        image: papyrus/${serviceName}:latest
        ports:
        - containerPort: ${port}
        env:
        - name: NODE_ENV
          value: production
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: ${port}
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: ${port}
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: ${serviceName}
spec:
  selector:
    app: ${serviceName}
  ports:
  - port: ${port}
    targetPort: ${port}
  type: ClusterIP
`.trim();
}

export default {
  registerService,
  getServiceEndpoint,
  listServices,
  checkAllServicesHealth,
  createApiGateway,
  getCircuitState,
  recordSuccess,
  recordFailure,
  canMakeRequest,
  serviceMeshConfig,
  generateDockerCompose,
  generateK8sDeployment,
};
