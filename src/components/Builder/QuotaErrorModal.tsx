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
      <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-8 max-w-md mx-4 shadow-2xl">
        <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-[#e8e8ed] text-center mb-2">
          API Credits Exhausted
        </h2>
        <p className="text-sm text-[#888] text-center leading-relaxed">
          {message || "You've hit the Gemini free tier limit. Please wait a moment and try again."}
        </p>
        <button
          onClick={onClose}
          className="mt-6 w-full py-2.5 bg-[#a78bfa] text-[#0a0a0f] text-sm font-medium rounded-lg hover:bg-[#c4b5fd] transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
