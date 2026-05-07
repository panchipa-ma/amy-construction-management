import { useEffect, useRef } from "react";
import {
  Switch,
  Route,
  Router as WouterRouter,
  Redirect,
  useLocation,
} from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  ClerkProvider,
  SignIn,
  SignUp,
  Show,
  useClerk,
  useUser,
} from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
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
import LandingPage from "@/pages/landing";
import ProfileSetupPage from "@/pages/profile-setup";
import { readProfile, isProfileComplete } from "@/lib/profile";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(222, 65%, 24%)",
    colorForeground: "hsl(220, 25%, 12%)",
    colorMutedForeground: "hsl(220, 10%, 40%)",
    colorDanger: "hsl(0, 70%, 50%)",
    colorBackground: "hsl(220, 25%, 98%)",
    colorInput: "hsl(0, 0%, 100%)",
    colorInputForeground: "hsl(220, 25%, 12%)",
    colorNeutral: "hsl(220, 15%, 85%)",
    fontFamily:
      "system-ui, -apple-system, 'Segoe UI', 'Hiragino Sans', 'Meiryo', sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox:
      "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl border border-slate-200",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-slate-900 text-xl font-semibold",
    headerSubtitle: "text-slate-600 text-sm",
    socialButtonsBlockButtonText: "text-slate-800 font-medium",
    formFieldLabel: "text-slate-800 text-sm font-medium",
    formFieldInput:
      "bg-white border-slate-300 text-slate-900 rounded-md",
    footerActionLink: "text-[hsl(222,65%,24%)] font-medium hover:underline",
    footerActionText: "text-slate-600",
    dividerText: "text-slate-500",
    identityPreviewEditButton: "text-[hsl(222,65%,24%)]",
    formFieldSuccessText: "text-emerald-600",
    alertText: "text-slate-700",
    logoBox: "flex justify-center mb-2",
    logoImage: "h-10 w-10",
    socialButtonsBlockButton:
      "border border-slate-300 hover:bg-slate-50",
    formButtonPrimary:
      "bg-[hsl(222,65%,24%)] hover:bg-[hsl(222,65%,18%)] text-white rounded-md",
    footerAction: "py-3",
    dividerLine: "bg-slate-200",
    alert: "bg-amber-50 border border-amber-200 rounded-md",
    otpCodeFieldInput:
      "bg-white border-slate-300 text-slate-900",
    formFieldRow: "space-y-1",
    main: "py-2",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-muted/30 px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-muted/30 px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function RoleGuard() {
  const { role } = useRole();
  const [location] = useLocation();
  if (!isPathAllowed(role, location)) {
    return <Redirect to="/vendor-invoices" />;
  }
  return null;
}

function ProfileGate({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const [location] = useLocation();
  if (!isLoaded) return null;
  const complete = isProfileComplete(readProfile(user));
  if (!complete && location !== "/profile-setup") {
    return <Redirect to="/profile-setup" />;
  }
  return <>{children}</>;
}

function ProfileEditPage() {
  return <ProfileSetupPage mode="edit" />;
}

function ProtectedRoutes() {
  return (
    <AppShell>
      <RoleGuard />
      <Switch>
        <Route path="/profile-setup">
          <ProfileSetupPage mode="setup" />
        </Route>
        <Route path="/profile" component={ProfileEditPage} />
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
    </AppShell>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route>
        <Show when="signed-in">
          <RoleProvider>
            <ProfileGate>
              <ProtectedRoutes />
            </ProfileGate>
          </RoleProvider>
        </Show>
        <Show when="signed-out">
          <LandingPage />
        </Show>
      </Route>
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "AMY 施工管理にログイン",
            subtitle: "アカウントにサインインしてください",
          },
        },
        signUp: {
          start: {
            title: "アカウントを作成",
            subtitle: "AMY 施工管理を始めましょう",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) =>
        setLocation(stripBase(to), { replace: true })
      }
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <AppRoutes />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
