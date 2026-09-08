"use client";

import React, { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus } from "lucide-react";
import { userService } from "@/lib/userService";
import { useApp } from "@/app/providers";
import {
  IMAGE_UPLOAD_ACCEPT,
  isSupportedImageUpload,
} from "@/lib/imageUploadPolicy";
import {
  Modal,
  Button,
  Alert,
  Group,
  Stack,
} from "@/components/organization/organization-operation-ui";

interface ImageSelectionModalProps {
  onSelect: (fileId: string, url: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

const previewUrl = (id: string, size: number) =>
  `/api/files/${encodeURIComponent(id)}/preview?w=${size}&h=${size}&fit=cover`;

function imageUploadError(file: File): string | null {
  if (file.size > 10 * 1024 * 1024) return "File size must be less than 10MB";
  if (!isSupportedImageUpload(file.type, file.name))
    return "Please select a PNG, JPEG, WebP, AVIF, or SVG image";
  return null;
}

async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/files/upload", {
    method: "POST",
    body: form,
    credentials: "include",
  });
  if (!response.ok) throw new Error("Upload failed");
  const payload = await response.json();
  const fileId = payload?.file?.id;
  if (typeof fileId !== "string" || !fileId.trim())
    throw new Error("The upload did not return an image identifier.");
  return fileId;
}

function ImageChoices({
  ids,
  onSelect,
  disabled,
}: {
  ids: string[];
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {ids.map((id, index) => (
        <button
          key={id}
          type="button"
          disabled={disabled}
          aria-label={`Select uploaded image ${index + 1}`}
          onClick={() => onSelect(id)}
          className="border-border bg-background org-radius-surface focus-visible:ring-ring relative aspect-square min-h-11 overflow-hidden border focus-visible:ring-[3px] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Image
            src={previewUrl(id, 240)}
            alt=""
            fill
            unoptimized
            sizes="240px"
            className="object-cover"
          />
        </button>
      ))}
    </div>
  );
}

export function ImageSelectionModal({
  onSelect,
  onClose,
  isOpen,
}: ImageSelectionModalProps) {
  const { refreshUser, user } = useApp();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const uploadedImages = user?.uploadedImages ?? [];
  const close = () => {
    if (!pending.current) onClose();
  };
  const selectExisting = (id: string) => {
    if (pending.current) return;
    onSelect(id, previewUrl(id, 240));
    onClose();
  };

  async function handleUpload(file: File) {
    if (pending.current) return;
    const validationError = imageUploadError(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!user) {
      setError("Sign in before uploading an image.");
      return;
    }
    pending.current = true;
    setUploading(true);
    setError(null);
    try {
      const fileId = await uploadImage(file);
      await userService.updateUser(user.$id, {
        uploadedImages: [...uploadedImages, fileId],
      });
      try {
        await refreshUser();
      } catch {
        /* The saved image remains available for selection. */
      }
      onSelect(fileId, previewUrl(fileId, 640));
      onClose();
    } catch {
      setError("Failed to upload image. Please try again.");
    } finally {
      pending.current = false;
      setUploading(false);
    }
  }

  return (
    <Modal
      opened={isOpen}
      onClose={close}
      title="Select image"
      size="xl"
      centered
    >
      <Stack gap="md">
        {error && <Alert color="red">{error}</Alert>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="border-input bg-background org-radius-control focus-within:ring-ring relative inline-flex min-h-11 items-center gap-2 border px-3 py-2 text-sm font-medium focus-within:ring-[3px]">
            <ImagePlus aria-hidden="true" size={18} />
            Upload new image
            <input
              type="file"
              aria-label="Upload new image"
              accept={IMAGE_UPLOAD_ACCEPT}
              disabled={uploading}
              className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void handleUpload(file);
              }}
            />
          </label>
          <p className="text-muted-foreground text-sm">
            Max 10MB, PNG/JPEG/WebP/AVIF/SVG
          </p>
        </div>
        {uploading && (
          <p role="status" className="text-muted-foreground text-sm">
            Uploading…
          </p>
        )}
        <ImageChoices
          ids={uploadedImages}
          onSelect={selectExisting}
          disabled={uploading}
        />
        {uploadedImages.length === 0 && (
          <p className="text-muted-foreground text-center text-sm">
            No images uploaded yet. Upload your first image!
          </p>
        )}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={close} disabled={uploading}>
            Close
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
