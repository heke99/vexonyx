import Image from "next/image";
import Link from "next/link";
import styles from "./brand.module.css";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/" aria-label="VEXONYX home">
      <span className={styles.mark} aria-hidden="true">
        <Image src="/icon.png" alt="" width={24} height={24} unoptimized priority />
      </span>
      {compact ? null : <span>VEXONYX</span>}
    </Link>
  );
}
