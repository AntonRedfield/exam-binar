import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envFile = fs.readFileSync('.env', 'utf-8')
const env = Object.fromEntries(envFile.split('\n').filter(Boolean).map(line => line.split('=')))

const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function fixAdmin() {
  console.log('Fixing duplicate author@binar.edu entries...')
  
  // 1. Delete all existing users with this ID
  const { error: delError } = await supabase.from('users').delete().eq('id', 'author@binar.edu')
  if (delError) {
    console.error('Failed to delete duplicates:', delError)
  } else {
    console.log('Deleted duplicate entries.')
  }

  // 2. Insert exactly one record
  const newAdmin = { 
    id: 'author@binar.edu', 
    password: 'pengurus@binar.21', 
    name: 'Pengurus Binar', 
    kelas: null, 
    role: 'SUPERADMIN' 
  }

  const { data: insertData, error: insertError } = await supabase.from('users').insert([newAdmin]).select()
  
  if (insertError) {
    console.error('Error creating single admin:', insertError.message)
  } else {
    console.log('Successfully created ONE new admin:', insertData[0].id)
  }
}

fixAdmin()
