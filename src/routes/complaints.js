const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { normalizeRoomArea, analyzeComplaint } = require('../services/ai-analysis');
const { findStrongMatch, findPartialMatches } = require('../services/duplicate-detection');
const { assignComplaint } = require('../services/assignment');

router.post('/', authenticate, (req, res) => {
  try {
    const { category, sub_category, description, building_id, floor_id, room_area } = req.body;

    if (!category || !description || !building_id || !floor_id) {
      return res.status(400).json({ error: 'category, description, building_id, and floor_id are required' });
    }

    const building = db.prepare('SELECT id FROM buildings WHERE id = ?').get(building_id);
    if (!building) return res.status(400).json({ error: 'Invalid building_id' });

    const floor = db.prepare('SELECT id FROM floors WHERE id = ? AND building_id = ?').get(floor_id, building_id);
    if (!floor) return res.status(400).json({ error: 'Invalid floor_id for the given building' });

    const roomAreaNormalized = normalizeRoomArea(room_area);

    const strongMatch = findStrongMatch(category, sub_category, building_id, floor_id, roomAreaNormalized);
    if (strongMatch) {
      const existingReporter = db.prepare(
        'SELECT * FROM complaint_reporters WHERE complaint_id = ? AND reporter_id = ?'
      ).get(strongMatch.id, req.user.id);

      if (!existingReporter) {
        db.prepare(
          'INSERT INTO complaint_reporters (complaint_id, reporter_id) VALUES (?, ?)'
        ).run(strongMatch.id, req.user.id);
      }

      return res.status(200).json({
        action: 'merged',
        message: 'Similar complaint found and your report has been attached to it',
        complaint_id: strongMatch.id,
      });
    }

    const partialMatches = findPartialMatches(category, sub_category, building_id, floor_id);
    const { ai_priority, required_skill } = analyzeComplaint(category, sub_category, description);

    const id = uuidv4();
    db.prepare(`
      INSERT INTO complaints (id, category, sub_category, description, building_id, floor_id, room_area, room_area_normalized, ai_priority, status, required_skill)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Submitted', ?)
    `).run(id, category, sub_category || null, description, building_id, floor_id, room_area || null, roomAreaNormalized, ai_priority, required_skill);

    db.prepare(
      'INSERT INTO complaint_reporters (complaint_id, reporter_id) VALUES (?, ?)'
    ).run(id, req.user.id);

    db.prepare(`
      INSERT INTO status_history (complaint_id, from_status, to_status, changed_by)
      VALUES (?, NULL, 'Submitted', ?)
    `).run(id, req.user.id);

    db.prepare(`
      UPDATE complaints SET status = 'AI_Analysis', updated_at = datetime('now') WHERE id = ?
    `).run(id);

    db.prepare(`
      INSERT INTO status_history (complaint_id, from_status, to_status, changed_by)
      VALUES (?, 'Submitted', 'AI_Analysis', ?)
    `).run(id, req.user.id);

    res.status(201).json({
      action: 'created',
      complaint_id: id,
      ai_priority,
      required_skill,
      similar_complaints: partialMatches.length > 0 ? partialMatches : undefined,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/attach', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    const existing = db.prepare(
      'SELECT * FROM complaint_reporters WHERE complaint_id = ? AND reporter_id = ?'
    ).get(id, req.user.id);

    if (existing) {
      return res.status(400).json({ error: 'Already attached to this complaint' });
    }

    db.prepare(
      'INSERT INTO complaint_reporters (complaint_id, reporter_id) VALUES (?, ?)'
    ).run(id, req.user.id);

    res.json({ message: 'Attached to complaint', complaint_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    const reporters = db.prepare(`
      SELECT u.id, u.name, u.email, cr.reported_at
      FROM complaint_reporters cr
      JOIN users u ON cr.reporter_id = u.id
      WHERE cr.complaint_id = ?
    `).all(id);

    const history = db.prepare(`
      SELECT * FROM status_history WHERE complaint_id = ? ORDER BY changed_at ASC
    `).all(id);

    const feedbackRow = db.prepare(
      'SELECT * FROM feedback WHERE complaint_id = ?'
    ).get(id);

    const escalations = db.prepare(
      'SELECT * FROM escalations WHERE complaint_id = ? ORDER BY escalated_at ASC'
    ).all(id);

    res.json({
      ...complaint,
      reporters,
      status_history: history,
      feedback: feedbackRow || null,
      escalations,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/assign', authenticate, authorize('admin'), (req, res) => {
  try {
    const result = assignComplaint(req.params.id, req.user.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/start', authenticate, authorize('technician'), (req, res) => {
  try {
    const { id } = req.params;
    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    if (complaint.assigned_technician_id !== req.user.id) {
      return res.status(403).json({ error: 'Not assigned to you' });
    }
    if (complaint.status !== 'Assigned') {
      return res.status(400).json({ error: 'Complaint must be Assigned to start work' });
    }

    db.prepare(`
      UPDATE complaints SET status = 'In_Progress', updated_at = datetime('now') WHERE id = ?
    `).run(id);

    db.prepare(`
      INSERT INTO status_history (complaint_id, from_status, to_status, changed_by)
      VALUES (?, 'Assigned', 'In_Progress', ?)
    `).run(id, req.user.id);

    res.json({ message: 'Work started', complaint_id: id, status: 'In_Progress' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/resolve', authenticate, authorize('technician'), (req, res) => {
  try {
    const { id } = req.params;
    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    if (complaint.assigned_technician_id !== req.user.id) {
      return res.status(403).json({ error: 'Not assigned to you' });
    }
    if (complaint.status !== 'In_Progress') {
      return res.status(400).json({ error: 'Complaint must be In_Progress to resolve' });
    }

    const verificationDeadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
      UPDATE complaints
      SET status = 'Reporter_Verification', resolved_at = datetime('now'), verification_deadline = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(verificationDeadline, id);

    db.prepare(`
      INSERT INTO status_history (complaint_id, from_status, to_status, changed_by)
      VALUES (?, 'In_Progress', 'Reporter_Verification', ?)
    `).run(id, req.user.id);

    db.prepare(`
      UPDATE technician_profiles SET current_workload = MAX(0, current_workload - 1) WHERE user_id = ?
    `).run(req.user.id);

    res.json({ message: 'Resolved, awaiting reporter verification', complaint_id: id, verification_deadline: verificationDeadline });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/verify', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { accept, rating, comment } = req.body;

    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    if (complaint.status !== 'Reporter_Verification') {
      return res.status(400).json({ error: 'Complaint is not awaiting verification' });
    }

    const isReporter = db.prepare(
      'SELECT 1 FROM complaint_reporters WHERE complaint_id = ? AND reporter_id = ?'
    ).get(id, req.user.id);

    if (!isReporter && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the reporter or admin can verify' });
    }

    if (accept) {
      if (rating) {
        db.prepare(
          'INSERT INTO feedback (complaint_id, rating, comment) VALUES (?, ?, ?)'
        ).run(id, rating, comment || null);
      }

      db.prepare(`
        UPDATE complaints SET status = 'Closed', updated_at = datetime('now') WHERE id = ?
      `).run(id);

      db.prepare(`
        INSERT INTO status_history (complaint_id, from_status, to_status, changed_by)
        VALUES (?, 'Reporter_Verification', 'Closed', ?)
      `).run(id, req.user.id);

      res.json({ message: 'Complaint accepted and closed', complaint_id: id, status: 'Closed' });
    } else {
      db.prepare(`
        UPDATE complaints
        SET status = 'Reopened', reopen_count = reopen_count + 1, updated_at = datetime('now')
        WHERE id = ?
      `).run(id);

      db.prepare(`
        INSERT INTO status_history (complaint_id, from_status, to_status, changed_by)
        VALUES (?, 'Reporter_Verification', 'Reopened', ?)
      `).run(id, req.user.id);

      try {
        const result = assignComplaint(id, req.user.id);
        res.json({ message: 'Complaint reopened and reassigned', complaint_id: id, assignment: result });
      } catch (assignErr) {
        res.json({ message: 'Complaint reopened but no technician available', complaint_id: id, status: 'Reopened' });
      }
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/priority', authenticate, authorize('admin'), (req, res) => {
  try {
    const { id } = req.params;
    const { priority } = req.body;

    if (!['Low', 'Medium', 'High', 'Critical'].includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority level' });
    }

    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    db.prepare(`
      UPDATE complaints SET final_priority = ?, updated_at = datetime('now') WHERE id = ?
    `).run(priority, id);

    db.prepare(`
      INSERT INTO status_history (complaint_id, from_status, to_status, changed_by)
      VALUES (?, ?, ?, ?)
    `).run(id, complaint.status, complaint.status, req.user.id);

    res.json({
      message: 'Priority updated',
      complaint_id: id,
      ai_priority: complaint.ai_priority,
      final_priority: priority,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/escalate', authenticate, authorize('admin'), (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    db.prepare(
      'INSERT INTO escalations (complaint_id, reason, escalated_by) VALUES (?, ?, ?)'
    ).run(id, reason || 'Manual escalation', req.user.id);

    res.json({ message: 'Complaint escalated', complaint_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', authenticate, (req, res) => {
  try {
    let complaints;
    if (req.user.role === 'reporter') {
      complaints = db.prepare(`
        SELECT c.* FROM complaints c
        JOIN complaint_reporters cr ON c.id = cr.complaint_id
        WHERE cr.reporter_id = ?
        ORDER BY c.created_at DESC
      `).all(req.user.id);
    } else if (req.user.role === 'technician') {
      complaints = db.prepare(`
        SELECT * FROM complaints WHERE assigned_technician_id = ?
        ORDER BY created_at DESC
      `).all(req.user.id);
    } else {
      complaints = db.prepare('SELECT * FROM complaints ORDER BY created_at DESC').all();
    }

    res.json(complaints);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
