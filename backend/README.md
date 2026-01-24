# TEKH Backend

This is the backend API for the TEKH project, built with Node.js, Express, and Supabase.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy `.env` and configure your environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `PRICE_TABLE`
   - `PRODUCTS_TABLE`

3. Run the server:
   ```bash
   npm start
   ```

The server will run on port 3001 by default.

## Features

- CSV data import to Supabase
- REST API endpoints