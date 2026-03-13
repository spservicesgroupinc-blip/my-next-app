/**
 * Database Migration Runner
 * 
 * This script runs the SQL migration file against your Supabase database.
 * 
 * Usage: node scripts/run-migration.js
 * 
 * Requirements:
 * - SUPABASE_SERVICE_ROLE_KEY must be set in .env.local
 * - NEXT_PUBLIC_SUPABASE_URL must be set in .env.local
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables:');
  console.error('  - NEXT_PUBLIC_SUPABASE_URL');
  console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nMake sure these are set in your .env.local file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function runMigration() {
  console.log('🚀 Running database migration...\n');
  console.log(`   Project: ${supabaseUrl}\n`);

  // Read the migration SQL file
  const migrationPath = path.join(__dirname, '..', 'docs', 'migrations', '001-complete-schema-setup.sql');
  
  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  console.log('📄 Migration file:', migrationPath);
  console.log(`📏 Size: ${(sql.length / 1024).toFixed(2)} KB\n`);

  try {
    // Execute the migration using Supabase RPC
    // Note: Supabase JS client doesn't have direct SQL execution
    // We need to use the REST API directly for raw SQL
    
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/run_migration`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ sql_content: sql })
    });

    if (response.ok) {
      console.log('✅ Migration completed successfully!\n');
    } else {
      const error = await response.json();
      console.error('❌ Migration failed:', error.message || error);
      console.error('\n💡 Alternative: Run the SQL manually in Supabase Dashboard:');
      console.log('   1. Go to https://supabase.com/dashboard/project/thwdaicnysqgjszcndkl');
      console.log('   2. Navigate to SQL Editor');
      console.log('   3. Copy and paste the contents of docs/migrations/001-complete-schema-setup.sql');
      console.log('   4. Click "Run"\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Error running migration:', err.message);
    console.error('\n💡 You need to run this migration manually in Supabase Dashboard:');
    console.log('   1. Go to https://supabase.com/dashboard/project/thwdaicnysqgjszcndkl');
    console.log('   2. Navigate to SQL Editor');
    console.log('   3. Copy and paste the contents of docs/migrations/001-complete-schema-setup.sql');
    console.log('   4. Click "Run"\n');
    process.exit(1);
  }
}

// Alternative: Verify database connection and show current schema
async function verifyConnection() {
  console.log('🔍 Verifying database connection...\n');
  
  const { data, error } = await supabase
    .from('profiles')
    .select('count')
    .limit(1);
  
  if (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
  
  console.log('✅ Database connection successful!\n');
  return true;
}

async function main() {
  const connected = await verifyConnection();
  if (!connected) {
    process.exit(1);
  }
  
  await runMigration();
}

main();
