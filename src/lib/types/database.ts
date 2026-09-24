// Hand-written types mirroring supabase/migrations/0001_init_schema.sql.
// If the schema changes, update this file (or regenerate with
// `supabase gen types typescript` once a live project is linked).

export type Employee = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type MealRecord = {
  id: string;
  employee_id: string;
  meal_date: string; // YYYY-MM-DD
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
  created_at: string;
  updated_at: string;
};

export type MealPrice = {
  id: string;
  period_id: string | null;
  breakfast_price: number;
  lunch_price: number;
  dinner_price: number;
  effective_from: string; // YYYY-MM-DD
  created_at: string;
};

export type AdminProfile = {
  id: string;
  full_name: string | null;
  role: "admin";
  created_at: string;
};

/** One mess month (e.g. 5 Jan – 4 Feb), owned by a single mess manager. */
export type MessPeriod = {
  id: string;
  manager_id: string;
  start_date: string; // YYYY-MM-DD, inclusive
  end_date: string; // YYYY-MM-DD, exclusive
  created_at: string;
};

export type PeriodReportRow = {
  employee_id: string;
  employee_name: string;
  is_active: boolean;
  breakfast_count: number;
  lunch_count: number;
  dinner_count: number;
  breakfast_amount: number;
  lunch_amount: number;
  dinner_amount: number;
  total_amount: number;
};

export type MealType = "breakfast" | "lunch" | "dinner";

export type Database = {
  public: {
    Tables: {
      employees: {
        Row: Employee;
        Insert: Partial<Employee> & { name: string };
        Update: Partial<Employee>;
        Relationships: [];
      };
      meal_records: {
        Row: MealRecord;
        Insert: Partial<MealRecord> & { employee_id: string; meal_date: string };
        Update: Partial<MealRecord>;
        Relationships: [];
      };
      meal_prices: {
        Row: MealPrice;
        Insert: Partial<MealPrice> & {
          breakfast_price: number;
          lunch_price: number;
          dinner_price: number;
          period_id: string;
        };
        Update: Partial<MealPrice>;
        Relationships: [];
      };
      mess_periods: {
        Row: MessPeriod;
        Insert: Partial<MessPeriod> & { start_date: string; end_date: string };
        Update: Partial<MessPeriod>;
        Relationships: [];
      };
      admin_profiles: {
        Row: AdminProfile;
        Insert: Partial<AdminProfile> & { id: string };
        Update: Partial<AdminProfile>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_period_report: {
        Args: { p_period_id: string };
        Returns: PeriodReportRow[];
      };
      register_mess_manager: {
        Args: { p_full_name: string; p_start_date: string; p_end_date: string };
        Returns: string;
      };
    };
  };
};
