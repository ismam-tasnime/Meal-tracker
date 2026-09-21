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

export type MonthlyReportRow = {
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
        };
        Update: Partial<MealPrice>;
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
      get_monthly_report: {
        Args: { p_year: number; p_month: number };
        Returns: MonthlyReportRow[];
      };
      admin_setup_completed: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      claim_first_admin: {
        Args: { p_full_name: string };
        Returns: boolean;
      };
    };
  };
};
