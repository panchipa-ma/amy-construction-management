import { useGetMe } from "@workspace/api-client-react";
import { Redirect } from "expo-router";
import React from "react";

import { Loader } from "@/components/ui";
import { isInternal } from "@/lib/role";

export function InternalOnly({ children }: { children: React.ReactNode }) {
  const meQ = useGetMe();
  if (meQ.isLoading) return <Loader />;
  if (!isInternal(meQ.data ?? null)) return <Redirect href="/(tabs)" />;
  return <>{children}</>;
}
