"use client";

import { useRef, useState, type FormEvent } from "react";

import { Modal } from "./modal";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 МБ

interface CategoryFormProps {
  open: boolean;
  onClose: () => void;
  initial?: { id: string; name: string } | null;
  onSubmit: (id: string, name: string) => Promise<void> | void;
  defaultSortOrder?: number;
}

export function CategoryForm({ open, onClose, initial, onSubmit, defaultSortOrder = 0 }: CategoryFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Введите название");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (initial) {
        await onSubmit(initial.id, name.trim());
      } else {
        await onSubmit(crypto.randomUUID(), name.trim());
      }
      onClose();
    } catch {
      setError("Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title={initial ? "Редактировать категорию" : "Новая категория"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Название</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-base outline-none focus:border-green-500 focus:ring-2 focus:ring-green-200"
            placeholder="Например: Электроника"
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-300 py-2.5 font-medium text-gray-700"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-xl bg-green-600 py-2.5 font-medium text-white disabled:opacity-50"
          >
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface ProductFormProps {
  open: boolean;
  onClose: () => void;
  categoryId: string;
  existingPhotoUrl?: string | null;
  initial?: { id: string; name: string; description: string | null } | null;
  onSubmit: (
    id: string,
    data: { name: string; description: string | null; photoUrl: string | null }
  ) => Promise<void> | void;
}

/**
 * Загрузка фото на сервер (Supabase Storage). Работает только онлайн.
 */
async function uploadPhoto(file: File, productId: string): Promise<string> {
  if (!navigator.onLine) {
    throw new Error("Загрузка фото доступна только онлайн");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("productId", productId);

  const res = await fetch("/api/upload", { method: "POST", body: formData });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? "Не удалось загрузить фото");
  }
  return data.url as string;
}

export function ProductForm({ open, onClose, categoryId, existingPhotoUrl, initial, onSubmit }: ProductFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [photoUrl, setPhotoUrl] = useState<string | null>(existingPhotoUrl ?? null);
  const [preview, setPreview] = useState<string | null>(existingPhotoUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Выберите файл изображения");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("Файл больше 5 МБ");
      return;
    }

    // Локальное превью
    setPreview(URL.createObjectURL(file));

    try {
      setUploading(true);
      const url = await uploadPhoto(file, initial?.id ?? crypto.randomUUID());
      setPhotoUrl(url);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить фото");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Введите название");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const id = initial ? initial.id : crypto.randomUUID();
      await onSubmit(id, { name: name.trim(), description: description.trim() || null, photoUrl });
      onClose();
    } catch (err) {
      console.error(err);
      setError("Не удалось сохранить товар");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title={initial ? "Редактировать товар" : "Новый товар"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Название *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-base outline-none focus:border-green-500 focus:ring-2 focus:ring-green-200"
            placeholder="Название товара"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Описание</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-base outline-none focus:border-green-500 focus:ring-2 focus:ring-green-200"
            placeholder="Необязательно"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Фото</label>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Фото товара"
              className="mb-2 h-32 w-32 rounded-xl object-cover"
            />
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || !navigator.onLine}
            className="w-full rounded-xl border border-dashed border-gray-300 py-2.5 text-sm text-gray-600 disabled:opacity-50"
          >
            {uploading ? "Загрузка..." : preview ? "Заменить фото" : "Добавить фото"}
          </button>
          {preview && (
            <button
              type="button"
              onClick={() => { setPreview(null); setPhotoUrl(null); }}
              className="mt-1 w-full text-center text-sm text-red-500"
            >
              Убрать фото
            </button>
          )}
        </div>

        <input type="hidden" name="categoryId" value={categoryId} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-300 py-2.5 font-medium text-gray-700"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-xl bg-green-600 py-2.5 font-medium text-white disabled:opacity-50"
          >
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
