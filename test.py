"""Small Supabase connectivity check. It never prints secrets."""
from pathlib import Path
import tomllib
from supabase import create_client

with (Path(__file__).parent / ".streamlit" / "secrets.toml").open("rb") as file:
    secrets = tomllib.load(file)
client = create_client(secrets["SUPABASE_URL"], secrets["SUPABASE_KEY"])

for table in ("users", "foods", "meals", "meal_items", "workouts", "workout_sets", "progress", "coach_notes"):
    try:
        rows = client.table(table).select("id").limit(1).execute().data
        print(f"OK   {table:<13} ({len(rows)}+ row returned)")
    except Exception as exc:
        print(f"FAIL {table:<13} {exc}")
