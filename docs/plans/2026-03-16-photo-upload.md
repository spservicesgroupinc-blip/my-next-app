# Photo Upload Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add photo uploading (up to 5 photos per task/job, unlimited in chat) with Supabase Storage, inline thumbnail galleries, full-screen viewer, and delete support for uploaders and admins.

**Architecture:** Three Supabase Storage buckets (`task-photos`, `job-photos`, `chat-images`) with company-scoped file paths (`{company_id}/{record_id}/{uuid}-{filename}`). Two new DB tables (`task_photos`, `job_photos`) store metadata. A reusable `PhotoGallery` component handles both tasks and jobs; `ChatView` gets an image upload button that sets `image_url` on the message.

**Tech Stack:** Next.js 16 App Router, Supabase JS SDK v2 (`@supabase/ssr`), TypeScript, Tailwind CSS 4, Lucide React icons. No new npm packages required.

---

## Task 1: Database Migration — photo tables + storage buckets

**Files:**
- Create: `supabase/migrations/20260316000001_photo_tables.sql`

**Step 1: Create the migration file**

```sql
-- ─── task_photos ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_photos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      uuid        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  company_id   uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  uploader_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path text        NOT NULL,  -- e.g. "company_id/task_id/uuid-filename.jpg"
  file_name    text        NOT NULL,
  file_size    integer     NOT NULL,
  mime_type    text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_photos_task_id    ON public.task_photos(task_id);
CREATE INDEX IF NOT EXISTS idx_task_photos_company_id ON public.task_photos(company_id);

ALTER TABLE public.task_photos ENABLE ROW LEVEL SECURITY;

-- Anyone in the company can view task photos
CREATE POLICY "company_members_select_task_photos"
  ON public.task_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND company_id = task_photos.company_id
    )
  );

-- Any authenticated company member can insert
CREATE POLICY "company_members_insert_task_photos"
  ON public.task_photos FOR INSERT
  WITH CHECK (
    auth.uid() = uploader_id AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND company_id = task_photos.company_id
    )
  );

-- Uploader or admin can delete
CREATE POLICY "uploader_or_admin_delete_task_photos"
  ON public.task_photos FOR DELETE
  USING (
    auth.uid() = uploader_id OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin' AND company_id = task_photos.company_id
    )
  );

-- ─── job_photos ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_photos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id   uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  uploader_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path text        NOT NULL,
  file_name    text        NOT NULL,
  file_size    integer     NOT NULL,
  mime_type    text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_photos_job_id     ON public.job_photos(job_id);
CREATE INDEX IF NOT EXISTS idx_job_photos_company_id ON public.job_photos(company_id);

ALTER TABLE public.job_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_members_select_job_photos"
  ON public.job_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND company_id = job_photos.company_id
    )
  );

CREATE POLICY "company_members_insert_job_photos"
  ON public.job_photos FOR INSERT
  WITH CHECK (
    auth.uid() = uploader_id AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND company_id = job_photos.company_id
    )
  );

CREATE POLICY "uploader_or_admin_delete_job_photos"
  ON public.job_photos FOR DELETE
  USING (
    auth.uid() = uploader_id OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin' AND company_id = job_photos.company_id
    )
  );
```

**Step 2: Apply migration via Supabase MCP**

Use the `apply_migration` MCP tool with the SQL above and name `photo_tables`.

**Step 3: Create Storage buckets via Supabase MCP**

Run this SQL via `execute_sql` MCP:
```sql
-- Create task-photos bucket (private, 10MB limit, images only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-photos',
  'task-photos',
  false,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
) ON CONFLICT (id) DO NOTHING;

-- Create job-photos bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'job-photos',
  'job-photos',
  false,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
) ON CONFLICT (id) DO NOTHING;

-- Create chat-images bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-images',
  'chat-images',
  false,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
) ON CONFLICT (id) DO NOTHING;
```

**Step 4: Create Storage RLS policies via `execute_sql`**

```sql
-- ─── task-photos storage policies ─────────────────────────────────────────────
CREATE POLICY "task_photos_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'task-photos' AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND company_id::text = (string_to_array(name, '/'))[1]
    )
  );

CREATE POLICY "task_photos_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'task-photos' AND
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND company_id::text = (string_to_array(name, '/'))[1]
    )
  );

CREATE POLICY "task_photos_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'task-photos' AND
    (
      -- uploader is encoded in path: company_id/task_id/uploader_id/filename
      auth.uid()::text = (string_to_array(name, '/'))[3] OR
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'admin'
          AND company_id::text = (string_to_array(name, '/'))[1]
      )
    )
  );

-- ─── job-photos storage policies ──────────────────────────────────────────────
CREATE POLICY "job_photos_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'job-photos' AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND company_id::text = (string_to_array(name, '/'))[1]
    )
  );

CREATE POLICY "job_photos_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'job-photos' AND
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND company_id::text = (string_to_array(name, '/'))[1]
    )
  );

CREATE POLICY "job_photos_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'job-photos' AND
    (
      auth.uid()::text = (string_to_array(name, '/'))[3] OR
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'admin'
          AND company_id::text = (string_to_array(name, '/'))[1]
      )
    )
  );

-- ─── chat-images storage policies ─────────────────────────────────────────────
CREATE POLICY "chat_images_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'chat-images' AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND company_id::text = (string_to_array(name, '/'))[1]
    )
  );

CREATE POLICY "chat_images_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-images' AND
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND company_id::text = (string_to_array(name, '/'))[1]
    )
  );

CREATE POLICY "chat_images_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'chat-images' AND
    (
      auth.uid()::text = (string_to_array(name, '/'))[3] OR
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'admin'
          AND company_id::text = (string_to_array(name, '/'))[1]
      )
    )
  );
```

**Step 5: Commit**
```bash
git add supabase/migrations/20260316000001_photo_tables.sql
git commit -m "feat: add photo tables migration and storage bucket setup"
```

---

## Task 2: TypeScript types for photos

**Files:**
- Modify: `src/lib/types.ts`

**Step 1: Add photo types to `src/lib/types.ts`**

Append to the end of the file:
```typescript
// ─── TaskPhoto (matches public.task_photos) ───────────────────────────────────
export interface TaskPhoto {
  id: string;
  task_id: string;
  company_id: string;
  uploader_id: string;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  created_at: string;
  // Joined
  uploader?: Pick<Profile, "id" | "full_name">;
  // Computed at load time
  url?: string;
}

// ─── JobPhoto (matches public.job_photos) ─────────────────────────────────────
export interface JobPhoto {
  id: string;
  job_id: string;
  company_id: string;
  uploader_id: string;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  created_at: string;
  // Joined
  uploader?: Pick<Profile, "id" | "full_name">;
  // Computed at load time
  url?: string;
}
```

**Step 2: Commit**
```bash
git add src/lib/types.ts
git commit -m "feat: add TaskPhoto and JobPhoto types"
```

---

## Task 3: `usePhotoUpload` hook

**Files:**
- Create: `src/lib/usePhotoUpload.ts`

**Step 1: Create the hook**

```typescript
// src/lib/usePhotoUpload.ts
"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export type PhotoBucket = "task-photos" | "job-photos" | "chat-images";

export interface UploadedPhoto {
  storagePath: string;
  publicUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

const MAX_PHOTOS = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export function usePhotoUpload(bucket: PhotoBucket) {
  const supabase = createClient();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return `${file.name}: Only JPG, PNG, WebP, and HEIC images are allowed.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `${file.name}: File exceeds 10 MB limit.`;
    }
    return null;
  };

  const uploadPhoto = useCallback(
    async (
      file: File,
      companyId: string,
      recordId: string,
      uploaderId: string
    ): Promise<UploadedPhoto | null> => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return null;
      }

      setUploading(true);
      setError(null);

      try {
        const ext = file.name.split(".").pop() ?? "jpg";
        const uniqueName = `${crypto.randomUUID()}.${ext}`;
        // Path: company_id/record_id/uploader_id/filename
        const storagePath = `${companyId}/${recordId}/${uploaderId}/${uniqueName}`;

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(storagePath, file, { cacheControl: "3600", upsert: false });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);

        return {
          storagePath,
          publicUrl: urlData.publicUrl,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        };
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Upload failed");
        return null;
      } finally {
        setUploading(false);
      }
    },
    [bucket, supabase]
  );

  const deletePhoto = useCallback(
    async (storagePath: string): Promise<boolean> => {
      const { error: deleteError } = await supabase.storage
        .from(bucket)
        .remove([storagePath]);

      if (deleteError) {
        setError(deleteError.message);
        return false;
      }
      return true;
    },
    [bucket, supabase]
  );

  const getSignedUrl = useCallback(
    async (storagePath: string, expiresIn = 3600): Promise<string | null> => {
      const { data, error: urlError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(storagePath, expiresIn);

      if (urlError || !data) return null;
      return data.signedUrl;
    },
    [bucket, supabase]
  );

  return { uploadPhoto, deletePhoto, getSignedUrl, uploading, error, setError, MAX_PHOTOS };
}
```

**Step 2: Commit**
```bash
git add src/lib/usePhotoUpload.ts
git commit -m "feat: add usePhotoUpload hook for Supabase Storage"
```

---

## Task 4: `PhotoViewer` fullscreen lightbox component

**Files:**
- Create: `src/components/photos/PhotoViewer.tsx`

**Step 1: Create the component**

```typescript
// src/components/photos/PhotoViewer.tsx
"use client";

import { useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react";

interface PhotoViewerProps {
  photos: { url: string; fileName: string }[];
  initialIndex: number;
  currentIndex: number;
  onChangeIndex: (index: number) => void;
  onClose: () => void;
}

export default function PhotoViewer({
  photos,
  currentIndex,
  onChangeIndex,
  onClose,
}: PhotoViewerProps) {
  const photo = photos[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onChangeIndex(currentIndex - 1);
      if (e.key === "ArrowRight" && hasNext) onChangeIndex(currentIndex + 1);
    },
    [onClose, hasPrev, hasNext, currentIndex, onChangeIndex]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  const handleDownload = async () => {
    try {
      const response = await fetch(photo.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = photo.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(photo.url, "_blank");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/95"
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm text-white/60">
          {currentIndex + 1} / {photos.length}
        </span>
        <span className="text-sm font-medium truncate max-w-[60%]">{photo.fileName}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            title="Download"
          >
            <Download className="h-5 w-5" />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Image */}
      <div
        className="flex-1 flex items-center justify-center p-4 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {hasPrev && (
          <button
            onClick={() => onChangeIndex(currentIndex - 1)}
            className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white z-10"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={photo.fileName}
          className="max-w-full max-h-full object-contain rounded-lg select-none"
          draggable={false}
        />

        {hasNext && (
          <button
            onClick={() => onChangeIndex(currentIndex + 1)}
            className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white z-10"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      {photos.length > 1 && (
        <div
          className="flex items-center justify-center gap-2 p-3 overflow-x-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {photos.map((p, i) => (
            <button
              key={i}
              onClick={() => onChangeIndex(i)}
              className={`flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                i === currentIndex
                  ? "border-white opacity-100"
                  : "border-transparent opacity-50 hover:opacity-75"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**
```bash
git add src/components/photos/PhotoViewer.tsx
git commit -m "feat: add PhotoViewer fullscreen lightbox component"
```

---

## Task 5: `PhotoGallery` reusable component

**Files:**
- Create: `src/components/photos/PhotoGallery.tsx`

**Step 1: Create the component**

```typescript
// src/components/photos/PhotoGallery.tsx
"use client";

import { useState, useRef } from "react";
import { Camera, Trash2, ImagePlus, Loader2 } from "lucide-react";
import { TaskPhoto, JobPhoto } from "@/lib/types";
import PhotoViewer from "./PhotoViewer";

type Photo = (TaskPhoto | JobPhoto) & { url: string };

interface PhotoGalleryProps {
  photos: Photo[];
  onUpload: (files: FileList) => Promise<void>;
  onDelete: (photo: Photo) => Promise<void>;
  currentUserId: string;
  isAdmin: boolean;
  uploading: boolean;
  uploadError: string | null;
  maxPhotos?: number;
  readOnly?: boolean;
}

export default function PhotoGallery({
  photos,
  onUpload,
  onDelete,
  currentUserId,
  isAdmin,
  uploading,
  uploadError,
  maxPhotos = 5,
  readOnly = false,
}: PhotoGalleryProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canUpload = !readOnly && photos.length < maxPhotos && !uploading;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await onUpload(e.target.files);
      e.target.value = "";
    }
  };

  const handleDelete = async (e: React.MouseEvent, photo: Photo) => {
    e.stopPropagation();
    setDeletingId(photo.id);
    await onDelete(photo);
    setDeletingId(null);
  };

  const openViewer = (index: number) => {
    setViewerIndex(index);
    setViewerOpen(true);
  };

  const canDeletePhoto = (photo: Photo) =>
    isAdmin || photo.uploader_id === currentUserId;

  const viewerPhotos = photos.map((p) => ({ url: p.url!, fileName: p.file_name }));

  if (photos.length === 0 && readOnly) return null;

  return (
    <div className="space-y-2">
      {/* Grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 cursor-pointer group"
              onClick={() => openViewer(index)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.file_name}
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
              />
              {/* Delete button */}
              {canDeletePhoto(photo) && !readOnly && (
                <button
                  onClick={(e) => handleDelete(e, photo)}
                  disabled={deletingId === photo.id}
                  className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600/80"
                  title="Delete photo"
                >
                  {deletingId === photo.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
          ))}

          {/* Upload slot */}
          {canUpload && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="aspect-square rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all"
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <ImagePlus className="h-5 w-5" />
                  <span className="text-xs">Add</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Empty state / upload button */}
      {photos.length === 0 && !readOnly && (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full py-6 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all"
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <>
              <Camera className="h-6 w-6" />
              <span className="text-sm">Add photos</span>
              <span className="text-xs text-slate-300">Up to {maxPhotos} photos · 10 MB each</span>
            </>
          )}
        </button>
      )}

      {/* Counter */}
      {photos.length > 0 && !readOnly && (
        <p className="text-xs text-slate-400 text-right">
          {photos.length} / {maxPhotos} photos
        </p>
      )}

      {/* Error */}
      {uploadError && (
        <p className="text-xs text-red-500">{uploadError}</p>
      )}

      {/* Hidden file input — accept captures camera on mobile */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Lightbox */}
      {viewerOpen && (
        <PhotoViewer
          photos={viewerPhotos}
          initialIndex={viewerIndex}
          currentIndex={viewerIndex}
          onChangeIndex={setViewerIndex}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </div>
  );
}
```

**Step 2: Commit**
```bash
git add src/components/photos/PhotoGallery.tsx
git commit -m "feat: add PhotoGallery component with upload, thumbnail grid, and viewer"
```

---

## Task 6: Integrate photos into `TaskDetailDrawer`

**Files:**
- Modify: `src/components/TaskDetailDrawer.tsx`

**Context:** `TaskDetailDrawer` receives `task`, `isAdmin`, `currentUserName`. The `profile` (with `company_id`) must be passed or read from `useAuth`. Check if `useAuth` is already imported — if not, add it.

**Step 1: Add imports and photo state to TaskDetailDrawer**

At the top of `TaskDetailDrawer.tsx`, add these imports:
```typescript
import { Camera } from "lucide-react";
import { TaskPhoto } from "@/lib/types";
import { usePhotoUpload } from "@/lib/usePhotoUpload";
import PhotoGallery from "@/components/photos/PhotoGallery";
import { useAuth } from "@/contexts/AuthContext";
```

**Step 2: Add photo state and load logic inside the component**

After the existing state declarations (after `const [localTask, setLocalTask] = useState<Task>(task)`), add:

```typescript
const { profile } = useAuth();
const { uploadPhoto, deletePhoto, getSignedUrl, uploading, error: uploadError, setError: setUploadError } = usePhotoUpload("task-photos");
const [photos, setPhotos] = useState<(TaskPhoto & { url: string })[]>([]);
const [photosLoading, setPhotosLoading] = useState(false);
```

**Step 3: Add photo fetch function**

After the existing `useEffect` blocks, add:
```typescript
useEffect(() => {
  async function fetchPhotos() {
    setPhotosLoading(true);
    const { data } = await supabase
      .from("task_photos")
      .select("*")
      .eq("task_id", task.id)
      .order("created_at", { ascending: true });

    if (data) {
      const withUrls = await Promise.all(
        data.map(async (p) => {
          const url = await getSignedUrl(p.storage_path) ?? "";
          return { ...p, url };
        })
      );
      setPhotos(withUrls);
    }
    setPhotosLoading(false);
  }
  fetchPhotos();
}, [task.id, supabase, getSignedUrl]);
```

**Step 4: Add upload and delete handlers**

```typescript
const handlePhotoUpload = async (files: FileList) => {
  if (!profile) return;
  const remaining = 5 - photos.length;
  const toUpload = Array.from(files).slice(0, remaining);

  for (const file of toUpload) {
    const result = await uploadPhoto(file, profile.company_id, task.id, profile.id);
    if (!result) continue;

    const { data: inserted } = await supabase
      .from("task_photos")
      .insert({
        task_id: task.id,
        company_id: profile.company_id,
        uploader_id: profile.id,
        storage_path: result.storagePath,
        file_name: result.fileName,
        file_size: result.fileSize,
        mime_type: result.mimeType,
      })
      .select()
      .single();

    if (inserted) {
      setPhotos((prev) => [...prev, { ...inserted, url: result.publicUrl }]);
    }
  }
};

const handlePhotoDelete = async (photo: TaskPhoto & { url: string }) => {
  const ok = await deletePhoto(photo.storage_path);
  if (!ok) return;

  await supabase.from("task_photos").delete().eq("id", photo.id);
  setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
};
```

**Step 5: Add `PhotoGallery` to the JSX**

Find a good location in the drawer's JSX — after the checklist section and before the footer/close button area. Add a "Photos" section:

```tsx
{/* Photos section */}
<div className="px-5 pb-4">
  <div className="flex items-center gap-2 mb-3">
    <Camera className="h-4 w-4 text-slate-400" />
    <h3 className="text-sm font-semibold text-slate-700">Photos</h3>
    {photosLoading && (
      <span className="text-xs text-slate-400 ml-auto">Loading...</span>
    )}
  </div>
  <PhotoGallery
    photos={photos}
    onUpload={handlePhotoUpload}
    onDelete={handlePhotoDelete}
    currentUserId={profile?.id ?? ""}
    isAdmin={isAdmin}
    uploading={uploading}
    uploadError={uploadError}
    maxPhotos={5}
  />
</div>
```

**Step 6: Commit**
```bash
git add src/components/TaskDetailDrawer.tsx
git commit -m "feat: add photo gallery to TaskDetailDrawer"
```

---

## Task 7: Integrate photos into Jobs (AdminView)

**Files:**
- Modify: `src/components/AdminView.tsx`

**Context:** `AdminView.tsx` is a large component (~58KB) with a "Jobs" sub-tab. Find the section that renders individual job rows/cards. Look for the Jobs section — search for `job.name` or `job.id` in the component. The job detail is likely an inline expand or modal within the Jobs tab.

**Step 1: Add imports at the top of `AdminView.tsx`**

```typescript
import { JobPhoto } from "@/lib/types";
import { usePhotoUpload } from "@/lib/usePhotoUpload";
import PhotoGallery from "@/components/photos/PhotoGallery";
```

**Step 2: Add per-job photo state**

Since AdminView manages many jobs, use a map keyed by job ID. Add to component state:
```typescript
const [jobPhotos, setJobPhotos] = useState<Record<string, (JobPhoto & { url: string })[]>>({});
const [jobPhotosLoading, setJobPhotosLoading] = useState<Record<string, boolean>>({});
const { uploadPhoto, deletePhoto, getSignedUrl, uploading: photoUploading, error: photoError } = usePhotoUpload("job-photos");
```

**Step 3: Add fetch function for a specific job's photos**

```typescript
const fetchJobPhotos = async (jobId: string) => {
  if (jobPhotos[jobId]) return; // already loaded
  setJobPhotosLoading((prev) => ({ ...prev, [jobId]: true }));
  const { data } = await supabase
    .from("job_photos")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (data) {
    const withUrls = await Promise.all(
      data.map(async (p) => {
        const { data: urlData } = supabase.storage
          .from("job-photos")
          .getPublicUrl(p.storage_path);
        const url = urlData?.publicUrl ?? await (async () => {
          const { data: sd } = await supabase.storage
            .from("job-photos")
            .createSignedUrl(p.storage_path, 3600);
          return sd?.signedUrl ?? "";
        })();
        return { ...p, url };
      })
    );
    setJobPhotos((prev) => ({ ...prev, [jobId]: withUrls }));
  }
  setJobPhotosLoading((prev) => ({ ...prev, [jobId]: false }));
};
```

**Step 4: Add upload and delete handlers**

```typescript
const handleJobPhotoUpload = async (jobId: string, files: FileList) => {
  if (!profile) return;
  const existing = jobPhotos[jobId] ?? [];
  const remaining = 5 - existing.length;
  const toUpload = Array.from(files).slice(0, remaining);

  for (const file of toUpload) {
    const result = await uploadPhoto(file, profile.company_id, jobId, profile.id);
    if (!result) continue;

    const { data: inserted } = await supabase
      .from("job_photos")
      .insert({
        job_id: jobId,
        company_id: profile.company_id,
        uploader_id: profile.id,
        storage_path: result.storagePath,
        file_name: result.fileName,
        file_size: result.fileSize,
        mime_type: result.mimeType,
      })
      .select()
      .single();

    if (inserted) {
      setJobPhotos((prev) => ({
        ...prev,
        [jobId]: [...(prev[jobId] ?? []), { ...inserted, url: result.publicUrl }],
      }));
    }
  }
};

const handleJobPhotoDelete = async (jobId: string, photo: JobPhoto & { url: string }) => {
  const ok = await deletePhoto(photo.storage_path);
  if (!ok) return;
  await supabase.from("job_photos").delete().eq("id", photo.id);
  setJobPhotos((prev) => ({
    ...prev,
    [jobId]: (prev[jobId] ?? []).filter((p) => p.id !== photo.id),
  }));
};
```

**Step 5: Add `PhotoGallery` inside the job detail/expand area in the Jobs tab**

Find where individual jobs are rendered in the Jobs tab (look for `job.name` rendering). Add a collapsible photos section that loads when expanded:

```tsx
{/* Inside each job's expanded/detail section */}
<div className="mt-3 pt-3 border-t border-slate-100">
  <div className="flex items-center gap-2 mb-2">
    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Photos</span>
  </div>
  <PhotoGallery
    photos={jobPhotos[job.id] ?? []}
    onUpload={(files) => handleJobPhotoUpload(job.id, files)}
    onDelete={(photo) => handleJobPhotoDelete(job.id, photo as JobPhoto & { url: string })}
    currentUserId={profile?.id ?? ""}
    isAdmin={isAdmin}
    uploading={photoUploading}
    uploadError={photoError}
    maxPhotos={5}
  />
</div>
```

Call `fetchJobPhotos(job.id)` when a job row is expanded/clicked.

**Step 6: Commit**
```bash
git add src/components/AdminView.tsx
git commit -m "feat: add photo gallery to job records in AdminView"
```

---

## Task 8: Integrate image uploads into `ChatView`

**Files:**
- Modify: `src/components/ChatView.tsx`
- Modify: `src/app/page.tsx` (update `onSend` callback signature)

**Context:** `ChatView` currently has `onSend: (text: string) => void`. We need to also support sending an image. The cleanest approach: add `onSendImage: (imageUrl: string, text?: string) => void` prop. In `page.tsx`, the `handleSendMessage` function inserts into `chat_messages` — we'll add a parallel handler for images.

**Step 1: Update `ChatViewProps` interface**

```typescript
interface ChatViewProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onSendImage: (imageUrl: string, text?: string) => Promise<void>;
  currentUserId: string;
  companyId: string;
}
```

**Step 2: Add imports to ChatView.tsx**

```typescript
import { ImagePlus, X, Loader2 } from "lucide-react";
import { usePhotoUpload } from "@/lib/usePhotoUpload";
import { useAuth } from "@/contexts/AuthContext";
```

**Step 3: Add image upload state and handler inside `ChatView`**

```typescript
const { profile } = useAuth();
const { uploadPhoto, uploading: imageUploading, error: imageError, setError: setImageError } = usePhotoUpload("chat-images");
const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
const [pendingImageName, setPendingImageName] = useState<string>("");
const imageInputRef = useRef<HTMLInputElement>(null);

const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file || !profile) return;
  e.target.value = "";

  const result = await uploadPhoto(
    file,
    companyId,
    `chat-${crypto.randomUUID()}`,  // use unique ID per chat image
    profile.id
  );
  if (result) {
    setPendingImageUrl(result.publicUrl);
    setPendingImageName(file.name);
  }
};

const handleSendWithImage = async () => {
  if (!pendingImageUrl) return;
  await onSendImage(pendingImageUrl, input.trim() || undefined);
  setPendingImageUrl(null);
  setPendingImageName("");
  setInput("");
};
```

**Step 4: Update the send handler**

```typescript
const handleSend = () => {
  if (pendingImageUrl) {
    handleSendWithImage();
    return;
  }
  if (!input.trim()) return;
  onSend(input.trim());
  setInput("");
};
```

**Step 5: Add image button + preview to the input area in ChatView JSX**

Find the input/send area in ChatView's JSX. Add an image upload button next to the send button, and a preview strip above the input when an image is selected:

```tsx
{/* Image preview */}
{pendingImageUrl && (
  <div className="px-4 py-2 flex items-center gap-2 bg-blue-50 border-t border-blue-100">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={pendingImageUrl} alt="preview" className="h-12 w-12 rounded-lg object-cover border border-blue-200" />
    <span className="text-xs text-blue-600 flex-1 truncate">{pendingImageName}</span>
    <button onClick={() => { setPendingImageUrl(null); setPendingImageName(""); }} className="p-1 text-blue-400 hover:text-blue-600">
      <X className="h-4 w-4" />
    </button>
  </div>
)}

{/* Image upload button — add near send button */}
<button
  onClick={() => imageInputRef.current?.click()}
  disabled={imageUploading}
  className="p-2 rounded-xl text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
  title="Send image"
>
  {imageUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
</button>

<input
  ref={imageInputRef}
  type="file"
  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
  capture="environment"
  className="hidden"
  onChange={handleImageSelect}
/>
```

**Step 6: Render image messages in the chat feed**

Find where `message.text` is rendered in the message list. Add image rendering:

```tsx
{/* Inside each message bubble, after the text */}
{message.image_url && (
  <div className="mt-1">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      src={message.image_url}
      alt="Shared image"
      className="max-w-[240px] rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
      onClick={() => window.open(message.image_url!, "_blank")}
    />
  </div>
)}
```

**Step 7: Update `page.tsx` to add `handleSendImage`**

Find the `handleSendMessage` function in `page.tsx`. Add alongside it:

```typescript
const handleSendImage = useCallback(
  async (imageUrl: string, text?: string) => {
    if (!profile) return;
    const { error } = await supabase.from("chat_messages").insert({
      sender_id: user!.id,
      text: text ?? "",
      image_url: imageUrl,
      company_id: profile.company_id,
    });
    if (error) console.error("Failed to send image:", error);
  },
  [supabase, profile, user]
);
```

Pass `onSendImage={handleSendImage}` and `companyId={profile?.company_id ?? ""}` to `<ChatView />` in the JSX.

**Step 8: Commit**
```bash
git add src/components/ChatView.tsx src/app/page.tsx
git commit -m "feat: add image upload and display to ChatView"
```

---

## Task 9: Final verification

**Step 1: Start the dev server**
```bash
npm run dev
```

**Step 2: Verify task photos**
- Open a task detail drawer
- Upload 1-2 photos (should show thumbnail grid)
- Click a thumbnail — lightbox opens with nav arrows and download
- Delete a photo (hover to reveal delete button)
- Confirm 5-photo cap

**Step 3: Verify job photos**
- Go to Admin → Jobs tab
- Expand a job
- Upload photos, view, delete

**Step 4: Verify chat images**
- Go to Chat tab
- Click the image icon in the input area
- Select an image — preview strip appears above input
- Send — image appears in the message feed

**Step 5: Commit**
```bash
git add -A
git commit -m "feat: complete photo upload feature across tasks, jobs, and chat"
```
