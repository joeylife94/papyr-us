const http = require('http');

// Test dashboard API endpoints
const testEndpoints = [
  '/api/dashboard/overview',
  '/api/dashboard/team/team1',
  '/api/dashboard/member/1',
];

function testEndpoint(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5001,
      path: endpoint,
      method: 'GET',
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          endpoint,
          status: res.statusCode,
          data: data ? JSON.parse(data) : null,
        });
      });
    });

    req.on('error', (error) => {
      reject({
        endpoint,
        error: error.message,
      });
    });

    req.setTimeout(5000, () => {
      req.destroy();
      reject({
        endpoint,
        error: 'Request timeout',
      });
    });

    req.end();
  });
}

async function runTests() {
  console.log('🧪 Testing Dashboard API endpoints...\n');

  for (const endpoint of testEndpoints) {
    try {
      console.log(`Testing ${endpoint}...`);
      const result = await testEndpoint(endpoint);

      if (result.status === 200) {
        console.log(`✅ ${endpoint} - Status: ${result.status}`);
        console.log(`   Data: ${JSON.stringify(result.data, null, 2)}`);
      } else {
        console.log(`❌ ${endpoint} - Status: ${result.status}`);
        console.log(`   Response: ${JSON.stringify(result.data, null, 2)}`);
      }
    } catch (error) {
      console.log(`❌ ${endpoint} - Error: ${error.error}`);
    }
    console.log('');
  }
}

runTests().catch(console.error);
