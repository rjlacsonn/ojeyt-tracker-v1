const SUPABASE_URL = 'https://oscddsxoeozyxsceegqh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_nsBMRKvpL7ueqHFt7nP-bw_j8qkh8OR';

window.SUPABASE_CONFIG = {
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
};

if (window.supabase?.createClient) {
  window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else if (typeof supabase !== 'undefined' && supabase?.createClient) {
  window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
