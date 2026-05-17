/** LP背景の装飾レイヤー（薄く・主張しすぎない） */

const CONFETTI = [
  { left: "8%", top: "12%", color: "#A78BFA", size: 6, delay: 0 },
  { left: "85%", top: "8%", color: "#F59E0B", size: 5, delay: 0.4 },
  { left: "72%", top: "22%", color: "#7C3AED", size: 4, delay: 0.8 },
  { left: "15%", top: "28%", color: "#F472B6", size: 5, delay: 1.2 },
  { left: "92%", top: "45%", color: "#38BDF8", size: 4, delay: 0.2 },
  { left: "5%", top: "55%", color: "#FBBF24", size: 6, delay: 1.6 },
  { left: "78%", top: "68%", color: "#C4B5FD", size: 5, delay: 0.6 },
  { left: "22%", top: "78%", color: "#7C3AED", size: 4, delay: 1 },
  { left: "55%", top: "88%", color: "#F59E0B", size: 5, delay: 1.4 },
];

const STARS = ["✨", "⭐", "🎉", "🎊", "💫"];

export function TopBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute -left-16 top-24 h-48 w-48 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, #C4B5FD 0%, transparent 70%)" }}
      />
      <div
        className="absolute -right-12 top-48 h-56 w-56 rounded-full opacity-35 blur-3xl"
        style={{ background: "radial-gradient(circle, #FBCFE8 0%, transparent 70%)" }}
      />
      <div
        className="absolute bottom-32 left-1/3 h-40 w-40 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, #FDE68A 0%, transparent 70%)" }}
      />

      {CONFETTI.map((c, i) => (
        <span
          key={i}
          className="top-float absolute rounded-full opacity-50"
          style={{
            left: c.left,
            top: c.top,
            width: c.size,
            height: c.size,
            backgroundColor: c.color,
            animationDelay: `${c.delay}s`,
          }}
        />
      ))}

      {STARS.map((star, i) => (
        <span
          key={star + i}
          className="top-shimmer absolute text-sm opacity-40"
          style={{
            left: `${12 + i * 18}%`,
            top: `${18 + (i % 3) * 24}%`,
            animationDelay: `${i * 0.35}s`,
          }}
        >
          {star}
        </span>
      ))}

      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: "radial-gradient(#7C3AED 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
    </div>
  );
}
