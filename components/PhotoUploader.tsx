"use client";

import React, { useState, useRef } from "react";
import Image from "next/image";
import { Camera, Upload, X, Loader2, Check } from "lucide-react";

interface PhotoUploaderProps {
  label: string;
  angle: "front" | "side" | "back";
  uploadEndpoint: string;
  currentUrl?: string | null;
  onUploaded: (url: string | null) => void;
}

export default function PhotoUploader({
  label,
  angle,
  uploadEndpoint,
  currentUrl,
  onUploaded,
}: PhotoUploaderProps) {
  const [preview, setPreview] = useState<string | null>(currentUrl || null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validations
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file (JPEG, PNG, WebP).");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Image size exceeds 10MB limit.");
      return;
    }

    setError(null);
    setUploading(true);

    // Show temporary local preview
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("angle", angle);

      const res = await fetch(uploadEndpoint, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Upload failed");
      }

      const data = await res.json();
      setPreview(data.url);
      onUploaded(data.url);
    } catch (err: unknown) {
      console.error("Photo upload error:", err);
      setError(err instanceof Error ? err.message : "Failed to upload photo.");
      setPreview(currentUrl || null);
      onUploaded(currentUrl || null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreview(null);
    setError(null);
    onUploaded(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-zinc-400">
        {label}
      </label>

      <div
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center rounded-xl border border-dashed transition-all cursor-pointer overflow-hidden min-h-[140px] ${
          preview
            ? "border-zinc-700 bg-zinc-950"
            : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/80"
        } ${uploading ? "opacity-75 cursor-wait" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/jpg"
          onChange={handleFileChange}
          disabled={uploading}
          className="hidden"
        />

        {preview ? (
          <div className="relative w-full h-[140px] group">
            <Image
              src={preview}
              alt={label}
              fill
              className="object-cover"
              unoptimized
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <span className="text-[11px] font-medium text-white bg-zinc-900/90 px-2.5 py-1 rounded-md border border-zinc-700 flex items-center gap-1">
                <Upload className="w-3 h-3" /> Change
              </span>
              <button
                type="button"
                onClick={handleRemove}
                className="p-1 rounded-md bg-rose-900/90 text-rose-200 hover:bg-rose-800 border border-rose-700"
                title="Remove photo"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {!uploading && (
              <div className="absolute top-2 right-2 bg-emerald-500/90 text-white rounded-full p-0.5 shadow">
                <Check className="w-3 h-3" />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-4 text-center">
            <div className="w-9 h-9 rounded-full bg-zinc-800/80 flex items-center justify-center text-zinc-400 mb-2">
              <Camera className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium text-zinc-300">
              Upload {label}
            </span>
            <span className="text-[10px] text-zinc-500 mt-0.5">
              JPG, PNG, WebP up to 10MB
            </span>
          </div>
        )}

        {uploading && (
          <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-1.5 z-10">
            <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
            <span className="text-[11px] font-medium text-amber-400">
              Uploading to storage…
            </span>
          </div>
        )}
      </div>

      {error && (
        <p className="text-[11px] text-rose-400 mt-1">{error}</p>
      )}
    </div>
  );
}
