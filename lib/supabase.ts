import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Серверный клиент Supabase (service role).
 * Используется в Server Actions / Route Handlers для операций со Storage.
 * Создаётся лениво — только когда реально нужен, чтобы не падать на этапе
 * сборки при отсутствии реальных значений переменных окружения.
 */
export function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!supabaseUrl.startsWith("https://") || !serviceRoleKey) {
    throw new Error("Supabase не настроен: проверьте NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}