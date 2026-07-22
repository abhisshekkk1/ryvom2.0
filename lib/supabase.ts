import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kfhwmkmxxdzgeeyuxizx.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_mK-ZCLEZoRQNVMpHRuyjhw_3Cb8zyg7";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);