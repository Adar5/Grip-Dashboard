# 🌍 GRIP - Goa Real-Time Infrastructure Protection

**GRIP** is a comprehensive civic tech solution designed to monitor, assign, and resolve infrastructure hazards like potholes and garbage overflow. Built for the State of Goa, it connects citizen reports directly to local administrative bodies (BDOs, PWD, GWMC) using AI classification, automated SLA tracking, and interactive mapping.

---

## ✨ Key Features

*   **🗺️ Live Territory Mapping:** Dynamic, color-coded maps showing active and resolved hazards based on geographic jurisdiction (Taluka/District).
*   **🔐 Role-Based Access Control (RBAC):** Granular, secure dashboards tailored for different administrative levels (BDO, CE, EE, AE, JE).
*   **🤖 AI Severity Prediction:** Automatically classifies issue types (e.g., *High Severity Pothole*, *Garbage Overflow*) and assigns confidence scores using integrated machine learning.
*   **⏳ Automated SLA Escalations:** Built-in accountability. If a village panchayat misses a deadline, BDOs can issue one-click warnings or escalate tickets directly to the State (GWMC).
*   **📧 Automated Email Routing:** Sends localized resolution proofs and escalation warnings to specific department secretaries based on intelligent district mapping (North Goa vs. South Goa).

---

## 🛠️ Tech Stack

**Frontend & API:**
*   **Framework:** [Next.js](https://nextjs.org/) (React, App Router)
*   **Styling:** [Tailwind CSS](https://tailwindcss.com/)

**Backend & Infrastructure:**
*   **Database:** [Supabase](https://supabase.com/) (PostgreSQL)
*   **Storage:** Supabase Storage (for High-Res Evidence & Resolution Photos)
*   **Authentication:** Supabase Auth
*   **Deployment:** [Docker](https://www.docker.com/) (Containerized for VPS hosting)
*   **Workflow Automation:** [n8n](https://n8n.io/) (For webhook-triggered email notifications)

---

## 🗄️ Database Architecture

The system relies on a strictly relational PostgreSQL architecture:
*   `dashboard_reports` / `reports`: Stores raw citizen submissions, AI predictions, and geographic coordinates.
*   `work_orders`: Links reports to specific workers, tracking statuses, SLAs, and escalation levels.
*   `departments`: Defines jurisdictions (Districts, Talukas) and stores official contact emails.
*   `field_workers`: Manages worker hierarchies (Level 1-5) and their assigned departments.

---

## 🚀 Local Setup & Installation

### 1. Prerequisites
Ensure you have the following installed on your machine:
*   [Git](https://git-scm.com/)
*   [Docker](https://www.docker.com/) (If running via containers)
*   [Node.js](https://nodejs.org/) (v18 or higher for local development)

### 2. Clone the Repository
```bash
git clone https://github.com/Adar5/Grip-Dashboard.git
cd Grip-Dashboard
```

### 3. Environment Variables
Create a .env.local file in the root directory and add your secure keys:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```
### 4. Run via Docker 
To build and spin up the dashboard exactly as it runs on the server:
```bash
# Build the Docker image
docker build --no-cache -t grip-dashboard:latest .

# Run the container on port 3000
docker run -d --name grip-app -p 3000:3000 --restart unless-stopped grip-dashboard:latest
```
The app will be available at http://localhost:3000

### 5. Run via Node (For Local Development)
```bash
npm install
npm run dev
```

## 👨‍💻 Author
### Adarsh Gaunkar
Developed as a final year academic project to modernize civic infrastructure management.
