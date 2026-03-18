"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";

type GalleryImage = {
  id?: string;
  url: string;
};

type Props = {
  images?: GalleryImage[];
  name: string;
  containerClassName?: string;
  imageClassName?: string;
  emptyClassName?: string;
  lazy?: boolean;
  imageCount?: number;
  onLoadGallery?: () => Promise<void>;
};

export function ItemImageViewer({
  images = [],
  name,
  containerClassName = "",
  imageClassName = "",
  emptyClassName = "",
  lazy = false,
  imageCount,
  onLoadGallery,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMounted, setIsMounted] = useState(false);

  const hasImages = images.length > 0;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }

      if (images.length > 1 && event.key === "ArrowLeft") {
        setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
      }

      if (images.length > 1 && event.key === "ArrowRight") {
        setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [images.length, isOpen]);

  useEffect(() => {
    if (!isOpen || !isMounted) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMounted, isOpen]);

  const openAt = (index: number) => {
    setCurrentIndex(index);
    setIsOpen(true);
    if (onLoadGallery && images.length < (imageCount ?? images.length)) {
      onLoadGallery().catch(() => {});
    }
  };

  const closeViewer = () => {
    setIsOpen(false);
  };

  const showPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const showNext = () => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  if (!hasImages) {
    return <div className={emptyClassName} />;
  }

  return (
    <>
      <button
        type="button"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openAt(0);
        }}
        className={["relative overflow-hidden", containerClassName].join(" ").trim()}
      >
        <img
          src={images[0].url}
          alt={name}
          className={imageClassName}
          loading={lazy ? "lazy" : undefined}
        />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 via-black/20 to-transparent px-3 py-2 text-white">
          <span className="inline-flex items-center gap-1 text-xs font-medium">
            <Expand size={12} />
            Ver foto
          </span>

          {((imageCount ?? images.length) > 1) && (
            <span className="rounded-full bg-black/60 px-2 py-1 text-[11px] font-semibold">
              {imageCount ?? images.length} fotos
            </span>
          )}
        </div>
      </button>

      {isMounted && isOpen && createPortal(
        <div
          className="fixed inset-0 z-[80] bg-black/90 px-4 py-6"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            closeViewer();
          }}
        >
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              closeViewer();
            }}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur"
            aria-label="Cerrar visor"
          >
            <X size={20} />
          </button>

          <div
            className="mx-auto flex h-full w-full max-w-5xl flex-col justify-center"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <div className="relative flex min-h-0 flex-1 items-center justify-center">
              {images.length > 1 && (
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    showPrevious();
                  }}
                  className="absolute left-0 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur md:left-4"
                  aria-label="Imagen anterior"
                >
                  <ChevronLeft size={22} />
                </button>
              )}

              <img
                src={images[currentIndex].url}
                alt={`${name} ${currentIndex + 1}`}
                className="max-h-full max-w-full rounded-2xl object-contain"
              />

              {images.length > 1 && (
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    showNext();
                  }}
                  className="absolute right-0 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur md:right-4"
                  aria-label="Siguiente imagen"
                >
                  <ChevronRight size={22} />
                </button>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between text-sm text-white/80">
              <span className="truncate pr-4 font-medium">{name}</span>
              <span>{currentIndex + 1} / {images.length}</span>
            </div>

            {images.length > 1 && (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {images.map((image, index) => (
                  <button
                    key={image.id ?? image.url}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openAt(index);
                    }}
                    className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border ${
                      index === currentIndex ? "border-white" : "border-white/20"
                    }`}
                    aria-label={`Ver imagen ${index + 1}`}
                  >
                    <img
                      src={image.url}
                      alt={`${name} miniatura ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
