"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { resolveActiveUserId } from "@/lib/userHelper";

export interface StapleRecipe {
  id: string;
  recipe_name: string;
  meal_category: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  icon: string;
  created_at?: string;
}

interface RecipeBuilderProps {
  user?: any;
  onRecipeLogged?: () => void;
}

export const DEFAULT_STAPLE_RECIPES: StapleRecipe[] = [
  {
    id: "r-chicken",
    recipe_name: "Air-Fried Chicken (Minimal Oil)",
    meal_category: "Lunch",
    calories: 320,
    protein: 60,
    carbs: 0,
    fat: 8,
    icon: "🍗",
  },
  {
    id: "r-shake",
    recipe_name: "Whey Protein Shake & Oats",
    meal_category: "Snack",
    calories: 290,
    protein: 35,
    carbs: 28,
    fat: 4,
    icon: "🥤",
  },
  {
    id: "r-eggs",
    recipe_name: "4 Whole Eggs & Sourdough Toast",
    meal_category: "Breakfast",
    calories: 410,
    protein: 26,
    carbs: 24,
    fat: 22,
    icon: "🍳",
  },
  {
    id: "r-beef-rice",
    recipe_name: "Lean Beef Bowl & Basmati Rice",
    meal_category: "Dinner",
    calories: 520,
    protein: 48,
    carbs: 55,
    fat: 12,
    icon: "🥩",
  },
];

export const RECIPE_ICONS = ["🥗", "🍗", "🥩", "🍳", "🥤", "🥣", "🐟", "🥪", "🥑"];

export default function RecipeBuilder({ user, onRecipeLogged }: RecipeBuilderProps) {
  const [recipes, setRecipes] = useState<StapleRecipe[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form Inputs
  const [recipeName, setRecipeName] = useState<string>("");
  const [mealCategory, setMealCategory] = useState<string>("Lunch");
  const [calories, setCalories] = useState<string>("");
  const [protein, setProtein] = useState<string>("");
  const [carbs, setCarbs] = useState<string>("");
  const [fat, setFat] = useState<string>("");
  const [selectedIcon, setSelectedIcon] = useState<string>("🥗");

  // Inline Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [editCategory, setEditCategory] = useState<string>("Lunch");
  const [editCalories, setEditCalories] = useState<number>(0);
  const [editProtein, setEditProtein] = useState<number>(0);
  const [editCarbs, setEditCarbs] = useState<number>(0);
  const [editFat, setEditFat] = useState<number>(0);

  // Fetch saved staple recipes from Supabase
  const fetchRecipes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const targetUserId = await resolveActiveUserId(user);
      let query = supabase.from("staple_recipes").select("*");
      if (targetUserId) query = query.eq("user_id", targetUserId);
      const { data, error: dbErr } = await query.order("created_at", { ascending: false });

      if (data && data.length > 0) {
        const formatted: StapleRecipe[] = data.map((d: any) => ({
          id: d.id,
          recipe_name: d.recipe_name,
          meal_category: d.meal_category || "Lunch",
          calories: Number(d.calories),
          protein: Number(d.protein),
          carbs: Number(d.carbs),
          fat: Number(d.fat || d.fats),
          icon: d.icon || "🥗",
          created_at: d.created_at,
        }));
        setRecipes(formatted);
      } else {
        setRecipes(DEFAULT_STAPLE_RECIPES);
      }
    } catch (err: any) {
      console.error("Fetch staple recipes error:", err);
      setRecipes(DEFAULT_STAPLE_RECIPES);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchRecipes();
  }, [fetchRecipes]);

  // Create new staple recipe
  const handleCreateRecipe = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!recipeName.trim()) {
      setError("Please enter a recipe name.");
      return;
    }

    const calVal = Number(calories);
    const pVal = Number(protein);
    const cVal = Number(carbs);
    const fVal = Number(fat);

    if (isNaN(calVal) || calVal < 0 || isNaN(pVal) || isNaN(cVal) || isNaN(fVal)) {
      setError("Please enter valid positive macro numbers.");
      return;
    }

    setSaving(true);
    setError(null);
    setFeedback(null);

    try {
      const targetUserId = await resolveActiveUserId(user);
      const newRecipe: StapleRecipe = {
        id: crypto.randomUUID(),
        recipe_name: recipeName.trim(),
        meal_category: mealCategory,
        calories: calVal,
        protein: pVal,
        carbs: cVal,
        fat: fVal,
        icon: selectedIcon,
        created_at: new Date().toISOString(),
      };

      // Write to Supabase staple_recipes table
      const { error: dbErr } = await supabase.from("staple_recipes").insert([
        {
          id: newRecipe.id,
          user_id: targetUserId || null,
          recipe_name: newRecipe.recipe_name,
          meal_category: newRecipe.meal_category,
          calories: newRecipe.calories,
          protein: newRecipe.protein,
          carbs: newRecipe.carbs,
          fat: newRecipe.fat,
          icon: newRecipe.icon,
        },
      ]);

      if (dbErr) {
        console.warn("Supabase insert warning (local fallback used):", dbErr.message);
      }

      setRecipes((prev) => [newRecipe, ...prev]);
      setFeedback(`✓ Saved staple recipe "${newRecipe.recipe_name}"!`);
      
      // Clear form inputs
      setRecipeName("");
      setCalories("");
      setProtein("");
      setCarbs("");
      setFat("");
      setTimeout(() => setFeedback(null), 3500);
    } catch (err: any) {
      console.error("Save recipe error:", err);
      setError(err.message || "Failed to save staple recipe.");
    } finally {
      setSaving(false);
    }
  };

  // Delete staple recipe
  const handleDeleteRecipe = async (id: string) => {
    setRecipes((prev) => prev.filter((r) => r.id !== id));
    setFeedback("✓ Removed staple recipe.");
    setTimeout(() => setFeedback(null), 3000);

    try {
      await supabase.from("staple_recipes").delete().eq("id", id);
    } catch (err) {
      console.error("Delete recipe error:", err);
    }
  };

  // Save inline edits
  const handleSaveEdit = async (id: string) => {
    if (!editName.trim()) return;

    setRecipes((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              recipe_name: editName.trim(),
              meal_category: editCategory,
              calories: editCalories,
              protein: editProtein,
              carbs: editCarbs,
              fat: editFat,
            }
          : r
      )
    );
    setEditingId(null);
    setFeedback("✓ Updated staple recipe!");
    setTimeout(() => setFeedback(null), 3000);

    try {
      await supabase
        .from("staple_recipes")
        .update({
          recipe_name: editName.trim(),
          meal_category: editCategory,
          calories: editCalories,
          protein: editProtein,
          carbs: editCarbs,
          fat: editFat,
        })
        .eq("id", id);
    } catch (err) {
      console.error("Update recipe error:", err);
    }
  };

  // One-Tap Quick Log recipe directly to meal_logs
  const handleQuickLogToMeals = async (recipe: StapleRecipe) => {
    try {
      const targetUserId = await resolveActiveUserId(user);
      if (!targetUserId) {
        alert("Session error. Refresh page.");
        return;
      }

      const { error: insertErr } = await supabase.from("meal_logs").insert([
        {
          id: crypto.randomUUID(),
          user_id: targetUserId,
          meal_name: recipe.meal_category,
          food_item: recipe.recipe_name,
          state: "Cooked",
          weight_g: 250,
          calories: recipe.calories,
          protein: recipe.protein,
          carbs: recipe.carbs,
          fats: recipe.fat,
        },
      ]);

      if (insertErr) throw insertErr;

      setFeedback(`⚡ One-Tap Logged "${recipe.recipe_name}" (+${recipe.calories} kcal) to ${recipe.meal_category}!`);
      if (onRecipeLogged) onRecipeLogged();
      setTimeout(() => setFeedback(null), 3500);
    } catch (err: any) {
      console.error("Quick log error:", err);
      alert(`Failed to log ${recipe.recipe_name}: ${err.message || err}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="p-6 rounded-2xl bg-[#121216] border border-zinc-800/80 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">👨‍🍳</span>
            <h2 className="text-xl font-extrabold text-white tracking-tight">
              Staple Recipe Builder & One-Tap Logger
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Build custom macro recipes for your staple meals and log them with a single click.
          </p>
        </div>
      </div>

      {/* Notifications */}
      {feedback && (
        <div className="p-4 rounded-xl text-xs font-bold border bg-emerald-950/30 border-emerald-700/60 text-emerald-400 shadow-lg animate-fade-in">
          {feedback}
        </div>
      )}
      {error && (
        <div className="p-4 rounded-xl text-xs font-medium border bg-red-950/20 border-red-900/50 text-[#ff334b]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recipe Builder Form */}
        <div className="p-6 rounded-2xl bg-[#121216] border border-zinc-800/80 shadow-xl space-y-4">
          <div className="border-b border-zinc-800/80 pb-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span>➕</span> Create Staple Recipe
            </h3>
            <p className="text-[11px] text-zinc-400 mt-0.5">Save custom macros for one-tap daily logging</p>
          </div>

          <form onSubmit={handleCreateRecipe} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                Recipe Icon
              </label>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {RECIPE_ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setSelectedIcon(ic)}
                    className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition border ${
                      selectedIcon === ic
                        ? "bg-[#ff334b]/20 border-[#ff334b] text-white"
                        : "bg-[#0b0b0e] border-zinc-800 hover:bg-zinc-800"
                    }`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                Recipe Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Air-Fried Chicken (Low Oil)"
                value={recipeName}
                onChange={(e) => setRecipeName(e.target.value)}
                className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#ff334b] transition font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                Meal Category
              </label>
              <select
                value={mealCategory}
                onChange={(e) => setMealCategory(e.target.value)}
                className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#ff334b] transition font-semibold"
              >
                <option value="Breakfast">🍳 Breakfast</option>
                <option value="Lunch">🍗 Lunch</option>
                <option value="Dinner">🥩 Dinner</option>
                <option value="Snack">🥤 Snack</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                  Calories (kcal)
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  placeholder="320"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-3 py-2 text-sm text-rose-400 font-bold focus:outline-none focus:border-[#ff334b] transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                  Protein (g)
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  placeholder="60"
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                  className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-3 py-2 text-sm text-emerald-400 font-bold focus:outline-none focus:border-[#ff334b] transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                  Carbs (g)
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  placeholder="0"
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                  className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-3 py-2 text-sm text-cyan-400 font-bold focus:outline-none focus:border-[#ff334b] transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                  Fat (g)
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  placeholder="8"
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                  className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-3 py-2 text-sm text-amber-400 font-bold focus:outline-none focus:border-[#ff334b] transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving || loading}
              className="w-full py-3.5 bg-gradient-to-r from-[#ff334b] to-[#ff5b6e] hover:from-[#e02d41] hover:to-[#e04558] disabled:opacity-50 text-white font-bold text-sm rounded-xl transition shadow-lg shadow-[#ff334b]/20 active:scale-[0.98]"
            >
              {saving ? "Saving Recipe..." : "+ Save Staple Recipe"}
            </button>
          </form>
        </div>

        {/* Saved Staple Recipes Grid & Quick Log */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-[#121216] border border-zinc-800/80 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span>📖</span> Saved Staple Recipes ({recipes.length})
              </h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">Click "One-Tap Log" to log directly to daily meals</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[580px] overflow-y-auto pr-1">
            {recipes.map((recipe) => {
              const isEditing = editingId === recipe.id;

              return (
                <div
                  key={recipe.id}
                  className="p-4 rounded-xl bg-[#0b0b0e] border border-zinc-800/80 hover:border-zinc-700 transition flex flex-col justify-between space-y-3 shadow-md"
                >
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white font-bold"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          placeholder="Cal"
                          value={editCalories}
                          onChange={(e) => setEditCalories(Number(e.target.value))}
                          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                        />
                        <input
                          type="number"
                          placeholder="P(g)"
                          value={editProtein}
                          onChange={(e) => setEditProtein(Number(e.target.value))}
                          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          placeholder="C(g)"
                          value={editCarbs}
                          onChange={(e) => setEditCarbs(Number(e.target.value))}
                          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                        />
                        <input
                          type="number"
                          placeholder="F(g)"
                          value={editFat}
                          onChange={(e) => setEditFat(Number(e.target.value))}
                          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(recipe.id)}
                          className="px-2.5 py-1 bg-emerald-600 text-white font-bold text-xs rounded"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-2.5 py-1 bg-zinc-800 text-zinc-300 font-bold text-xs rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-2xl">{recipe.icon || "🥗"}</span>
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
                            {recipe.meal_category}
                          </span>
                        </div>

                        <h4 className="text-sm font-black text-white mt-2">{recipe.recipe_name}</h4>
                        <div className="text-sm font-extrabold text-rose-400 mt-0.5">
                          {recipe.calories} <span className="text-xs font-normal text-zinc-400">kcal</span>
                        </div>

                        <div className="flex items-center gap-2 text-[10px] font-semibold text-zinc-400 mt-2 pt-2 border-t border-zinc-800/60">
                          <span className="text-emerald-400">P: {recipe.protein}g</span>
                          <span>•</span>
                          <span className="text-cyan-400">C: {recipe.carbs}g</span>
                          <span>•</span>
                          <span className="text-amber-400">F: {recipe.fat}g</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/60">
                        <button
                          type="button"
                          onClick={() => handleQuickLogToMeals(recipe)}
                          className="flex-1 py-2 bg-gradient-to-r from-[#ff334b] to-[#ff5b6e] hover:from-[#e02d41] hover:to-[#e04558] text-white font-bold text-xs rounded-xl transition shadow-md shadow-[#ff334b]/20 active:scale-95 flex items-center justify-center gap-1"
                        >
                          <span>⚡ One-Tap Log</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(recipe.id);
                            setEditName(recipe.recipe_name);
                            setEditCategory(recipe.meal_category);
                            setEditCalories(recipe.calories);
                            setEditProtein(recipe.protein);
                            setEditCarbs(recipe.carbs);
                            setEditFat(recipe.fat);
                          }}
                          className="p-2 text-xs text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition"
                          title="Edit Recipe"
                        >
                          ✏️
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteRecipe(recipe.id)}
                          className="p-2 text-xs text-zinc-400 hover:text-red-400 bg-zinc-900 hover:bg-zinc-800 rounded-xl transition"
                          title="Delete Recipe"
                        >
                          🗑️
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
