import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-muted/30 px-4">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="flex flex-col items-center gap-4">
          <div className="bg-primary text-primary-foreground w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-bold shadow-md">
            A
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              AMY 施工管理
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              内装工事の見積・請求・原価管理システム
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-6 space-y-3">
          <p className="text-sm text-muted-foreground">
            ご利用にはサインインが必要です
          </p>
          <div className="flex flex-col gap-2">
            <Button asChild size="lg" className="w-full">
              <Link href="/sign-in">サインイン</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="w-full"
            >
              <Link href="/sign-up">アカウントを作成</Link>
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground pt-2">
            ※ 関係者以外はサインインできません
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} 株式会社AMY
        </p>
      </div>
    </div>
  );
}
