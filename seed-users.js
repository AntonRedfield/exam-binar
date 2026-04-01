import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envFile = fs.readFileSync('.env', 'utf-8')
const env = Object.fromEntries(envFile.split('\n').filter(Boolean).map(line => line.split('=')))

const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseAnonKey)

const defaultUsers = [
  {
    id: 'admin',
    password: 'admin',
    name: 'Super Admin',
    kelas: null,
    role: 'SUPERADMIN'
  },
  {
    id: 'guru1',
    password: 'guru',
    name: 'Guru Matematika',
    kelas: null,
    role: 'TEACHER'
  },
  {
    id: 'siswa1@murid.binar',
    password: null,
    name: 'Siswa Contoh',
    kelas: 'X IPA 1',
    role: 'USER'
  }
]

async function seed() {
  console.log('Seeding users...')
  const { data, error } = await supabase.from('users').upsert(defaultUsers).select()
  if (error) {
    console.error('Error seeding users:', error.message)
  } else {
    console.log('Successfully seeded users:', data.length)
  }
}

seed()
