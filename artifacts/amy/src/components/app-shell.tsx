import { Link, useLocation } from "wouter";
import { LayoutDashboard, FolderKanban, FileText, Receipt, Users, HardHat, Upload, ReceiptText, BookOpen, ClipboardList, GanttChart } from "lucide-react";

const navItems = [
  { name: "ダッシュボード", href: "/", icon: LayoutDashboard },
  { name: "案件", href: "/projects", icon: FolderKanban },
  { name: "施工台帳", href: "/ledger", icon: BookOpen },
  { name: "工程表", href: "/gantt", icon: GanttChart },
  { name: "見積", href: "/quotes", icon: FileText },
  { name: "請求", href: "/invoices", icon: Receipt },
  { name: "職人請求書", href: "/vendor-invoices", icon: Upload },
  { name: "領収書", href: "/receipts", icon: ReceiptText },
  { name: "職人 出面表", href: "/staff-assignments", icon: ClipboardList },
  { name: "顧客", href: "/customers", icon: Users },
  { name: "職人", href: "/staff", icon: HardHat },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex bg-muted/30 print:block print:bg-white">
      <aside className="w-64 border-r bg-sidebar flex-shrink-0 flex flex-col print:hidden">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg text-sidebar-foreground">
            <span className="bg-primary text-primary-foreground w-8 h-8 rounded-md flex items-center justify-center">A</span>
            AMY 施工管理
          </Link>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium ${
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.name}
                </div>
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
