const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/recurring-insights', authenticate, authorize('admin'), (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const insights = db.prepare(`
      SELECT
        c.category,
        c.sub_category,
        c.building_id,
        b.name as building_name,
        c.floor_id,
        f.name as floor_name,
        COUNT(*) as complaint_count,
        MIN(c.created_at) as window_start,
        MAX(c.created_at) as window_end
      FROM complaints c
      LEFT JOIN buildings b ON c.building_id = b.id
      LEFT JOIN floors f ON c.floor_id = f.id
      WHERE c.created_at >= ?
      GROUP BY c.category, COALESCE(c.sub_category, ''), c.building_id, COALESCE(c.floor_id, '')
      HAVING COUNT(*) >= 3
      ORDER BY complaint_count DESC
    `).all(thirtyDaysAgo);

    res.json(insights);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/dashboard/reporter', authenticate, (req, res) => {
  try {
    const myComplaints = db.prepare(`
      SELECT c.* FROM complaints c
      JOIN complaint_reporters cr ON c.id = cr.complaint_id
      WHERE cr.reporter_id = ?
      ORDER BY c.created_at DESC
    `).all(req.user.id);

    const pending = myComplaints.filter(c => !['Closed', 'Feedback'].includes(c.status));
    const needsVerification = myComplaints.filter(c => c.status === 'Reporter_Verification');

    res.json({
      total: myComplaints.length,
      pending: pending.length,
      needs_verification: needsVerification.length,
      complaints: myComplaints,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/dashboard/technician', authenticate, authorize('technician'), (req, res) => {
  try {
    const myAssignments = db.prepare(`
      SELECT * FROM complaints WHERE assigned_technician_id = ?
      ORDER BY
        CASE status
          WHEN 'Assigned' THEN 1
          WHEN 'In_Progress' THEN 2
          WHEN 'Reporter_Verification' THEN 3
          ELSE 4
        END,
        created_at DESC
    `).all(req.user.id);

    const active = myAssignments.filter(c => ['Assigned', 'In_Progress'].includes(c.status));
    const pendingVerification = myAssignments.filter(c => c.status === 'Reporter_Verification');

    const profile = db.prepare(
      'SELECT * FROM technician_profiles WHERE user_id = ?'
    ).get(req.user.id);

    res.json({
      workload: profile ? profile.current_workload : 0,
      max_workload: profile ? profile.max_workload : 5,
      active: active.length,
      pending_verification: pendingVerification.length,
      assignments: myAssignments,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/dashboard/admin', authenticate, authorize('admin'), (req, res) => {
  try {
    const statusCounts = db.prepare(`
      SELECT status, COUNT(*) as count FROM complaints GROUP BY status
    `).all();

    const unassigned = db.prepare(`
      SELECT COUNT(*) as count FROM complaints
      WHERE status IN ('Submitted', 'AI_Analysis') AND assigned_technician_id IS NULL
    `).get();

    const overdueVerifications = db.prepare(`
      SELECT COUNT(*) as count FROM complaints
      WHERE status = 'Reporter_Verification'
        AND verification_deadline < datetime('now')
    `).get();

    const openEscalations = db.prepare(`
      SELECT COUNT(DISTINCT complaint_id) as count FROM escalations
    `).get();

    const priorityDistribution = db.prepare(`
      SELECT
        COALESCE(final_priority, ai_priority) as priority,
        COUNT(*) as count
      FROM complaints
      WHERE status NOT IN ('Closed', 'Feedback')
      GROUP BY COALESCE(final_priority, ai_priority)
    `).all();

    const recentComplaints = db.prepare(`
      SELECT * FROM complaints ORDER BY created_at DESC LIMIT 20
    `).all();

    res.json({
      status_distribution: statusCounts,
      unassigned_count: unassigned.count,
      overdue_verifications: overdueVerifications.count,
      open_escalations: openEscalations.count,
      priority_distribution: priorityDistribution,
      recent_complaints: recentComplaints,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
