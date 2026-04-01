import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envFile = fs.readFileSync('.env', 'utf-8')
const env = Object.fromEntries(envFile.split('\n').filter(Boolean).map(line => line.split('=')))

const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function updateAdmin() {
  console.log('Updating superadmin credentials...')
  
  // First, let's create the new admin user
  const newAdmin = { 
    id: 'author@binar.edu', 
    password: 'pengurus@binar.21', 
    name: 'Pengurus Binar', 
    kelas: null, 
    role: 'SUPERADMIN' 
  }

  const { data: insertData, error: insertError } = await supabase.from('users').upsert(newAdmin).select()
  
  if (insertError) {
    console.error('Error creating new admin:', insertError.message)
    return
  }
  
  console.log('Successfully created new admin:', insertData[0].id)

  // Now, let's try to delete the old 'admin' user if it exists
  const { error: deleteError } = await supabase.from('users').delete().eq('id', 'admin')
  
  if (deleteError) {
    console.error('Note: Could not delete old "admin" user (might be referenced elsewhere or already deleted):', deleteError.message)
  } else {
    console.log('Successfully removed old "admin" user')
  }

  console.log('Done!')
}

updateAdmin()
