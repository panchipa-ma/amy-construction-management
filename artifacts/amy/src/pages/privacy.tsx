import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function PrivacyPage() {
  return (
    <div className="min-h-[100dvh] bg-muted/30 px-4 py-10">
      <div className="max-w-3xl mx-auto bg-white rounded-xl border shadow-sm p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">プライバシーポリシー</h1>
          <Button asChild variant="outline" size="sm">
            <Link href="/">トップへ</Link>
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          最終更新日: 2026年5月22日
        </p>

        <section className="space-y-2 text-sm leading-relaxed">
          <p>
            株式会社AMY（以下「当社」）は、当社が提供する施工管理アプリ「AMY 施工管理」（以下「本アプリ」）における、ユーザーの個人情報の取り扱いについて、以下のとおりプライバシーポリシー（以下「本ポリシー」）を定めます。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold border-b pb-1">1. 収集する情報</h2>
          <ul className="list-disc pl-6 text-sm space-y-1">
            <li>アカウント情報: 氏名、メールアドレス、電話番号（認証プロバイダ Clerk 経由で取得）</li>
            <li>業務データ: ユーザーが入力した顧客・案件・見積書・請求書・原価・工程・職人情報など</li>
            <li>アップロードファイル: 請求書PDF、領収書画像など、ユーザーが本アプリにアップロードしたファイル</li>
            <li>利用ログ: アクセス日時、IPアドレス、エラー情報など、サービス改善に必要な技術ログ</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold border-b pb-1">2. 利用目的</h2>
          <ul className="list-disc pl-6 text-sm space-y-1">
            <li>本アプリの提供、運営、ユーザー認証</li>
            <li>業務データの保存・表示・集計（粗利計算、歩合計算等）</li>
            <li>不具合対応、機能改善、セキュリティの維持</li>
            <li>法令に基づく対応</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold border-b pb-1">3. 第三者提供</h2>
          <p className="text-sm">
            当社は、法令に基づく場合を除き、ユーザーの同意なく個人情報を第三者に提供しません。なお、本アプリは下記の業務委託先（クラウドサービス事業者）を利用しており、必要な範囲で情報を取り扱います。
          </p>
          <ul className="list-disc pl-6 text-sm space-y-1">
            <li>Clerk, Inc.（認証基盤）</li>
            <li>Replit, Inc.（アプリ実行・ホスティング基盤、データベース、ファイルストレージ）</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold border-b pb-1">4. 安全管理</h2>
          <p className="text-sm">
            通信は TLS で暗号化し、業務データへのアクセスは認証済みユーザーに限定します。社外ユーザー（職人等）は自身が登録したデータのみ閲覧できる権限分離を実装しています。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold border-b pb-1">5. データの保存期間・削除</h2>
          <p className="text-sm">
            ユーザーが入力した業務データは、ユーザーが削除するまで保存されます。アカウント削除のご希望は下記連絡先までご連絡ください。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold border-b pb-1">6. お問い合わせ</h2>
          <div className="text-sm space-y-0.5">
            <p>株式会社AMY</p>
            <p>TEL: 06-6780-9124</p>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold border-b pb-1">7. 改定</h2>
          <p className="text-sm">
            本ポリシーは、必要に応じて改定する場合があります。重要な変更がある場合は、本アプリ上で告知します。
          </p>
        </section>
      </div>
    </div>
  );
}
