const https = require('https');

const SUPABASE_URL = 'https://thwdaicnysqgjszcndkl.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRod2RhaWNueXNxZ2pzemNuZGtsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzMxMDMxMiwiZXhwIjoyMDg4ODg2MzEyfQ.CYZRHU08q0VNeJqwwiO2bWHjofNdKidT9De0HFcHA5Q';

function executeSql(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sql });
    
    const options = {
      hostname: 'thwdaicnysqgjszcndkl.supabase.co',
      port: 443,
      path: '/rest/v1/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Length': data.length,
        'Prefer': 'params=single-object'
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          resolve({ raw: responseData, status: res.statusCode });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function inspectSchema() {
  console.log('=== SUPABASE DATABASE SCHEMA INSPECTION ===\n');
  console.log(`Project: thwdaicnysqgjszcndkl\n`);
  console.log('=' .repeat(80) + '\n');

  // 1. Get all tables in public schema with RLS status
  console.log('=== 1. TABLES WITH RLS STATUS ===\n');
  
  const tablesSql = `
    SELECT 
      schemaname,
      tablename,
      rowsecurity as rls_enabled
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename;
  `;

  const tablesResult = await executeSql(tablesSql);
  console.log('Tables in public schema:');
  if (Array.isArray(tablesResult)) {
    tablesResult.forEach(t => {
      console.log(`  - ${t.tablename} (RLS: ${t.rls_enabled ? 'ENABLED' : 'DISABLED'})`);
    });
  } else {
    console.log('Result:', tablesResult);
  }
  console.log('');

  // 2. Get all columns for specific tables
  console.log('=== 2. TABLE COLUMNS ===\n');
  
  const columnsSql = `
    SELECT 
      table_name,
      column_name,
      data_type,
      character_maximum_length,
      numeric_precision,
      numeric_scale,
      is_nullable,
      column_default,
      udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
  `;

  const columnsResult = await executeSql(columnsSql);
  
  const tablesOfInterest = ['profiles', 'tasks', 'time_entries', 'chat_messages', 'jobs', 'employee_locations', 'companies'];
  
  if (Array.isArray(columnsResult)) {
    const columnsByTable = {};
    columnsResult.forEach(col => {
      if (!columnsByTable[col.table_name]) {
        columnsByTable[col.table_name] = [];
      }
      columnsByTable[col.table_name].push(col);
    });

    tablesOfInterest.forEach(tableName => {
      const columns = columnsByTable[tableName];
      if (columns && columns.length > 0) {
        console.log(`\n--- ${tableName.toUpperCase()} ---`);
        columns.forEach(col => {
          let typeStr = col.data_type;
          if (col.character_maximum_length) {
            typeStr += `(${col.character_maximum_length})`;
          } else if (col.numeric_precision && col.data_type === 'numeric') {
            typeStr += `(${col.numeric_precision},${col.numeric_scale || 0})`;
          }
          const nullable = col.is_nullable === 'NO' ? ' NOT NULL' : '';
          const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
          console.log(`  - ${col.column_name}: ${typeStr}${nullable}${defaultVal}`);
        });
      } else {
        console.log(`\n--- ${tableName.toUpperCase()} --- (NOT FOUND)`);
      }
    });
  } else {
    console.log('Columns Result:', columnsResult);
  }
  console.log('');

  // 3. Get foreign key constraints
  console.log('=== 3. FOREIGN KEY CONSTRAINTS ===\n');
  
  const fkSql = `
    SELECT
      tc.constraint_name,
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      rc.update_rule,
      rc.delete_rule
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints AS rc
      ON rc.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
    ORDER BY tc.table_name, tc.constraint_name;
  `;

  const fkResult = await executeSql(fkSql);
  console.log('Foreign Key Constraints:');
  if (Array.isArray(fkResult)) {
    fkResult.forEach(fk => {
      console.log(`  - ${fk.constraint_name}`);
      console.log(`    Table: ${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`);
      console.log(`    ON UPDATE: ${fk.update_rule}, ON DELETE: ${fk.delete_rule}`);
    });
    
    // Highlight specific FKs mentioned by user
    const specificFKs = [
      'tasks_assigned_to_fkey',
      'tasks_created_by_fkey', 
      'chat_messages_sender_id_fkey',
      'employee_locations_user_id_fkey',
      'profiles_company_id_fkey'
    ];
    
    console.log('\n--- SPECIFIC FKs REQUESTED ---');
    specificFKs.forEach(fkName => {
      const found = fkResult.find(fk => fk.constraint_name === fkName);
      if (found) {
        console.log(`  ✓ ${fkName}: EXISTS`);
      } else {
        console.log(`  ✗ ${fkName}: NOT FOUND`);
      }
    });
  } else {
    console.log('FK Result:', fkResult);
  }
  console.log('');

  // 4. Get RLS policies
  console.log('=== 4. RLS POLICIES ===\n');
  
  const rlsSql = `
    SELECT
      schemaname,
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname;
  `;

  const rlsResult = await executeSql(rlsSql);
  console.log('RLS Policies:');
  if (Array.isArray(rlsResult)) {
    const policiesByTable = {};
    rlsResult.forEach(policy => {
      if (!policiesByTable[policy.tablename]) {
        policiesByTable[policy.tablename] = [];
      }
      policiesByTable[policy.tablename].push(policy);
    });

    Object.keys(policiesByTable).sort().forEach(tableName => {
      console.log(`\n--- ${tableName} ---`);
      policiesByTable[tableName].forEach(policy => {
        console.log(`  Policy: ${policy.policyname}`);
        console.log(`    Command: ${policy.cmd}, Permissive: ${policy.permissive}`);
        console.log(`    Roles: ${policy.roles.join(', ')}`);
        if (policy.qual) {
          console.log(`    USING: ${policy.qual.substring(0, 200)}${policy.qual.length > 200 ? '...' : ''}`);
        }
        if (policy.with_check) {
          console.log(`    WITH CHECK: ${policy.with_check.substring(0, 200)}${policy.with_check.length > 200 ? '...' : ''}`);
        }
        console.log('');
      });
    });
  } else {
    console.log('RLS Result:', rlsResult);
  }

  // 5. Check realtime publication
  console.log('\n=== 5. REALTIME PUBLICATION (supabase_realtime) ===\n');
  
  const realtimeSql = `
    SELECT 
      schemaname,
      tablename
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    ORDER BY tablename;
  `;

  const realtimeResult = await executeSql(realtimeSql);
  console.log('Tables in supabase_realtime publication:');
  if (Array.isArray(realtimeResult)) {
    realtimeResult.forEach(t => {
      console.log(`  - ${t.tablename}`);
    });
    
    // Check specific tables
    console.log('\n--- SPECIFIC TABLES REALTIME STATUS ---');
    tablesOfInterest.forEach(tableName => {
      const found = realtimeResult.find(t => t.tablename === tableName);
      if (found) {
        console.log(`  ✓ ${tableName}: REALTIME ENABLED`);
      } else {
        console.log(`  ✗ ${tableName}: REALTIME NOT ENABLED`);
      }
    });
  } else {
    console.log('Realtime Result:', realtimeResult);
  }
  console.log('');

  console.log('='.repeat(80));
  console.log('=== END OF SCHEMA INSPECTION ===');
}

inspectSchema().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
