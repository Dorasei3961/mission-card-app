import Link from "next/link";

export function TopFooter() {
  return (
    <footer className="mt-16 border-t border-violet-100 pb-10 pt-8 text-center">
      <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-500">
        <Link href="/" className="hover:text-[#7C3AED]">
          トップへ
        </Link>
        <Link href="/terms" className="hover:text-[#7C3AED]">
          利用規約
        </Link>
        <Link href="/privacy" className="hover:text-[#7C3AED]">
          プライバシー
        </Link>
      </nav>
      <p className="mt-6 text-xs text-gray-400">© mission-card</p>
    </footer>
  );
}
