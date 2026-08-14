import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/" aria-label="VEXONYX home">
      <span className="brand-mark" aria-hidden="true"><span /></span>
      {compact ? null : <span>VEXONYX</span>}
    </Link>
  );
}
