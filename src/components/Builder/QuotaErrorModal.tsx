"use client";

interface QuotaErrorModalProps {
  open: boolean;
  onClose: () => void;
  message?: string;
}

export function QuotaErrorModal({ open, onClose, message }: QuotaErrorModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-8 max-w-md mx-4 shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
        <div className="w-12 h-12 rounded-full bg-[#ff8a5c]/15 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-[#ff8a5c]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-white text-center mb-2">
          API Credits Exhausted
        </h2>
        <p className="text-sm text-[#888] text-center leading-relaxed">
          {message || "You've hit the API rate limit. Please wait a moment and try again."}
        </p>
        <button
          onClick={onClose}
          className="mt-6 w-full py-2.5 bg-[#ff8a5c] text-white text-sm font-semibold rounded-xl hover:bg-[#e87345] transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
