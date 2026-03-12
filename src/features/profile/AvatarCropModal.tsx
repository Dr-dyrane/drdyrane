import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Scissors, X } from 'lucide-react';
import { OverlayPortal } from '../../components/shared/OverlayPortal';

interface AvatarCropModalProps {
  isOpen: boolean;
  imageDataUrl: string | null;
  onClose: () => void;
  onSkipCrop: () => void;
  onConfirmCrop: (croppedDataUrl: string) => void;
}

export const AvatarCropModal: React.FC<AvatarCropModalProps> = ({
  isOpen,
  imageDataUrl,
  onClose,
  onSkipCrop,
  onConfirmCrop,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState(1.15);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });

  useEffect(() => {
    if (!imageDataUrl || !isOpen) return;
    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.width, height: img.height });
      setZoom(1.15);
      setOffsetX(0);
      setOffsetY(0);
    };
    img.src = imageDataUrl;
  }, [imageDataUrl, isOpen]);

  const previewStyle = useMemo(() => {
    const x = 50 + offsetX;
    const y = 50 + offsetY;
    return {
      backgroundImage: imageDataUrl ? `url(${imageDataUrl})` : undefined,
      backgroundPosition: `${x}% ${y}%`,
      backgroundSize: `${zoom * 100}%`,
    };
  }, [imageDataUrl, offsetX, offsetY, zoom]);

  const confirmCrop = () => {
    if (!imageDataUrl || !canvasRef.current) return;
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const outputSize = 512;
      canvas.width = outputSize;
      canvas.height = outputSize;

      const minSide = Math.min(img.width, img.height);
      const cropSize = minSide / zoom;
      const maxX = img.width - cropSize;
      const maxY = img.height - cropSize;

      const normalizedX = Math.max(0, Math.min(1, (offsetX + 50) / 100));
      const normalizedY = Math.max(0, Math.min(1, (offsetY + 50) / 100));
      const srcX = maxX * normalizedX;
      const srcY = maxY * normalizedY;

      ctx.drawImage(
        img,
        srcX,
        srcY,
        cropSize,
        cropSize,
        0,
        0,
        outputSize,
        outputSize
      );

      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      onConfirmCrop(dataUrl);
    };
    img.src = imageDataUrl;
  };

  return (
    <OverlayPortal>
      <AnimatePresence>
        {isOpen && imageDataUrl && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 z-[170] overlay-backdrop-strong backdrop-blur-md"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed inset-x-0 bottom-0 max-w-[440px] mx-auto z-[180] rounded-t-[34px] surface-raised p-5 space-y-4 shadow-modal pointer-events-auto"
            >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.22em] text-content-dim">Crop Avatar (Optional)</p>
                <p className="text-sm text-content-secondary">
                  Move and zoom image before saving.
                </p>
              </div>
              <button onClick={onClose} className="h-9 w-9 rounded-full surface-strong flex items-center justify-center">
                <X size={14} />
              </button>
            </div>

            <div className="w-full flex justify-center">
              <div
                className="h-52 w-52 rounded-[26px] shadow-glass bg-surface-muted bg-no-repeat"
                style={previewStyle}
              />
            </div>

            <div className="space-y-2">
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-[0.18em] text-content-dim">
                  Zoom
                </span>
                <input
                  type="range"
                  min={1}
                  max={2.2}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full range-accent"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-[0.18em] text-content-dim">
                  Horizontal
                </span>
                <input
                  type="range"
                  min={-50}
                  max={50}
                  step={1}
                  value={offsetX}
                  onChange={(e) => setOffsetX(Number(e.target.value))}
                  className="w-full range-accent"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-[0.18em] text-content-dim">
                  Vertical
                </span>
                <input
                  type="range"
                  min={-50}
                  max={50}
                  step={1}
                  value={offsetY}
                  onChange={(e) => setOffsetY(Number(e.target.value))}
                  className="w-full range-accent"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2 pb-1">
              <button
                onClick={onSkipCrop}
                className="h-11 rounded-xl surface-strong text-xs uppercase tracking-[0.2em]"
              >
                Use Original
              </button>
              <button
                onClick={confirmCrop}
                className="h-11 rounded-xl cta-live-icon text-xs uppercase tracking-[0.2em] font-semibold"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Scissors size={12} /> Crop
                </span>
              </button>
            </div>

            <button
              onClick={confirmCrop}
              className="w-full h-11 rounded-xl bg-surface-active text-content-active text-xs uppercase tracking-[0.2em] font-semibold"
            >
              <span className="inline-flex items-center gap-1.5">
                <Check size={12} /> Save Avatar
              </span>
            </button>

            <p className="text-xs text-content-dim">
              Source: {imageSize.width} x {imageSize.height}
            </p>

            <canvas ref={canvasRef} className="hidden" />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </OverlayPortal>
  );
};

