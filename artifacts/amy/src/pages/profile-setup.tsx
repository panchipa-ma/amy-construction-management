import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  EMPTY_PROFILE,
  readProfile,
  saveProfile,
  isProfileComplete,
  type UserProfile,
} from "@/lib/profile";

type Mode = "setup" | "edit";

export default function ProfileSetupPage({ mode = "setup" }: { mode?: Mode }) {
  const { user, isLoaded } = useUser();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
  const [submitting, setSubmitting] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!hydrated && isLoaded && user) {
      setProfile(readProfile(user));
      setHydrated(true);
    }
  }, [isLoaded, user, hydrated]);

  const update = <K extends keyof UserProfile>(k: K, v: UserProfile[K]) =>
    setProfile((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!user) return;
    if (!isProfileComplete(profile)) {
      toast({
        title: "必須項目を入力してください",
        description:
          "インボイス登録番号以外はすべて必須です（請求書作成時に自動反映されます）",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      await saveProfile(user, profile);
      toast({ title: "プロフィールを保存しました" });
      setLocation(mode === "setup" ? "/" : "/profile");
    } catch (e) {
      toast({
        title: "保存に失敗しました",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {mode === "setup" ? "プロフィール初期設定" : "プロフィール編集"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          ここで入力した情報は、職人請求書を作成するときに発行元・お振込先として自動で反映されます。<br />
          他のメンバーには公開されません（あなたのアカウント専用です）。
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          <section>
            <div className="text-sm font-semibold mb-3">発行元情報</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  会社名 <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={profile.companyName}
                  onChange={(e) => update("companyName", e.target.value)}
                  placeholder="例: 有限会社 浪速"
                  data-testid="input-company-name"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  インボイス登録番号{" "}
                  <span className="text-muted-foreground text-xs">(任意)</span>
                </Label>
                <Input
                  value={profile.registrationNumber}
                  onChange={(e) =>
                    update("registrationNumber", e.target.value)
                  }
                  placeholder="例: T1234567890123"
                  data-testid="input-registration-number"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  会社郵便番号 <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={profile.postalCode}
                  onChange={(e) => update("postalCode", e.target.value)}
                  placeholder="〒000-0000"
                  data-testid="input-postal-code"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  会社住所 <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={profile.address}
                  onChange={(e) => update("address", e.target.value)}
                  placeholder="例: 大阪府..."
                  data-testid="input-address"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>
                  会社メールアドレス <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="email"
                  value={profile.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="example@example.com"
                  data-testid="input-email"
                />
              </div>
            </div>
          </section>

          <section className="border-t pt-6">
            <div className="text-sm font-semibold mb-3">お振込先</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  銀行名 <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={profile.bankName}
                  onChange={(e) => update("bankName", e.target.value)}
                  placeholder="例: 三井住友銀行"
                  data-testid="input-bank-name"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  支店名 <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={profile.branchName}
                  onChange={(e) => update("branchName", e.target.value)}
                  placeholder="例: 守口支店"
                  data-testid="input-branch-name"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  種別 <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={profile.accountType}
                  onValueChange={(v) => update("accountType", v)}
                >
                  <SelectTrigger data-testid="select-account-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="普通">普通</SelectItem>
                    <SelectItem value="当座">当座</SelectItem>
                    <SelectItem value="貯蓄">貯蓄</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>
                  口座番号 <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={profile.accountNumber}
                  onChange={(e) => update("accountNumber", e.target.value)}
                  placeholder="例: 1234567"
                  data-testid="input-account-number"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>
                  口座名義 <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={profile.accountHolder}
                  onChange={(e) => update("accountHolder", e.target.value)}
                  placeholder="例: ユウ）ナニワ"
                  data-testid="input-account-holder"
                />
              </div>
            </div>
          </section>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              onClick={handleSave}
              disabled={submitting}
              data-testid="button-save-profile"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              保存
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
