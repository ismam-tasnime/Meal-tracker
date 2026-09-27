/**
 * Supabase Auth refuses sign-ins for a while when too many arrive together
 * (Authentication → Rate Limits). That isn't a wrong password, so say so.
 */
export const AUTH_BUSY_MESSAGE =
  "Too many people are signing in right now. Please wait a minute and try again.";

export function isAuthRateLimited(error: { status?: number; code?: string } | null): boolean {
  return !!error && (error.status === 429 || error.code === "over_request_rate_limit");
}
