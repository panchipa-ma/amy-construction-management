import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { LayoutDashboard, FolderKanban, FileText, Receipt, Users, HardHat, Upload, ReceiptText, BookOpen, ClipboardList, GanttChart, LogOut, UserCog, Shield, FileSignature, CheckCircle2, BadgeCheck, Calculator, Briefcase, CalendarDays, RefreshCw, Menu, X } from "lucide-react";
import { useUser, useClerk } from "@clerk/react";
import { useRole, isPathAllowed } from "@/lib/role";
import { Button } from "@/components/ui/button";

type NavItem = {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  internalOnly?: boolean;
  externalOnly?: boolean;
};

const navItems: NavItem[] = [
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
  { name: "職人 出面表", href: "/staff-assignments", icon: ClipboardList, internalOnly: true },
  { name: "マイ工程・出面", href: "/my-schedule", icon: CalendarDays, externalOnly: true },
  { name: "顧客", href: "/customers", icon: Users, internalOnly: false },
  { name: "職人", href: "/staff", icon: HardHat, internalOnly: false },
  { name: "社員", href: "/employees", icon: Briefcase, internalOnly: true },
  { name: "月次歩合", href: "/commissions", icon: Calculator, internalOnly: true },
  { name: "ユーザー管理", href: "/users", icon: Shield, internalOnly: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const search = useSearch();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { role } = useRole();
  const { user } = useUser();
  const { signOut } = useClerk();
  const visibleNav = navItems.filter((item) => {
    const pathOnly = item.href.split("?")[0];
    return (
      isPathAllowed(role, pathOnly) &&
      (!item.internalOnly || role === "internal") &&
      (!item.externalOnly || role === "external")
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

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location, search]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  const isActive = (item: NavItem) => {
    const [itemPath, itemQuery] = item.href.split("?");
    if (item.href === "/") {
      return location === "/" && !currentSearch;
    }
    if (itemQuery) {
      return currentFull === item.href;
    }
    const hasFilteredSibling = navItems.some(
      (other) =>
        other.href !== item.href &&
        other.href.startsWith(itemPath + "?") &&
        currentFull === other.href,
    );
    return location.startsWith(itemPath) && !hasFilteredSibling;
  };

  const handleSignOut = () => {
    setMobileMenuOpen(false);
    void signOut();
  };

  return (
    <div className="app-shell min-h-screen flex bg-muted/30 print:block print:bg-white">
      <aside className="app-shell-sidebar w-56 border-r bg-sidebar flex-shrink-0 flex flex-col print:hidden sticky top-0 h-screen self-start">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg text-sidebar-foreground">
            <span className="bg-primary text-primary-foreground w-8 h-8 rounded-md flex items-center justify-center">A</span>
            AMY 施工管理
          </Link>
        </div>
        <nav className="sidebar-nav flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => {
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium ${
                     isActive(item)
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
           <Link
             href="/profile"
             className="flex w-full items-center justify-start rounded-md px-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-xs"
             data-testid="button-profile"
           >
             <UserCog className="w-3.5 h-3.5 mr-2" />
             プロフィール
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-xs"
             onClick={handleSignOut}
            data-testid="button-sign-out"
          >
            <LogOut className="w-3.5 h-3.5 mr-2" />
            サインアウト
          </Button>
        </div>
      </aside>
       <main className="app-shell-main flex-1 flex flex-col min-w-0">
         <header className="mobile-header print:hidden">
           <Link href="/" className="mobile-header-brand" onClick={() => setMobileMenuOpen(false)}>
             <span className="mobile-brand-mark">A</span>
             <span className="mobile-brand-copy">
               <strong>AMY</strong>
               <span>施工管理</span>
             </span>
           </Link>
           <div className="mobile-header-actions">
             <Button
               variant="outline"
               size="icon"
               className="app-shell-reload bg-background/95 shadow-sm"
               onClick={() => window.location.reload()}
               aria-label="画面を再読み込み"
               title="画面を再読み込み"
               data-testid="button-reload-page"
             >
               <RefreshCw className="w-4 h-4" />
             </Button>
             <Button
               variant="outline"
               size="icon"
               className="mobile-menu-trigger"
               onClick={() => setMobileMenuOpen(true)}
               aria-label="メニューを開く"
               aria-expanded={mobileMenuOpen}
               aria-controls="amy-mobile-menu"
               data-testid="button-mobile-menu"
             >
               <Menu className="w-5 h-5" />
             </Button>
           </div>
         </header>
         <div className="app-shell-content flex-1 p-8 print:p-0">
          {children}
        </div>
      </main>
       {mobileMenuOpen && (
         <div className="mobile-drawer-root print:hidden">
           <button
             type="button"
             className="mobile-drawer-backdrop"
             aria-label="メニューを閉じる"
             onClick={() => setMobileMenuOpen(false)}
           />
           <aside
             id="amy-mobile-menu"
             className="mobile-drawer"
             role="dialog"
             aria-modal="true"
             aria-label="AMYメニュー"
           >
             <div className="mobile-drawer-header">
               <div className="mobile-drawer-title">
                 <span className="mobile-brand-mark">A</span>
                 <span>
                   <strong>AMY</strong>
                   <small>施工管理</small>
                 </span>
               </div>
               <Button
                 variant="ghost"
                 size="icon"
                 className="mobile-drawer-close"
                 onClick={() => setMobileMenuOpen(false)}
                 aria-label="メニューを閉じる"
                 data-testid="button-mobile-menu-close"
               >
                 <X className="w-5 h-5" />
               </Button>
             </div>
             <nav className="mobile-drawer-nav" aria-label="メインメニュー">
               {visibleNav.map((item) => (
                 <Link
                   key={item.href}
                   href={item.href}
                   onClick={() => setMobileMenuOpen(false)}
                   className={`mobile-nav-link ${
                     isActive(item) ? "mobile-nav-link-active" : ""
                   }`}
                 >
                   <item.icon className="w-[17px] h-[17px]" />
                   <span>{item.name}</span>
                 </Link>
               ))}
             </nav>
             <div className="mobile-drawer-footer">
               <div className="mobile-user-summary">
                 <div className="mobile-user-label">{userLabel}</div>
                 <div className="mobile-role-label">
                   権限: <span>{roleLabel}</span>
                 </div>
               </div>
               <Link
                 href="/profile"
                 onClick={() => setMobileMenuOpen(false)}
                 className="mobile-drawer-action"
                 data-testid="button-mobile-profile"
               >
                 <UserCog className="w-4 h-4" />
                 プロフィール
               </Link>
               <Button
                 variant="ghost"
                 size="sm"
                 className="mobile-drawer-action"
                 onClick={handleSignOut}
                 data-testid="button-mobile-sign-out"
               >
                 <LogOut className="w-4 h-4" />
                 サインアウト
               </Button>
             </div>
           </aside>
         </div>
       )}
    </div>
  );
}
