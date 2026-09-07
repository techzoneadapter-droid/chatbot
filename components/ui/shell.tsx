import Link from "next/link";
import { BarChart3, Bot, Boxes, ClipboardList, Facebook, FileQuestion, FileText, Megaphone, MessageCircle, MessageSquareText, Settings, SlidersHorizontal, UsersRound } from "lucide-react";

const nav = [
  { href: "/dashboard", label: "Tổng quan", icon: BarChart3 },
  { href: "/inbox", label: "Inbox", icon: MessageSquareText },
  { href: "/campaigns", label: "Campaign", icon: Megaphone },
  { href: "/customers", label: "Khách hàng", icon: UsersRound },
  { href: "/orders", label: "Đơn hàng", icon: ClipboardList },
  { href: "/comments", label: "Bình luận", icon: MessageCircle },
  { href: "/products", label: "Sản phẩm", icon: Boxes },
  { href: "/facebook-pages", label: "Facebook Pages", icon: Facebook },
  { href: "/automation", label: "Automation", icon: SlidersHorizontal },
  { href: "/ai", label: "AI", icon: Bot },
  { href: "/help", label: "Hướng dẫn", icon: FileQuestion },
  { href: "/logs", label: "Nhật ký", icon: FileText },
  { href: "/settings", label: "Cài đặt", icon: Settings },
  { href: "/", label: "Chat thử", icon: MessageSquareText }
];

export function AppShell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-b border-line bg-white lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="px-5 py-5">
          <div className="text-lg font-bold text-ink">SalesBot AI</div>
          <div className="text-sm text-muted">Facebook sales console</div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-w-fit items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <section className="min-w-0">
        <header className="border-b border-line bg-white px-5 py-4">
          <h1 className="text-2xl font-bold tracking-normal text-ink">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </header>
        <div className="p-4 sm:p-6">{children}</div>
      </section>
    </main>
  );
}
