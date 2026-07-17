export default function NewFooterSection() {
  return (
    <footer className="border-t border-[#e5e5e5] px-6 md:px-16 py-10 bg-white">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="font-bold text-base tracking-tight">
            <span className="text-[#111]">craftai</span>
          </span>
          <span className="text-[#888] text-xs">&copy; 2025</span>
        </div>
        <div className="flex items-center gap-8 text-sm text-[#888]">
          <a href="#" className="hover:text-[#f05a1a] transition-colors">Privacy</a>
          <a href="#" className="hover:text-[#f05a1a] transition-colors">Terms</a>
          <a href="#" className="hover:text-[#f05a1a] transition-colors">Docs</a>
          <a href="#" className="hover:text-[#f05a1a] transition-colors">Twitter / X</a>
          <a href="#" className="hover:text-[#f05a1a] transition-colors">GitHub</a>
        </div>
      </div>
    </footer>
  );
}
