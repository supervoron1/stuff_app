import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";

const BUCKET = "products";
const MAX_SIZE = 5 * 1024 * 1024; // 5 МБ

/**
 * POST /api/upload — загрузка фото товара в Supabase Storage.
 * body: FormData с полем file и productId.
 * Возвращает публичный URL фото.
 */
export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  const productId = formData.get("productId")?.toString();

  if (!(file instanceof File) || !productId) {
    return NextResponse.json({ ok: false, error: "file и productId обязательны" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ ok: false, error: "Файл больше 5 МБ" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Проверяем/создаём bucket (создание — один раз, дальше уже есть)
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    await supabase.storage.createBucket(BUCKET, { public: true });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${productId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({ ok: true, url: publicData.publicUrl });
}