const { db } = require('./index');

function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('reporter','technician','admin')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS technician_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      category_group TEXT,
      current_workload INTEGER NOT NULL DEFAULT 0,
      max_workload INTEGER NOT NULL DEFAULT 5
    );

    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS technician_skills (
      technician_id TEXT REFERENCES users(id),
      skill_id INTEGER REFERENCES skills(id),
      PRIMARY KEY (technician_id, skill_id)
    );

    CREATE TABLE IF NOT EXISTS buildings (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS floors (
      id TEXT PRIMARY KEY,
      building_id TEXT NOT NULL REFERENCES buildings(id),
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sub_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      sub_category TEXT,
      description TEXT NOT NULL,
      building_id TEXT NOT NULL REFERENCES buildings(id),
      floor_id TEXT NOT NULL REFERENCES floors(id),
      room_area TEXT,
      room_area_normalized TEXT,
      ai_priority TEXT CHECK(ai_priority IN ('Low','Medium','High','Critical')),
      final_priority TEXT CHECK(final_priority IN ('Low','Medium','High','Critical')),
      status TEXT NOT NULL DEFAULT 'Submitted'
        CHECK(status IN ('Submitted','AI_Analysis','Assigned','In_Progress','Resolved','Reporter_Verification','Feedback','Closed','Reopened')),
      required_skill TEXT,
      assigned_technician_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      verification_deadline TEXT,
      reopen_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS complaint_reporters (
      complaint_id TEXT NOT NULL REFERENCES complaints(id),
      reporter_id TEXT NOT NULL REFERENCES users(id),
      reported_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (complaint_id, reporter_id)
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id TEXT NOT NULL REFERENCES complaints(id),
      technician_id TEXT NOT NULL REFERENCES users(id),
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_reassignment INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id TEXT NOT NULL REFERENCES complaints(id),
      from_status TEXT,
      to_status TEXT NOT NULL,
      changed_at TEXT NOT NULL DEFAULT (datetime('now')),
      changed_by TEXT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id TEXT NOT NULL REFERENCES complaints(id),
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment TEXT,
      submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS escalations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id TEXT NOT NULL REFERENCES complaints(id),
      escalated_at TEXT NOT NULL DEFAULT (datetime('now')),
      reason TEXT,
      escalated_by TEXT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS recurring_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      sub_category TEXT,
      building_id TEXT NOT NULL REFERENCES buildings(id),
      floor_id TEXT,
      complaint_count INTEGER NOT NULL,
      window_start TEXT NOT NULL,
      window_end TEXT NOT NULL,
      flagged_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
    CREATE INDEX IF NOT EXISTS idx_complaints_building ON complaints(building_id);
    CREATE INDEX IF NOT EXISTS idx_complaints_category ON complaints(category);
    CREATE INDEX IF NOT EXISTS idx_complaints_assigned ON complaints(assigned_technician_id);
    CREATE INDEX IF NOT EXISTS idx_complaints_created ON complaints(created_at);
    CREATE INDEX IF NOT EXISTS idx_status_history_complaint ON status_history(complaint_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_complaint ON assignments(complaint_id);
  `);
}

module.exports = { runMigrations };
