/**
 * True when Supabase says a table or function doesn't exist: the app is
 * newer than the database, i.e. a migration hasn't been run yet.
 * PGRST202/PGRST205 come from the REST API's schema cache, 42883/42P01 from
 * Postgres itself.
 */
export function isMissingFromDatabase(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "PGRST202" || code === "PGRST205" || code === "42883" || code === "42P01";
}
