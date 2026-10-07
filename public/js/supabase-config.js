const SUPABASE_URL = 'https://oscddsxoeozyxsceegqh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zY2Rkc3hvZW96eXhzY2VlZ3FoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MjY5NjksImV4cCI6MjA5MzIwMjk2OX0.TCaJt2m_uJsO0TIArIV0cmeiCVeLmZBgQbZmNXDbhow';

window.SUPABASE_CONFIG = {
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
};

if (window.supabase?.createClient) {
  window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else if (typeof supabase !== 'undefined' && supabase?.createClient) {
  window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
