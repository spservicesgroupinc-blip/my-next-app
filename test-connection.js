const https = require('https');

// Try different key formats and endpoints
const SUPABASE_URL = 'https://thwdaicnysqgjszcndkl.supabase.co';
const SERVICE_ROLE_KEY = 'sbp_a39ed236527d5e529219fa1e8264b02bae9b8d16';

// Try using the postgres endpoint directly
function executeSqlViaPostgREST(sql) {
  return new Promise((resolve, reject) => {
    // Encode the SQL as a URL parameter for the rpc endpoint
    // We need to create a temporary function or use an existing one
    
    // Alternative: Use the query endpoint if available
    const encodedSql = encodeURIComponent(sql);
    const path = `/rest/v1/`;
    
    const data = JSON.stringify({ 
      query: sql,
      // Try as a raw SQL execution
    });
    
    const options = {
      hostname: 'thwdaicnysqgjszcndkl.supabase.co',
      port: 443,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Length': data.length,
        'Prefer': 'params=single-object'
      }
    };

    console.log('Attempting connection to:', SUPABASE_URL);
    console.log('Key prefix:', SERVICE_ROLE_KEY.substring(0, 10) + '...');

    const req = https.request(options, (res) => {
      console.log('Response Status:', res.statusCode);
      console.log('Response Headers:', JSON.stringify(res.headers, null, 2));
      
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        console.log('Response Body:', responseData);
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          resolve({ raw: responseData, status: res.statusCode });
        }
      });
    });

    req.on('error', (e) => {
      console.error('Request Error:', e);
      reject(e);
    });
    req.write(data);
    req.end();
  });
}

// Try fetching from a known table first to verify connection
function testConnection() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'thwdaicnysqgjszcndkl.supabase.co',
      port: 443,
      path: '/rest/v1/companies?select=*&limit=1',
      method: 'GET',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      console.log('\n=== TEST CONNECTION ===');
      console.log('Response Status:', res.statusCode);
      console.log('Response Headers:', JSON.stringify(res.headers, null, 2));
      
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        console.log('Response Body:', responseData);
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          resolve({ raw: responseData, status: res.statusCode });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('Testing Supabase connection...\n');
  const testResult = await testConnection();
  console.log('\nTest result:', testResult);
}

main().catch(console.error);
