import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "@/lib/queryClient";
import { AppShell } from "@/components/app-shell";
import { RoleProvider, useRole, isPathAllowed } from "@/lib/role";
import NotFound from "@/pages/not-found";
import DashboardPage from "@/pages/dashboard";
import ProjectsListPage from "@/pages/projects-list";
import ProjectNewPage from "@/pages/project-new";
import ProjectDetailPage from "@/pages/project-detail";
import CustomersPage from "@/pages/customers";
import StaffPage from "@/pages/staff";
import QuotesListPage from "@/pages/quotes-list";
import QuoteNewPage from "@/pages/quote-new";
import QuoteDetailPage from "@/pages/quote-detail";
import InvoicesListPage from "@/pages/invoices-list";
import InvoiceNewPage from "@/pages/invoice-new";
import InvoiceDetailPage from "@/pages/invoice-detail";
import VendorInvoicesPage from "@/pages/vendor-invoices";
import VendorInvoiceNewPage from "@/pages/vendor-invoice-new";
import ReceiptsPage from "@/pages/receipts";
import LedgerPage from "@/pages/ledger";
import StaffAssignmentsPage from "@/pages/staff-assignments";
import GanttPage from "@/pages/gantt";

function RoleGuard() {
  const { role } = useRole();
  const [location] = useLocation();
  if (!isPathAllowed(role, location)) {
    return <Redirect to="/vendor-invoices" />;
  }
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/projects" component={ProjectsListPage} />
      <Route path="/projects/new" component={ProjectNewPage} />
      <Route path="/projects/:id" component={ProjectDetailPage} />
      <Route path="/customers" component={CustomersPage} />
      <Route path="/staff" component={StaffPage} />
      <Route path="/quotes" component={QuotesListPage} />
      <Route path="/quotes/new" component={QuoteNewPage} />
      <Route path="/quotes/:id" component={QuoteDetailPage} />
      <Route path="/invoices" component={InvoicesListPage} />
      <Route path="/invoices/new" component={InvoiceNewPage} />
      <Route path="/invoices/:id" component={InvoiceDetailPage} />
      <Route path="/gantt" component={GanttPage} />
      <Route path="/vendor-invoices" component={VendorInvoicesPage} />
      <Route path="/vendor-invoices/new" component={VendorInvoiceNewPage} />
      <Route path="/receipts" component={ReceiptsPage} />
      <Route path="/ledger" component={LedgerPage} />
      <Route path="/staff-assignments" component={StaffAssignmentsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RoleProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppShell>
              <RoleGuard />
              <Router />
            </AppShell>
          </WouterRouter>
        </RoleProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
