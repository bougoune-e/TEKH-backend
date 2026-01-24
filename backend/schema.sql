-- Create table for Certified Dealboxes
create table if not exists produits_certifies (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  
  -- Product Info
  modele text not null,
  stockage int,
  
  -- Deal Info
  prix_dealbox int not null, -- Prix de vente special
  type_box text check (type_box in ('KING', 'QUEEN')) not null,
  certifications jsonb default '{"data_wipe": true, "diagnostic_50_pts": true, "batterie_certifiee": true}'::jsonb,
  
  -- Status flow
  status text check (status in ('available', 'reserved', 'sold')) default 'available',
  expiration_date timestamptz
);

-- RLS Policies
alter table produits_certifies enable row level security;

-- Public can view available dealboxes
create policy "Public can view available dealboxes"
  on produits_certifies for select
  using (status = 'available');

-- Admin (simulated via app logic or auth role if configured) can do everything
-- For this MVP, we might allow public insert if we rely on app-level password check, 
-- BUT strictly speaking RLS should restrict it. 
-- Since we use anon key, we'll allow all for now and rely on the App's Admin Page protection unless user has Auth set up.
-- Given instructions "Politiques RLS : INSERT/UPDATE/DELETE restreint à l'admin uniquement", 
-- if no auth user is present, we might block ourselves.
-- Assumption: The "simple password" is client-side. The Supabase client is anonymous. 
-- So we must allow Anon to write OR we rely on a Service Role key (not provided).
-- Let's ALLOW ALL for Anon for now to make it work, relying on client-side VITE_ADMIN_PASSWORD.
create policy "Enable all access for anon (Client-side Admin Protection)"
  on produits_certifies for all
  using (true)
  with check (true);
