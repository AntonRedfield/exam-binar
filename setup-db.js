import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envFile = fs.readFileSync('.env', 'utf-8')
const env = Object.fromEntries(envFile.split('\n').filter(Boolean).map(line => line.split('=')))

const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function runMigration() {
  console.log('Running Supabase Database Setup...')
  
  // We cannot run raw SQL via the supabase-js client anon key without an RPC function
  // But we can check if tables exist by querying them.
  const { error: usersError } = await supabase.from('users').select('id').limit(1)
  
  if (usersError && usersError.code === '42P01') {
    console.error('ERROR: Tables do not exist!')
    console.error('Unfortunately, raw SQL migrations (CREATE TABLE) cannot be executed via the Supabase Javascript client using only the anon key.')
    console.error('You must run `supabase/migration.sql` manually in the Supabase SQL Editor at https://supabase.com/dashboard/project/_/sql/new')
    process.exit(1)
  } else {
    console.log('Tables exist. Proceeding to seed users...')
  }

  const defaultUsers = [
    { id: 'admin', password: 'admin', name: 'Super Admin', kelas: null, role: 'SUPERADMIN' },
    { id: 'guru1', password: 'guru', name: 'Guru Matematika', kelas: null, role: 'TEACHER' },
    { id: 'siswa1@murid.binar', password: null, name: 'Siswa Contoh', kelas: 'X IPA 1', role: 'USER' }
  ]

  const { data, error } = await supabase.from('users').upsert(defaultUsers).select()
  if (error) {
    console.error('Error seeding users:', error.message)
  } else {
    console.log('Successfully seeded users:', data.length)
  }
}

runMigration()
