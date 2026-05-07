import { useClerk, useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, LogOut, RefreshCw } from "lucide-react";
import { useMe } from "@/lib/role";

export default function PendingApprovalPage() {
  const { signOut } = useClerk();
  const { user } = useUser();
  const { refetch } = useMe();

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-6">
          <div className="mx-auto w-14 h-14 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
            <Clock className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold">承認待ち</h1>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              アカウントの登録が完了しました。<br />
              社内管理者の承認後、機能をご利用いただけます。<br />
              管理者にご連絡のうえ、しばらくお待ちください。
            </p>
            <div className="mt-4 text-xs text-muted-foreground">
              {user?.fullName || user?.primaryEmailAddress?.emailAddress}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              onClick={() => refetch()}
              data-testid="button-recheck-approval"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              承認状況を更新
            </Button>
            <Button
              variant="ghost"
              onClick={() => signOut()}
              data-testid="button-sign-out-pending"
            >
              <LogOut className="w-4 h-4 mr-2" />
              サインアウト
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
