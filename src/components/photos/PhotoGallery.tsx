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

      {/* Hidden file input — capture="environment" triggers camera on mobile */}
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
