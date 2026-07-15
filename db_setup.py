import sqlite3

def init_db():
    conn = sqlite3.connect('coach_app.db')
    cursor = conn.cursor()

    # Table: Clients
    cursor.execute('''CREATE TABLE IF NOT EXISTS clients 
                      (id INTEGER PRIMARY KEY, name TEXT, email TEXT, goal TEXT, 
                       target_cal INTEGER, target_protein INTEGER)''')

    # Table: Daily Logs
    cursor.execute('''CREATE TABLE IF NOT EXISTS daily_logs 
                      (id INTEGER PRIMARY KEY, client_id INTEGER, date TEXT, 
                       weight REAL, photo_url TEXT, calories INTEGER, 
                       protein INTEGER, feedback TEXT, 
                       FOREIGN KEY(client_id) REFERENCES clients(id))''')
    
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully.")