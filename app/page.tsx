"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import Auth from "@/components/Auth";
import Dashboard from "@/components/Dashboard";
import StrengthTracker from "@/components/StrengthTracker";
import RecipeBuilder from "@/components/RecipeBuilder";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getOrCreatePublicUser, fileToBase64 } from "@/lib/userHelper";

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"dashboard" | "workouts" | "strength" | "nutrition" | "recipes">("dashboard");

  // Nutrition states
  const [mealName, setMealName] = useState("Breakfast");
  const [foodItem, setFoodItem] = useState("");
  const [foodState, setFoodState] = useState("Raw");
  const [weightG, setWeightG] = useState<number>(100);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [nutritionLoading, setNutritionLoading] = useState(false);
  const [nutritionError, setNutritionError] = useState<string | null>(null);
  const [nutritionSuccess, setNutritionSuccess] = useState<string | null>(null);

  useEffect(() => {
    // 1. Check local storage for ryvom_user
    const localRyvom = localStorage.getItem("ryvom_user");
    if (localRyvom) {
      try {
        setUser(JSON.parse(localRyvom));
        setAuthLoading(false);
        return;
      } catch (e) {
        localStorage.removeItem("ryvom_user");
      }
    }

    // 2. Check active Supabase Auth session & sync to public.users
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const publicUser = await getOrCreatePublicUser(session.user);
        setUser(publicUser || session.user);
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });

    // Listen for auth state shifts
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const publicUser = await getOrCreatePublicUser(session.user);
        setUser(publicUser || session.user);
      } else if (!localStorage.getItem("ryvom_user")) {
        setUser(null);
      }
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    localStorage.removeItem("ryvom_user");
    await supabase.auth.signOut();
    setUser(null);
  };

  const handleCalculateAndLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foodItem.trim() && !imageFile) {
      setNutritionError("Please enter a food item or upload a food photo.");
      return;
    }

    setNutritionLoading(true);
    setNutritionError(null);
    setNutritionSuccess(null);

    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
      if (!apiKey) {
        throw new Error("Missing Gemini API Key in configuration.");
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

      const contents: any[] = [];

      if (imageFile) {
        const { base64Data, mimeType } = await fileToBase64(imageFile);
        contents.push({
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          },
        });
      }

      const prompt = `
        Analyze the provided image of the food or nutrition label. Identify the food, estimate the portion size, and calculate the total calories, protein, carbohydrates, and fats.
        ${foodItem.trim() ? `Additional food details provided by user: "${foodItem}" (State: ${foodState}, Weight: ${weightG}g).` : ""}
        Return strictly valid JSON with keys: "food_item", "calories", "protein", "carbs", "fats", "weight_g".
        Do not include markdown blocks or any other text.
      `;

      contents.push(prompt);

      const result = await model.generateContent(contents);
      const rawText = result.response.text().trim();
      
      // Strip markdown code blocks if any are present
      let cleanJson = rawText;
      if (cleanJson.startsWith("```")) {
        cleanJson = cleanJson.split("\n").slice(1, -1).join("\n").trim();
      }
      
      const macros = JSON.parse(cleanJson);
      
      const calories = parseInt(macros.calories || 0);
      const protein = parseFloat(macros.protein || 0);
      const carbs = parseFloat(macros.carbs || 0);
      const fats = parseFloat(macros.fats || 0);
      const identifiedFood = foodItem.trim() || macros.food_item || "Scanned Food";
      const finalWeight = weightG || parseInt(macros.weight_g || 100);

      // Determine the exact public.users ID for foreign key constraint (meal_logs_user_id_fkey)
      let publicUser = await getOrCreatePublicUser(user);
      if (!publicUser?.id) {
        const { data: authData } = await supabase.auth.getSession();
        if (authData?.session?.user) {
          publicUser = await getOrCreatePublicUser(authData.session.user);
        }
      }

      const currentUserId = publicUser?.id || user?.id;

      if (!currentUserId) {
        alert("Error: Could not verify user session. Please refresh the page.");
        return;
      }

      console.log("Attempting insert for public user ID:", currentUserId);

      const { error: dbError } = await supabase
        .from('meal_logs')
        .insert([{
          id: crypto.randomUUID(),
          user_id: currentUserId,
          meal_name: mealName,
          food_item: identifiedFood,
          state: foodState,
          weight_g: Number(finalWeight),
          calories: Number(calories),
          protein: Number(protein),
          carbs: Number(carbs),
          fats: Number(fats)
        }]);

      if (dbError) throw dbError;

      setNutritionSuccess(
        `Successfully logged ${finalWeight}g of ${identifiedFood} to ${mealName}!\n` +
        `Macros: ${calories} kcal | P: ${protein}g | C: ${carbs}g | F: ${fats}g`
      );
      
      // Clear inputs
      setFoodItem("");
      setWeightG(100);
      setImageFile(null);
      setImagePreview(null);

    } catch (err: any) {
      setNutritionError(err.message || "Failed to calculate or log meal.");
    } finally {
      setNutritionLoading(false);
    }
  };

  // Tab content components
  const renderTabContent = () => {
    switch (activeTab) {
      case "dashboard":
        return (
          <Dashboard
            user={user}
            onNavigateToNutrition={() => setActiveTab("nutrition")}
            onNavigateToWorkouts={() => setActiveTab("workouts")}
            onNavigateToStrength={() => setActiveTab("strength")}
          />
        );
      case "strength":
        return <StrengthTracker user={user} />;
      case "recipes":
        return <RecipeBuilder user={user} />;
      case "workouts":
        return (
          <div className="p-8 rounded-2xl bg-[#121216] border border-zinc-800/50 shadow-xl text-center space-y-3">
            <div className="text-4xl">🏋️‍♂️</div>
            <h3 className="text-xl font-bold text-white">Workout Logger</h3>
            <p className="text-sm text-zinc-400 max-w-md mx-auto">
              Select your routine or record dynamic sets, reps, weight, and RPE.
            </p>
          </div>
        );
      case "nutrition":
        return (
          <div className="p-8 rounded-2xl bg-[#121216] border border-zinc-800/50 shadow-xl space-y-6 max-w-2xl mx-auto">
            <div className="flex items-center gap-3 border-b border-zinc-800/80 pb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-xl">
                🤖
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-white tracking-tight">AI Nutrition Tracker</h3>
                <p className="text-xs text-zinc-400">Describe or scan your food for instant macro calculations</p>
              </div>
            </div>
            
            {nutritionSuccess && (
              <div className="p-4 rounded-xl text-xs font-medium border bg-emerald-950/20 border-emerald-800/50 text-emerald-400 whitespace-pre-line">
                {nutritionSuccess}
              </div>
            )}

            {nutritionError && (
              <div className="p-4 rounded-xl text-xs font-medium border bg-red-950/20 border-red-900/50 text-[#ff334b]">
                {nutritionError}
              </div>
            )}

            <form onSubmit={handleCalculateAndLog} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Meal Name</label>
                <input
                  type="text"
                  value={mealName}
                  onChange={(e) => setMealName(e.target.value)}
                  placeholder="e.g. Breakfast, Post-Workout"
                  className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Food Photo or Label (Camera / File)</label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setImageFile(file);
                    if (file) {
                      const url = URL.createObjectURL(file);
                      setImagePreview(url);
                    } else {
                      setImagePreview(null);
                    }
                  }}
                  className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#ff334b] file:text-white hover:file:bg-[#e02d41] transition cursor-pointer"
                />
                {imagePreview && (
                  <div className="mt-3 relative inline-block">
                    <img src={imagePreview} alt="Food Preview" className="w-24 h-24 object-cover rounded-xl border border-zinc-700 shadow-md" />
                    <button
                      type="button"
                      onClick={() => {
                        setImageFile(null);
                        setImagePreview(null);
                      }}
                      className="absolute -top-2 -right-2 bg-red-600 hover:bg-red-700 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shadow-md"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">What did you eat? (Optional if photo attached)</label>
                <input
                  type="text"
                  value={foodItem}
                  onChange={(e) => setFoodItem(e.target.value)}
                  placeholder="e.g. 4 scrambled eggs and avocado"
                  className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">State</label>
                  <select
                    value={foodState}
                    onChange={(e) => setFoodState(e.target.value)}
                    className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 transition"
                  >
                    <option value="Raw">Raw</option>
                    <option value="Cooked">Cooked</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Weight (g)</label>
                  <input
                    type="number"
                    value={weightG}
                    onChange={(e) => setWeightG(Number(e.target.value))}
                    min="1"
                    className="w-full bg-[#0b0b0e] border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={nutritionLoading}
                className="w-full py-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-red-600/50 disabled:to-red-700/50 text-white font-bold rounded-xl transition shadow-lg shadow-red-950/20 active:scale-[0.98]"
              >
                {nutritionLoading ? "Calculating with AI..." : "Calculate & Log with AI"}
              </button>
            </form>
          </div>
        );
      default:
        return null;
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0b0b0e] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#ff334b]" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0b0b0e] flex items-center justify-center p-4">
        <Auth />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0b0e] text-zinc-100 flex flex-col antialiased">
      {/* Navigation Header */}
      <header className="border-b border-zinc-800/80 bg-[#0e0e12]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#ff334b] to-[#ff5b6e] flex items-center justify-center font-black text-white shadow-lg shadow-[#ff334b]/20">
              R
            </div>
            <span className="font-extrabold text-lg text-white tracking-wide uppercase">Ryvom</span>
          </div>
          
          <nav className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                activeTab === "dashboard"
                  ? "bg-zinc-800/50 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab("workouts")}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                activeTab === "workouts"
                  ? "bg-zinc-800/50 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Workouts
            </button>
            <button
              onClick={() => setActiveTab("strength")}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                activeTab === "strength"
                  ? "bg-zinc-800/50 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Strength
            </button>
            <button
              onClick={() => setActiveTab("nutrition")}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                activeTab === "nutrition"
                  ? "bg-zinc-800/50 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Nutrition
            </button>
            <button
              onClick={() => setActiveTab("recipes")}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                activeTab === "recipes"
                  ? "bg-zinc-800/50 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Recipes
            </button>
            <Link
              href="/analytics"
              className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30 transition"
            >
              Analytics
            </Link>
            <Link
              href="/settings"
              className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30 transition"
            >
              Settings
            </Link>
            
            <div className="h-6 w-px bg-zinc-800 mx-2" />
            
            <button
              onClick={handleSignOut}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800/30 transition"
            >
              Sign Out
            </button>
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        {renderTabContent()}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 bg-[#07070a] py-6 text-center text-xs text-zinc-600">
        &copy; {new Date().getFullYear()} Ryvom App. All rights reserved.
      </footer>
    </div>
  );
}
