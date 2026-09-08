"use client";

import React, { useState } from "react";
import Image from "next/image";
import { ImageSelectionModal } from "./ImageSelectionModal";
import {
  Button,
  ActionIcon,
} from "@/components/organization/organization-operation-ui";
import { ImagePlus, Pencil, Trash2 } from "lucide-react";

interface ImageUploaderProps {
  currentImageUrl?: string;
  className?: string;
  placeholder?: string;
  previewHeight?: number;
  onChange?: (fileId: string, url: string) => void;
  readOnly?: boolean;
}

export function ImageUploader({
  currentImageUrl,
  className,
  placeholder = "Click to select image",
  previewHeight = 160,
  onChange,
  readOnly = false,
}: ImageUploaderProps) {
  const [opened, setOpened] = useState(false);
  const [internalImageUrl, setInternalImageUrl] = useState("");
  const selectedImageUrl = currentImageUrl ?? internalImageUrl;
  const selectImage = (fileId: string, url: string) => {
    if (readOnly) return;
    setInternalImageUrl(url);
    onChange?.(fileId, url);
  };

  return (
    <>
      <div className={className}>
        {selectedImageUrl ? (
          <div className="relative">
            <Image
              src={selectedImageUrl}
              alt="Selected image"
              width={640}
              height={previewHeight}
              unoptimized
              className="border-border org-radius-surface w-full border object-cover"
              style={{ height: previewHeight }}
            />
            {!readOnly && (
              <div className="absolute top-2 right-2 flex gap-2">
                <ActionIcon
                  variant="default"
                  aria-label="Change image"
                  title="Change image"
                  onClick={() => setOpened(true)}
                >
                  <Pencil aria-hidden="true" size={16} />
                </ActionIcon>
                <ActionIcon
                  color="red"
                  aria-label="Remove image"
                  title="Remove image"
                  onClick={() => selectImage("", "")}
                >
                  <Trash2 aria-hidden="true" size={16} />
                </ActionIcon>
              </div>
            )}
          </div>
        ) : (
          <div
            className="border-border bg-background org-radius-surface flex flex-col items-center justify-center gap-2 border border-dashed p-4"
            style={{ minHeight: previewHeight }}
          >
            <ImagePlus aria-hidden="true" size={32} />
            <Button
              variant="light"
              onClick={() => setOpened(true)}
              disabled={readOnly}
            >
              Select image
            </Button>
            <p className="text-muted-foreground text-xs">{placeholder}</p>
          </div>
        )}
      </div>
      <ImageSelectionModal
        isOpen={opened && !readOnly}
        onClose={() => setOpened(false)}
        onSelect={selectImage}
      />
    </>
  );
}
