# ResolveIT — Complaint Management System

ResolveIT is a full-stack web application that allows users to create, view, update, and delete complaints through a web interface.

The application provides user registration and login, protects complaint data so that users can access only their own complaints, and stores data in a PostgreSQL database.

## Live Demo

- **Frontend:** https://complaint-management-api-theta.vercel.app
- **Backend API:** https://complaint-management-api-zkpx.onrender.com
- **API Documentation:** https://complaint-management-api-zkpx.onrender.com/docs


## Technology Stack

### Frontend
- React
- Vite
- JavaScript
- CSS

### Backend
- Python
- FastAPI
- SQLAlchemy
- JWT-based authentication

### Database
- PostgreSQL

### Development and Deployment
- Git and GitHub
- Vercel for frontend hosting
- Render for backend hosting


## Features

- User registration and login
- JWT-based authentication
- Create new complaints
- View complaints belonging to the logged-in user
- Update existing complaints
- Delete complaints
- User-specific complaint data isolation
- Persistent data storage using PostgreSQL
- Frontend and backend deployed separately
- Interactive API documentation through FastAPI Swagger UI


## Architecture

ResolveIT uses a frontend-backend architecture.

1. **Frontend (React + Vite):** Provides the user interface for registration, login, and complaint management.
2. **Backend (FastAPI):** Handles API requests, validates input, authenticates users, and enforces complaint ownership.
3. **Database (PostgreSQL):** Stores user accounts and complaints persistently.
4. **Authentication (JWT):** Uses tokens to authenticate requests to protected endpoints.

### Request Flow

The application follows this flow:

`User → React Frontend → FastAPI Backend → PostgreSQL Database`

The backend returns a response to the frontend, which updates the user interface.


## Getting Started

Follow these steps to run ResolveIT locally.

### Prerequisites

Install the following tools:

- Python 3.12 or compatible version
- Node.js and npm
- PostgreSQL
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/Kapubalaji/complaint-management-api.git
cd complaint-management-api
```

If the cloned directory has a different name, enter that directory instead.

### 2. Set Up the Backend

Create and activate a Python virtual environment:

```bash
python3 -m venv venv
source venv/bin/activate
```

Install the backend dependencies:

```bash
pip install -r requirements.txt
```

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST:5432/DATABASE_NAME
SECRET_KEY=REPLACE_WITH_A_RANDOM_SECRET_KEY
FRONTEND_URL=http://localhost:5173
```

Replace the example values with your own PostgreSQL connection details and a securely generated secret key.

Never commit `.env` files or real credentials to GitHub.

### 4. Prepare the Database

Create a PostgreSQL database and configure `DATABASE_URL` to point to it.

The application uses SQLAlchemy to connect to PostgreSQL and manage its database models.

### 5. Start the Backend

From the project root, run:

```bash
uvicorn backend.server:app --reload
```

The backend will normally be available at:

- API: http://localhost:8000
- Interactive API documentation: http://localhost:8000/docs

### 6. Configure and Start the Frontend

Open a second terminal and navigate to the frontend directory:

```bash
cd frontend
```

Create a `.env` file inside `frontend/`:

```env
VITE_API_BASE_URL=http://localhost:8000
```

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Vite will display the local frontend URL in the terminal, normally http://localhost:5173.

### 7. Open the Application

Visit the frontend URL displayed by Vite in your browser, register an account, and test the complaint management features.


## Project Structure

```text
complaint-management-api/
backend/
├── __init__.py
├── models/
│   │   ├── user.py
│   │   └── complaint.py
│   ├── routers/
│   │   ├── users.py
│   │   └── complaints.py
│   ├── database.py
│   ├── schemas.py
│   ├── security.py
│   └── server.py
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── api.js
│   │   └── index.css
│   ├── package.json
│   └── vite.config.js
├── .gitignore
├── requirements.txt
└── README.md
```

## Security Notes

- Never commit `.env` files, database credentials, or JWT signing keys.
- Configure environment variables separately for local development and deployment.
- Keep `VITE_API_BASE_URL` pointed at the appropriate backend URL for each environment.
- The `VITE_` prefix makes this frontend variable visible to browser users, so never put secrets in it.
