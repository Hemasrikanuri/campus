const { db } = require('./db');
const { runMigrations } = require('./db/migrations');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

runMigrations();

const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
if (existingUsers.count > 0) {
  console.log('Database already seeded. Skipping.');
  process.exit(0);
}

console.log('Seeding database...');

const buildings = [
  { id: uuidv4(), name: 'Engineering Building' },
  { id: uuidv4(), name: 'Science Hall' },
  { id: uuidv4(), name: 'Library' },
  { id: uuidv4(), name: 'Student Center' },
  { id: uuidv4(), name: 'Administration Building' },
];

const insertBuilding = db.prepare('INSERT INTO buildings (id, name) VALUES (?, ?)');
for (const b of buildings) {
  insertBuilding.run(b.id, b.name);
}

const floors = [];
const floorNames = ['Ground Floor', '1st Floor', '2nd Floor', '3rd Floor'];
const insertFloor = db.prepare('INSERT INTO floors (id, building_id, name) VALUES (?, ?, ?)');

for (const building of buildings) {
  const numFloors = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < numFloors; i++) {
    const floor = { id: uuidv4(), building_id: building.id, name: floorNames[i] || `Floor ${i}` };
    floors.push(floor);
    insertFloor.run(floor.id, floor.building_id, floor.name);
  }
}

const categories = [
  { name: 'Electrical', subs: ['Power Outage', 'Lighting', 'Wiring', 'Outlet'] },
  { name: 'Plumbing', subs: ['Leak', 'Clogged Drain', 'No Water', 'Toilet'] },
  { name: 'HVAC', subs: ['No Cooling', 'No Heating', 'Poor Ventilation', 'Thermostat'] },
  { name: 'Structural', subs: ['Wall Damage', 'Ceiling', 'Floor', 'Door/Window'] },
  { name: 'IT/Network', subs: ['No Internet', 'Slow Connection', 'WiFi', 'Hardware'] },
  { name: 'Cleaning', subs: ['Restroom', 'General', 'Trash', 'Pest Control'] },
  { name: 'Safety', subs: ['Fire Equipment', 'Emergency Exit', 'Security', 'Lighting'] },
];

const insertCategory = db.prepare('INSERT INTO categories (name) VALUES (?)');
const insertSubCategory = db.prepare('INSERT INTO sub_categories (category_id, name) VALUES (?, ?)');

const categoryMap = {};
for (const cat of categories) {
  const result = insertCategory.run(cat.name);
  categoryMap[cat.name] = result.lastInsertRowid;
  for (const sub of cat.subs) {
    insertSubCategory.run(result.lastInsertRowid, sub);
  }
}

const skills = ['electrical', 'plumbing', 'hvac', 'carpentry', 'painting', 'cleaning', 'it_network', 'security', 'general'];
const insertSkill = db.prepare('INSERT INTO skills (name) VALUES (?)');
const skillMap = {};
for (const skill of skills) {
  const result = insertSkill.run(skill);
  skillMap[skill] = result.lastInsertRowid;
}

const passwordHash = bcrypt.hashSync('password123', 10);

const users = [
  { id: uuidv4(), name: 'Alice Reporter', email: 'alice@campus.edu', role: 'reporter' },
  { id: uuidv4(), name: 'Bob Reporter', email: 'bob@campus.edu', role: 'reporter' },
  { id: uuidv4(), name: 'Charlie Reporter', email: 'charlie@campus.edu', role: 'reporter' },
  { id: uuidv4(), name: 'Dave Technician', email: 'dave@campus.edu', role: 'technician' },
  { id: uuidv4(), name: 'Eve Technician', email: 'eve@campus.edu', role: 'technician' },
  { id: uuidv4(), name: 'Frank Technician', email: 'frank@campus.edu', role: 'technician' },
  { id: uuidv4(), name: 'Grace Technician', email: 'grace@campus.edu', role: 'technician' },
  { id: uuidv4(), name: 'Admin User', email: 'admin@campus.edu', role: 'admin' },
];

const insertUser = db.prepare('INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)');
for (const user of users) {
  insertUser.run(user.id, user.name, user.email, passwordHash, user.role);
}

const technicians = users.filter(u => u.role === 'technician');
const technicianData = [
  { user: technicians[0], categoryGroup: 'Electrical', skills: ['electrical', 'general'] },
  { user: technicians[1], categoryGroup: 'Plumbing', skills: ['plumbing', 'general'] },
  { user: technicians[2], categoryGroup: 'HVAC', skills: ['hvac', 'general'] },
  { user: technicians[3], categoryGroup: 'Structural', skills: ['carpentry', 'painting', 'general'] },
];

const insertTechProfile = db.prepare(
  'INSERT INTO technician_profiles (user_id, category_group, current_workload, max_workload) VALUES (?, ?, 0, 5)'
);
const insertTechSkill = db.prepare(
  'INSERT INTO technician_skills (technician_id, skill_id) VALUES (?, ?)'
);

for (const tech of technicianData) {
  insertTechProfile.run(tech.user.id, tech.categoryGroup);
  for (const skillName of tech.skills) {
    insertTechSkill.run(tech.user.id, skillMap[skillName]);
  }
}

const sampleComplaints = [
  {
    category: 'Electrical', sub_category: 'Power Outage', description: 'Entire 2nd floor has no power since morning',
    building: buildings[0], floor: floors[2], room_area: 'Room 201',
  },
  {
    category: 'Plumbing', sub_category: 'Leak', description: 'Water leaking from ceiling in bathroom',
    building: buildings[1], floor: floors[1], room_area: 'Restroom B',
  },
  {
    category: 'HVAC', sub_category: 'No Cooling', description: 'Air conditioning not working, room is very hot',
    building: buildings[2], floor: floors[0], room_area: 'Study Area',
  },
  {
    category: 'IT/Network', sub_category: 'No Internet', description: 'WiFi is completely down in the east wing',
    building: buildings[3], floor: floors[1], room_area: 'East Wing',
  },
  {
    category: 'Safety', sub_category: 'Emergency Exit', description: 'Emergency exit door is blocked by furniture',
    building: buildings[4], floor: floors[0], room_area: 'Main Lobby',
  },
];

const insertComplaint = db.prepare(`
  INSERT INTO complaints (id, category, sub_category, description, building_id, floor_id, room_area, room_area_normalized, ai_priority, status, required_skill)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Submitted', ?)
`);
const insertReporter = db.prepare('INSERT INTO complaint_reporters (complaint_id, reporter_id) VALUES (?, ?)');
const insertStatusHistory = db.prepare('INSERT INTO status_history (complaint_id, from_status, to_status, changed_by) VALUES (?, ?, ?, ?)');

const reporters = users.filter(u => u.role === 'reporter');

for (let i = 0; i < sampleComplaints.length; i++) {
  const sc = sampleComplaints[i];
  const id = uuidv4();
  const reporter = reporters[i % reporters.length];
  const normalized = sc.room_area.trim().toLowerCase().replace(/\s+/g, ' ').replace(/^(room|rm)\s*/i, '');

  insertComplaint.run(id, sc.category, sc.sub_category, sc.description, sc.building.id, sc.floor.id, sc.room_area, normalized, 'Medium', 'general');
  insertReporter.run(id, reporter.id);
  insertStatusHistory.run(id, null, 'Submitted', reporter.id);
}

console.log('Seed completed!');
console.log('\nDemo credentials:');
console.log('  Reporter:    alice@campus.edu / password123');
console.log('  Technician:  dave@campus.edu / password123');
console.log('  Admin:       admin@campus.edu / password123');

process.exit(0);
