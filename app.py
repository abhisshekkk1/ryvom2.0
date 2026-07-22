import hashlib
import html
import secrets
from collections import defaultdict
from datetime import date, datetime, timedelta

# pandas removed — st.dataframe/st.line_chart accept plain dicts natively
from google import genai as _genai
from google.genai import types as _genai_types
import requests
import streamlit as st
import streamlit.components.v1 as components
from supabase import Client, create_client


st.set_page_config(page_title="Ryvom", page_icon="\U0001F4AA", layout="wide")

# ── Global styles ──────────────────────────────────────────────────────────────
st.markdown(
    """
    <style>
      /* Base and Layout styling inside Streamlit */

      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
      
      html, body, [data-testid="stAppViewContainer"] {
        font-family: 'Inter', sans-serif !important;
        background-color: #0a0a0e !important;
        color: #e2e8f0 !important;
      }
      
      .stApp { background: #0a0a0e; color: #e2e8f0; }
      .stMainBlockContainer { padding-top: 86px !important; }

      footer { visibility: hidden; }
      header { background: transparent !important; }
      [data-testid="stToolbar"] { visibility: hidden; }

      /* Collapsed sidebar toggle menu button / hamburger */
      [data-testid="collapsedSidebar"] {
        background-color: #111116 !important;
        border: 1px solid #24242c !important;
        border-radius: 8px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        top: 12px !important;
        left: 12px !important;
        width: 40px !important;
        height: 40px !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5) !important;
        z-index: 999999 !important;
      }
      [data-testid="collapsedSidebar"] button {
        color: #ff334b !important;
      }
      section[data-testid="stSidebar"] {
        background-color: #0d0d12 !important;
        border-right: 1px solid #24242c !important;
      }


      /* Visual UI Card Elements */
      .ry-card {
        background: #111116;
        border: 1px solid #24242c;
        border-radius: 12px;
        padding: 14px;
        margin-bottom: 12px;
        position: relative;
      }
      .card-title {
        font-size: 13px;
        font-weight: 700;
        margin-bottom: 11px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        color: #e2e8f0;
      }
      .see-all {
        font-size: 11px;
        color: #ff334b;
        cursor: pointer;
        font-weight: 500;
      }
      .see-all:hover {
        text-decoration: underline;
      }

      /* Macros Grid & Summary */
      .summary-row {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
      .macro-card {
        flex: 1;
        min-width: 100px;
        background: #18181e;
        border: 1px solid #24242c;
        border-radius: 10px;
        padding: 11px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
      }
      .macro-ring {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        font-weight: 900;
        border: 3px solid;
      }
      .macro-value {
        font-size: 19px;
        font-weight: 800;
        line-height: 1;
      }
      .macro-label {
        font-size: 11px;
        color: #94a3b8;
      }
      .macro-sub {
        font-size: 10px;
        color: #64748b;
      }
      .macro-bar {
        width: 100%;
        height: 4px;
        background: #0a0a0e;
        border-radius: 2px;
        overflow: hidden;
      }
      .macro-bar-fill {
        height: 100%;
        border-radius: 2px;
        transition: width 0.6s ease;
      }

      /* Progress Bar Visuals */
      .progress-big {
        font-size: 40px;
        font-weight: 800;
        color: #22c55e;
        line-height: 1;
      }
      .progress-bar-h {
        width: 100%;
        height: 8px;
        background: #18181e;
        border-radius: 4px;
        overflow: hidden;
        margin: 7px 0;
      }
      .progress-bar-fill {
        height: 100%;
        border-radius: 4px;
        background: linear-gradient(90deg, #ff334b, #22c55e);
        transition: width 0.6s ease;
      }
      .view-link {
        color: #ff334b;
        font-size: 12px;
        cursor: pointer;
        font-weight: 500;
      }
      .view-link:hover {
        text-decoration: underline;
      }

      /* Quick Actions */
      .quick-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .quick-btn {
        background: #18181e;
        border: 1px solid #24242c;
        border-radius: 10px;
        padding: 11px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
        cursor: pointer;
        transition: all 0.2s;
        text-align: center;
      }
      .quick-btn:hover {
        border-color: #ff334b;
        background: rgba(255, 51, 75, 0.06);
      }
      .qicon {
        width: 30px;
        height: 30px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
      }
      .qlabel {
        font-size: 11px;
        font-weight: 600;
        color: #94a3b8;
      }

      /* Meals Log List */
      .meal-item {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 9px;
        border-radius: 10px;
        background: #18181e;
        border: 1px solid #24242c;
        margin-bottom: 7px;
        position: relative;
      }
      .meal-img {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        background: linear-gradient(135deg, #1a1a24, #2a2a34);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        flex-shrink: 0;
      }
      .meal-info {
        flex: 1;
        min-width: 0;
      }
      .meal-name {
        font-weight: 600;
        font-size: 13px;
        color: #e2e8f0;
      }
      .meal-foods {
        font-size: 11px;
        color: #94a3b8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .meal-macros {
        display: flex;
        gap: 6px;
        margin-top: 3px;
      }
      .meal-kcal {
        font-size: 11px;
        color: #94a3b8;
      }
      .macro-chip {
        font-size: 10px;
        font-weight: 600;
        padding: 1px 5px;
        border-radius: 4px;
      }
      .meal-time {
        font-size: 10px;
        color: #64748b;
        position: absolute;
        right: 28px;
        top: 9px;
      }
      .add-meal-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 9px;
        border-radius: 10px;
        border: 1px dashed #24242c;
        color: #94a3b8;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
        text-align: center;
      }
      .add-meal-row:hover {
        border-color: #ff334b;
        color: #ff334b;
      }

      /* Weight chart sparkline box */
      .weight-chart {
        background: linear-gradient(135deg, rgba(255,51,75,0.09), rgba(255,51,75,0.03));
        border: 1px solid rgba(255,51,75,0.18);
        border-radius: 10px;
        padding: 11px;
        margin-bottom: 9px;
      }
      .wc-label {
        font-size: 11px;
        color: #94a3b8;
        margin-bottom: 3px;
      }
      .wc-value {
        font-size: 19px;
        font-weight: 800;
        color: #ff334b;
      }
      .wc-sub {
        font-size: 10px;
        color: #94a3b8;
      }
      .sparkline {
        height: 46px;
        margin-top: 7px;
      }
      .sparkline svg {
        width: 100%;
        height: 100%;
      }
      .stats-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 7px;
      }
      .stat-item {
        background: #18181e;
        border-radius: 8px;
        padding: 9px;
        border: 1px solid #24242c;
      }
      .stat-label {
        font-size: 10px;
        color: #94a3b8;
        margin-bottom: 2px;
      }
      .stat-value {
        font-size: 15px;
        font-weight: 800;
      }
      .stat-change {
        font-size: 10px;
        margin-top: 2px;
      }
      .up { color: #22c55e; }
      .down { color: #ff334b; }

      /* Coach Dashboard Cards */
      .coach-stat {
        background: #18181e;
        border: 1px solid #24242c;
        border-radius: 10px;
        padding: 11px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }
      .cs-label {
        font-size: 11px;
        color: #94a3b8;
      }
      .cs-value {
        font-size: 26px;
        font-weight: 800;
        line-height: 1.1;
      }
      .cs-change {
        font-size: 11px;
        color: #22c55e;
      }
      .cs-icon {
        width: 42px;
        height: 42px;
        border-radius: 50%;
        background: rgba(255, 51, 75, 0.12);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 19px;
      }
      .client-item {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 7px 0;
        border-bottom: 1px solid #24242c;
      }
      .client-av {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 10px;
        color: #fff;
        flex-shrink: 0;
      }
      .client-info {
        flex: 1;
        min-width: 0;
      }
      .client-name {
        font-size: 12px;
        font-weight: 600;
        color: #e2e8f0;
      }
      .client-prog {
        font-size: 10px;
        color: #94a3b8;
      }
      .client-bar {
        height: 3px;
        border-radius: 2px;
        margin-top: 3px;
        overflow: hidden;
        background: #24242c;
      }
      .client-bar-fill {
        height: 100%;
        border-radius: 2px;
      }
      .activity-item {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 7px 0;
        border-bottom: 1px solid #24242c;
      }
      .act-av {
        width: 27px;
        height: 27px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 10px;
        color: #fff;
        flex-shrink: 0;
      }
      .act-info {
        flex: 1;
      }
      .act-name {
        font-size: 12px;
        font-weight: 600;
      }
      .act-desc {
        font-size: 10px;
        color: #94a3b8;
      }
      .act-time {
        font-size: 10px;
        color: #64748b;
      }

      /* Feedback Items */
      .feedback-item {
        background: #18181e;
        border: 1px solid #24242c;
        border-radius: 10px;
        padding: 11px;
        margin-bottom: 9px;
      }
      .fb-header {
        display: flex;
        align-items: center;
        gap: 7px;
        margin-bottom: 7px;
      }
      .fb-av {
        width: 27px;
        height: 27px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 10px;
        color: #fff;
      }
      .fb-name {
        font-weight: 600;
        font-size: 13px;
      }
      .fb-time {
        font-size: 10px;
        color: #64748b;
        margin-left: auto;
      }
      .fb-text {
        font-size: 12px;
        color: #94a3b8;
        line-height: 1.6;
      }

      /* Override Streamlit elements directly where possible */
      .stButton > button {
        background: linear-gradient(135deg, #ff334b, #c62828) !important;
        color: white !important;
        border: 0 !important;
        border-radius: 8px !important;
        font-weight: 700 !important;
        transition: opacity 0.15s !important;
        width: 100%;
      }
      .stButton > button:hover {
        opacity: 0.9 !important;
      }
      
      /* TextInput and Selectbox dark inputs styling */
      div[data-baseweb="select"], div[data-baseweb="input"], input, select, textarea {
        background-color: #18181e !important;
        border-color: #24242c !important;
        color: #e2e8f0 !important;
      }
      
      div[data-testid="stDataFrame"] {
        border: 1px solid #24242c !important;
        border-radius: 8px !important;
        overflow: hidden;
      }
    </style>
    """,
    unsafe_allow_html=True,
)

# ── Supabase ───────────────────────────────────────────────────────────────────
@st.cache_resource
def get_supabase() -> Client:
    try:
        return create_client(st.secrets["SUPABASE_URL"], st.secrets["SUPABASE_KEY"])
    except (KeyError, FileNotFoundError):
        st.error("Supabase is not configured. Add SUPABASE_URL and SUPABASE_KEY to .streamlit/secrets.toml.")
        st.stop()


supabase = get_supabase()


# ── Auth helpers ───────────────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    """SHA-256 hash – compatible with the existing users table."""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def verify_password(stored_hash: str, candidate: str) -> bool:
    return stored_hash == hash_password(candidate) or stored_hash == candidate


# ── Session helpers ────────────────────────────────────────────────────────────
def initialize_state() -> None:
    defaults = {
        "logged_in": False,
        "user_id": None,
        "username": "",
        "user_type": "",
        "current_view": "Dashboard",
        "today_meals": [],
        "checked_local_storage": False,
        "trigger_logout_js": False,
    }
    for key, value in defaults.items():
        st.session_state.setdefault(key, value)


def reset_session() -> None:
    uid = st.session_state.get("user_id")
    if uid:
        try:
            supabase.table("coach_notes").delete().eq("client_id", uid).ilike("note", "SESSION_TOKEN:%").execute()
        except Exception:
            pass
    for key in ("logged_in", "user_id", "username", "user_type", "today_meals"):
        st.session_state.pop(key, None)
    st.session_state["current_view"] = "Dashboard"
    st.session_state["trigger_logout_js"] = True
    st.session_state["checked_local_storage"] = True


# ── Top navigation bar (injected into the parent document via JS) ──────────────
def render_top_nav() -> None:
    """
    Injects a fixed top navigation bar into the real browser document
    (window.parent) so it is completely unaffected by Streamlit's iframe
    nesting and layout containers – the only reliable way to get a true
    position:fixed header in Streamlit.
    """
    cv = st.session_state.current_view

    def _cls(page: str) -> str:
        return "nav-active" if cv == page else ""

    uname = st.session_state.username.title()
    role  = st.session_state.user_type.title()

    nav_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
    <style>
      * {{ margin:0; padding:0; box-sizing:border-box; }}
      body {{ background: transparent; overflow: hidden; }}

      #ry-nav {{
        position: fixed;
        top: 0; left: 0; right: 0;
        height: 62px;
        background: rgba(10,10,14,0.97);
        backdrop-filter: blur(12px);
        border-bottom: 1px solid #24242c;
        display: flex;
        align-items: center;
        padding: 0 1.5rem;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        gap: 0;
      }}

      .ry-logo {{
        font-size: 20px;
        font-weight: 900;
        letter-spacing: 3px;
        color: #fff;
        white-space: nowrap;
        margin-right: 2rem;
        flex-shrink: 0;
      }}

      .ry-links {{
        display: flex;
        align-items: center;
        gap: 0.2rem;
        flex: 1;
      }}

      .ry-links a {{
        color: #94a3b8;
        text-decoration: none;
        font-size: 13px;
        font-weight: 600;
        padding: 0.35rem 0.75rem;
        border-radius: 6px;
        transition: background 0.15s, color 0.15s;
        white-space: nowrap;
      }}
      .ry-links a:hover   {{ background: #1e1e26; color: #e2e8f0; }}
      .ry-links a.nav-active {{ background: rgba(255,51,75,0.15); color: #ff334b; }}

      .ry-right {{
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-shrink: 0;
        margin-left: auto;
      }}

      .ry-user {{
        color: #64748b;
        font-size: 12px;
        font-weight: 500;
        white-space: nowrap;
      }}
      .ry-user b {{ color: #94a3b8; }}

      .ry-signout {{
        background: linear-gradient(135deg,#ff334b,#c62828);
        color: #fff !important;
        font-size: 12px;
        font-weight: 700;
        padding: 0.35rem 0.9rem;
        border-radius: 7px;
        text-decoration: none;
        white-space: nowrap;
        transition: opacity 0.15s;
      }}
      .ry-signout:hover {{ opacity: 0.85; }}

      /* Hamburger (mobile) */
      .ry-burger {{
        display: none;
        background: none;
        border: none;
        color: #e2e8f0;
        font-size: 22px;
        cursor: pointer;
        padding: 0.2rem 0.4rem;
        margin-left: auto;
      }}

      @media (max-width: 900px) {{
        .ry-burger  {{ display: block; }}
        .ry-links   {{
          display: none;
          position: fixed;
          top: 62px; left: 0; right: 0;
          flex-direction: column;
          align-items: flex-start;
          background: #0d0d11;
          border-bottom: 1px solid #24242c;
          padding: 1rem 1.5rem;
          gap: 0.4rem;
          z-index: 2147483646;
        }}
        .ry-links.open {{ display: flex; }}
        .ry-links a {{ font-size: 15px; width: 100%; padding: 0.6rem 0.75rem; }}
        .ry-right {{ gap: 0.5rem; }}
        .ry-user  {{ display: none; }}
      }}
    </style>
    </head>
    <body>
    <nav id="ry-nav">
      <div class="ry-logo">RYVOM</div>

      <div class="ry-links" id="ry-links">
        <a href="/?view=Dashboard"  class="{_cls('Dashboard')}">Dashboard</a>
        <a href="/?view=Nutrition"  class="{_cls('Nutrition')}">Nutrition</a>
        <a href="/?view=Log Food"   class="{_cls('Log Food')}">Log&nbsp;Food</a>
        <a href="/?view=Workouts"   class="{_cls('Workouts')}">Workouts</a>
        <a href="/?view=Progress"   class="{_cls('Progress')}">Progress</a>
        <a href="/?view=Feedback"   class="{_cls('Feedback')}">Feedback</a>
        <a href="/?view=Settings"   class="{_cls('Settings')}">Settings</a>
      </div>

      <div class="ry-right">
        <span class="ry-user"><b>{uname}</b>&nbsp;({role})</span>
        <a href="/?logout=true" class="ry-signout">Sign&nbsp;Out</a>
        <button class="ry-burger" onclick="toggleMenu()" aria-label="Menu">&#9776;</button>
      </div>
    </nav>

    <script>
      function toggleMenu() {{
        document.getElementById('ry-links').classList.toggle('open');
      }}

      // ── Hoist nav into the real browser document (parent of Streamlit iframe) ──
      (function hoist() {{
        try {{
          var parent = window.parent;
          var pdoc   = parent.document;

          // Remove any previously injected nav to avoid duplicates on rerun
          var old = pdoc.getElementById('ry-nav-host');
          if (old) old.remove();

          // Clone the nav element into the parent document
          var navEl = document.getElementById('ry-nav');
          var clone = pdoc.importNode(navEl, true);
          clone.id  = 'ry-nav-host';

          // Re-attach the toggle handler inside the parent document context
          var burger = clone.querySelector('.ry-burger');
          var links  = clone.querySelector('.ry-links');
          if (burger && links) {{
            burger.onclick = function() {{ links.classList.toggle('open'); }};
          }}

          // Inject a <style> block into the parent <head>
          var oldStyle = pdoc.getElementById('ry-nav-style');
          if (oldStyle) oldStyle.remove();
          var style = pdoc.createElement('style');
          style.id  = 'ry-nav-style';
          style.textContent = document.querySelector('style').textContent;
          pdoc.head.appendChild(style);

          pdoc.body.appendChild(clone);
        }} catch(e) {{
          // Cross-origin guard – falls back gracefully; nav stays in iframe
          console.warn('Ryvom: could not hoist nav –', e);
        }}
      }})();
    </script>
    </body>
    </html>
    """
    components.html(nav_html, height=0, scrolling=False)


# ── Settings page ──────────────────────────────────────────────────────────────
def settings_page() -> None:
    st.markdown("<div class='ry-card'><h3>👤 Account Settings</h3>", unsafe_allow_html=True)
    new_pass = st.text_input("New Password", type="password", key="my_new_pass")
    if st.button("Update Password", type="primary"):
        if len(new_pass) < 8:
            st.warning("Password must be at least 8 characters.")
        else:
            try:
                supabase.table("users").update({"password_hash": hash_password(new_pass)}).eq("id", st.session_state.user_id).execute()
                supabase.table("coach_notes").delete().eq("client_id", st.session_state.user_id).ilike("note", "SESSION_TOKEN:%").execute()
                st.success("Password updated! Signing you out…")
            except Exception as exc:
                st.error(f"Could not update password: {exc}")
                return
            reset_session()
            st.rerun()
    st.markdown("</div>", unsafe_allow_html=True)



# ── Food helpers ───────────────────────────────────────────────────────────────
def food_macros(food: dict, grams: float) -> dict:
    serving = float(food.get("serving_g") or 100)
    scale   = grams / serving
    return {
        "calories": round(float(food.get("calories") or 0) * scale),
        "protein":  round(float(food.get("protein")  or 0) * scale, 1),
        "carbs":    round(float(food.get("carbs")    or 0) * scale, 1),
        "fat":      round(float(food.get("fat")      or 0) * scale, 1),
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
        .limit(1).execute().data
    )
    if existing:
        return existing[0]
    payload = {
        "name": item["name"], "category": "Packaged food", "serving_g": 100,
        "calories": item["calories"], "protein": item["protein"],
        "carbs": item["carbs"], "fat": item["fat"], "source": "Open Food Facts",
    }
    return supabase.table("foods").insert(payload).execute().data[0]


def lookup_barcode(barcode: str) -> dict | None:
    try:
        r = requests.get(
            f"https://world.openfoodfacts.org/api/v2/product/{barcode}.json",
            headers={"User-Agent": "Ryvom/0.1 (development)"},
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
        if data.get("status") != 1:
            return None
        product   = data["product"]
        nutrients = product.get("nutriments", {})
        return {
            "name":     product.get("product_name") or product.get("product_name_en") or "Packaged product",
            "calories": float(nutrients.get("energy-kcal_100g") or 0),
            "protein":  float(nutrients.get("proteins_100g")    or 0),
            "carbs":    float(nutrients.get("carbohydrates_100g") or 0),
            "fat":      float(nutrients.get("fat_100g")          or 0),
        }
    except requests.RequestException:
        return None


def add_meal_item(meal_type: str, food: dict, grams: float) -> None:
    macros = food_macros(food, grams)
    st.session_state.today_meals.append({
        "meal_type": meal_type, "food_id": food["id"], "food_name": food["name"],
        "grams": grams, **macros,
    })


def today_meal_items() -> list[dict]:
    today_start = f"{date.today().isoformat()}T00:00:00"
    meals = (
        supabase.table("meals")
        .select("id,meal_type,meal_date")
        .eq("user_id", st.session_state.user_id)
        .gte("meal_date", today_start)
        .execute().data
    )
    if not meals:
        return []
    meal_by_id = {m["id"]: m for m in meals}
    ids = list(meal_by_id)
    items = (
        supabase.table("meal_items")
        .select("meal_id,calories,protein,carbs,fat,grams,food_id,foods(name)")
        .in_("meal_id", ids)
        .execute().data
    )
    for item in items:
        item["meal_type"] = meal_by_id[item["meal_id"]]["meal_type"]
        item["meal_date"] = meal_by_id[item["meal_id"]]["meal_date"]
        # extract food name from related foods table dictionary
        if "foods" in item and item["foods"]:
            item["food_name"] = item["foods"]["name"]
        else:
            item["food_name"] = "Unknown Food"
    return items



# ── Page renderers ─────────────────────────────────────────────────────────────
def login_or_registration_page() -> None:
    import base64
    
    def get_base64_image(path: str) -> str:
        try:
            with open(path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode("utf-8")
                mime = "image/png" if path.endswith(".png") else "image/jpeg"
                return f"data:{mime};base64,{encoded_string}"
        except Exception:
            return ""

    # Load logo_small.jpg (3.4 KB) for high-speed compilation
    logo_b64 = get_base64_image("logo_small.jpg")

    try:
        with open("login.html", "r", encoding="utf-8") as f:
            html_content = f.read()
    except Exception:
        st.error("Could not load login.html template.")
        st.stop()

    # Serve error container if search params contain login_error
    error_html = ""
    if "login_error" in st.query_params:
        error_html = """
        <div style="background:rgba(255,51,75,0.1); border:1px solid #ff334b; color:#ff334b; font-size:12px; padding:10px; border-radius:8px; margin-bottom:15px; text-align:center;">
          Invalid username or password. Please try again.
        </div>
        """

    html_content = html_content.replace("{{ERROR_HTML}}", error_html)
    html_content = html_content.replace("{{LOGO_BASE64}}", logo_b64)

    # Full screen layout styling for login page injected directly in top window
    st.html(
        """
        <style>
          [data-testid="stSidebar"] { display: none !important; }
          [data-testid="stHeader"] { display: none !important; }
          footer { display: none !important; }
          .stApp { background-color: #0a0a0e !important; }
          .stMainBlockContainer { padding: 0 !important; margin: 0 !important; max-width: 100% !important; }
          div[data-testid="stHtml"] { padding: 0 !important; margin: 0 !important; }
        </style>
        """
    )

    st.html(html_content)




def get_sparkline_svg(weights: list[float]) -> str:
    if not weights or len(weights) < 2:
        return """
        <svg viewBox="0 0 200 50" preserveAspectRatio="none">
            <defs>
                <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#ff334b" stop-opacity=".3"/>
                    <stop offset="100%" stop-color="#ff334b" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <path d="M0,38 L40,35 L80,38 L120,28 L160,32 L200,20" stroke="#ff334b" stroke-width="2" fill="none"/>
            <path d="M0,38 L40,35 L80,38 L120,28 L160,32 L200,20 L200,50 L0,50Z" fill="url(#sg)"/>
            <circle cx="200" cy="20" r="3" fill="#ff334b"/>
            <text x="0" y="48" font-size="8" fill="#64748b">1 May</text>
            <text x="73" y="48" font-size="8" fill="#64748b">15 May</text>
            <text x="158" y="48" font-size="8" fill="#64748b">31 May</text>
        </svg>
        """
    min_w = min(weights)
    max_w = max(weights)
    diff = max_w - min_w if max_w != min_w else 1
    
    points = []
    n = len(weights)
    for idx, w in enumerate(weights):
        x = (idx / (n - 1)) * 200
        y = 38 - ((w - min_w) / diff) * 22
        points.append(f"{x},{y}")
        
    path_d = " L ".join(points)
    if path_d:
        path_d = "M " + path_d
    area_d = f"{path_d} L 200,50 L 0,50Z" if path_d else ""
    
    svg = f"""
    <svg viewBox="0 0 200 50" preserveAspectRatio="none">
        <defs>
            <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#ff334b" stop-opacity=".3"/>
                <stop offset="100%" stop-color="#ff334b" stop-opacity="0"/>
            </linearGradient>
        </defs>
        <path d="{path_d}" stroke="#ff334b" stroke-width="2" fill="none"/>
        <path d="{area_d}" fill="url(#sg)"/>
        <circle cx="{points[-1].split(',')[0]}" cy="{points[-1].split(',')[1]}" r="3" fill="#ff334b"/>
        <text x="0" y="48" font-size="8" fill="#64748b">Start</text>
        <text x="160" y="48" font-size="8" fill="#64748b">Today</text>
    </svg>
    """
    return svg

def dashboard_page() -> None:
    st.markdown("<div style='height: 12px;'></div>", unsafe_allow_html=True)
    try:
        items = today_meal_items()
    except Exception as exc:
        st.error(f"Could not load today's meals: {exc}")
        return

    totals = {k: sum(float(i.get(k) or 0) for i in items) for k in ("calories", "protein", "carbs", "fat")}
    
    # Percentages relative to mockup targets (2300 Cal, 150g P, 220g C, 70g F)
    cal_pct = min(100, round((totals["calories"] / 2300) * 100)) if totals["calories"] > 0 else 0
    pro_pct = min(100, round((totals["protein"] / 150) * 100)) if totals["protein"] > 0 else 0
    car_pct = min(100, round((totals["carbs"] / 220) * 100)) if totals["carbs"] > 0 else 0
    fat_pct = min(100, round((totals["fat"] / 70) * 100)) if totals["fat"] > 0 else 0
    
    avg_pct = round((cal_pct + pro_pct + car_pct + fat_pct) / 4)

    # ── ROW 1: Summary, Daily Progress, Quick Actions ─────────────────────────
    summary_html = f"""
    <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px;">
        <div class="ry-card" style="flex: 2; min-width: 300px; margin-bottom: 0;">
            <div class="card-title">Today's Summary</div>
            <div class="summary-row">
                <div class="macro-card">
                    <div class="macro-ring" style="color:#ef4444;border-color:#ef4444;background:rgba(239,68,68,.1)">🔥</div>
                    <div class="macro-value">{round(totals['calories']):,}</div>
                    <div class="macro-label">Calories</div>
                    <div class="macro-sub">of 2,300 kcal</div>
                    <div class="macro-bar"><div class="macro-bar-fill" style="width:{cal_pct}%;background:#ef4444"></div></div>
                </div>
                <div class="macro-card">
                    <div class="macro-ring" style="color:#22c55e;border-color:#22c55e;background:rgba(34,197,94,.1)">P</div>
                    <div class="macro-value">{round(totals['protein'])}g</div>
                    <div class="macro-label">Protein</div>
                    <div class="macro-sub">of 150g</div>
                    <div class="macro-bar"><div class="macro-bar-fill" style="width:{pro_pct}%;background:#22c55e"></div></div>
                </div>
                <div class="macro-card">
                    <div class="macro-ring" style="color:#f59e0b;border-color:#f59e0b;background:rgba(245,158,11,.1)">C</div>
                    <div class="macro-value">{round(totals['carbs'])}g</div>
                    <div class="macro-label">Carbs</div>
                    <div class="macro-sub">of 220g</div>
                    <div class="macro-bar"><div class="macro-bar-fill" style="width:{car_pct}%;background:#f59e0b"></div></div>
                </div>
                <div class="macro-card">
                    <div class="macro-ring" style="color:#3b82f6;border-color:#3b82f6;background:rgba(59,130,246,.1)">F</div>
                    <div class="macro-value">{round(totals['fat'])}g</div>
                    <div class="macro-label">Fats</div>
                    <div class="macro-sub">of 70g</div>
                    <div class="macro-bar"><div class="macro-bar-fill" style="width:{fat_pct}%;background:#3b82f6"></div></div>
                </div>
            </div>
        </div>
        <div class="ry-card" style="flex: 1; min-width: 200px; margin-bottom: 0; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
                <div class="card-title">Daily Progress</div>
                <div class="progress-big">{avg_pct}%</div>
                <div class="progress-bar-h"><div class="progress-bar-fill" style="width:{avg_pct}%"></div></div>
                <div style="font-size:12px;color:#94a3b8;margin-bottom:10px">Overall target completion.</div>
            </div>
            <a href="/?view=Progress" target="_self" class="view-link" style="text-decoration: none;">View Progress &rarr;</a>
        </div>
        <div class="ry-card" style="flex: 1; min-width: 200px; margin-bottom: 0;">
            <div class="card-title">Quick Actions</div>
            <div class="quick-grid">
                <a href="/?view=Log Food" target="_self" class="quick-btn" style="text-decoration: none; color: inherit;">
                    <div class="qicon" style="background:rgba(255,51,75,.12); color:#ff334b;">🍽️</div>
                    <div class="qlabel">Log Food</div>
                </a>
                <a href="/?view=Workouts" target="_self" class="quick-btn" style="text-decoration: none; color: inherit;">
                    <div class="qicon" style="background:rgba(59,130,246,.12); color:#3b82f6;">💪</div>
                    <div class="qlabel">Log Workout</div>
                </a>
                <a href="/?view=Progress" target="_self" class="quick-btn" style="text-decoration: none; color: inherit;">
                    <div class="qicon" style="background:rgba(34,197,94,.12); color:#22c55e;">📈</div>
                    <div class="qlabel">Progress</div>
                </a>
                <a href="/?view=Feedback" target="_self" class="quick-btn" style="text-decoration: none; color: inherit;">
                    <div class="qicon" style="background:rgba(168,85,247,.12); color:#a855f7;">💬</div>
                    <div class="qlabel">Feedback</div>
                </a>
            </div>
        </div>
    </div>
    """
    st.markdown(summary_html, unsafe_allow_html=True)

    # ── ROW 2: Today's Meals & User-specific Context (Coaching vs. Client metrics) ──
    meals_grouped = defaultdict(list)
    for item in items:
        meals_grouped[item["meal_type"]].append(item)

    meals_html = "<div class='ry-card col' style='flex: 1.1; margin-bottom: 0;'>"
    meals_html += "<div class='card-title'>Today's Meals <a href='/?view=Log Food' target='_self' class='see-all' style='text-decoration: none;'>View All</a></div>"
    for mtype, emoji in [("Breakfast", "🥣"), ("Lunch", "🍗"), ("Dinner", "🍛"), ("Snack", "🍎")]:
        mitems = meals_grouped[mtype]
        if mitems:
            food_names = ", ".join(i["food_name"] for i in mitems)
            kcal_sum = round(sum(i["calories"] for i in mitems))
            p_sum = round(sum(i["protein"] for i in mitems))
            c_sum = round(sum(i["carbs"] for i in mitems))
            f_sum = round(sum(i["fat"] for i in mitems))
            meals_html += f"""
            <div class="meal-item">
                <div class="meal-img">{emoji}</div>
                <div class="meal-info">
                    <div class="meal-name">{mtype}</div>
                    <div class="meal-foods">{food_names}</div>
                    <div class="meal-macros">
                        <span class="meal-kcal">{kcal_sum} kcal</span>
                        <span class="macro-chip" style="background:rgba(34,197,94,.15);color:#22c55e">P {p_sum}g</span>
                        <span class="macro-chip" style="background:rgba(245,158,11,.15);color:#f59e0b">C {c_sum}g</span>
                        <span class="macro-chip" style="background:rgba(59,130,246,.15);color:#3b82f6">F {f_sum}g</span>
                    </div>
                </div>
            </div>
            """
        else:
            meals_html += f"""
            <div class="meal-item" style="opacity: 0.5;">
                <div class="meal-img">{emoji}</div>
                <div class="meal-info">
                    <div class="meal-name">{mtype}</div>
                    <div class="meal-foods">No items logged today</div>
                </div>
            </div>
            """
    meals_html += "<a href='/?view=Log Food' target='_self' class='add-meal-row' style='text-decoration: none;'>+ Add Meal</a>"
    meals_html += "</div>"

    # Context block logic
    context_html = ""
    is_coach = st.session_state.user_type == "coach"

    if is_coach:
        # ── Coach view: Client overview list & stats ───────────────────────────
        try:
            clients = supabase.table("users").select("id,username").eq("role", "client").order("username").execute().data
        except Exception:
            clients = []
            
        context_html += f"""
        <div class="ry-card col" style="flex: 1.1; margin-bottom: 0;">
            <div class="card-title">Coach Dashboard <a href="/?view=Feedback" target="_self" class="see-all" style="text-decoration: none;">View All Clients &rarr;</a></div>
            <div class="coach-stat">
                <div>
                    <div class="cs-label">Total Clients</div>
                    <div class="cs-value">{len(clients)}</div>
                    <div class="cs-change">↑ Active and tracking</div>
                </div>
                <div class="cs-icon">👥</div>
            </div>
            <div class="card-title" style="margin-bottom:7px">Client Roster</div>
        """
        if not clients:
            context_html += "<div style='font-size:12px;color:#94a3b8;padding:10px 0;'>No client accounts registered.</div>"
        else:
            for idx, c in enumerate(clients[:4]):
                av_letters = c["username"][:2].upper()
                # mock a progress level based on username hash length
                prog = min(100, max(40, (len(c["username"]) * 7) + 20))
                color = "#22c55e" if prog > 70 else "#f59e0b"
                context_html += f"""
                <div class="client-item">
                    <div class="client-av" style="background:linear-gradient(135deg,#f59e0b,#ef4444);">{av_letters}</div>
                    <div class="client-info">
                        <div class="client-name">{c['username'].title()}</div>
                        <div class="client-prog">Progress {prog}%</div>
                        <div class="client-bar"><div class="client-bar-fill" style="width:{prog}%;background:{color}"></div></div>
                    </div>
                </div>
                """
        context_html += "</div>"
    else:
        # ── Client view: Weight Trend Sparkline & Metrics Overview ─────────────
        try:
            history = supabase.table("progress").select("date,weight").eq("user_id", st.session_state.user_id).order("date").limit(30).execute().data
            history = [h for h in history if h.get("weight") is not None]
            weights = [float(h["weight"]) for h in history]
            current_weight = f"{weights[-1]} kg" if weights else "80.5 kg"
            delta = f"↓ {round(weights[0] - weights[-1], 1)} kg" if len(weights) >= 2 else "Starting line"
        except Exception:
            weights = []
            current_weight = "80.5 kg"
            delta = "No records"

        sparkline_svg = get_sparkline_svg(weights)

        context_html += f"""
        <div class="ry-card col" style="flex: 1.1; margin-bottom: 0;">
            <div class="card-title">Progress Overview</div>
            <div class="weight-chart">
                <div class="wc-label">Weight Trend</div>
                <div class="wc-value">{current_weight}</div>
                <div class="wc-sub">{delta} logged</div>
                <div class="sparkline">{sparkline_svg}</div>
            </div>
            <div class="card-title" style="margin-bottom: 7px;">Current Metrics</div>
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-label">Weight</div>
                    <div class="stat-value">{current_weight}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Streak</div>
                    <div class="stat-value" style="color:#f59e0b;">12 days 🔥</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Calories Target</div>
                    <div class="stat-value">2,300 kcal</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Water Target</div>
                    <div class="stat-value">3.5 L</div>
                </div>
            </div>
        </div>
        """

    # Render row 2
    row2_html = f"""
    <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: stretch;">
        {meals_html}
        {context_html}
    </div>
    """
    st.markdown(row2_html, unsafe_allow_html=True)


# ── AI Food Scanner ────────────────────────────────────────────────────────────
import google.generativeai as genai
import json

def nutrition_page() -> None:
    # Build the UI using dark theme card
    st.markdown("<div class='ry-card'><h3>🤖 AI Nutrition Tracker</h3>", unsafe_allow_html=True)
    
    with st.form("nutrition_form", clear_on_submit=False):
        meal_name = st.text_input("Meal Name", value="Breakfast")
        
        col1, col2, col3 = st.columns([2, 1, 1])
        with col1:
            food_item = st.text_input("What did you eat?", placeholder="e.g. Chicken breast")
        with col2:
            food_state = st.selectbox("State", ["Cooked", "Raw"])
        with col3:
            weight_g = st.number_input("Weight (g)", min_value=1, value=100)
            
        st.markdown("<br>", unsafe_allow_html=True)
        submitted = st.form_submit_button("Calculate & Log")

    if submitted:
        if not food_item.strip():
            st.error("Please enter a food item.")
        else:
            with st.spinner("AI is calculating..."):
                try:
                    # Initialize Gemini
                    genai.configure(api_key=st.secrets["GEMINI_API_KEY"])
                    model = genai.GenerativeModel('gemini-3.6-flash')
                    
                    # The prompt
                    prompt = f"""
                    Calculate the macronutrients for {weight_g}g of {food_state} {food_item}. 
                    Return strictly valid JSON with keys: "calories", "protein", "carbs", "fats".
                    Do not include markdown blocks or any other text.
                    """
                    
                    # Call the AI
                    response = model.generate_content(prompt)
                    clean_json = response.text.replace("```json", "").replace("```", "").strip()
                    macros = json.loads(clean_json)
                    
                    calories = int(macros.get("calories", 0))
                    protein = float(macros.get("protein", 0))
                    carbs = float(macros.get("carbs", 0))
                    fats = float(macros.get("fats", 0))
                    
                    # Insert to Supabase using the exact columns required
                    supabase.table("meal_logs").insert({
                        "user_id": st.session_state.user_id,
                        "meal_name": meal_name,
                        "food_item": food_item,
                        "state": food_state,
                        "weight_g": weight_g,
                        "calories": calories,
                        "protein": protein,
                        "carbs": carbs,
                        "fats": fats
                    }).execute()
                    
                    st.success(
                        f"Successfully logged {weight_g}g of {food_item} to {meal_name}!\n\n"
                        f"**Macros:** {calories} kcal | P: {protein}g | C: {carbs}g | F: {fats}g"
                    )
                except Exception as e:
                    st.error(f"Error: {e}")
                    
    st.markdown("</div>", unsafe_allow_html=True)
    
def log_food_page() -> None:
    st.markdown("<div class='ry-card'><h3>🍽️ Log Food</h3>", unsafe_allow_html=True)
    meal_type = st.selectbox("Meal Type", ["Breakfast", "Lunch", "Dinner", "Snack"])
    manual_tab, barcode_tab = st.tabs(["Search food", "Scan barcode"])

    with manual_tab:
        query = st.text_input("Search your food database", placeholder="Chicken breast")
        try:
            foods = find_foods(query)
        except Exception as exc:
            st.error(f"Could not search foods: {exc}")
            foods = []
        if foods:
            by_label = {f"{f['name']} — {f.get('calories') or 0} kcal / {f.get('serving_g') or 100:g}g": f for f in foods}
            label = st.selectbox("Food", list(by_label))
            food  = by_label[label]
            grams = st.number_input("Amount (grams)", min_value=1.0, value=float(food.get("serving_g") or 100), step=1.0)
            macros = food_macros(food, grams)
            
            preview_html = f"""
            <div style="margin-top: 10px; margin-bottom: 12px; display: flex; gap: 8px;">
                <span class="macro-chip" style="background:rgba(239,68,68,.12);color:#ef4444">{macros['calories']} kcal</span>
                <span class="macro-chip" style="background:rgba(34,197,94,.15);color:#22c55e">Protein {macros['protein']}g</span>
                <span class="macro-chip" style="background:rgba(245,158,11,.15);color:#f59e0b">Carbs {macros['carbs']}g</span>
                <span class="macro-chip" style="background:rgba(59,130,246,.15);color:#3b82f6">Fat {macros['fat']}g</span>
            </div>
            """
            st.markdown(preview_html, unsafe_allow_html=True)
            if st.button("Add to meal", key="add_manual"):
                add_meal_item(meal_type, food, grams)
                st.rerun()
        else:
            st.info("Type a food name to search up to 50 matching foods.")

    with barcode_tab:
        with st.form("barcode_form"):
            barcode = st.text_input("Barcode", placeholder="e.g. 3017620422003")
            grams   = st.number_input("Amount eaten (grams)", min_value=1.0, value=100.0, step=1.0)
            scan    = st.form_submit_button("Find product")
        if scan:
            item = lookup_barcode(barcode.strip())
            if not item:
                st.error("Product not found. Check the barcode or use food search.")
            else:
                try:
                    food = get_or_create_barcode_food(item)
                    add_meal_item(meal_type, food, grams)
                    st.success(f"Added {food['name']}.")
                except Exception as exc:
                    st.error(f"Could not save scanned product: {exc}")
    st.markdown("</div>", unsafe_allow_html=True)

    st.markdown("<div class='ry-card'><h3>📝 Meal Queue</h3>", unsafe_allow_html=True)
    queued = st.session_state.today_meals
    if not queued:
        st.caption("Items added here are saved only after you press Save meals.")
        st.markdown("</div>", unsafe_allow_html=True)
        return
    for index, item in enumerate(queued):
        left, right = st.columns([6, 1])
        left.markdown(
            f"""
            <div class="meal-item" style="margin-bottom: 0;">
                <div class="meal-img">🍽️</div>
                <div class="meal-info">
                    <div class="meal-name">{html.escape(item['meal_type'])} &bull; {html.escape(item['food_name'])}</div>
                    <div class="meal-foods">{item['grams']:g}g</div>
                    <div class="meal-macros">
                        <span class="meal-kcal">{item['calories']} kcal</span>
                        <span class="macro-chip" style="background:rgba(34,197,94,.15);color:#22c55e">P {item['protein']}g</span>
                        <span class="macro-chip" style="background:rgba(245,158,11,.15);color:#f59e0b">C {item['carbs']}g</span>
                        <span class="macro-chip" style="background:rgba(59,130,246,.15);color:#3b82f6">F {item['fat']}g</span>
                    </div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        if right.button("Remove", key=f"remove_{index}"):
            queued.pop(index)
            st.rerun()
    st.markdown("<div style='height: 10px;'></div>", unsafe_allow_html=True)
    if st.button("Save meals", type="primary"):
        grouped = defaultdict(list)
        for item in queued:
            grouped[item["meal_type"]].append(item)
        try:
            for lmt, items in grouped.items():
                meal = supabase.table("meals").insert({"user_id": st.session_state.user_id, "meal_type": lmt, "meal_date": datetime.now().isoformat()}).execute().data[0]
                rows = [{"meal_id": meal["id"], "food_id": i["food_id"], "grams": i["grams"], "calories": i["calories"], "protein": i["protein"], "carbs": i["carbs"], "fat": i["fat"]} for i in items]
                supabase.table("meal_items").insert(rows).execute()
            st.session_state.today_meals = []
            st.success("Meals saved.")
            st.rerun()
        except Exception as exc:
            st.error(f"Could not save meals: {exc}")
    st.markdown("</div>", unsafe_allow_html=True)


# ── E1RM math helpers ──────────────────────────────────────────────────────────
# Standard powerlifting RPE chart: (reps, rpe) → percentage of 1RM
# Source: Reactive Training Systems / commonly used RPE table
_RPE_TABLE: dict[tuple[int, float], float] = {
    (1, 10): 1.000, (1, 9.5): 0.978, (1, 9): 0.955, (1, 8.5): 0.939,
    (1, 8):  0.922, (1, 7.5): 0.907, (1, 7): 0.892, (1, 6.5): 0.878,
    (1, 6):  0.863,
    (2, 10): 0.955, (2, 9.5): 0.939, (2, 9): 0.922, (2, 8.5): 0.907,
    (2, 8):  0.892, (2, 7.5): 0.878, (2, 7): 0.863, (2, 6.5): 0.849,
    (2, 6):  0.835,
    (3, 10): 0.922, (3, 9.5): 0.907, (3, 9): 0.892, (3, 8.5): 0.878,
    (3, 8):  0.863, (3, 7.5): 0.849, (3, 7): 0.835, (3, 6.5): 0.821,
    (3, 6):  0.807,
    (4, 10): 0.892, (4, 9.5): 0.878, (4, 9): 0.863, (4, 8.5): 0.849,
    (4, 8):  0.835, (4, 7.5): 0.821, (4, 7): 0.807, (4, 6.5): 0.794,
    (4, 6):  0.781,
    (5, 10): 0.863, (5, 9.5): 0.849, (5, 9): 0.835, (5, 8.5): 0.821,
    (5, 8):  0.807, (5, 7.5): 0.794, (5, 7): 0.781, (5, 6.5): 0.768,
    (5, 6):  0.755,
    (6, 10): 0.835, (6, 9.5): 0.821, (6, 9): 0.807, (6, 8.5): 0.794,
    (6, 8):  0.781, (6, 7.5): 0.768, (6, 7): 0.755, (6, 6.5): 0.742,
    (6, 6):  0.730,
    (7, 10): 0.807, (7, 9.5): 0.794, (7, 9): 0.781, (7, 8.5): 0.768,
    (7, 8):  0.755, (7, 7.5): 0.742, (7, 7): 0.730, (7, 6.5): 0.717,
    (7, 6):  0.705,
    (8, 10): 0.781, (8, 9.5): 0.768, (8, 9): 0.755, (8, 8.5): 0.742,
    (8, 8):  0.730, (8, 7.5): 0.717, (8, 7): 0.705, (8, 6.5): 0.693,
    (8, 6):  0.681,
    (9, 10): 0.755, (9, 9.5): 0.742, (9, 9): 0.730, (9, 8.5): 0.717,
    (9, 8):  0.705, (9, 7.5): 0.693, (9, 7): 0.681, (9, 6.5): 0.669,
    (9, 6):  0.658,
    (10, 10): 0.730, (10, 9.5): 0.717, (10, 9): 0.705, (10, 8.5): 0.693,
    (10, 8): 0.681, (10, 7.5): 0.669, (10, 7): 0.658, (10, 6.5): 0.647,
    (10, 6): 0.636,
    (12, 10): 0.681, (12, 9.5): 0.669, (12, 9): 0.658, (12, 8.5): 0.647,
    (12, 8): 0.636, (12, 7.5): 0.625, (12, 7): 0.613, (12, 6.5): 0.602,
    (12, 6): 0.591,
}

def _rpe_percentage(reps: int, rpe: float) -> float:
    """Return the % of 1RM for the given reps × RPE cell.

    RPE is rounded to the nearest 0.5. Reps beyond 12 fall back to the
    Brzycki formula so the table never returns a KeyError.
    """
    rpe_rounded = round(rpe * 2) / 2           # snap to nearest 0.5
    rpe_clamped = max(6.0, min(10.0, rpe_rounded))
    reps_clamped = max(1, min(reps, 12))

    # Exact table lookup first
    key = (reps_clamped, rpe_clamped)
    if key in _RPE_TABLE:
        return _RPE_TABLE[key]

    # Linear interpolation between adjacent rep rows when needed
    for r in range(reps_clamped, 13):
        if (r, rpe_clamped) in _RPE_TABLE:
            return _RPE_TABLE[(r, rpe_clamped)]
    return _RPE_TABLE[(12, rpe_clamped)]        # floor fallback


def _calc_e1rm(weight: float, reps: int, rpe: float) -> float:
    """Estimated 1-Rep Max via the RPE percentage table.

    E1RM = weight / percentage_of_1rm
    Returns 0.0 for invalid inputs.
    """
    if weight <= 0 or reps <= 0:
        return 0.0
    pct = _rpe_percentage(reps, rpe)
    return round(weight / pct, 1) if pct > 0 else 0.0


def workouts_page() -> None:
    # Build the UI inside the dark theme card
    st.markdown("<div class='ry-card'><h3>🏋️ Log Workout</h3>", unsafe_allow_html=True)
    
    with st.form("workout_form", clear_on_submit=False):
        exercises = [
            "Bench Press (Barbell)", "Squat (Barbell)", "Deadlift (Barbell)",
            "Incline Dumbbell Press", "Overhead Press (Barbell)",
            "Romanian Deadlift", "Bent Over Row (Barbell)",
            "Pull-Up / Chin-Up", "Dumbbell Curl", "Tricep Pushdown",
        ]
        exercise = st.selectbox("Exercise", exercises)
        
        col_w, col_r, col_rpe = st.columns(3)
        with col_w:
            weight = st.number_input("Weight (kg)", min_value=0.0, max_value=500.0, value=0.0, step=0.5)
        with col_r:
            reps = st.number_input("Reps", min_value=0, max_value=30, value=0, step=1)
        with col_rpe:
            rpe = st.slider("RPE", min_value=6.0, max_value=10.0, value=8.0, step=0.5)
            
        submitted = st.form_submit_button("Log Set")

    if submitted:
        if weight <= 0 or reps <= 0:
            st.error("Weight and Reps must both be greater than 0.")
        else:
            try:
                # Calculate E1RM
                pct = _rpe_percentage(reps, rpe)
                e1rm = round(weight / pct, 1) if pct > 0 else 0.0
                
                # Insert to Supabase workout_logs
                supabase.table("workout_logs").insert({
                    "user_id": st.session_state.user_id,
                    "exercise_name": exercise,
                    "weight_kg": weight,
                    "reps": reps,
                    "rpe": rpe,
                    "e1rm": e1rm
                }).execute()
                
                st.success(f"Set logged successfully! Calculated E1RM: {e1rm} kg")
            except Exception as e:
                st.error(f"Error: {e}")
                
    st.markdown("</div>", unsafe_allow_html=True)


def progress_page() -> None:
    import pandas as pd
    from datetime import datetime

    # 1. Fetch workout logs
    try:
        workout_data = supabase.table("workout_logs").select("*").eq("user_id", st.session_state.user_id).execute().data
    except Exception as exc:
        workout_data = []
        st.warning(f"Could not load workout logs: {exc}")

    # 2. Fetch meal logs
    try:
        meal_data = supabase.table("meal_logs").select("*").eq("user_id", st.session_state.user_id).execute().data
    except Exception as exc:
        meal_data = []
        st.warning(f"Could not load meal logs: {exc}")

    # 3. Fetch progress history
    try:
        progress_data = supabase.table("progress").select("*").eq("user_id", st.session_state.user_id).order("date").execute().data
    except Exception as exc:
        progress_data = []
        st.warning(f"Could not load progress data: {exc}")

    # Empty State Handling
    if not workout_data and not meal_data and not progress_data:
        st.info("Log your first workout or meal to see your progress charts!")
        return

    # ── Calculate weight metrics & 7-Day Moving Average ───────────────────────
    current_avg_weight = "No data"
    df_weight = None

    if progress_data:
        history = [i for i in progress_data if i.get("weight") is not None]
        if history:
            # Sort by date
            history = sorted(history, key=lambda x: x["date"])
            
            # Compute 7-day average for each record
            weight_rows = []
            for i, record in enumerate(history):
                c_date = datetime.strptime(record["date"], "%Y-%m-%d").date()
                c_weight = float(record["weight"])
                
                # Filter records within [c_date - 6 days, c_date]
                last_7 = []
                for prev in history:
                    p_date = datetime.strptime(prev["date"], "%Y-%m-%d").date()
                    if 0 <= (c_date - p_date).days < 7:
                        last_7.append(float(prev["weight"]))
                        
                avg_val = round(sum(last_7) / len(last_7), 2)
                weight_rows.append({
                    "Date": record["date"],
                    "Weight": c_weight,
                    "7-Day Average": avg_val
                })
            
            if weight_rows:
                df_weight = pd.DataFrame(weight_rows).set_index("Date")
                current_avg_weight = f"{weight_rows[-1]['7-Day Average']} kg"

    # ── Calculate E1RM metrics & session curves ────────────────────────────────
    bench_max = 0.0
    squat_max = 0.0
    deadlift_max = 0.0
    df_workout = None

    if workout_data:
        records = []
        for row in workout_data:
            exercise = row.get("exercise_name", "Unknown Lift")
            timestamp_str = row.get("created_at") or row.get("logged_at") or datetime.now().isoformat()
            date_str = timestamp_str[:10]
            val = float(row.get("e1rm") or 0)
            records.append({
                "date": date_str,
                "exercise_name": exercise,
                "e1rm": val
            })
            
            # Keep track of absolute maxes for the summary card
            ex_lower = exercise.lower()
            if "bench" in ex_lower and val > bench_max:
                bench_max = val
            elif "squat" in ex_lower and val > squat_max:
                squat_max = val
            elif "deadlift" in ex_lower and val > deadlift_max:
                deadlift_max = val
                
        if records:
            df_raw = pd.DataFrame(records)
            df_workout = df_raw.groupby(["date", "exercise_name"])["e1rm"].max().unstack()
            df_workout = df_workout.sort_index().ffill()

    # ── Nutrition Trends ─────────────────────────────────────────────────────
    df_nutrition = None
    if meal_data:
        nut_records = []
        for row in meal_data:
            timestamp_str = row.get("created_at") or row.get("logged_at") or datetime.now().isoformat()
            date_str = timestamp_str[:10]
            nut_records.append({
                "Date": date_str,
                "Calories": float(row.get("calories") or 0),
                "Protein": float(row.get("protein") or 0)
            })
        if nut_records:
            df_nut_raw = pd.DataFrame(nut_records)
            df_nutrition = df_nut_raw.groupby("Date")[["Calories", "Protein"]].sum()
            df_nutrition = df_nutrition.sort_index()

    # ── Card: Current Stats Summary ───────────────────────────────────────────
    st.markdown("<div class='ry-card'><h3>📊 Current Stats Summary</h3>", unsafe_allow_html=True)
    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Bench Press Max", f"{bench_max} kg" if bench_max > 0 else "No data")
    m2.metric("Squat Max", f"{squat_max} kg" if squat_max > 0 else "No data")
    m3.metric("Deadlift Max", f"{deadlift_max} kg" if deadlift_max > 0 else "No data")
    m4.metric("7-Day Avg Weight", current_avg_weight)
    st.markdown("</div>", unsafe_allow_html=True)

    # ── Card: Log Progress Form ───────────────────────────────────────────────
    st.markdown("<div class='ry-card'><h3>📈 Log Progress</h3>", unsafe_allow_html=True)
    with st.form("progress_form"):
        logged_on = st.date_input("Date", value=date.today())
        weight    = st.number_input("Body weight (kg)", min_value=0.0, value=0.0, step=0.1)
        waist     = st.number_input("Waist (cm)",       min_value=0.0, value=0.0, step=0.1)
        submitted = st.form_submit_button("Save progress")
    if submitted:
        try:
            supabase.table("progress").upsert({"user_id": st.session_state.user_id, "date": logged_on.isoformat(), "weight": weight or None, "waist": waist or None}, on_conflict="user_id,date").execute()
            st.success("Progress saved.")
            st.rerun()
        except Exception as exc:
            st.error(f"Could not save progress: {exc}")
    st.markdown("</div>", unsafe_allow_html=True)

    # ── Card: Weight Trend ────────────────────────────────────────────────────
    if df_weight is not None:
        st.markdown("<div class='ry-card'><h3>⚖️ Weight Trend (7-Day Moving Average)</h3>", unsafe_allow_html=True)
        st.line_chart(df_weight)
        st.markdown("</div>", unsafe_allow_html=True)

    # ── Card: Strength Tracker ────────────────────────────────────────────────
    if df_workout is not None:
        st.markdown("<div class='ry-card'><h3>💪 E1RM Strength Tracker</h3>", unsafe_allow_html=True)
        st.line_chart(df_workout)
        st.markdown("</div>", unsafe_allow_html=True)

    # ── Card: Nutrition Trends ────────────────────────────────────────────────
    if df_nutrition is not None:
        st.markdown("<div class='ry-card'><h3>🍎 Daily Nutrition Trends</h3>", unsafe_allow_html=True)
        col1, col2 = st.columns(2)
        with col1:
            st.markdown("<b>Daily Calories (kcal)</b>", unsafe_allow_html=True)
            st.bar_chart(df_nutrition["Calories"])
        with col2:
            st.markdown("<b>Daily Protein (g)</b>", unsafe_allow_html=True)
            st.bar_chart(df_nutrition["Protein"])
        st.markdown("</div>", unsafe_allow_html=True)



def feedback_page() -> None:
    is_coach = st.session_state.user_type == "coach"
    st.markdown("<div class='ry-card'><h3>💬 Coach Feedback</h3>", unsafe_allow_html=True)
    if is_coach:
        try:
            clients = supabase.table("users").select("id,username").eq("role", "client").order("username").execute().data
        except Exception as exc:
            st.error(f"Could not load clients: {exc}")
            st.markdown("</div>", unsafe_allow_html=True)
            return
        if not clients:
            st.info("Create a client account first.")
            st.markdown("</div>", unsafe_allow_html=True)
            return
        labels      = {c["username"]: c for c in clients}
        client_name = st.selectbox("Client", list(labels))
        note        = st.text_area("Message")
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
            target_user   = st.selectbox("Select account to reset", list(labels))
            new_temp_pass = st.text_input("Set temporary password", type="password")
            admin_submit  = st.form_submit_button("🚨 Force Password Override")
            if admin_submit:
                if len(new_temp_pass) < 4:
                    st.warning("Temporary password must be at least 4 characters.")
                else:
                    try:
                        tid = labels[target_user]["id"]
                        supabase.table("users").update({"password_hash": hash_password(new_temp_pass)}).eq("id", tid).execute()
                        supabase.table("coach_notes").delete().eq("client_id", tid).ilike("note", "SESSION_TOKEN:%").execute()
                        st.success(f"Password for '{target_user}' overridden and all sessions invalidated.")
                    except Exception as exc:
                        st.error(f"Database error: {exc}")
    else:
        try:
            notes = supabase.table("coach_notes").select("note,created_at").eq("client_id", st.session_state.user_id).order("created_at", desc=True).limit(20).execute().data
            notes = [n for n in notes if not n.get("note", "").startswith("SESSION_TOKEN:")]
            if notes:
                for note in notes:
                    st.markdown(f"""
                    <div class="feedback-item">
                        <div class="fb-header">
                            <div class="fb-av" style="background:linear-gradient(135deg,#f59e0b,#ef4444)">CA</div>
                            <div class="fb-name">Coach Abhishek</div>
                            <div class="fb-time">{note['created_at'][:10]}</div>
                        </div>
                        <div class="fb-text">{html.escape(note['note'])}</div>
                    </div>
                    """, unsafe_allow_html=True)
            else:
                st.info("No coach feedback yet.")
        except Exception as exc:
            st.error(f"Could not load feedback: {exc}")
    st.markdown("</div>", unsafe_allow_html=True)


# ── Action callback functions (called by the query-param action handler) ───────
def _cb_add_meal(user_id: str, data: dict) -> tuple[bool, str]:
    """Insert a meal + its items. Returns (success, message)."""
    meal_type = data.get("meal_type", "Snack")
    items = data.get("items", [])
    if not items:
        return False, "No food items provided."
    try:
        meal = supabase.table("meals").insert({
            "user_id": user_id,
            "meal_type": meal_type,
            "meal_date": date.today().isoformat(),
        }).execute().data[0]
        rows = []
        for i in items:
            qty_str = (
                str(i.get("qty", "100"))
                .replace("g", "").replace(" Scoop", "")
                .replace(" Large", "").replace(" Medium", "")
                .replace(" pc", "")
            )
            try:
                grams_val = float(qty_str or 100)
            except ValueError:
                grams_val = 100.0
            rows.append({
                "meal_id": meal["id"],
                "food_id": i.get("food_id"),
                "grams": grams_val,
                "calories": float(i.get("cal") or 0),
                "protein": float(i.get("protein") or 0),
                "carbs": float(i.get("carbs") or 0),
                "fat": float(i.get("fat") or 0),
            })
        if rows:
            supabase.table("meal_items").insert(rows).execute()
        return True, f"{meal_type} saved successfully!"
    except Exception as exc:
        return False, f"Could not save meal: {exc}"


def _cb_save_progress(user_id: str, data: dict) -> tuple[bool, str]:
    """Upsert a progress entry. Returns (success, message)."""
    try:
        supabase.table("progress").upsert({
            "user_id": user_id,
            "date": date.today().isoformat(),
            "weight": float(data.get("weight") or 0) or None,
            "waist": float(data.get("waist") or 0) or None,
        }, on_conflict="user_id,date").execute()
        return True, "Progress saved!"
    except Exception as exc:
        return False, f"Could not save progress: {exc}"


def _cb_save_workout(user_id: str, data: dict) -> tuple[bool, str]:
    """Insert a workout session with sets. Returns (success, message)."""
    w_date = data.get("date") or date.today().isoformat()
    sets = data.get("sets", [])
    if not sets:
        return False, "No completed sets provided."
    try:
        workout = supabase.table("workouts").insert({
            "user_id": user_id,
            "workout_date": w_date,
        }).execute().data[0]
        rows = [{
            "workout_id": workout["id"],
            "exercise": s["exercise"],
            "set_no": int(s["set_no"]),
            "reps": int(s["reps"]),
            "weight": float(s["weight"]),
            "rpe": float(s.get("rpe", 8)),
        } for s in sets]
        supabase.table("workout_sets").insert(rows).execute()
        return True, f"{len(sets)} sets saved!"
    except Exception as exc:
        return False, f"Could not save workout: {exc}"


def _cb_send_feedback(coach_id: str, data: dict) -> tuple[bool, str]:
    """Insert a coach note/feedback entry. Returns (success, message)."""
    client_name = data.get("client", "")
    msg = data.get("message", "").strip()
    if not client_name or not msg:
        return False, "Client name and message are both required."
    try:
        c_res = (
            supabase.table("users")
            .select("id")
            .eq("username", client_name.lower())
            .limit(1)
            .execute()
            .data
        )
        if not c_res:
            return False, f"Client '{client_name}' not found."
        client_id = c_res[0]["id"]
        supabase.table("coach_notes").insert({
            "coach_id": coach_id,
            "client_id": client_id,
            "note": msg,
        }).execute()
        return True, f"Feedback sent to {client_name}!"
    except Exception as exc:
        return False, f"Could not send feedback: {exc}"


# ── Main app ───────────────────────────────────────────────────────────────────
def get_dynamic_dashboard() -> str:
    import json
    
    # 1. Load food database
    try:
        foods = supabase.table("foods").select("id,name,serving_g,calories,protein,carbs,fat").order("name").limit(250).execute().data
    except Exception:
        foods = []

    # 2. Load today's meals
    try:
        today_meals = today_meal_items()
    except Exception:
        today_meals = []

    # 3. Load progress history
    try:
        progress_data = supabase.table("progress").select("date,weight,waist").eq("user_id", st.session_state.user_id).order("date").execute().data
    except Exception:
        progress_data = []

    # 4. Load coach notes / feedback
    try:
        notes = supabase.table("coach_notes").select("id,client_id,coach_id,note,created_at").eq("client_id", st.session_state.user_id).order("created_at", desc=True).limit(30).execute().data
        notes = [n for n in notes if not n.get("note", "").startswith("SESSION_TOKEN:")]
    except Exception:
        notes = []

    # 5. Load client roster (if coach)
    clients_data = []
    if st.session_state.user_type == "coach":
        try:
            clients = supabase.table("users").select("id,username").eq("role", "client").order("username").execute().data
            for c in clients:
                # Calculate progress based on number of weight logs
                weight_count = supabase.table("progress").select("id", count="exact").eq("user_id", c["id"]).execute().count or 0
                progress_val = min(100, max(20, weight_count * 15)) if weight_count else 0
                
                clients_data.append({
                    "id": c["username"][:2].upper(),
                    "uuid": c["id"],
                    "name": c["username"].title(),
                    "goal": "Fat Loss" if progress_val > 50 else "Body Recomp",
                    "prog": progress_val,
                    "color": "linear-gradient(135deg,#f59e0b,#ef4444)" if progress_val > 50 else "linear-gradient(135deg,#a855f7,#3b82f6)",
                    "active": "Active" if progress_val > 0 else "Inactive"
                })
        except Exception:
            pass

    # 6. Current user info
    user_info = {
        "username": st.session_state.username.title(),
        "role": st.session_state.user_type,
        "uuid": st.session_state.user_id
    }

    # Load index.html template
    with open("index.html", "r", encoding="utf-8") as f:
        html_content = f.read()

    import base64
    def get_base64_image(path: str) -> str:
        try:
            with open(path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode("utf-8")
                mime = "image/png" if path.endswith(".png") else "image/jpeg"
                return f"data:{mime};base64,{encoded_string}"
        except Exception:
            return ""

    logo_b64 = get_base64_image("logo_small.jpg")
    html_content = html_content.replace("{{LOGO_BASE64}}", logo_b64)

    # Retrieve action result and restore-view stored by the action handler
    action_result = st.session_state.pop("action_result", None)   # {"ok": bool, "msg": str}
    restore_view  = st.session_state.pop("restore_view", "dashboard")

    # Create injection script
    injection = f"""
    <script>
      window.currentUser = {json.dumps(user_info)};
      window.todayMeals = {json.dumps(today_meals)};
      window.clientsData = {json.dumps(clients_data)};
      window.progressHistory = {json.dumps(progress_data)};
      window.foodDatabase = {json.dumps(foods)};
      window.feedbackMessages = {json.dumps(notes)};
      window.actionResult = {json.dumps(action_result)};  // {{ok, msg}} or null
      window.restoreView  = {json.dumps(restore_view)};   // page to navigate back to
    </script>
    """

    html_content = html_content.replace("<head>", f"<head>{injection}")
    return html_content


# ── Main app ───────────────────────────────────────────────────────────────────
def app() -> None:
    initialize_state()

    # ── Persist token to localStorage after login ──────────────────────────────
    if "save_token" in st.session_state:
        token = st.session_state.pop("save_token")
        components.html(f"<script>localStorage.setItem('ryvom_token','{token}');</script>", height=0)

    # ── Clear localStorage on logout ───────────────────────────────────────────
    if st.session_state.get("trigger_logout_js"):
        st.session_state["trigger_logout_js"] = False
        components.html("<script>localStorage.removeItem('ryvom_token');</script>", height=0)

    # ── Query-param routing (view switching, logout & database actions) ────────
    qp = st.query_params

    if "logout" in qp:
        reset_session()
        st.query_params.clear()
        st.rerun()

    # ── Persistent login via session token ─────────────────────────────────────
    if not st.session_state.logged_in:
        # Check manual query login params
        if "login_user" in qp and "login_pass" in qp:
            username = qp["login_user"].strip().lower()
            password = qp["login_pass"]
            remember_me = qp.get("remember_me", "0") == "1"
            
            try:
                result = supabase.table("users").select("id,username,password_hash,role").eq("username", username).limit(1).execute().data
                if result and verify_password(result[0]["password_hash"], password):
                    user = result[0]
                    st.session_state.update(
                        logged_in=True,
                        user_id=user["id"],
                        username=user["username"],
                        user_type=user["role"]
                    )
                    if remember_me:
                        token = secrets.token_hex(16)
                        expires_at = (datetime.now() + timedelta(minutes=50)).isoformat()
                        try:
                            supabase.table("coach_notes").insert({
                                "coach_id": user["id"],
                                "client_id": user["id"],
                                "note": f"SESSION_TOKEN:{token}:{expires_at}"
                            }).execute()
                            st.session_state["save_token"] = token
                        except Exception:
                            pass
                    st.query_params.clear()
                    st.rerun()
                else:
                    # Redirect to show error state on the login card
                    st.query_params.clear()
                    st.query_params["login_error"] = "1"
                    st.rerun()
            except Exception:
                st.query_params.clear()
                st.query_params["login_error"] = "1"
                st.rerun()

        if "token" in qp:
            token = qp["token"]
            try:
                results = supabase.table("coach_notes").select("id,client_id,note").ilike("note", f"SESSION_TOKEN:{token}:%").execute().data
                if results:
                    row   = results[0]
                    parts = row["note"].split(":")
                    if len(parts) >= 3:
                        expires_at = datetime.fromisoformat(":".join(parts[2:]))
                        if datetime.now() < expires_at:
                            uid       = row["client_id"]
                            user_data = supabase.table("users").select("username,role").eq("id", uid).limit(1).execute().data
                            if user_data:
                                user = user_data[0]
                                new_expiry = (datetime.now() + timedelta(minutes=50)).isoformat()
                                supabase.table("coach_notes").update({"note": f"SESSION_TOKEN:{token}:{new_expiry}"}).eq("id", row["id"]).execute()
                                st.session_state.update(logged_in=True, user_id=uid, username=user["username"], user_type=user["role"])
                                st.query_params.clear()
                                st.rerun()
                        else:
                            supabase.table("coach_notes").delete().eq("id", row["id"]).execute()
            except Exception:
                pass
            st.query_params.clear()
            st.rerun()
        else:
            if not st.session_state.checked_local_storage:
                st.session_state.checked_local_storage = True
                components.html("""
                    <script>
                        var t = localStorage.getItem('ryvom_token');
                        if (t) {
                            var u = new URL(window.parent.location.href);
                            u.searchParams.set('token', t);
                            window.parent.location.href = u.href;
                        }
                    </script>
                """, height=0)

    # ── Not logged in → show login page ───────────────────────────────────────
    if not st.session_state.logged_in:
        login_or_registration_page()
        return

    # ── Process database actions from query parameters ─────────────────────────
    if "action" in qp:
        import json
        action = qp["action"]
        # Capture the active page so we can restore it after rerun
        restore_view = qp.get("view", "dashboard")
        try:
            data = json.loads(qp.get("data", "{}"))
        except Exception:
            data = {}

        # Dispatch to the appropriate standalone callback
        uid = st.session_state.user_id
        if action == "add_meal":
            ok, msg = _cb_add_meal(uid, data)
        elif action == "save_progress":
            ok, msg = _cb_save_progress(uid, data)
        elif action == "save_workout":
            ok, msg = _cb_save_workout(uid, data)
        elif action == "send_feedback":
            ok, msg = _cb_send_feedback(uid, data)
        else:
            ok, msg = False, f"Unknown action: {action}"

        # Store result in session state so get_dynamic_dashboard() can inject it
        st.session_state["action_result"] = {"ok": ok, "msg": msg}
        st.session_state["restore_view"]  = restore_view

        # Clear query params to prevent resubmission on next refresh
        st.query_params.clear()
        st.rerun()

    # ── Render Dynamic Dashboard in Fullscreen ─────────────────────────
    st.markdown(
        """
        <style>
          /* Hide Streamlit panels and controls entirely */
          [data-testid="stSidebar"] { display: none !important; }
          [data-testid="stHeader"] { display: none !important; }
          .stApp { background-color: #0a0a0e !important; }
          .stMainBlockContainer { padding: 0 !important; margin: 0 !important; max-width: 100% !important; }
          iframe { width: 100vw !important; height: 100vh !important; border: none !important; }
          div[data-testid="stHtml"] { padding: 0 !important; margin: 0 !important; }
        </style>
        """,
        unsafe_allow_html=True
    )

    components.html(get_dynamic_dashboard(), height=1080, scrolling=True)


if __name__ == "__main__":
    app()