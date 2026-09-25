function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env.local and fill in your Supabase project credentials.`
    );
  }
  return value;
}

// These must be written out literally: Next.js only inlines
// `process.env.NEXT_PUBLIC_*` into browser code for static references, so a
// dynamic `process.env[name]` is always undefined in the browser.
export const supabaseUrl = () =>
  requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
export const supabaseAnonKey = () =>
  requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
