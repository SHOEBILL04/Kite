import React from 'react';

/**
 * Modern minimal geometric logo for KITE.
 * Represents precision, elevation, and academic quality assurance.
 */
export function KiteIcon({ size = 32, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-label="KITE Logo"
    >
      <defs>
        <linearGradient id="kiteTopRight" x1="32" y1="5" x2="57" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
        <linearGradient id="kiteTopLeft" x1="7" y1="25" x2="32" y2="5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
        <linearGradient id="kiteBottomLeft" x1="7" y1="25" x2="32" y2="57" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#047857" />
          <stop offset="100%" stopColor="#064E3B" />
        </linearGradient>
        <linearGradient id="kiteBottomRight" x1="57" y1="25" x2="32" y2="57" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#059669" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>
        <linearGradient id="kiteSpine" x1="32" y1="5" x2="32" y2="57" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.7" />
          <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.5" />
        </linearGradient>
      </defs>

      {/* Top Left Facet */}
      <polygon points="32,6 32,26 8,24" fill="url(#kiteTopLeft)" />

      {/* Top Right Facet */}
      <polygon points="32,6 56,24 32,26" fill="url(#kiteTopRight)" />

      {/* Bottom Left Facet */}
      <polygon points="8,24 32,26 32,58" fill="url(#kiteBottomLeft)" />

      {/* Bottom Right Facet */}
      <polygon points="32,26 56,24 32,58" fill="url(#kiteBottomRight)" />

      {/* Modern Center Spine & Crossbars */}
      <line x1="32" y1="6" x2="32" y2="58" stroke="url(#kiteSpine)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="24" x2="56" y2="24" stroke="#FFFFFF" strokeOpacity="0.3" strokeWidth="1" strokeLinecap="round" />

      {/* Aerodynamic Ribbon Accent */}
      <path
        d="M32,58 C30,61 35,63 33,66"
        stroke="#10B981"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.85"
      />
    </svg>
  );
}

export default function KiteLogo({
  size = 32,
  showText = true,
  subtitle = 'Academic Intelligence',
  className = '',
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="flex items-center justify-center rounded-lg bg-surface shadow-2xs border border-border-default/60 p-1">
        <KiteIcon size={size} />
      </div>

      {showText && (
        <div className="leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="text-[17px] font-extrabold tracking-wider text-heading font-mono">
              KITE
            </span>
          </div>
          {subtitle && (
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted">
              {subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
