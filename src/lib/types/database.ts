// Hand-written types mirroring supabase/migrations/0001_init_schema.sql.
// If the schema changes, update this file (or regenerate with
// `supabase gen types typescript` once a live project is linked).

export type Employee = {
  id: string;
  /** Office token number (TKN); unique when set. */
  token_no: number | null;
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
  /** Month-end meal rate (BDT per meal count); null until the team sets it. */
  meal_rate: number | null;
  created_at: string;
};

/** Meal counts (weights) for one date. No row = the defaults. */
export type MealDayWeights = {
  period_id: string;
  meal_date: string; // YYYY-MM-DD
  breakfast_weight: number;
  lunch_weight: number;
  dinner_weight: number;
  updated_at: string;
};

export type Deposit = {
  id: string;
  period_id: string;
  employee_id: string;
  amount: number;
  deposited_on: string; // YYYY-MM-DD
  note: string | null;
  created_at: string;
};

export type PeriodReportRow = {
  employee_id: string;
  token_no: number | null;
  employee_name: string;
  is_active: boolean;
  breakfast_count: number;
  lunch_count: number;
  dinner_count: number;
  /** Weighted: Σ meals ON × that date's meal count. */
  meal_count: number;
  /** meal_count × meal rate; null until the rate is set. */
  total_bill: number | null;
  total_deposit: number;
  /** total_deposit − total_bill: > 0 remaining, 0 settled, < 0 due. Null until the rate is set. */
  balance: number | null;
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
      meal_day_weights: {
        Row: MealDayWeights;
        Insert: Partial<MealDayWeights> & { period_id: string; meal_date: string };
        Update: Partial<MealDayWeights>;
        Relationships: [];
      };
      deposits: {
        Row: Deposit;
        Insert: Partial<Deposit> & { period_id: string; employee_id: string; amount: number };
        Update: Partial<Deposit>;
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
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
  };
};
