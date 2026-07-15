"""Import a small, reviewable USDA starter set into the Ryvom foods table.

Run from the project folder after installing requirements using the project's
Python environment.
"""
from pathlib import Path
import tomllib

import pandas as pd
from supabase import create_client

ROOT = Path(__file__).parent
with (ROOT / ".streamlit" / "secrets.toml").open("rb") as file:
    secrets = tomllib.load(file)
supabase = create_client(secrets["SUPABASE_URL"], secrets["SUPABASE_KEY"])

folder = ROOT / "FoodData_Central_csv_2026-04-30"
foods = pd.read_csv(folder / "food.csv", low_memory=False)
foods = foods[foods["data_type"].eq("sr_legacy_food")]
nutrients = pd.read_csv(folder / "food_nutrient.csv", usecols=["fdc_id", "nutrient_id", "amount"], low_memory=False)

terms = ["chicken breast", "broccoli", "oats", "egg, whole", "rice, white", "paneer", "lentil"]
matches = foods[foods["description"].str.contains("|".join(terms), case=False, na=False)].head(200)
macro_names = {1008: "calories", 1003: "protein", 1005: "carbs", 1004: "fat"}

uploaded = 0
for _, food in matches.iterrows():
    food_nutrients = nutrients[nutrients["fdc_id"].eq(food["fdc_id"])]
    payload = {"name": food["description"], "category": "USDA", "serving_g": 100, "calories": 0, "protein": 0, "carbs": 0, "fat": 0, "source": "USDA FoodData Central"}
    for _, nutrient in food_nutrients.iterrows():
        name = macro_names.get(nutrient["nutrient_id"])
        if name:
            payload[name] = float(nutrient["amount"])
    existing = supabase.table("foods").select("id").eq("name", payload["name"]).limit(1).execute().data
    if existing:
        continue
    supabase.table("foods").insert(payload).execute()
    uploaded += 1

print(f"Imported {uploaded} new USDA foods. Existing names were skipped.")
