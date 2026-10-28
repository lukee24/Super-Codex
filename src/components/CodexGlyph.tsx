export interface CodexGlyphProps {
  size?: number;
  className?: string;
}

/** Codex's cloud-terminal outline, traced from the supplied desktop reference. */
export function CodexGlyph({ size = 48, className }: CodexGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M28.7 6.2C24.8 1.5 18 .7 13.4 4.9c-2.3 2.1-3.7 4.6-4 7.7C4.5 13.8 1.4 18.3 1.5 23.2c0 3.1 1.4 5.9 3.7 7.8-1.1 6.5 2.9 12.1 9.1 12.4 1.6.1 3.1 0 4.4-.4 3.4 4.3 9.6 5.1 14 1.8 2.5-1.9 3.6-4.5 4.3-7 5.3-1.3 9-5.9 9-11.1 0-3.2-1.5-6.3-4.1-8.3C43.8 10.5 37.1 3.1 28.7 6.2Z"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinejoin="round"
      />
      <path
        d="m13.3 17.4 4.5 7.1-4.5 7.1M25.3 31.1h9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default CodexGlyph;
