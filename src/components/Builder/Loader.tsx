"use client";

interface LoaderProps {
  label?: string;
}

export function Loader({ label = "Loading..." }: LoaderProps) {
  return (
    <div className="flex items-center justify-center gap-3">
      <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#ff8a5c] border-t-transparent" />
      <p className="text-sm text-[#888]">{label}</p>
    </div>
  );
}
