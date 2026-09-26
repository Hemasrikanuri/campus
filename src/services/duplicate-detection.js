const { db } = require('../db');

function findStrongMatch(category, subCategory, buildingId, floorId, roomAreaNormalized) {
  if (!roomAreaNormalized) return null;

  const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

  const match = db.prepare(`
    SELECT id FROM complaints
    WHERE category = ?
      AND COALESCE(sub_category, '') = COALESCE(?, '')
      AND building_id = ?
      AND floor_id = ?
      AND room_area_normalized = ?
      AND status NOT IN ('Closed', 'Feedback')
      AND created_at >= ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(category, subCategory || '', buildingId, floorId, roomAreaNormalized, seventyTwoHoursAgo);

  return match || null;
}

function findPartialMatches(category, subCategory, buildingId, floorId) {
  const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

  const matches = db.prepare(`
    SELECT id, category, sub_category, description, room_area, status, created_at
    FROM complaints
    WHERE building_id = ?
      AND floor_id = ?
      AND status NOT IN ('Closed', 'Feedback')
      AND created_at >= ?
    ORDER BY created_at DESC
    LIMIT 10
  `).all(buildingId, floorId, seventyTwoHoursAgo);

  return matches;
}

module.exports = { findStrongMatch, findPartialMatches };
