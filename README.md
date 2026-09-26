# Campus Issue Resolution System

A backend API for managing campus facility complaints with AI-powered prioritization, duplicate detection, assignment automation, and escalation workflows.

## Tech Stack

- **Runtime**: Node.js + Express
- **Database**: SQLite (via better-sqlite3)
- **Auth**: JWT (jsonwebtoken) + bcrypt

## Setup

```bash
npm install
npm run seed    # Seed demo data
npm start       # Start server on port 3000
```

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Reporter | alice@campus.edu | password123 |
| Technician | dave@campus.edu | password123 |
| Admin | admin@campus.edu | password123 |

## API Endpoints

### Auth
- `POST /auth/signup` — Register new user (name, email, password, role)
- `POST /auth/login` — Login (email, password) → JWT token

### Complaints
- `POST /complaints` — Submit complaint (category, sub_category, description, building_id, floor_id, room_area)
  - Runs AI analysis for priority + skill suggestion
  - Detects duplicates (strong match → auto-merge, partial match → warning)
- `POST /complaints/:id/attach` — Attach reporter to existing complaint
- `GET /complaints/:id` — Get complaint detail + history + feedback
- `GET /complaints` — List complaints (filtered by role)
- `POST /complaints/:id/assign` — Assign technician (admin only)
- `POST /complaints/:id/start` — Technician starts work
- `POST /complaints/:id/resolve` — Technician marks resolved (starts 3-day verification)
- `POST /complaints/:id/verify` — Reporter accepts/rejects resolution
- `POST /complaints/:id/priority` — Admin override priority
- `POST /complaints/:id/escalate` — Admin escalation

### Dashboards & Insights
- `GET /admin/dashboard/reporter` — Reporter's complaint summary
- `GET /admin/dashboard/technician` — Technician's workload + assignments
- `GET /admin/dashboard/admin` — Admin overview (status distribution, escalations, etc.)
- `GET /admin/recurring-insights` — Recurring issues (≥3 complaints in 30 days by category+location)

## Status State Machine

```
Submitted → AI_Analysis → Assigned → In_Progress → Reporter_Verification
                                                        ↓           ↓
                                                     (accept)    (reject)
                                                        ↓           ↓
                                                     Closed     Reopened → Assigned
```

- No response in 3 days → Auto-Closed
- Reopen 2+ times → Escalated to Admin queue

## Scheduled Jobs

- **Auto-close**: Complaints in `Reporter_Verification` past 3-day deadline
- **Auto-escalation**: Unassigned complaints older than 48 hours
