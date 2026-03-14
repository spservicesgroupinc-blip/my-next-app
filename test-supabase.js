// Test script to check Supabase connection and tasks table schema
const { createClient } = require('@supabase/supabase-js')

require('dotenv').config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables!')
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗')
  console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseKey ? '✓' : '✗')
  process.exit(1)
}

console.log('Testing Supabase connection...')
console.log('URL:', supabaseUrl)

const supabase = createClient(supabaseUrl, supabaseKey)

async function testConnection() {
  // Test 1: Check auth status
  console.log('\n1. Testing auth...')
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) {
    console.log('   Not authenticated (this is OK for anon key)')
  } else {
    console.log('   ✓ Authenticated as:', user?.email)
  }

  // Test 2: Check tasks table schema
  console.log('\n2. Checking tasks table schema...')
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .limit(1)
  
  if (error) {
    console.error('   ❌ Error querying tasks:', error.message)
    console.error('   Hint: Check if the tasks table exists and RLS policies allow access')
  } else {
    console.log('   ✓ Tasks table is accessible')
    if (data && data.length > 0) {
      console.log('   Sample task columns:', Object.keys(data[0]).join(', '))
    } else {
      console.log('   Table is empty, but accessible')
    }
  }

  // Test 3: Try to get a task with assignee join
  console.log('\n3. Testing task query with assignee join...')
  const { data: tasksWithAssignee, error: joinError } = await supabase
    .from('tasks')
    .select('*, assignee:profiles!tasks_assigned_to_fkey(id, full_name)')
    .limit(1)
  
  if (joinError) {
    console.error('   ❌ Join query failed:', joinError.message)
    console.error('   Hint: Check if the foreign key constraint exists')
  } else {
    console.log('   ✓ Join query works')
  }

  // Test 4: Check if updated_by column exists
  console.log('\n4. Checking for updated_by column...')
  const { data: sampleTask, error: sampleError } = await supabase
    .from('tasks')
    .select('id, updated_by, updated_by_name')
    .limit(1)
    .single()
  
  if (sampleError) {
    console.error('   ❌ Could not query updated_by fields:', sampleError.message)
  } else {
    console.log('   ✓ updated_by fields exist:', sampleTask)
  }

  console.log('\n✓ Connection test complete!')
}

testConnection().catch(console.error)
