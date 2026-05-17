import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#FAF7FF] px-5 py-10">
      <main className="mx-auto max-w-[375px]">
        <h1 className="text-2xl font-black text-[#111827]">利用規約</h1>
        <p className="mt-4 text-sm leading-relaxed text-gray-500">準備中です。</p>
        <Link href="/" className="mt-8 inline-block text-sm font-semibold text-[#7C3AED]">
          トップへ戻る
        </Link>
      </main>
    </div>
  );
}
