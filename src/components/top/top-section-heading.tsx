type Props = {
  title: string;
  subtitle?: string;
  className?: string;
};

export function TopSectionHeading({ title, subtitle, className = "" }: Props) {
  return (
    <div className={`text-center ${className}`}>
      <h2 className="text-2xl font-black text-[#111827]">{title}</h2>
      {subtitle ? <p className="mt-2 text-sm text-gray-500">{subtitle}</p> : null}
    </div>
  );
}
