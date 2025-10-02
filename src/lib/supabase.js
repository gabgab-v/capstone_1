import { createClient } from '@supabase/supabase-js';

// It's recommended to store these in environment variables
const supabaseUrl = 'https://vifynucfnarnaxilodsj.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpZnludWNmbmFybmF4aWxvZHNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0MDQxNDMsImV4cCI6MjA3NDk4MDE0M30.PPQQa_mUTd15WTD88gc5hy_fH4OaL97eMDDpzdV5_TE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);