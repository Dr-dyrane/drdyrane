import React from 'react';
import { createPortal } from 'react-dom';

interface OverlayPortalProps {
  children: React.ReactNode;
}

const OVERLAY_ROOT_ID = 'drdyrane-overlay-root';

const ensureOverlayRoot = (): HTMLElement => {
  const existing = document.getElementById(OVERLAY_ROOT_ID);
  if (existing) return existing;

  const root = document.createElement('div');
  root.id = OVERLAY_ROOT_ID;
  root.style.position = 'relative';
  root.style.zIndex = '9999';
  root.style.isolation = 'isolate';
  document.body.appendChild(root);

  return root;
};

export const OverlayPortal: React.FC<OverlayPortalProps> = ({ children }) => {
  if (typeof document === 'undefined') return null;
  return createPortal(children, ensureOverlayRoot());
};
