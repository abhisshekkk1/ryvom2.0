"""Print a short food-search sample from Supabase."""
from pathlib import Path
import tomllib
from supabase import create_client

with (Path(__file__).parent / ".streamlit" / "secrets.toml").open("rb") as file:
    secrets = tomllib.load(file)
client = create_client(secrets["SUPABASE_URL"], secrets["SUPABASE_KEY"])

foods = client.table("foods").select("name,calories,protein,carbs,fat,serving_g").ilike("name", "%chicken%").order("name").limit(10).execute().data
print(f"Found {len(foods)} chicken food(s):")
for food in foods:
    print(food)
