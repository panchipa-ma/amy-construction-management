import { Link, useLocation, useSearch } from "wouter";
import { LayoutDashboard, FolderKanban, FileText, Receipt, Users, HardHat, Upload, ReceiptText, BookOpen, ClipboardList, GanttChart, LogOut, UserCog, Shield, FileSignature, CheckCircle2, BadgeCheck, Building2 } from "lucide-react";
import { useUser, useClerk } from "@clerk/react";
import { useRole, isPathAllowed } from "@/lib/role";
import { Button } from "@/components/ui/button";

const navItems = [
  { name: "ダッシュボード", href: "/", icon: LayoutDashboard, internalOnly: false },
  { name: "案件", href: "/projects", icon: FolderKanban, internalOnly: false },
  { name: "竣工", href: "/projects?status=completed", icon: CheckCircle2, internalOnly: false },
  { name: "施工台帳", href: "/ledger", icon: BookOpen, internalOnly: false },
  { name: "工程表", href: "/gantt", icon: GanttChart, internalOnly: false },
  { name: "見積", href: "/quotes", icon: FileText, internalOnly: false },
  { name: "請求", href: "/invoices", icon: Receipt, internalOnly: false },
  { name: "入金済", href: "/invoices?paid=true", icon: BadgeCheck, internalOnly: false },
  { name: "職人見積書", href: "/vendor-quotes", icon: FileSignature, internalOnly: false },
  { name: "職人請求書", href: "/vendor-invoices", icon: Upload, internalOnly: false },
  { name: "職人振込済", href: "/vendor-invoices?paid=true", icon: BadgeCheck, internalOnly: false },
  { name: "領収書", href: "/receipts", icon: ReceiptText, internalOnly: false },
  { name: "職人 出面表", href: "/staff-assignments", icon: ClipboardList, internalOnly: false },
  { name: "顧客", href: "/customers", icon: Users, internalOnly: false },
  { name: "職人", href: "/staff", icon: HardHat, internalOnly: false },
  { name: "ユーザー管理", href: "/users", icon: Shield, internalOnly: true },
  { name: "会社プロフィール", href: "/company-profile", icon: Building2, internalOnly: true },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const search = useSearch();
  const { role } = useRole();
  const { user } = useUser();
  const { signOut } = useClerk();
  const visibleNav = navItems.filter((item) => {
    const pathOnly = item.href.split("?")[0];
    return (
      isPathAllowed(role, pathOnly) && (!item.internalOnly || role === "internal")
    );
  });
  const currentSearch = search ? `?${search}` : "";
  const currentFull = location + currentSearch;
  const userLabel =
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress ||
    user?.username ||
    "ユーザー";
  const roleLabel = role === "internal" ? "社内（全機能）" : "社外";

  return (
    <div className="min-h-screen flex bg-muted/30 print:block print:bg-white">
      <aside className="w-64 border-r bg-sidebar flex-shrink-0 flex flex-col print:hidden sticky top-0 h-screen self-start">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg text-sidebar-foreground">
            <span className="bg-primary text-primary-foreground w-8 h-8 rounded-md flex items-center justify-center">A</span>
            AMY 施工管理
          </Link>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => {
            const [itemPath, itemQuery] = item.href.split("?");
            let isActive: boolean;
            if (item.href === "/") {
              isActive = location === "/" && !currentSearch;
            } else if (itemQuery) {
              // Filtered shortcut — must match path AND query exactly.
              isActive = currentFull === item.href;
            } else {
              // Plain path — match prefix but NOT when a sibling shortcut
              // (same path + query) is active.
              const hasFilteredSibling = navItems.some(
                (other) =>
                  other.href !== item.href &&
                  other.href.startsWith(itemPath + "?") &&
                  currentFull === other.href,
              );
              isActive = location.startsWith(itemPath) && !hasFilteredSibling;
            }
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
        <div className="px-3 py-3 border-t border-sidebar-border space-y-1">
          <div className="px-1 mb-2">
            <div className="text-[11px] text-sidebar-foreground/60 truncate">
              {userLabel}
            </div>
            <div className="text-[11px] text-sidebar-foreground/60 mt-0.5">
              権限: <span className="text-sidebar-foreground/90">{roleLabel}</span>
            </div>
          </div>
          <Link href="/profile">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-xs"
              data-testid="button-profile"
            >
              <UserCog className="w-3.5 h-3.5 mr-2" />
              プロフィール
            </Button>
          </Link>
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
      </aside>
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 p-8 print:p-0">
          {children}
        </div>
      </main>
    </div>
  );
}
