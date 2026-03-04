import { createClient } from '@supabase/supabase-js';

// Fallback to the currently configured scraper project when env vars are not present.
const DEFAULT_SUPABASE_URL = 'https://qjdrzetcvhgyvjxhhutx.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_4XCsHHwc10-L-sOoe_teyQ_WIu685az';

function firstNonEmpty(...values) {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0);
}

export function createScraperSupabaseClient() {
  const supabaseUrl = firstNonEmpty(
    process.env.SCRAPER_SUPABASE_URL,
    process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    DEFAULT_SUPABASE_URL
  );

  const supabaseKey = firstNonEmpty(
    process.env.SCRAPER_SUPABASE_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    DEFAULT_SUPABASE_ANON_KEY
  );

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing Supabase credentials for scraper. Set SCRAPER_SUPABASE_URL and SCRAPER_SUPABASE_KEY.'
    );
  }

  return createClient(supabaseUrl, supabaseKey);
}
