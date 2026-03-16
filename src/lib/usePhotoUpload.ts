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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
