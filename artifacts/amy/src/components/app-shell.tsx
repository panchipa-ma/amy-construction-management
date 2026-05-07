import { Link, useLocation } from "wouter";
import { LayoutDashboard, FolderKanban, FileText, Receipt, Users, HardHat, Upload, ReceiptText, BookOpen, ClipboardList, GanttChart, LogOut } from "lucide-react";
import { useUser, useClerk } from "@clerk/react";
import { useRole, isPathAllowed, type Role } from "@/lib/role";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

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
  const { role, setRole } = useRole();
  const { user } = useUser();
  const { signOut } = useClerk();
  const visibleNav = navItems.filter((item) => isPathAllowed(role, item.href));
  const userLabel =
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress ||
    user?.username ||
    "ユーザー";

  return (
    <div className="min-h-screen flex bg-muted/30 print:block print:bg-white">
      <aside className="w-64 border-r bg-sidebar flex-shrink-0 flex flex-col print:hidden sticky top-0 h-screen self-start">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg text-sidebar-foreground">
            <span className="bg-primary text-primary-foreground w-8 h-8 rounded-md flex items-center justify-center">A</span>
            AMY 施工管理
          </Link>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {visibleNav.map((item) => {
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
        <div className="px-3 py-3 border-t border-sidebar-border space-y-3">
          <div>
            <div className="text-[11px] text-sidebar-foreground/60 mb-1.5 px-1">
              権限
            </div>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as Role)}
            >
              <SelectTrigger className="bg-sidebar-accent/30 border-sidebar-border text-sidebar-foreground h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">社内（全機能）</SelectItem>
                <SelectItem value="external">社外（職人請求書・出面表のみ）</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="border-t border-sidebar-border pt-3">
            <div className="text-[11px] text-sidebar-foreground/60 mb-1 px-1 truncate">
              {userLabel}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-xs"
              onClick={() => signOut()}
              data-testid="button-sign-out"
            >
              <LogOut className="w-3.5 h-3.5 mr-2" />
              サインアウト
            </Button>
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
