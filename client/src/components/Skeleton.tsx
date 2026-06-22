// Shimmer placeholder block. Use <Skeleton width="200px" height="16px" /> wherever a content
// placeholder is wanted. (The .skeleton CSS lives in index.css.)
export function Skeleton({ width, height, borderRadius = "6px", className = "" }: {
  width?: string | number; height?: string | number; borderRadius?: string; className?: string;
}) {
  return <div className={`skeleton ${className}`} style={{ width, height, borderRadius }} />;
}
