interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showGradient?: boolean;
  animated?: boolean;
}

const sizeConfig = {
  sm: {
    icon: 16,
    main: 'text-lg',
    suffix: 'text-[10px]',
    gap: 'gap-1.5',
  },
  md: {
    icon: 22,
    main: 'text-2xl',
    suffix: 'text-xs',
    gap: 'gap-2',
  },
  lg: {
    icon: 32,
    main: 'text-4xl',
    suffix: 'text-base',
    gap: 'gap-2.5',
  },
  xl: {
    icon: 48,
    main: 'text-6xl',
    suffix: 'text-xl',
    gap: 'gap-3',
  },
};

export function Logo({ size = 'md', className = '', showGradient = true, animated = true }: LogoProps) {
  const config = sizeConfig[size];

  const gradientClass = showGradient
    ? 'bg-gradient-to-r from-violet-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent'
    : 'text-white';

  return (
    <span className={`font-bold inline-flex items-center ${config.gap} ${className} group`}>
      {/* Animated ball icon */}
      <span className="relative flex-shrink-0">
        <svg
          width={config.icon}
          height={config.icon}
          viewBox="0 0 32 32"
          fill="none"
          className={animated ? 'group-hover:scale-110 transition-transform duration-300' : ''}
        >
          <defs>
            <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a855f7" />
              <stop offset="50%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          {/* Outer ring */}
          <circle
            cx="16"
            cy="16"
            r="13"
            stroke="url(#logoGradient)"
            strokeWidth="2"
            fill="none"
            filter="url(#glow)"
          />
          {/* Inner filled circle (the "ball") */}
          <circle
            cx="16"
            cy="16"
            r="7"
            fill="url(#logoGradient)"
            filter="url(#glow)"
          />
          {/* Camera lens / eye effect */}
          <circle cx="16" cy="16" r="3" fill="#0f172a" />
          <circle cx="14.5" cy="14.5" r="1" fill="rgba(255,255,255,0.6)" />
        </svg>
      </span>

      {/* Text part */}
      <span className="inline-flex items-baseline tracking-tight">
        <span className={`${config.main} font-medium ${gradientClass}`}>ballcam</span>
        <span className={`${config.suffix} font-normal ${gradientClass} opacity-70`}>.tv</span>
      </span>
    </span>
  );
}

// Icon-only version for favicon/small spaces
export function LogoIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
    >
      <defs>
        <linearGradient id="logoIconGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="50%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
        <filter id="iconGlow">
          <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <circle
        cx="16"
        cy="16"
        r="13"
        stroke="url(#logoIconGradient)"
        strokeWidth="2.5"
        fill="none"
        filter="url(#iconGlow)"
      />
      <circle
        cx="16"
        cy="16"
        r="7"
        fill="url(#logoIconGradient)"
        filter="url(#iconGlow)"
      />
      <circle cx="16" cy="16" r="3" fill="#0f172a" />
      <circle cx="14.5" cy="14.5" r="1" fill="rgba(255,255,255,0.6)" />
    </svg>
  );
}
