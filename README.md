# ZimMarketplace

ZimMarketplace is a full-stack online marketplace platform that combines a React frontend, a .NET API backend, and a Java payment microservice. The project is structured as a multi-service application with real-time auction updates, secure API access, and containerized PostgreSQL persistence.

For the running implementation and validation history, see the [ZimMarketplace change summary](.github/modernize/java-upgrade/20260909090849/summary.md).

## Overview

This repository contains:

- Frontend: `zim-marketplace-ui` — a React + Vite single-page application for browsing listings, placing bids, and managing authentication.
- Backend API: `ZimMarketplace.API` — a .NET 10 ASP.NET Core service with JWT authentication, EF Core, PostgreSQL access, and SignalR real-time auction updates.
- Payment Service: `ZimMarketplace.Payments` — a Java Spring Boot microservice for payment-related logic.
- Infrastructure: `docker-compose.yml` — PostgreSQL database container orchestration.

## Key Features

- Marketplace listing catalog with search and filtering
- Seller dashboard for managing listings
- Auction bidding with live updates using SignalR
- Instant buy and timed auctions
- JWT-based authentication and role-aware access
- Admin moderation tools
- PostgreSQL-backed persistence
- Containerized local database setup

## Architecture

The application is organized as three distinct runtime components:

1. Web UI (React + Vite)
   - Handles the user experience and marketplace interaction
   - Calls the API over HTTP
   - Subscribes to SignalR auction events

2. API Service (.NET)
   - Exposes marketplace and auth endpoints
   - Validates JWT tokens
   - Stores data in PostgreSQL
   - Publishes live auction updates

3. Payment Service (Java/Spring Boot)
   - Hosts payment-related processing and future payment workflows
   - Can be extended independently from the marketplace API

## Repository Structure

```text
ZimMarketplace/
├── README.md
├── docker-compose.yml
├── .gitignore
├── zim-marketplace-ui/
│   ├── package.json
│   ├── vite.config.js
│   ├── eslint.config.js
│   └── src/
├── ZimMarketplace.API/
│   ├── Controllers/
│   ├── Hubs/
│   ├── Migrations/
│   ├── Models/
│   ├── Services/
│   ├── appsettings.json
│   ├── Program.cs
│   └── ZimMarketplace.API.csproj
└── ZimMarketplace.Payments/
    ├── pom.xml
    └── src/
```

## Prerequisites

Before running the project locally, ensure you have:

- Node.js 20+ and npm
- .NET 10 SDK
- Java 17 JDK
- Maven
- Docker Desktop or Docker Engine
- Git

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/EmperorAang/ZimMarketplace.git
cd ZimMarketplace
```

### 2. Start the database

```bash
docker compose up -d db
```

This starts PostgreSQL on port `5432` using the credentials configured in `docker-compose.yml`.

### 3. Run the API service

```bash
cd ZimMarketplace.API
dotnet restore
dotnet run
```

The API will run at:

- `http://localhost:5159`
- SignalR hub: `http://localhost:5159/hubs/auction`

### 4. Run the frontend

```bash
cd ../zim-marketplace-ui
npm install
npm run dev
```

The UI will run at:

- `http://localhost:5173`
- LAN devices: `http://192.168.101.81:5173`

For LAN testing, keep the API running with the HTTP launch profile. It listens on `http://0.0.0.0:5159`, and the frontend derives its API and SignalR host from the browser hostname. Both devices must be connected to the same Wi-Fi network, and Windows Firewall must allow the development ports.

After pulling database changes, apply migrations from the repository root:

```bash
dotnet ef database update --project ZimMarketplace.API/ZimMarketplace.API.csproj --startup-project ZimMarketplace.API/ZimMarketplace.API.csproj
```

### 5. Run the payment microservice

```bash
cd ../ZimMarketplace.Payments
mvn clean install
mvn spring-boot:run
```

The Java service typically runs on its default Spring Boot port unless further configuration is added.

## Configuration Notes

### API configuration
The .NET API is configured through `ZimMarketplace.API/appsettings.json` and includes:

- PostgreSQL connection string
- JWT settings
- CORS policy for the frontend application

### Database credentials
The default local database values configured for development are:

- Database: `zim_marketplace`
- Username: `tafara_admin`
- Password: `SecureZimPassword2026`
- Port: `5432`

## Development Notes

- The frontend uses Vite and React 19.
- The backend uses ASP.NET Core and Entity Framework Core.
- JWT authentication is enabled for protected routes.
- SignalR is used for live auction activity notifications.
- Migrations are included under `ZimMarketplace.API/Migrations`.

## Common Commands

### Frontend

```bash
cd zim-marketplace-ui
npm install
npm run dev
npm run build
npm run lint
```

### API

```bash
dotnet restore
cd ZimMarketplace.API
dotnet build
dotnet run
```

### Payment service

```bash
cd ZimMarketplace.Payments
mvn clean install
mvn test
mvn spring-boot:run
```

## Git Workflow

This repository is intended to be used with a standard Git flow. The default branch used for this project is `main`.

```bash
git checkout main
git pull origin main
git add .
git commit -m "Describe your change"
git push origin main
```

## License

This project is currently distributed for local development and educational/demo purposes unless otherwise specified by the repository owner.

## Future Improvements

Potential improvements for the project include:

- full payment integration and transaction flow
- stronger role-based authorization policies
- notifications and email support
- deployment configuration for Azure, Docker, or Kubernetes
- automated CI/CD pipeline configuration
- unit and integration test coverage

## Contact

For questions or enhancements related to this project, please reach out through the repository owner or the project maintainer.
