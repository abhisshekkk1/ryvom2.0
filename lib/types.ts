// ─── Core database types matching Supabase schema ───

export interface Client {
  id: string;
  coach_user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  goal: string | null;
  starting_weight: number | null;
  target_weight: number | null;
  target_date: string | null;
  notes: string | null;
  active: boolean;
  is_self?: boolean;
  created_at: string;
  updated_at: string;
}

export type CheckInStatus = "pending" | "reviewed" | "follow_up";

export interface CheckIn {
  id: string;
  client_id: string;
  week_ending: string;
  submitted_at: string;
  weight: number | null;
  average_weight: number | null;
  waist_cm: number | null;
  diet_adherence: number | null;
  training_adherence: number | null;
  average_steps: number | null;
  sleep_hours: number | null;
  hunger: number | null;
  energy: number | null;
  stress: number | null;
  client_notes: string | null;
  photo_front_url: string | null;
  photo_side_url: string | null;
  photo_back_url: string | null;
  status: CheckInStatus;
  created_at: string;
  updated_at: string;
}

export interface CoachReview {
  id: string;
  check_in_id: string;
  coach_notes: string | null;
  wins: string | null;
  issues: string | null;
  adjustments: string | null;
  next_week_goals: string | null;
  reviewed_at: string;
}

export interface ClientAccess {
  id: string;
  client_id: string;
  token_hash: string;
  active: boolean;
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
}

// ─── Performance Tracking Types ───

export type MetricType = "number" | "percentage" | "weight" | "distance" | "time" | "reps";

export interface PerformanceMetric {
  id: string;
  client_id: string;
  name: string;
  unit: string;
  metric_type: MetricType;
  target_value: number | null;
  track_on_checkin: boolean;
  show_on_dashboard: boolean;
  created_at: string;
}

export interface PerformanceLog {
  id: string;
  metric_id: string;
  client_id: string;
  check_in_id: string | null;
  logged_date: string;
  value: number;
  notes: string | null;
  created_at: string;
}

export interface PerformanceWithLogs extends PerformanceMetric {
  logs: PerformanceLog[];
  starting_value?: number | null;
  current_value?: number | null;
  best_value?: number | null;
  absolute_change?: number | null;
  percentage_change?: number | null;
}

// ─── Coach Private Notes Timeline ───

export interface CoachTimelineNote {
  id: string;
  client_id: string;
  note_date: string;
  note: string;
  category: string;
  created_at: string;
}

// ─── API payload types ───

export interface AddClientPayload {
  full_name: string;
  email?: string;
  phone?: string;
  goal?: string;
  starting_weight?: number;
  target_weight?: number;
  target_date?: string;
  notes?: string;
  is_self?: boolean;
}

export interface UpdateClientPayload extends Partial<AddClientPayload> {
  active?: boolean;
}

export interface SaveReviewPayload {
  wins: string;
  issues: string;
  adjustments: string;
  next_week_goals: string;
  coach_notes: string;
}

export interface CheckInPayload {
  week_ending: string;
  weight?: number | null;
  average_weight?: number | null;
  waist_cm?: number | null;
  diet_adherence?: number | null;
  training_adherence?: number | null;
  average_steps?: number | null;
  sleep_hours?: number | null;
  hunger?: number | null;
  energy?: number | null;
  stress?: number | null;
  client_notes?: string | null;
  photo_front_url?: string | null;
  photo_side_url?: string | null;
  photo_back_url?: string | null;
}

// ─── Date Range Filtering ───

export type DateRangePreset = "4w" | "8w" | "12w" | "6m" | "1y" | "all" | "custom";

export interface DateRangeFilter {
  preset: DateRangePreset;
  startDate?: string;
  endDate?: string;
}

// ─── Analytics & Calculations ───

export interface MetricSummary {
  first: number | null;
  latest: number | null;
  highest: number | null;
  lowest: number | null;
  average: number | null;
  absoluteChange: number | null;
  percentageChange: number | null;
  count: number;
}

export interface PeriodComparisonData {
  currentPeriodLabel: string;
  previousPeriodLabel: string;
  metrics: {
    label: string;
    unit: string;
    currentValue: number | null;
    previousValue: number | null;
    difference: number | null;
    percentageDifference: number | null;
  }[];
}

// ─── Client with latest check-in & progress summary ───

export interface ClientWithCheckIn extends Client {
  latest_checkin?: CheckIn | null;
  starting_weight_calc?: number | null;
  current_weight_calc?: number | null;
  weight_change_calc?: number | null;
  starting_waist_calc?: number | null;
  current_waist_calc?: number | null;
  waist_change_calc?: number | null;
  avg_diet_calc?: number | null;
  avg_training_calc?: number | null;
  total_checkins_count?: number;
  attention_flags?: string[];
}