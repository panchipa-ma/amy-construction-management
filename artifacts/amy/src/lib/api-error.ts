export function apiErrorMessage(err: unknown): string {
  if (err == null) return "エラーが発生しました";
  if (typeof err === "object" && err !== null) {
    const anyErr = err as { message?: string; response?: { data?: { error?: string } } };
    if (anyErr.response?.data?.error) return anyErr.response.data.error;
    if (anyErr.message) return anyErr.message;
  }
  return "エラーが発生しました";
}
