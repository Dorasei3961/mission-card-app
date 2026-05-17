const COLORS = ["#7C3AED", "#FCD34D", "#F472B6", "#34D399", "#60A5FA", "#FB923C"];

/** 紙吹雪（SSR/CSR一致のためインデックスで決定論的に配置） */
const PIECES = Array.from({ length: 40 }, (_, i) => {
  const left = ((i * 37 + 13) % 100).toFixed(1);
  const size = 6 + (i % 8);
  const color = COLORS[i % COLORS.length];
  const rounded = i % 2 === 0;
  const duration = 4 + (i % 6);
  const delay = (i % 6) * 0.35;
  const rotate = (i * 47) % 360;
  return { id: i, left: `${left}%`, size, color, rounded, duration, delay, rotate };
});

export function AboutConfetti() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      {PIECES.map((p) => (
        <span
          key={p.id}
          className="about-confetti-piece absolute top-[-20px] opacity-0"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: p.rounded ? "50%" : "2px",
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}
