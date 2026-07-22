"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { getOrCreatePublicUser, resolveActiveUserId } from "@/lib/userHelper";

// Fallback default targets
export const DEFAULT_TARGETS = {
  target_calories: 2200,
  target_protein: 180, // grams
  target_carbs: 150,   // grams
  target_fats: 60,     // grams
};

export interface StapleMeal {
  id: string;
  name: string;
  food_item: string;
  weight_g: number;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  icon: string;
}

// Configurable favorite staple meals array
export const STAPLE_MEALS: StapleMeal[] = [
  {
    id: "staple-chicken",
    name: "Lunch",
    food_item: "Air-Fried Chicken (Minimal Oil)",
    weight_g: 200,
    calories: 320,
    protein: 60,
    carbs: 0,
    fats: 8,
    icon: "🍗",
  },
  {
    id: "staple-shake",
    name: "Snack",
    food_item: "Whey Protein Shake & Oats",
    weight_g: 350,
    calories: 290,
    protein: 35,
    carbs: 28,
    fats: 4,
    icon: "🥤",
  },
  {
    id: "staple-eggs",
    name: "Breakfast",
    food_item: "4 Whole Eggs & Toast",
    weight_g: 250,
    calories: 410,
    protein: 26,
    carbs: 24,
    fats: 22,
    icon: "🍳",
  },
  {
    id: "staple-beef-rice",
    name: "Dinner",
    food_item: "Lean Beef Bowl & Rice",
    weight_g: 300,
    calories: 520,
    protein: 48,
    carbs: 55,
    fats: 12,
    icon: "🥩",
  },
];

interface UserSettings {
  target_calories: number;
  target_protein: number;
  target_carbs: number;
  target_fats: number;
}

interface MealLog {
  id: string;
  meal_name: string;
  food_item: string;
  weight_g: number;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  logged_at: string;
}

interface DashboardProps {
  user: any;
  onNavigateToNutrition?: () => void;
  onNavigateToWorkouts?: () => void;
}

export default function Dashboard({ user, onNavigateToNutrition, onNavigateToWorkouts }: DashboardProps) {
  const [todayMeals, setTodayMeals] = useState<MealLog[]>([]);
  const [targets, setTargets] = useState<UserSettings>(DEFAULT_TARGETS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Quick-Add feedback states
  const [addingStapleId, setAddingStapleId] = useState<string | null>(null);
  const [quickAddFeedback, setQuickAddFeedback] = useState<string | null>(null);

  // Inline editing states for logged meals
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [editingGrams, setEditingGrams] = useState<number>(0);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const targetUserId = await resolveActiveUserId(user);

      // 1. Fetch dynamic user target goals from user_settings table for user_id
      let settingsData = null;
      if (targetUserId) {
        const { data: userSet } = await supabase
          .from("user_settings")
          .select("*")
          .eq("user_id", targetUserId)
          .maybeSingle();
        settingsData = userSet;
      }

      if (!settingsData) {
        const { data: globalSet } = await supabase
          .from("user_settings")
          .select("*")
          .limit(1)
          .maybeSingle();
        settingsData = globalSet;
      }

      // Check localStorage for ryvom_user_settings override
      let localTargets = null;
      if (typeof window !== "undefined") {
        const s = localStorage.getItem("ryvom_user_settings");
        if (s) {
          try {
            const parsed = JSON.parse(s);
            if (parsed.target_calories) localTargets = parsed;
          } catch (e) {}
        }
      }

      if (localTargets) {
        setTargets({
          target_calories: Number(localTargets.target_calories) || DEFAULT_TARGETS.target_calories,
          target_protein: Number(localTargets.target_protein) || DEFAULT_TARGETS.target_protein,
          target_carbs: Number(localTargets.target_carbs) || DEFAULT_TARGETS.target_carbs,
          target_fats: Number(localTargets.target_fats) || DEFAULT_TARGETS.target_fats,
        });
      } else if (settingsData) {
        setTargets({
          target_calories: Number(settingsData.target_calories) || DEFAULT_TARGETS.target_calories,
          target_protein: Number(settingsData.target_protein) || DEFAULT_TARGETS.target_protein,
          target_carbs: Number(settingsData.target_carbs) || DEFAULT_TARGETS.target_carbs,
          target_fats: Number(settingsData.target_fats) || DEFAULT_TARGETS.target_fats,
        });
      } else {
        setTargets(DEFAULT_TARGETS);
      }

      if (!targetUserId) {
        setLoading(false);
        return;
      }

      // 2. Calculate start and end of today in local timezone
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const { data: mealsData, error: dbError } = await supabase
        .from("meal_logs")
        .select("*")
        .eq("user_id", targetUserId)
        .gte("logged_at", startOfDay.toISOString())
        .lte("logged_at", endOfDay.toISOString())
        .order("logged_at", { ascending: false });

      if (dbError) throw dbError;
      setTodayMeals(mealsData || []);
    } catch (err: any) {
      console.error("Supabase Error:", err);
      setError("Failed to fetch today's dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Delete logged meal item handler
  const handleDeleteMeal = async (mealId: string) => {
    // Optimistically remove from state so consumption totals and rings update live
    setTodayMeals((prev) => prev.filter((m) => m.id !== mealId));
    setQuickAddFeedback("✓ Removed food item");
    setTimeout(() => setQuickAddFeedback(null), 3000);

    try {
      const targetUserId = await resolveActiveUserId(user);
      let query = supabase.from("meal_logs").delete().eq("id", mealId);
      if (targetUserId) query = query.eq("user_id", targetUserId);

      const { error: delErr } = await query;
      if (delErr) {
        console.error("Delete meal_logs error:", delErr);
        await supabase.from("meals").delete().eq("id", mealId);
      }
    } catch (err: any) {
      console.error("Delete meal error:", err);
    }
  };

  // Edit quantity / grams handler
  const handleSaveEditedGrams = async (meal: MealLog, newGrams: number) => {
    if (!newGrams || newGrams <= 0 || newGrams === meal.weight_g) {
      setEditingMealId(null);
      return;
    }

    const oldGrams = meal.weight_g || 100;
    const ratio = newGrams / oldGrams;

    const updatedMeal: MealLog = {
      ...meal,
      weight_g: newGrams,
      calories: Math.max(1, Math.round(meal.calories * ratio)),
      protein: Math.max(0, Math.round((meal.protein * ratio) * 10) / 10),
      carbs: Math.max(0, Math.round((meal.carbs * ratio) * 10) / 10),
      fats: Math.max(0, Math.round((meal.fats * ratio) * 10) / 10),
    };

    // Optimistically update local state so totals recalculate in real-time
    setTodayMeals((prev) => prev.map((m) => (m.id === meal.id ? updatedMeal : m)));
    setEditingMealId(null);
    setQuickAddFeedback(`✓ Recalculated macros for ${newGrams}g (${updatedMeal.calories} kcal)`);
    setTimeout(() => setQuickAddFeedback(null), 3500);

    try {
      const targetUserId = await resolveActiveUserId(user);
      let query = supabase
        .from("meal_logs")
        .update({
          weight_g: updatedMeal.weight_g,
          calories: updatedMeal.calories,
          protein: updatedMeal.protein,
          carbs: updatedMeal.carbs,
          fats: updatedMeal.fats,
        })
        .eq("id", meal.id);

      if (targetUserId) query = query.eq("user_id", targetUserId);

      const { error: updateErr } = await query;
      if (updateErr) {
        console.error("Update meal_logs error:", updateErr);
      }
    } catch (err: any) {
      console.error("Update meal error:", err);
    }
  };

  // Quick-Add Async Handler
  const handleQuickAdd = async (staple: StapleMeal) => {
    setAddingStapleId(staple.id);
    setQuickAddFeedback(null);

    try {
      const targetUserId = await resolveActiveUserId(user);
      if (!targetUserId) {
        alert("Could not verify user session for quick add.");
        return;
      }

      const { error: insertErr } = await supabase
        .from("meal_logs")
        .insert([
          {
            id: crypto.randomUUID(),
            user_id: targetUserId,
            meal_name: staple.name,
            food_item: staple.food_item,
            state: "Cooked",
            weight_g: staple.weight_g,
            calories: staple.calories,
            protein: staple.protein,
            carbs: staple.carbs,
            fats: staple.fats,
          },
        ]);

      if (insertErr) throw insertErr;

      // Provide immediate success feedback banner
      setQuickAddFeedback(`⚡ Added "${staple.food_item}" (+${staple.calories} kcal)`);

      // Instantly refresh dashboard data so macro rings update without manual reload
      await fetchDashboardData();

      // Clear feedback after 3.5s
      setTimeout(() => {
        setQuickAddFeedback(null);
      }, 3500);
    } catch (err: any) {
      console.error("Quick Add Error:", err);
      alert(`Failed to add ${staple.food_item}: ${err.message || err}`);
    } finally {
      setAddingStapleId(null);
    }
  };

  // Aggregate today's totals
  const totals = todayMeals.reduce(
    (acc, meal) => ({
      calories: acc.calories + (Number(meal.calories) || 0),
      protein: acc.protein + (Number(meal.protein) || 0),
      carbs: acc.carbs + (Number(meal.carbs) || 0),
      fats: acc.fats + (Number(meal.fats) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );

  const calcPercent = (val: number, target: number) => {
    if (!target || target <= 0) return 0;
    return Math.min(100, Math.round((val / target) * 100));
  };

  const metrics = [
    {
      key: "calories",
      label: "Calories",
      current: Math.round(totals.calories),
      target: targets.target_calories,
      unit: "kcal",
      colorGradient: "from-red-500 to-rose-600",
      textColor: "text-rose-500",
      bgColor: "bg-rose-500/10",
      borderColor: "border-rose-500/20",
      icon: "🔥",
    },
    {
      key: "protein",
      label: "Protein",
      current: Math.round(totals.protein * 10) / 10,
      target: targets.target_protein,
      unit: "g",
      colorGradient: "from-emerald-500 to-teal-500",
      textColor: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
      borderColor: "border-emerald-500/20",
      icon: "🥩",
    },
    {
      key: "carbs",
      label: "Carbohydrates",
      current: Math.round(totals.carbs * 10) / 10,
      target: targets.target_carbs,
      unit: "g",
      colorGradient: "from-blue-500 to-cyan-500",
      textColor: "text-cyan-400",
      bgColor: "bg-cyan-500/10",
      borderColor: "border-cyan-500/20",
      icon: "🍚",
    },
    {
      key: "fats",
      label: "Fats",
      current: Math.round(totals.fats * 10) / 10,
      target: targets.target_fats,
      unit: "g",
      colorGradient: "from-amber-400 to-yellow-500",
      textColor: "text-amber-400",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/20",
      icon: "🥑",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 rounded-2xl bg-[#121216] border border-zinc-800/80 shadow-xl">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <span>📊</span> Analytics Dashboard
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time daily macro totals against target goals
          </p>
        </div>
        <button
          onClick={fetchDashboardData}
          disabled={loading}
          className="self-start sm:self-auto px-4 py-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition border border-zinc-700/50 flex items-center gap-2 active:scale-95 disabled:opacity-50"
        >
          <span className={loading ? "animate-spin" : ""}>🔄</span> Refresh
        </button>
      </div>

      {/* Quick-Add / Feedback Banner */}
      {quickAddFeedback && (
        <div className="p-4 rounded-xl text-xs font-bold border bg-emerald-950/30 border-emerald-700/60 text-emerald-400 shadow-lg animate-fade-in flex items-center justify-between">
          <span>{quickAddFeedback}</span>
          <span className="text-emerald-500 text-xs font-normal">Updated rings</span>
        </div>
      )}

      {/* Loading Skeletons */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="p-6 rounded-2xl bg-[#121216] border border-zinc-800/50 space-y-3 animate-pulse">
              <div className="h-4 bg-zinc-800 rounded w-1/2"></div>
              <div className="h-8 bg-zinc-800 rounded w-3/4"></div>
              <div className="h-2.5 bg-zinc-800 rounded w-full"></div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl text-xs font-medium border bg-red-950/20 border-red-900/50 text-[#ff334b]">
          {error}
        </div>
      ) : (
        <>
          {/* Macro Metric Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {metrics.map((m) => {
              const pct = calcPercent(m.current, m.target);
              return (
                <div
                  key={m.key}
                  className="p-6 rounded-2xl bg-[#121216] border border-zinc-800/60 shadow-xl flex flex-col justify-between transition hover:border-zinc-700/80"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span>{m.icon}</span> {m.label}
                      </span>
                      <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${m.bgColor} ${m.textColor} ${m.borderColor} border`}>
                        {pct}%
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between mb-2">
                      <div className="text-2xl font-black text-white tracking-tight">
                        {m.current} <span className="text-xs font-normal text-zinc-400">{m.unit}</span>
                      </div>
                      <div className="text-xs text-zinc-500 font-medium">
                        Target: {m.target} {m.unit}
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar Container */}
                  <div className="w-full bg-[#1b1b22] h-2.5 rounded-full overflow-hidden mt-3 border border-zinc-800/80">
                    <div
                      className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${m.colorGradient}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick-Add Staples Section */}
          <div className="p-6 rounded-2xl bg-[#121216] border border-zinc-800/60 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <span>⚡</span> Quick-Add Favorite Staples
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Tap any staple to log instantly and update today's macros
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {STAPLE_MEALS.map((staple) => {
                const isAdding = addingStapleId === staple.id;
                return (
                  <button
                    key={staple.id}
                    onClick={() => handleQuickAdd(staple)}
                    disabled={isAdding || loading}
                    className="p-4 rounded-xl bg-[#0b0b0e] border border-zinc-800/80 hover:border-[#ff334b]/60 hover:bg-zinc-900/60 transition text-left space-y-2 group active:scale-[0.98] disabled:opacity-50 relative overflow-hidden"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xl">{staple.icon}</span>
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 group-hover:bg-[#ff334b] group-hover:text-white transition">
                        {isAdding ? "Adding..." : "+ Quick Add"}
                      </span>
                    </div>

                    <div>
                      <div className="text-xs font-bold text-white line-clamp-1 group-hover:text-[#ff334b] transition">
                        {staple.food_item}
                      </div>
                      <div className="text-[11px] font-semibold text-rose-400 mt-0.5">
                        {staple.calories} kcal
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-medium pt-1 border-t border-zinc-800/60">
                      <span className="text-emerald-400">P: {staple.protein}g</span>
                      <span>•</span>
                      <span className="text-cyan-400">C: {staple.carbs}g</span>
                      <span>•</span>
                      <span className="text-amber-400">F: {staple.fats}g</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Today's Logged Meals Section with Delete & Quantity Editing */}
          <div className="p-6 rounded-2xl bg-[#121216] border border-zinc-800/60 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <span>🍽️</span> Today's Logged Meals ({todayMeals.length})
              </h3>
              {onNavigateToNutrition && (
                <button
                  onClick={onNavigateToNutrition}
                  className="px-3 py-1.5 rounded-lg bg-[#ff334b] hover:bg-[#e02d41] text-white font-bold text-xs transition active:scale-95 shadow-md shadow-[#ff334b]/20"
                >
                  + Log Meal with AI
                </button>
              )}
            </div>

            {todayMeals.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-zinc-800 rounded-xl bg-[#0b0b0e]/40 space-y-3">
                <div className="text-3xl">🥗</div>
                <p className="text-xs text-zinc-400 font-medium">No meals logged for today yet.</p>
                {onNavigateToNutrition && (
                  <button
                    onClick={onNavigateToNutrition}
                    className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-white transition"
                  >
                    Scan or Log First Meal
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/60">
                {todayMeals.map((meal) => {
                  const isEditingThis = editingMealId === meal.id;
                  return (
                    <div key={meal.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group">
                      <div className="space-y-1">
                        <div className="text-sm font-bold text-white flex items-center gap-2">
                          <span>{meal.meal_name}</span>
                          <span className="text-xs font-medium text-zinc-400">({meal.food_item})</span>
                        </div>

                        {/* Inline Grams Editing */}
                        <div className="flex items-center gap-2 text-xs text-zinc-400">
                          {isEditingThis ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                required
                                min="1"
                                max="5000"
                                value={editingGrams}
                                onChange={(e) => setEditingGrams(Number(e.target.value))}
                                className="w-20 bg-[#0b0b0e] border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-[#ff334b]"
                              />
                              <span className="text-xs text-zinc-400">g</span>
                              <button
                                onClick={() => handleSaveEditedGrams(meal, editingGrams)}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded-md transition"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingMealId(null)}
                                className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] rounded-md transition"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-zinc-300">{meal.weight_g}g</span>
                              <button
                                onClick={() => {
                                  setEditingMealId(meal.id);
                                  setEditingGrams(meal.weight_g);
                                }}
                                title="Edit weight in grams"
                                className="text-[10px] font-medium text-zinc-500 hover:text-zinc-200 underline transition"
                              >
                                ✏️ Edit g
                              </button>
                              <span>•</span>
                              <span className="text-zinc-500">
                                {new Date(meal.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3">
                        <div className="flex items-center gap-2 text-xs font-semibold">
                          <span className="text-rose-400 font-bold bg-rose-500/10 px-2 py-1 rounded-md border border-rose-500/20">
                            {meal.calories} kcal
                          </span>
                          <span className="text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md">
                            P: {meal.protein}g
                          </span>
                          <span className="text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded-md">
                            C: {meal.carbs}g
                          </span>
                          <span className="text-amber-400 bg-amber-500/10 px-2 py-1 rounded-md">
                            F: {meal.fats}g
                          </span>
                        </div>

                        {/* Delete Logged Meal Button */}
                        <button
                          onClick={() => handleDeleteMeal(meal.id)}
                          title="Delete logged item"
                          className="p-1.5 rounded-lg bg-zinc-800/40 hover:bg-red-950/60 text-zinc-500 hover:text-red-400 border border-zinc-800 hover:border-red-900/50 transition active:scale-95"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
