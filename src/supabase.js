import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://xrnwxmwkisamxygevpgu.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhybnd4bXdraXNhbXh5Z2V2cGd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NjY5MDIsImV4cCI6MjEwMjM0MjkwMn0.GmXpYgrxSN4IlQ6pq_Q3qar__iFDIqx0yE4gWPcamgA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
