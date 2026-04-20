import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "@/lib/queryClient";
import { AppShell } from "@/components/app-shell";
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
import SchedulePage from "@/pages/schedule";
import VendorInvoicesPage from "@/pages/vendor-invoices";
import ReceiptsPage from "@/pages/receipts";
import LedgerPage from "@/pages/ledger";

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
      <Route path="/schedule" component={SchedulePage} />
      <Route path="/vendor-invoices" component={VendorInvoicesPage} />
      <Route path="/receipts" component={ReceiptsPage} />
      <Route path="/ledger" component={LedgerPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppShell>
            <Router />
          </AppShell>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
