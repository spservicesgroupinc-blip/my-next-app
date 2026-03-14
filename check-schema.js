// Test script to check full Supabase schema
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function checkSchema() {
  console.log('Checking database schema...\n')

  // Check profiles table
  console.log('1. Profiles table:')
  const { data: profiles, error: profError } = await supabase
    .from('profiles')
    .select('*')
    .limit(1)
  if (profError) {
    console.log('   Error:', profError.message)
  } else {
    console.log('   Columns:', profiles && profiles.length > 0 ? Object.keys(profiles[0]).join(', ') : 'table empty')
  }

  // Check tasks table
  console.log('\n2. Tasks table:')
  const { data: tasksData, error: tasksError } = await supabase
    .from('tasks')
    .select('*')
    .limit(1)
  if (tasksError) {
    console.log('   Error:', tasksError.message)
  } else {
    console.log('   Columns:', tasksData && tasksData.length > 0 ? Object.keys(tasksData[0]).join(', ') : 'table empty')
  }

  // Check if profiles has company_id
  console.log('\n3. Checking for company_id in profiles:')
  const { data: profWithCompany, error: companyError } = await supabase
    .from('profiles')
    .select('id, company_id')
    .limit(1)
  if (companyError) {
    console.log('   Error:', companyError.message)
  } else {
    console.log('   Result:', profWithCompany)
  }
}

checkSchema().catch(console.error)
