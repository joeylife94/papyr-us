/**
 * k6 Load Testing Script for Papyr.us
 * 
 * Install k6: https://k6.io/docs/getting-started/installation/
 * Run: k6 run scripts/load-test.js
 * 
 * Environment variables:
 *   BASE_URL - Target server URL (default: http://localhost:5001)
 *   VUS - Number of virtual users (default: 10)
 *   DURATION - Test duration (default: 30s)
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const pageLoadTime = new Trend('page_load_time');
const apiResponseTime = new Trend('api_response_time');

// Configuration
export const options = {
  // Stages for ramping up/down
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 users
    { duration: '1m', target: 20 },    // Stay at 20 users
    { duration: '30s', target: 50 },   // Spike to 50 users
    { duration: '1m', target: 50 },    // Stay at 50 users
    { duration: '30s', target: 0 },    // Ramp down
  ],
  
  // Thresholds for pass/fail
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],  // 95% under 500ms, 99% under 1s
    errors: ['rate<0.1'],                             // Error rate under 10%
    http_req_failed: ['rate<0.05'],                   // Request failure under 5%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5001';

// Test data
let authToken = null;
const testUser = {
  email: `loadtest_${Date.now()}@test.com`,
  password: 'TestPassword123!',
  name: 'Load Test User',
};

// Setup function - runs once before test
export function setup() {
  // Register a test user
  const registerRes = http.post(`${BASE_URL}/api/auth/register`, JSON.stringify({
    name: testUser.name,
    email: testUser.email,
    password: testUser.password,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (registerRes.status === 201 || registerRes.status === 409) {
    // Login to get token
    const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
      email: testUser.email,
      password: testUser.password,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

    if (loginRes.status === 200) {
      const body = JSON.parse(loginRes.body);
      return { token: body.accessToken || body.token };
    }
  }

  return { token: null };
}

// Main test function - runs for each VU
export default function(data) {
  const token = data.token;
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
  };

  // Test Group: Health Check
  group('Health Check', function() {
    const res = http.get(`${BASE_URL}/health`);
    
    check(res, {
      'health check status is 200': (r) => r.status === 200,
      'health check has status field': (r) => JSON.parse(r.body).status !== undefined,
    });
    
    errorRate.add(res.status !== 200);
  });

  sleep(0.5);

  // Test Group: Page Operations
  group('Wiki Pages', function() {
    // List pages
    const listRes = http.get(`${BASE_URL}/api/pages`, { headers });
    
    check(listRes, {
      'list pages status is 200': (r) => r.status === 200,
      'list pages returns array': (r) => Array.isArray(JSON.parse(r.body)),
    });
    
    apiResponseTime.add(listRes.timings.duration);
    errorRate.add(listRes.status !== 200);

    // Create page (if authenticated)
    if (token) {
      const createRes = http.post(`${BASE_URL}/api/pages`, JSON.stringify({
        title: `Load Test Page ${Date.now()}`,
        content: 'This is a load test page content.',
        tags: ['loadtest'],
      }), { headers });

      check(createRes, {
        'create page status is 201': (r) => r.status === 201,
      });
      
      if (createRes.status === 201) {
        const page = JSON.parse(createRes.body);
        
        // Read page
        const readRes = http.get(`${BASE_URL}/api/pages/${page.id}`, { headers });
        check(readRes, {
          'read page status is 200': (r) => r.status === 200,
        });
        
        pageLoadTime.add(readRes.timings.duration);

        // Update page
        const updateRes = http.patch(`${BASE_URL}/api/pages/${page.id}`, JSON.stringify({
          content: 'Updated content at ' + new Date().toISOString(),
        }), { headers });
        
        check(updateRes, {
          'update page status is 200': (r) => r.status === 200,
        });

        // Delete page (cleanup)
        const deleteRes = http.del(`${BASE_URL}/api/pages/${page.id}`, null, { headers });
        check(deleteRes, {
          'delete page status is 200 or 204': (r) => r.status === 200 || r.status === 204,
        });
      }
      
      errorRate.add(createRes.status !== 201);
    }
  });

  sleep(1);

  // Test Group: Search
  group('Search', function() {
    const searchRes = http.get(`${BASE_URL}/api/search?q=test&limit=10`, { headers });
    
    check(searchRes, {
      'search status is 200': (r) => r.status === 200,
    });
    
    apiResponseTime.add(searchRes.timings.duration);
    errorRate.add(searchRes.status !== 200);
  });

  sleep(0.5);

  // Test Group: Teams (if authenticated)
  if (token) {
    group('Teams', function() {
      const teamsRes = http.get(`${BASE_URL}/api/teams`, { headers });
      
      check(teamsRes, {
        'teams list status is 200': (r) => r.status === 200,
      });
      
      apiResponseTime.add(teamsRes.timings.duration);
      errorRate.add(teamsRes.status !== 200);
    });
  }

  sleep(0.5);
}

// Teardown function - runs once after test
export function teardown(data) {
  console.log('Load test completed');
  console.log(`Token used: ${data.token ? 'Yes' : 'No'}`);
}

// Handle test summary
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'load-test-results.json': JSON.stringify(data, null, 2),
  };
}

// Text summary helper
function textSummary(data, options) {
  const { metrics } = data;
  
  let summary = '\n========== LOAD TEST SUMMARY ==========\n\n';
  
  // Key metrics
  summary += `Total Requests: ${metrics.http_reqs?.values?.count || 0}\n`;
  summary += `Failed Requests: ${metrics.http_req_failed?.values?.passes || 0}\n`;
  summary += `Error Rate: ${((metrics.errors?.values?.rate || 0) * 100).toFixed(2)}%\n\n`;
  
  // Response times
  summary += `Response Time (avg): ${metrics.http_req_duration?.values?.avg?.toFixed(2) || 0}ms\n`;
  summary += `Response Time (p95): ${metrics.http_req_duration?.values?.['p(95)']?.toFixed(2) || 0}ms\n`;
  summary += `Response Time (p99): ${metrics.http_req_duration?.values?.['p(99)']?.toFixed(2) || 0}ms\n\n`;
  
  // Custom metrics
  summary += `API Response Time (avg): ${metrics.api_response_time?.values?.avg?.toFixed(2) || 0}ms\n`;
  summary += `Page Load Time (avg): ${metrics.page_load_time?.values?.avg?.toFixed(2) || 0}ms\n\n`;
  
  summary += '========================================\n';
  
  return summary;
}
