import React from 'react';

export const DepthLayer: React.FC = () => {
  return (
    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-surface-muted/25 via-transparent to-surface-primary/60" />
      <div className="atmosphere-orb atmosphere-cyan h-[260px] w-[260px] -top-24 -left-14" />
      <div className="atmosphere-orb atmosphere-mint h-[220px] w-[220px] top-[28%] -right-20" />
      <div className="atmosphere-orb atmosphere-amber h-[200px] w-[200px] bottom-[-3.5rem] left-[18%]" />
    </div>
  );
};
