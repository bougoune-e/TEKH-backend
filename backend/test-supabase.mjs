import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load local env first, then default .env
try { dotenv.config({ path: '.env.local' }); } catch {}
try { dotenv.config(); } catch {}

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const pricesTableEnv = process.env.VITE_PRICES_TABLE;
const apiUrl = process.env.VITE_API_URL || 'http://localhost:3001';

async function main() {
  console.log('--- Supabase connectivity test ---');
  if (!url || !anonKey) {
    console.error('Supabase not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local');
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(url, anonKey, { auth: { persistSession: false } });
  console.log('Environment OK. Attempting to query candidate tables...');

  const candidates = Array.from(new Set([
    pricesTableEnv,
    'prix_telephones',
    'tab_cleaned',
    'tab_cleaned_csv',
    'produits',
  ].filter(Boolean)));

  for (const table of candidates) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(5);
      if (error) {
        console.log(`[${table}] error:`, error.message);
        continue;
      }
      const rows = data || [];
      if (rows.length === 0) {
        console.log(`[${table}] accessible but returned 0 rows`);
        // Still acceptable to derive columns if PostgREST returns no rows. Try head request for columns via limit 0
        const { data: d2, error: e2 } = await supabase.from(table).select('*').limit(1);
        if (!e2 && Array.isArray(d2) && d2[0]) {
          const cols = Object.keys(d2[0]);
          console.log(`[${table}] columns:`, cols.join(', '));
        }
        continue;
      }
      const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
      console.log('Supabase connection: OK');
      console.log(`Table '${table}' accessible. First ${rows.length} rows fetched.`);
      console.log('Detected columns:', columns.join(', '));
      return;
    } catch (e) {
      console.log(`[${table}] unexpected error:`, e?.message || String(e));
    }
  }

  console.error('No candidate table was accessible. Check table name or RLS policies.');
  // Fallback to local API to show dataset columns if available
  try {
    const res = await fetch(`${apiUrl}/produits`);
    if (res.ok) {
      const rows = await res.json();
      const subset = (rows || []).slice(0, 5);
      console.log(`API fallback OK from ${apiUrl}/produits. First ${subset.length} rows.`);
      if (subset.length > 0) {
        const cols = Array.from(new Set(subset.flatMap((r) => Object.keys(r))));
        console.log('Detected columns (API):', cols.join(', '));
      }
    } else {
      console.log(`API fallback failed with status ${res.status}`);
    }
  } catch (e) {
    console.log('API fallback error:', e?.message || String(e));
  }
  process.exitCode = 2;
}

main();
