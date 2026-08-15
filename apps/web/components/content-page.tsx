import Link from "next/link";
import { MarketingFooter } from "./marketing-footer";
import { MarketingHeader } from "./marketing-header";

type Card = { title: string; body: string; href?: string };
export function ContentPage({ label, title, intro, cards }: { label: string; title: string; intro: string; cards: Card[] }) {
  return <main className="content-page"><MarketingHeader /><section className="shell content-hero"><div className="section-label">{label}</div><h1>{title}</h1><p>{intro}</p></section><section className="shell content-body">{cards.map((card)=><article className="content-card" key={card.title}><h2>{card.href ? <Link href={card.href}>{card.title} →</Link> : card.title}</h2><p>{card.body}</p></article>)}</section><MarketingFooter /></main>;
}
