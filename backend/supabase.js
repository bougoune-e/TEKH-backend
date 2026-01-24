import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PRICE_TABLE, PRODUCTS_TABLE } = process.env;

console.log('SUPABASE_URL:', SUPABASE_URL);
console.log('SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'not set');
console.log('All env:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[API] Supabase non configuré: définissez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env');
}

export const supabase = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

export const TABLE_PRICES = PRICE_TABLE || 'prix_telephones';
export const TABLE_PRODUCTS = PRODUCTS_TABLE || 'produits';
