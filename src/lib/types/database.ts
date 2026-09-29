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

/**
 * An employee's phone number and, once they've signed up, their login.
 * Readable only by mess managers and by the employee themself.
 */
export type EmployeeAccount = {
  employee_id: string;
  /** "01XXXXXXXXX" */
  phone: string;
  /** Null until the employee signs up. */
  user_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Answers from employee_signup_status() / register_employee(). */
export type EmployeeSignupStatus = "ok" | "not_found" | "inactive" | "taken";

/** One employee's bill for one mess month (get_my_statement). */
export type MyStatementRow = {
  /** False when no mess manager has signed up for that month yet. */
  period_exists: boolean;
  /** The PUBLISHED meal rate; null until the mess manager publishes one. */
  meal_rate: number | null;
  /** When the rate was last published (ISO timestamp); null if not published. */
  rate_published_at: string | null;
  breakfast_count: number;
  lunch_count: number;
  dinner_count: number;
  meal_count: number;
  total_bill: number | null;
  total_deposit: number;
  balance: number | null;
  deposits: { amount: number; deposited_on: string; note: string | null }[];
};

/** One day of the signed-in employee's meals, with that day's meal counts. */
export type MyMealDayRow = {
  meal_date: string;
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
  breakfast_weight: number;
  lunch_weight: number;
  dinner_weight: number;
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

/** The single row of employee meal deadlines (office time, "HH:MM:SS"). */
export type MealCutoffsRow = {
  id: boolean;
  breakfast_cutoff: string;
  lunch_cutoff: string;
  dinner_cutoff: string;
  updated_at: string;
};

/**
 * What the mess manager announced is being served on one date. A null
 * column means nothing was announced for that meal.
 */
export type MealMenu = {
  meal_date: string; // YYYY-MM-DD
  breakfast_item: string | null;
  lunch_item: string | null;
  dinner_item: string | null;
  updated_at: string;
};

export type AdminProfile = {
  id: string;
  full_name: string | null;
  role: "admin";
  created_at: string;
};

/**
 * One mess month, owned by a single mess manager. It runs meal by meal from
 * start_meal on start_date to end_meal on end_date, both inclusive — the
 * standard month is 5th lunch → next 5th breakfast (0015).
 */
export type MessPeriod = {
  id: string;
  manager_id: string;
  start_date: string; // YYYY-MM-DD: date of the first meal
  start_meal: MealType; // the first meal, on start_date
  end_date: string; // YYYY-MM-DD: date of the last meal
  end_meal: MealType; // the last meal, on end_date
  /** Every meal numbered in time order (private.meal_slot): first and last owned. */
  first_slot: number;
  last_slot: number;
  /**
   * The rate the manager is testing (BDT per meal count). Bills on the
   * manager's own pages use it; employees never see it. Null until set.
   */
  meal_rate: number | null;
  /** The rate employees see with their bill; null until published. */
  published_meal_rate: number | null;
  /** When published_meal_rate was last set (set by the database). */
  rate_published_at: string | null;
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

/**
 * Guests declared for one date (0014): a count per meal. One row per month
 * and date (0015): on the 5th, each month's row has only its own meals'
 * guests. No row = no guests. Bills are never stored — see
 * src/lib/utils/guests.ts.
 */
export type GuestMeal = {
  meal_date: string; // YYYY-MM-DD; primary key with period_id
  period_id: string;
  breakfast_guests: number;
  lunch_guests: number;
  dinner_guests: number;
  updated_at: string;
};

/** Today's guest counts for the cook's meal board (get_today_guest_meals). */
export type TodayGuestMealsRow = Pick<
  GuestMeal,
  "meal_date" | "breakfast_guests" | "lunch_guests" | "dinner_guests"
>;

/** One spending entry (0014). Any number per date. */
export type SpendingRecord = {
  id: string;
  period_id: string;
  spent_on: string; // YYYY-MM-DD
  person_name: string;
  amount: number;
  created_at: string;
  updated_at: string;
};

/**
 * The signed-in manager's month, for one date (get_my_meal_access): whether
 * the month is open for changing employee meals, which of the date's meals
 * it owns, and which of them the manager may change right now.
 */
export type MyMealAccessRow = {
  period_status: "upcoming" | "active" | "completed";
  breakfast_owned: boolean;
  lunch_owned: boolean;
  dinner_owned: boolean;
  breakfast_can_change: boolean;
  lunch_can_change: boolean;
  dinner_can_change: boolean;
};

/** The month's spending, added up by the database (get_spending_total). */
export type SpendingTotalRow = {
  entry_count: number;
  total_amount: number;
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

export type DashboardStatsRow = {
  active_employees: number;
  /** Today has at least one of the period's meals (its first and last dates count). */
  today_in_period: boolean;
  /** Null when today's meal belongs to another month's period (on the 5th). */
  today_breakfast: number | null;
  today_lunch: number | null;
  today_dinner: number | null;
  meal_count: number;
  total_deposit: number;
  /** Null until the meal rate is set. */
  total_bill: number | null;
  total_due: number | null;
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
      employee_accounts: {
        Row: EmployeeAccount;
        Insert: { employee_id: string; phone: string };
        Update: { phone?: string };
        Relationships: [
          {
            foreignKeyName: "employee_accounts_employee_id_fkey";
            columns: ["employee_id"];
            // employee_id is the primary key: at most one account per employee.
            isOneToOne: true;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      meal_records: {
        Row: MealRecord;
        Insert: Partial<MealRecord> & { employee_id: string; meal_date: string };
        Update: Partial<MealRecord>;
        Relationships: [
          {
            foreignKeyName: "meal_records_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      meal_cutoffs: {
        Row: MealCutoffsRow;
        Insert: Partial<MealCutoffsRow>;
        Update: Partial<MealCutoffsRow>;
        Relationships: [];
      };
      meal_menus: {
        Row: MealMenu;
        Insert: Partial<MealMenu> & { meal_date: string };
        Update: Partial<MealMenu>;
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
        Relationships: [
          {
            foreignKeyName: "deposits_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      guest_meals: {
        Row: GuestMeal;
        Insert: Partial<GuestMeal> & { meal_date: string; period_id: string };
        Update: Partial<GuestMeal>;
        Relationships: [];
      };
      spending_records: {
        Row: SpendingRecord;
        // Only these columns are granted to managers (0014).
        Insert: Pick<SpendingRecord, "period_id" | "spent_on" | "person_name" | "amount">;
        Update: Partial<Pick<SpendingRecord, "spent_on" | "person_name" | "amount">>;
        Relationships: [];
      };
      mess_periods: {
        Row: MessPeriod;
        Insert: Partial<MessPeriod> & { start_date: string; end_date: string };
        Update: Partial<MessPeriod>;
        Relationships: [
          {
            foreignKeyName: "mess_periods_manager_id_fkey";
            columns: ["manager_id"];
            // manager_id is unique: one account manages exactly one month.
            isOneToOne: true;
            referencedRelation: "admin_profiles";
            referencedColumns: ["id"];
          },
        ];
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
      get_dashboard_stats: {
        Args: { p_period_id: string; p_today: string };
        Returns: DashboardStatsRow[];
      };
      get_period_report: {
        Args: { p_period_id: string };
        Returns: PeriodReportRow[];
      };
      register_mess_manager: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      employee_signup_status: {
        Args: { p_phone: string };
        Returns: EmployeeSignupStatus;
      };
      register_employee: {
        Args: Record<string, never>;
        Returns: EmployeeSignupStatus;
      };
      reset_employee_login: {
        Args: { p_employee_id: string };
        Returns: boolean;
      };
      get_my_meal_days: {
        Args: { p_start: string };
        Returns: MyMealDayRow[];
      };
      get_my_statement: {
        Args: { p_start: string };
        Returns: MyStatementRow[];
      };
      get_today_guest_meals: {
        Args: Record<string, never>;
        Returns: TodayGuestMealsRow[];
      };
      get_spending_total: {
        Args: { p_period_id: string };
        Returns: SpendingTotalRow[];
      };
      get_my_meal_access: {
        Args: { p_meal_date: string };
        Returns: MyMealAccessRow[];
      };
    };
  };
};
