const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspectTables() {
  console.log('=== SUPABASE TABLE INSPECTION ===\n');

  const tablesToCheck = ['profiles', 'time_entries', 'companies', 'tasks', 'jobs', 'chat_messages'];
  
  for (const tableName of tablesToCheck) {
    console.log(`\n=== ${tableName.toUpperCase()} ===`);
    
    // Try to select one row to see structure
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1);
      
    if (error) {
      console.log(`Error: ${error.message}`);
    } else if (data && data.length > 0) {
      console.log('Columns:', Object.keys(data[0]).join(', '));
      console.log('Sample:', JSON.stringify(data[0], null, 2));
    } else {
      console.log('Table exists but is empty');
      // Try to get column names via a different method
      const { error: insertError } = await supabase
        .from(tableName)
        .select('count')
        .limit(1);
      if (insertError) {
        console.log('Error checking:', insertError.message);
      }
    }
  }
  
  // Specifically check time_entries structure
  console.log('\n\n=== DETAILED TIME_ENTRIES CHECK ===');
  const { data: timeData, error: timeError } = await supabase
    .from('time_entries')
    .select('*')
    .limit(5);
    
  if (timeError) {
    console.log('Error:', timeError.message);
  } else if (timeData && timeData.length > 0) {
    console.log('Sample time entries:');
    timeData.forEach((entry, idx) => {
      console.log(`\nEntry ${idx + 1}:`, JSON.stringify(entry, null, 2));
    });
  } else {
    console.log('time_entries table is empty');
  }
  
  // Check profiles for employee info
  console.log('\n\n=== PROFILES CHECK ===');
  const { data: profilesData, error: profilesError } = await supabase
    .from('profiles')
    .select('*')
    .limit(5);
    
  if (profilesError) {
    console.log('Error:', profilesError.message);
  } else if (profilesData && profilesData.length > 0) {
    console.log('Sample profiles:');
    profilesData.forEach((profile, idx) => {
      console.log(`\nProfile ${idx + 1}:`, JSON.stringify(profile, null, 2));
    });
  } else {
    console.log('profiles table is empty');
  }
}

inspectTables().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
