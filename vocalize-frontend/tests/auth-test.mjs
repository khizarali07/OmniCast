import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase environment variables. Please check .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runTests() {
  console.log('Testing Supabase Authentication...\n');

  const testEmail = `test_${Date.now()}@example.com`;
  const testPassword = 'TestPassword123!';
  const testFullName = 'John Doe Tester';

  console.log(`1. Testing Signup with Full Name`);
  console.log(`   Email: ${testEmail}`);
  console.log(`   Name:  ${testFullName}`);
  
  const { data: signupData, error: signupError } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
    options: {
      data: {
        full_name: testFullName,
      }
    }
  });

  if (signupError) {
    console.error('❌ Signup failed:', signupError.message);
    if (supabaseUrl === 'https://your-project-id.supabase.co') {
      console.log('💡 HINT: You are using the placeholder "https://your-project-id.supabase.co" URL. You must replace this with your real Supabase project URL in .env.local!');
    }
    process.exit(1);
  }

  console.log('✅ Signup successful!');
  console.log('   User ID:', signupData?.user?.id);
  console.log('   Metadata full_name:', signupData?.user?.user_metadata?.full_name);

  console.log('\n2. Testing Login');
  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (loginError) {
    console.error('❌ Login failed:', loginError.message);
    process.exit(1);
  }

  console.log('✅ Login successful!');
  
  if (serviceRoleKey) {
    console.log('\n3. Cleaning up (deleting test user)...');
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(signupData.user.id);
    if (deleteError) {
      console.error('❌ Failed to delete test user:', deleteError.message);
    } else {
      console.log('✅ Test user deleted successfully.');
    }
  }

  console.log('\nAll tests passed successfully! 🎉');
}

runTests();
