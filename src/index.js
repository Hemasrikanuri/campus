const express = require('express');
const { runMigrations } = require('./db/migrations');
const { startScheduledJobs } = require('./services/scheduler');
const authRoutes = require('./routes/auth');
const complaintRoutes = require('./routes/complaints');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use('/auth', authRoutes);
app.use('/complaints', complaintRoutes);
app.use('/admin', adminRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

runMigrations();
startScheduledJobs();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Campus Issue Resolution System running on port ${PORT}`);
});

module.exports = app;
