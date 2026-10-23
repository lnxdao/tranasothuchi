import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY — kiểm tra lại Environment Variables trên Vercel (hoặc file .env khi chạy local)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
