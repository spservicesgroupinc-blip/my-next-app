"use client";
import { useId } from "react";

// Small badge icon for the header button (36×36)
export function DCFoamIcon({ size = 36, className = "" }: { size?: number; className?: string }) {
  const uid = useId().replace(/:/g, "");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`dcf-${uid}`}>
          <rect width="36" height="36" rx="7" />
        </clipPath>
      </defs>
      {/* Black background */}
      <rect width="36" height="36" rx="7" fill="#111111" />
      {/* Red bottom accent bar */}
      <rect y="27" width="36" height="9" fill="#CC1414" clipPath={`url(#dcf-${uid})`} />
      {/* Yellow DC lettering */}
      <text
        x="2"
        y="26"
        fontFamily="Impact, 'Arial Black', Arial, sans-serif"
        fontSize="22"
        fill="#FFD200"
      >
        DC
      </text>
      {/* Red border outline */}
      <rect width="36" height="36" rx="7" stroke="#CC1414" strokeWidth="2" fill="none" />
    </svg>
  );
}

// Horizontal wordmark: "DC FOAM" with subtitle
export function DCFoamWordmark({
  subtitle,
  className = "",
}: {
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col justify-center ${className}`}>
      <div
        className="leading-none tracking-tight"
        style={{ fontFamily: "Impact, 'Arial Black', sans-serif" }}
      >
        <span className="text-[19px] text-slate-900">DC&nbsp;</span>
        <span className="text-[19px] text-red-600" style={{ letterSpacing: "0.12em" }}>
          FOAM
        </span>
      </div>
      {subtitle && (
        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mt-0.5">
          {subtitle}
        </p>
      )}
    </div>
  );
}

// Large brand lockup for login / signup pages
export function DCFoamBrand({
  tagline = "Contractor Field Management",
  className = "",
}: {
  tagline?: string;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Badge */}
      <svg
        width="80"
        height="80"
        viewBox="0 0 80 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="mb-4 drop-shadow-xl"
        aria-hidden="true"
      >
        <defs>
          <clipPath id={`dcfb-${uid}`}>
            <rect width="80" height="80" rx="16" />
          </clipPath>
        </defs>
        {/* Black background */}
        <rect width="80" height="80" rx="16" fill="#111111" />
        {/* Red bottom accent bar */}
        <rect y="58" width="80" height="22" fill="#CC1414" clipPath={`url(#dcfb-${uid})`} />
        {/* Yellow DC lettering */}
        <text
          x="5"
          y="57"
          fontFamily="Impact, 'Arial Black', Arial, sans-serif"
          fontSize="50"
          fill="#FFD200"
        >
          DC
        </text>
        {/* Red border outline */}
        <rect width="80" height="80" rx="16" stroke="#CC1414" strokeWidth="3" fill="none" />
      </svg>

      {/* Wordmark */}
      <div
        className="flex items-baseline gap-2 leading-none"
        style={{ fontFamily: "Impact, 'Arial Black', sans-serif" }}
      >
        <span className="text-[30px] text-slate-900 tracking-tight">DC</span>
        <span className="text-[30px] text-red-600" style={{ letterSpacing: "0.18em" }}>
          FOAM
        </span>
      </div>
      {tagline && (
        <p className="text-sm text-slate-500 mt-1.5 tracking-widest uppercase font-medium">
          {tagline}
        </p>
      )}
    </div>
  );
}
