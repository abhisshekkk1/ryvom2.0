import hashlib
import html
import os
from collections import defaultdict
from datetime import date, datetime

import pandas as pd
import requests
import streamlit as st
from supabase import Client, create_client


st.set_page_config(page_title="Ryvom", page_icon="\U0001F4AA", layout="wide")

st.markdown(
    """
    <style>
      .stApp { background: #0b0b0e; color: #e2e8f0; }
      header, footer { visibility: hidden; }
      section[data-testid="stSidebar"] { background: #050507; border-right: 1px solid #202027; }
      .ry-card { background:#121216; border:1px solid #24242c; border-radius:16px; padding:20px; margin-bottom:16px; }
      .metric { font-size:28px; font-weight:800; margin:0; }
      .muted { color:#94a3b8; font-size:13px; }
      .meal-row { background:#18181e; border:1px solid #24242c; border-radius:12px; padding:12px 16px; margin:8px 0; }
      .stButton > button { background:linear-gradient(135deg,#ff334b,#d32f2f); color:white; border:0; border-radius:10px; font-weight:700; }
    </style>
    """,
    unsafe_allow_html=True,
)


@st.cache_resource
def get_supabase() -> Client:
    try:
        return create_client(st.secrets["SUPABASE_URL"], st.secrets["SUPABASE_KEY"])
    except (KeyError, FileNotFoundError) as exc:
        st.error("Supabase is not configured. Add SUPABASE_URL and SUPABASE_KEY to .streamlit/secrets.toml.")
        st.stop()


supabase = get_supabase()


def hash_password(password: str) -> str:
    """Compatibility hash for the existing custom users table."""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def verify_password(stored_hash: str, candidate: str) -> bool:
    return stored_hash == hash_password(candidate) or stored_hash == candidate


def initialize_state() -> None:
    defaults = {
        "logged_in": False,
        "user_id": None,
        "username": "",
        "user_type": "",
        "current_view": "Dashboard",
        "today_meals": [],
    }
    for key, value in defaults.items():
        st.session_state.setdefault(key, value)


def reset_session() -> None:
    for key in ("logged_in", "user_id", "username", "user_type", "today_meals"):
        st.session_state.pop(key, None)
    st.session_state["current_view"] = "Dashboard"


def food_macros(food: dict, grams: float) -> dict:
    serving = float(food.get("serving_g") or 100)
    scale = grams / serving
    return {
        "calories": round(float(food.get("calories") or 0) * scale),
        "protein": round(float(food.get("protein") or 0) * scale, 1),
        "carbs": round(float(food.get("carbs") or 0) * scale, 1),
        "fat": round(float(food.get("fat") or 0) * scale, 1),
    }


def find_foods(search_term: str) -> list[dict]:
    query = supabase.table("foods").select("id,name,serving_g,calories,protein,carbs,fat")
    if search_term.strip():
        query = query.ilike("name", f"%{search_term.strip()}%")
    return query.order("name").limit(50).execute().data


def get_or_create_barcode_food(item: dict) -> dict:
    existing = (
        supabase.table("foods")
        .select("id,name,serving_g,calories,protein,carbs,fat")
        .eq("name", item["name"])
        .limit(1)
        .execute()
        .data
    )
    if existing:
        return existing[0]

    payload = {
        "name": item["name"],
        "category": "Packaged food",
        "serving_g": 100,
        "calories": item["calories"],
        "protein": item["protein"],
        "carbs": item["carbs"],
        "fat": item["fat"],
        "source": "Open Food Facts",
    }
    return supabase.table("foods").insert(payload).execute().data[0]


def lookup_barcode(barcode: str) -> dict | None:
    try:
        response = requests.get(
            f"https://world.openfoodfacts.org/api/v2/product/{barcode}.json",
            headers={"User-Agent": "Ryvom/0.1 (development)"},
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()
        if data.get("status") != 1:
            return None
        product = data["product"]
        nutrients = product.get("nutriments", {})
        return {
            "name": product.get("product_name") or product.get("product_name_en") or "Packaged product",
            "calories": float(nutrients.get("energy-kcal_100g") or 0),
            "protein": float(nutrients.get("proteins_100g") or 0),
            "carbs": float(nutrients.get("carbohydrates_100g") or 0),
            "fat": float(nutrients.get("fat_100g") or 0),
        }
    except requests.RequestException:
        return None


def add_meal_item(meal_type: str, food: dict, grams: float) -> None:
    macros = food_macros(food, grams)
    st.session_state.today_meals.append(
        {
            "meal_type": meal_type,
            "food_id": food["id"],
            "food_name": food["name"],
            "grams": grams,
            **macros,
        }
    )


def today_meal_items() -> list[dict]:
    today_start = f"{date.today().isoformat()}T00:00:00"
    meals = (
        supabase.table("meals")
        .select("id,meal_type,meal_date")
        .eq("user_id", st.session_state.user_id)
        .gte("meal_date", today_start)
        .execute()
        .data
    )
    if not meals:
        return []
    meal_type_by_id = {meal["id"]: meal["meal_type"] for meal in meals}
    ids = list(meal_type_by_id)
    return (
        supabase.table("meal_items")
        .select("meal_id,calories,protein,carbs,fat")
        .in_("meal_id", ids)
        .execute()
        .data
    )


def login_or_registration_page() -> None:
    st.markdown("<div style='height:60px'></div>", unsafe_allow_html=True)
    st.markdown("<h1 style='text-align:center;letter-spacing:5px'>RYVOM</h1>", unsafe_allow_html=True)
    st.markdown("<p style='text-align:center;color:#ff334b;font-weight:700;letter-spacing:2px'>BUILD. TRACK. TRANSFORM.</p>", unsafe_allow_html=True)
    
    login_tab, register_tab, recover_tab = st.tabs(["\U0001F512 Sign in", "\u2728 Create client account", "\U0001F511 Recover account"])

    with login_tab:
        with st.form("login_form"):
            username = st.text_input("Username").strip().lower()
            password = st.text_input("Password", type="password")
            submitted = st.form_submit_button("Sign in")
        if submitted:
            if not username or not password:
                st.error("Enter both username and password.")
                return
            result = supabase.table("users").select("id,username,password_hash,role").eq("username", username).limit(1).execute().data
            if not result or not verify_password(result[0]["password_hash"], password):
                st.error("Invalid username or password.")
                return
            user = result[0]
            if user["password_hash"] == password:
                supabase.table("users").update({"password_hash": hash_password(password)}).eq("id", user["id"]).execute()
            st.session_state.update(logged_in=True, user_id=user["id"], username=user["username"], user_type=user["role"])
            st.rerun()

    with register_tab:
        with st.form("register_form", clear_on_submit=True):
            username = st.text_input("Choose a username").strip().lower()
            password = st.text_input("Password", type="password")
            confirm = st.text_input("Confirm password", type="password")
            submitted = st.form_submit_button("Create account")
        if submitted:
            if not username.replace("_", "").isalnum() or len(username) < 3:
                st.error("Use at least 3 letters, numbers, or underscores for the username.")
            elif len(password) < 8:
                st.error("Use a password with at least 8 characters.")
            elif password != confirm:
                st.error("Passwords do not match.")
            else:
                try:
                    supabase.table("users").insert({"username": username, "password_hash": hash_password(password), "role": "client"}).execute()
                    st.success("Account created. You can sign in now.")
                except Exception:
                    st.error("That username is already in use.")
                    
    with recover_tab:
        st.markdown("<div class='ry-card' style='text-align: center; border-top: 4px solid #FF334B;'>", unsafe_allow_html=True)
        st.markdown("### 🔒 Account Locked?")
        st.markdown("<p style='color: #94A3B8; font-size: 14px;'>For security purposes, automated password resets are disabled on client accounts.</p>", unsafe_allow_html=True)
        st.markdown("<br><p style='color: #E2E8F0; font-size: 14px;'>Please contact <b>Coach Abhishek</b> directly to verify your identity and receive a temporary login key.</p>", unsafe_allow_html=True)
        st.markdown("</div>", unsafe_allow_html=True)


def dashboard_page() -> None:
    st.title("Dashboard")
    try:
        items = today_meal_items()
    except Exception as exc:
        st.error(f"Could not load today’s meals: {exc}")
        return
    totals = {key: sum(float(item.get(key) or 0) for item in items) for key in ("calories", "protein", "carbs", "fat")}
    columns = st.columns(4)
    for col, label, value, suffix, colour in zip(
        columns,
        ("Calories", "Protein", "Carbs", "Fat"),
        (round(totals["calories"]), round(totals["protein"], 1), round(totals["carbs"], 1), round(totals["fat"], 1)),
        ("kcal", "g", "g", "g"),
        ("#ff334b", "#00e676", "#00b0ff", "#ffd600"),
    ):
        col.markdown(f"<div class='ry-card'><p class='muted'>{label}</p><p class='metric' style='color:{colour}'>{value}{suffix}</p></div>", unsafe_allow_html=True)

    st.subheader("Today’s meals")
    if not items:
        st.info("No meals saved today. Use Log Food to add your first item.")
    else:
        meal_totals = defaultdict(float)
        for item in items:
            meal_totals[item["meal_id"]] += float(item.get("calories") or 0)
        st.caption(f"{len(items)} food items saved across {len(meal_totals)} meal(s).")


def nutrition_page() -> None:
    st.title("Nutrition database")
    term = st.text_input("Search foods", placeholder="Try chicken, rice, paneer …")
    try:
        foods = find_foods(term)
        if foods:
            st.dataframe(pd.DataFrame(foods).drop(columns=["id"]), use_container_width=True, hide_index=True)
        else:
            st.info("No foods found. Import foods with import_usda.py or add a food in Supabase.")
    except Exception as exc:
        st.error(f"Could not search foods: {exc}")


def log_food_page() -> None:
    st.title("Log food")
    meal_type = st.selectbox("Meal", ["Breakfast", "Lunch", "Dinner", "Snack"])
    manual_tab, barcode_tab = st.tabs(["Search food", "Scan barcode"])

    with manual_tab:
        query = st.text_input("Search your food database", placeholder="Chicken breast")
        try:
            foods = find_foods(query)
        except Exception as exc:
            st.error(f"Could not search foods: {exc}")
            foods = []
        if foods:
            by_label = {f"{food['name']} — {food.get('calories') or 0} kcal / {food.get('serving_g') or 100:g}g": food for food in foods}
            label = st.selectbox("Food", list(by_label))
            food = by_label[label]
            grams = st.number_input("Amount (grams)", min_value=1.0, value=float(food.get("serving_g") or 100), step=1.0)
            macros = food_macros(food, grams)
            st.caption(f"{macros['calories']} kcal · P {macros['protein']}g · C {macros['carbs']}g · F {macros['fat']}g")
            if st.button("Add to meal", key="add_manual"):
                add_meal_item(meal_type, food, grams)
                st.rerun()
        else:
            st.info("Type a food name to search up to 50 matching foods.")

    with barcode_tab:
        with st.form("barcode_form"):
            barcode = st.text_input("Barcode", placeholder="e.g. 3017620422003")
            grams = st.number_input("Amount eaten (grams)", min_value=1.0, value=100.0, step=1.0)
            scan = st.form_submit_button("Find product")
        if scan:
            item = lookup_barcode(barcode.strip())
            if not item:
                st.error("Product not found. Check the barcode or use the food search.")
            else:
                try:
                    food = get_or_create_barcode_food(item)
                    add_meal_item(meal_type, food, grams)
                    st.success(f"Added {food['name']}.")
                except Exception as exc:
                    st.error(f"Could not save the scanned product: {exc}")

    st.subheader("Meal queue")
    queued = st.session_state.today_meals
    if not queued:
        st.caption("Items added here are saved only after you press Save meals.")
        return
    for index, item in enumerate(queued):
        left, right = st.columns([6, 1])
        left.markdown(f"<div class='meal-row'><b>{html.escape(item['meal_type'])}</b> · {html.escape(item['food_name'])}<br><span class='muted'>{item['grams']:g}g · {item['calories']} kcal · P {item['protein']}g · C {item['carbs']}g · F {item['fat']}g</span></div>", unsafe_allow_html=True)
        if right.button("Remove", key=f"remove_{index}"):
            queued.pop(index)
            st.rerun()
    if st.button("Save meals", type="primary"):
        grouped = defaultdict(list)
        for item in queued:
            grouped[item["meal_type"]].append(item)
        try:
            for logged_meal_type, items in grouped.items():
                meal = supabase.table("meals").insert({"user_id": st.session_state.user_id, "meal_type": logged_meal_type, "meal_date": datetime.now().isoformat()}).execute().data[0]
                rows = [{"meal_id": meal["id"], "food_id": item["food_id"], "grams": item["grams"], "calories": item["calories"], "protein": item["protein"], "carbs": item["carbs"], "fat": item["fat"]} for item in items]
                supabase.table("meal_items").insert(rows).execute()
            st.session_state.today_meals = []
            st.success("Meals saved.")
            st.rerun()
        except Exception as exc:
            st.error(f"Could not save meals: {exc}")


def workouts_page() -> None:
    st.title("Log workout")
    exercises = ["Bench Press (Barbell)", "Incline Dumbbell Press", "Shoulder Press"]
    workout_date = st.date_input("Workout date", value=date.today())
    entered_sets = []
    for exercise in exercises:
        st.subheader(exercise)
        for set_number in range(1, 5):
            cols = st.columns([1, 2, 2, 2])
            cols[0].write(f"Set {set_number}")
            weight = cols[1].number_input("Weight (kg)", min_value=0.0, value=0.0, step=0.5, key=f"weight_{exercise}_{set_number}")
            reps = cols[2].number_input("Reps", min_value=0, value=0, step=1, key=f"reps_{exercise}_{set_number}")
            rpe = cols[3].number_input("RPE", min_value=1.0, max_value=10.0, value=8.0, step=0.5, key=f"rpe_{exercise}_{set_number}")
            if weight > 0 and reps > 0:
                entered_sets.append({"exercise": exercise, "set_no": set_number, "weight": weight, "reps": reps, "rpe": rpe})
    if st.button("Save workout", type="primary"):
        if not entered_sets:
            st.warning("Enter at least one completed set first.")
            return
        try:
            workout = supabase.table("workouts").insert({"user_id": st.session_state.user_id, "workout_date": workout_date.isoformat()}).execute().data[0]
            supabase.table("workout_sets").insert([{**entry, "workout_id": workout["id"]} for entry in entered_sets]).execute()
            st.success(f"Saved {len(entered_sets)} sets.")
        except Exception as exc:
            st.error(f"Could not save workout: {exc}")


def progress_page() -> None:
    st.title("Progress")
    with st.form("progress_form"):
        logged_on = st.date_input("Date", value=date.today())
        weight = st.number_input("Body weight (kg)", min_value=0.0, value=0.0, step=0.1)
        waist = st.number_input("Waist (cm)", min_value=0.0, value=0.0, step=0.1)
        submitted = st.form_submit_button("Save progress")
    if submitted:
        try:
            supabase.table("progress").upsert({"user_id": st.session_state.user_id, "date": logged_on.isoformat(), "weight": weight or None, "waist": waist or None}, on_conflict="user_id,date").execute()
            st.success("Progress saved.")
        except Exception as exc:
            st.error(f"Could not save progress: {exc}")
    try:
        history = supabase.table("progress").select("date,weight").eq("user_id", st.session_state.user_id).order("date").execute().data
        history = [item for item in history if item.get("weight") is not None]
        if history:
            st.line_chart(pd.DataFrame(history).set_index("date"))
    except Exception as exc:
        st.warning(f"Could not load chart: {exc}")


def feedback_page() -> None:
    is_coach = st.session_state.user_type == "coach"
    st.title("Coach feedback")
    if is_coach:
        try:
            clients = supabase.table("users").select("id,username").eq("role", "client").order("username").execute().data
        except Exception as exc:
            st.error(f"Could not load clients: {exc}")
            return
        if not clients:
            st.info("Create a client account first.")
            return
        labels = {client["username"]: client for client in clients}
        client_name = st.selectbox("Client", list(labels))
        note = st.text_area("Message")
        if st.button("Send feedback", type="primary"):
            if not note.strip():
                st.warning("Write a message first.")
            else:
                try:
                    supabase.table("coach_notes").insert({"coach_id": st.session_state.user_id, "client_id": labels[client_name]["id"], "note": note.strip()}).execute()
                    st.success("Feedback sent.")
                except Exception as exc:
                    st.error(f"Could not send feedback: {exc}")
                    
        st.divider()
        
        st.subheader("🔑 Admin Password Override")
        with st.form("admin_reset_form", clear_on_submit=True):
            target_reset_user = st.selectbox("Select Target Account to Reset", list(labels))
            new_temp_pass = st.text_input("Set Temporary Password", type="password")
            admin_submit_reset = st.form_submit_button("🚨 Force Password Override")
            
            if admin_submit_reset:
                if len(new_temp_pass) < 4:
                    st.warning("Temporary password must be at least 4 characters.")
                else:
                    try:
                        supabase.table("users").update({"password_hash": hash_password(new_temp_pass)}).eq("username", target_reset_user).execute()
                        st.success(f"Success: Password for '{target_reset_user}' has been overridden.")
                    except Exception as e:
                        st.error(f"Database error: {e}")
                    
    else:
        try:
            notes = supabase.table("coach_notes").select("note,created_at").eq("client_id", st.session_state.user_id).order("created_at", desc=True).limit(20).execute().data
            if notes:
                for note in notes:
                    st.markdown(f"<div class='ry-card'><b>{note['created_at'][:10]}</b><br>{html.escape(note['note'])}</div>", unsafe_allow_html=True)
            else:
                st.info("No coach feedback yet.")
        except Exception as exc:
            st.error(f"Could not load feedback: {exc}")


def app() -> None:
    initialize_state()
    if not st.session_state.logged_in:
        login_or_registration_page()
        return
    pages = ["Dashboard", "Nutrition", "Log Food", "Workouts", "Progress", "Feedback"]
    with st.sidebar:
        st.header("RYVOM")
        st.caption("BUILD. TRACK. TRANSFORM.")
        current = st.radio("Navigation", pages, index=pages.index(st.session_state.current_view))
        st.session_state.current_view = current
        st.divider()
        st.write(f"**{st.session_state.username.title()}**")
        st.caption(st.session_state.user_type.title())
        
        st.divider()
        with st.expander("⚙️ Account Settings"):
            new_my_pass = st.text_input("New Password", type="password", key="my_new_pass")
            if st.button("Update My Password"):
                if len(new_my_pass) < 8:
                    st.warning("Must be at least 8 characters.")
                else:
                    supabase.table("users").update({"password_hash": hash_password(new_my_pass)}).eq("id", st.session_state.user_id).execute()
                    st.success("Password updated!")
                    
        if st.button("Sign out"):
            reset_session()
            st.rerun()
            
    st.caption(f"{datetime.now():%A, %d %B %Y}")
    {"Dashboard": dashboard_page, "Nutrition": nutrition_page, "Log Food": log_food_page, "Workouts": workouts_page, "Progress": progress_page, "Feedback": feedback_page}[st.session_state.current_view]()


if __name__ == "__main__":
    app()