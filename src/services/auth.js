const { db } = require('../db');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { generateToken } = require('../middleware/auth');

function signup(name, email, password, role = 'reporter') {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    throw new Error('Email already registered');
  }

  const id = uuidv4();
  const password_hash = bcrypt.hashSync(password, 10);

  db.prepare(
    'INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name, email, password_hash, role);

  const user = { id, name, email, role };
  const token = generateToken(user);
  return { user, token };
}

function login(email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    throw new Error('Invalid credentials');
  }

  if (!bcrypt.compareSync(password, user.password_hash)) {
    throw new Error('Invalid credentials');
  }

  const token = generateToken({ id: user.id, name: user.name, email: user.email, role: user.role });
  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    token,
  };
}

module.exports = { signup, login };
