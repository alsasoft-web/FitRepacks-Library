"use client";

import React, { useState } from "react";
import { Image as MantineImage, ImageProps as MantineImageProps } from "@mantine/core";

interface CachedImageProps extends Omit<MantineImageProps, "src"> {
  src?: string;
  fallbackSrc?: string;
  alt?: string;
  height?: number | string;
  fit?: "cover" | "contain" | "fill" | "none" | "scale-down";
  className?: string;
}

export function CachedImage({
  src,
  fallbackSrc = "https://placehold.co/600x800/0f172a/3b82f6?text=No+Cover",
  alt = "Image",
  height,
  fit = "cover",
  className,
  ...rest
}: CachedImageProps) {
  const [imgSrc, setImgSrc] = useState<string>(src || fallbackSrc);
  const [hasError, setHasError] = useState<boolean>(false);

  React.useEffect(() => {
    setImgSrc(src || fallbackSrc);
    setHasError(false);
  }, [src, fallbackSrc]);

  return (
    <MantineImage
      src={imgSrc}
      alt={alt}
      h={height}
      fit={fit}
      className={className}
      onError={() => {
        if (!hasError && fallbackSrc && imgSrc !== fallbackSrc) {
          setHasError(true);
          setImgSrc(fallbackSrc);
        }
      }}
      loading="lazy"
      decoding="async"
      {...rest}
    />
  );
}
