const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspectSchema() {
  console.log('=== SUPABASE DATABASE SCHEMA INSPECTION ===\n');
  console.log(`Project: ${process.env.NEXT_PUBLIC_SUPABASE_URL}\n`);
  console.log('='.repeat(80) + '\n');

  // Get all tables
  console.log('=== 1. ALL TABLES ===\n');
  
  const { data: tables, error: tablesError } = await supabase
    .from('pg_tables')
    .select('schemaname, tablename, rowsecurity')
    .eq('schemaname', 'public');
    
  if (tablesError) {
    console.log('Error fetching tables:', tablesError.message);
  } else {
    console.log('Tables in public schema:');
    tables?.forEach(t => {
      console.log(`  - ${t.tablename} (RLS: ${t.rowsecurity ? 'ENABLED' : 'DISABLED'})`);
    });
  }
  console.log('');

  // Get columns for key tables
  console.log('=== 2. KEY TABLE COLUMNS ===\n');
  
  const tablesOfInterest = ['profiles', 'time_entries', 'companies', 'tasks', 'jobs', 'chat_messages'];
  
  for (const tableName of tablesOfInterest) {
    console.log(`\n--- ${tableName.toUpperCase()} ---`);
    
    const { data: columns, error } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, character_maximum_length, numeric_precision, is_nullable, column_default')
      .eq('table_schema', 'public')
      .eq('table_name', tableName)
      .order('ordinal_position');
      
    if (error) {
      console.log(`  Error: ${error.message}`);
    } else if (columns && columns.length > 0) {
      columns.forEach(col => {
        let typeStr = col.data_type;
        if (col.character_maximum_length) {
          typeStr += `(${col.character_maximum_length})`;
        } else if (col.numeric_precision && col.data_type === 'numeric') {
          typeStr += `(${col.numeric_precision},${col.numeric_scale || 0})`;
        }
        const nullable = col.is_nullable === 'NO' ? ' NOT NULL' : '';
        console.log(`  - ${col.column_name}: ${typeStr}${nullable}`);
      });
    } else {
      console.log('  (table not found or empty)');
    }
  }
  console.log('');

  // Check for time-related tables specifically
  console.log('=== 3. TIME-RELATED TABLES ===\n');
  
  const timeTables = ['time_entries', 'time_clock_entries', 'time_logs', 'attendance', 'timesheets'];
  
  for (const tableName of timeTables) {
    const { data: exists, error } = await supabase
      .from(tableName)
      .select('count')
      .limit(1);
      
    if (error && error.message.includes('does not exist')) {
      console.log(`  ✗ ${tableName}: DOES NOT EXIST`);
    } else if (error) {
      console.log(`  ? ${tableName}: ERROR - ${error.message}`);
    } else {
      console.log(`  ✓ ${tableName}: EXISTS`);
      
      // Get columns
      const { data: cols } = await supabase
        .from('information_schema.columns')
        .select('column_name, data_type, is_nullable')
        .eq('table_schema', 'public')
        .eq('table_name', tableName);
        
      if (cols) {
        cols.forEach(col => {
          const nullable = col.is_nullable === 'NO' ? ' NOT NULL' : '';
          console.log(`    - ${col.column_name}: ${col.data_type}${nullable}`);
        });
      }
    }
  }
  console.log('');

  console.log('='.repeat(80));
  console.log('=== END OF SCHEMA INSPECTION ===');
}

inspectSchema().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
