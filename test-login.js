import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envFile = fs.readFileSync('.env', 'utf-8')
const env = Object.fromEntries(envFile.split('\n').filter(Boolean).map(line => line.split('=')))

const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testLogin(id, password) {
  console.log(`Testing login for ${id}...`)
  
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !user) {
    console.error('FAILED: ID not found. Error:', error?.message)
    return
  }

  console.log('User found in DB:', user)

  if (user.password !== password) {
    console.error(`FAILED: Password does not match. Expected "${user.password}", got "${password}"`)
    return
  }

  console.log('SUCCESS: Login validated correctly.')
}

testLogin('author@binar.edu', 'pengurus@binar.21')
