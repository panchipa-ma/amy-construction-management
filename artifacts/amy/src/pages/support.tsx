import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function SupportPage() {
  return (
    <div className="min-h-[100dvh] bg-muted/30 px-4 py-10">
      <div className="max-w-3xl mx-auto bg-white rounded-xl border shadow-sm p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">サポート</h1>
          <Button asChild variant="outline" size="sm">
            <Link href="/">トップへ</Link>
          </Button>
        </div>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold border-b pb-1">お問い合わせ</h2>
          <p className="text-sm">
            AMY 施工管理に関するご質問・不具合のご報告は、下記までご連絡ください。
          </p>
          <div className="text-sm space-y-0.5 mt-2">
            <p>株式会社AMY</p>
            <p>TEL: 06-6780-9124</p>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold border-b pb-1">よくあるご質問</h2>

          <div className="space-y-3 text-sm">
            <div>
              <p className="font-semibold">Q. サインインできません。</p>
              <p className="text-muted-foreground">
                A. 本アプリは関係者限定です。アカウント作成後、管理者の承認が必要です。承認待ちの方は管理者にお問い合わせください。
              </p>
            </div>

            <div>
              <p className="font-semibold">Q. 職人アカウント（社外ユーザー）で見えるデータは？</p>
              <p className="text-muted-foreground">
                A. ご自身がアップロードした職人請求書・見積書のみ閲覧できます。他の方のデータは見えません。
              </p>
            </div>

            <div>
              <p className="font-semibold">Q. パスワードを忘れました。</p>
              <p className="text-muted-foreground">
                A. サインイン画面の「パスワードをお忘れですか？」からメールで再設定できます。
              </p>
            </div>

            <div>
              <p className="font-semibold">Q. アカウントを削除したい。</p>
              <p className="text-muted-foreground">
                A. お手数ですが、上記連絡先までご連絡ください。
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold border-b pb-1">関連リンク</h2>
          <div className="text-sm">
            <Link href="/privacy" className="text-primary underline">
              プライバシーポリシー
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
