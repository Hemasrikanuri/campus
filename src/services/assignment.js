const { db } = require('../db');

function assignTechnician(complaint) {
  const { category, required_skill, building_id } = complaint;

  const candidates = db.prepare(`
    SELECT u.id, u.name, tp.current_workload, tp.max_workload
    FROM users u
    JOIN technician_profiles tp ON u.id = tp.user_id
    LEFT JOIN technician_skills ts ON u.id = ts.technician_id
    LEFT JOIN skills s ON ts.skill_id = s.id
    WHERE u.role = 'technician'
      AND tp.category_group = ?
      AND (s.name = ? OR ? IS NULL)
      AND tp.current_workload < tp.max_workload
    ORDER BY tp.current_workload ASC
    LIMIT 1
  `).all(category, required_skill, required_skill);

  if (candidates.length === 0) {
    const fallback = db.prepare(`
      SELECT u.id, u.name, tp.current_workload
      FROM users u
      JOIN technician_profiles tp ON u.id = tp.user_id
      WHERE u.role = 'technician'
        AND tp.current_workload < tp.max_workload
      ORDER BY tp.current_workload ASC
      LIMIT 1
    `).get();

    return fallback || null;
  }

  return candidates[0];
}

function assignComplaint(complaintId, userId) {
  const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId);
  if (!complaint) throw new Error('Complaint not found');

  if (complaint.status === 'Reopened' && complaint.reopen_count >= 2) {
    db.prepare(`
      UPDATE complaints SET status = 'Assigned', updated_at = datetime('now') WHERE id = ?
    `).run(complaintId);

    db.prepare(`
      INSERT INTO status_history (complaint_id, from_status, to_status, changed_by)
      VALUES (?, ?, 'Assigned', ?)
    `).run(complaintId, complaint.status, userId);

    return { complaintId, assignedTo: 'admin_queue', message: 'Escalated to admin after multiple reopens' };
  }

  let technicianId;
  let isReassignment = false;

  if (complaint.status === 'Reopened' && complaint.assigned_technician_id) {
    technicianId = complaint.assigned_technician_id;
    isReassignment = true;
  } else {
    const technician = assignTechnician(complaint);
    if (!technician) throw new Error('No available technicians');
    technicianId = technician.id;
  }

  db.prepare(`
    UPDATE complaints
    SET assigned_technician_id = ?, status = 'Assigned', updated_at = datetime('now')
    WHERE id = ?
  `).run(technicianId, complaintId);

  db.prepare(`
    INSERT INTO assignments (complaint_id, technician_id, is_reassignment)
    VALUES (?, ?, ?)
  `).run(complaintId, technicianId, isReassignment ? 1 : 0);

  db.prepare(`
    UPDATE technician_profiles SET current_workload = current_workload + 1 WHERE user_id = ?
  `).run(technicianId);

  db.prepare(`
    INSERT INTO status_history (complaint_id, from_status, to_status, changed_by)
    VALUES (?, ?, 'Assigned', ?)
  `).run(complaintId, complaint.status, userId);

  return { complaintId, assignedTo: technicianId, isReassignment };
}

module.exports = { assignTechnician, assignComplaint };
