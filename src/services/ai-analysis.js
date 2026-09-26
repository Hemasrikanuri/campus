const { db } = require('../db');

function normalizeRoomArea(roomArea) {
  if (!roomArea) return null;
  let normalized = roomArea.trim().toLowerCase();
  normalized = normalized.replace(/\s+/g, ' ');
  normalized = normalized.replace(/^(room|rm)\s*/i, '');
  return normalized;
}

function derivePriority(category, subCategory, description) {
  const text = `${category} ${subCategory || ''} ${description}`.toLowerCase();

  const criticalKeywords = ['fire', 'flood', 'gas leak', 'collapse', 'emergency', 'electrical hazard', 'structural'];
  const highKeywords = ['no water', 'no power', 'broken lock', 'security', 'hazard', 'unsafe', 'leak'];
  const mediumKeywords = ['not working', 'broken', 'damage', 'stuck', 'noise', 'crack'];

  for (const kw of criticalKeywords) {
    if (text.includes(kw)) return 'Critical';
  }
  for (const kw of highKeywords) {
    if (text.includes(kw)) return 'High';
  }
  for (const kw of mediumKeywords) {
    if (text.includes(kw)) return 'Medium';
  }

  return 'Low';
}

function suggestSkill(category, subCategory, description) {
  const text = `${category} ${subCategory || ''} ${description}`.toLowerCase();

  const skillMap = [
    { skill: 'electrical', keywords: ['electric', 'power', 'outlet', 'switch', 'light', 'wiring', 'circuit', 'breaker'] },
    { skill: 'plumbing', keywords: ['water', 'pipe', 'leak', 'faucet', 'toilet', 'drain', 'plumbing', 'flooding'] },
    { skill: 'hvac', keywords: ['hvac', 'air condition', 'heating', 'ventilation', 'thermostat', 'ac', 'temperature'] },
    { skill: 'carpentry', keywords: ['door', 'window', 'furniture', 'wood', 'cabinet', 'shelf', 'desk', 'chair'] },
    { skill: 'painting', keywords: ['paint', 'wall', 'ceiling', 'crack', 'peeling', 'stain'] },
    { skill: 'cleaning', keywords: ['clean', 'trash', 'garbage', 'sanitiz', 'hygiene', 'restroom'] },
    { skill: 'it_network', keywords: ['internet', 'network', 'wifi', 'ethernet', 'router', 'connection', 'computer'] },
    { skill: 'security', keywords: ['lock', 'key', 'security', 'access', 'camera', 'alarm'] },
    { skill: 'general', keywords: [] },
  ];

  for (const { skill, keywords } of skillMap) {
    if (skill === 'general') continue;
    for (const kw of keywords) {
      if (text.includes(kw)) return skill;
    }
  }
  return 'general';
}

function analyzeComplaint(category, subCategory, description) {
  return {
    ai_priority: derivePriority(category, subCategory, description),
    required_skill: suggestSkill(category, subCategory, description),
  };
}

module.exports = { normalizeRoomArea, analyzeComplaint, derivePriority, suggestSkill };
