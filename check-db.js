import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envFile = fs.readFileSync('.env', 'utf-8')
const env = Object.fromEntries(envFile.split('\n').filter(Boolean).map(line => line.split('=')))

const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function checkDb() {
  console.log('Checking Supabase connection...')
  const { data, error } = await supabase.from('users').select('*').limit(5)
  if (error) {
    console.error('Error fetching users:', error.message)
    if (error.code === '42P01') {
      console.log('Table "users" does not exist. Migration needs to be run.')
    }
  } else {
    console.log('Users found:', data.length)
    if (data.length === 0) {
      console.log('Table "users" exists but is empty. Needs seed data.')
    } else {
      console.log('Sample users:', data)
    }
  }
}

checkDb()
