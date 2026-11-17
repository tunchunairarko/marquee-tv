export function Spinner({ size = 40 }: { size?: number }) {
  return (
    <svg className="spinner" width={size} height={size} viewBox="0 0 50 50" aria-label="Loading">
      <circle cx="25" cy="25" r="20" fill="none" strokeWidth="4" />
    </svg>
  );
}
