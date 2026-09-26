const { db } = require('../db');

function autoCloseExpiredVerifications() {
  const expired = db.prepare(`
    SELECT id FROM complaints
    WHERE status = 'Reporter_Verification'
      AND verification_deadline IS NOT NULL
      AND verification_deadline < datetime('now')
  `).all();

  for (const complaint of expired) {
    db.prepare(`
      UPDATE complaints SET status = 'Closed', updated_at = datetime('now') WHERE id = ?
    `).run(complaint.id);

    db.prepare(`
      INSERT INTO status_history (complaint_id, from_status, to_status, changed_by)
      VALUES (?, 'Reporter_Verification', 'Closed', NULL)
    `).run(complaint.id);
  }

  return expired.length;
}

function checkStaleComplaints() {
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const stale = db.prepare(`
    SELECT id, category, description, created_at FROM complaints
    WHERE status IN ('Submitted', 'AI_Analysis')
      AND assigned_technician_id IS NULL
      AND created_at <= ?
  `).all(fortyEightHoursAgo);

  for (const complaint of stale) {
    db.prepare(`
      INSERT INTO escalations (complaint_id, reason, escalated_by)
      VALUES (?, 'Auto-escalated: unassigned for over 48 hours', NULL)
    `).run(complaint.id);
  }

  return stale.length;
}

function startScheduledJobs() {
  setInterval(() => {
    try {
      const closed = autoCloseExpiredVerifications();
      if (closed > 0) console.log(`Auto-closed ${closed} expired verification(s)`);
    } catch (err) {
      console.error('Error in auto-close job:', err.message);
    }
  }, 60 * 60 * 1000);

  setInterval(() => {
    try {
      const escalated = checkStaleComplaints();
      if (escalated > 0) console.log(`Auto-escalated ${escalated} stale complaint(s)`);
    } catch (err) {
      console.error('Error in stale complaint check:', err.message);
    }
  }, 60 * 60 * 1000);

  console.log('Scheduled jobs started (runs every hour)');
}

module.exports = { autoCloseExpiredVerifications, checkStaleComplaints, startScheduledJobs };
