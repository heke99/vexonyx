import Link from "next/link";
import { Brand } from "./brand";

const items = [
  ["Overview", "/app"], ["New chat", "/app/chat"], ["Projects", "/app/projects"], ["Agents", "/app/agents"], ["Files", "/app/files"], ["Findings", "/app/findings"], ["Reports", "/app/reports"], ["Activity", "/app/activity"], ["Team", "/app/team"], ["Usage", "/app/usage"], ["Settings", "/app/settings"],
] as const;

export function AppSidebar() { return <aside className="app-sidebar"><Brand /> <nav aria-label="Workspace">{items.map(([label, href], index) => <Link className={index === 8 ? "nav-group" : ""} href={href} key={href}>{label}</Link>)}</nav></aside>; }
