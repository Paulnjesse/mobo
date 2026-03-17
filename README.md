# MOBO — Your City. Your Ride. Your Community.

MOBO is a community-focused ride-hailing platform built for African cities. Designed with warmth, reliability, and local culture in mind — because every ride is more than just a trip.

## Supported Markets

- Cameroon (Douala, Yaoundé)
- Nigeria (Lagos, Abuja)
- Kenya (Nairobi, Mombasa)
- Ivory Coast (Abidjan)
- South Africa (Johannesburg, Cape Town)
- Gabon (Libreville)
- Benin (Cotonou)
- Niger (Niamey)

---

## Architecture

MOBO follows a microservices architecture. Each service is independently deployable and communicates via HTTP. The API Gateway is the single entry point for all client requests.

```
                        ┌─────────────────────┐
                        │      Mobile App      │
                        │   (Expo / React       │
                        │    Native)            │
                        └──────────┬───────────┘
                                   │ HTTPS
                        ┌──────────▼───────────┐
                        │     API Gateway       │
                        │  Port 3000            │
                        │  JWT auth, rate limit │
                        └──┬───────┬────────────┘
               ┌───────────┘       └──────────────────────┐
     ┌─────────▼──────┐  ┌──────────────┐  ┌─────────────▼──────┐
     │  User Service  │  │ Ride Service │  │ Payment Service     │
     │  Port 3001     │  │ Port 3002    │  │ Port 3003           │
     │  Auth, profiles│  │ Rides, fares │  │ MTN, Orange, Stripe │
     │  subscriptions │  │ promo codes  │  │ wallets             │
     └────────────────┘  └──────┬───────┘  └─────────────────────┘
                                │
                        ┌───────▼────────┐
                        │Location Service│
                        │  Port 3004     │
                        │  Real-time GPS │
                        │  Socket.IO     │
                        └────────────────┘
                                │
                        ┌───────▼────────┐
                        │  PostgreSQL +   │
                        │  PostGIS DB     │
                        └────────────────┘
```

| Service          | Port | Responsibility                                       |
|------------------|------|------------------------------------------------------|
| API Gateway      | 3000 | Routing, JWT auth, rate limiting, CORS               |
| User Service     | 3001 | Auth (OTP), profiles, teen accounts, corporate, push |
| Ride Service     | 3002 | Ride lifecycle, fares, surge pricing, promo codes    |
| Payment Service  | 3003 | Payments, wallets, subscriptions, refunds            |
| Location Service | 3004 | Real-time driver tracking, nearby drivers, Socket.IO |
| Admin Dashboard  | 3005 | React admin panel (Create React App)                 |

---

## Prerequisites

- Node.js 18+
- Docker & Docker Compose (for containerized setup)
- PostgreSQL 15+ with PostGIS extension (if running without Docker)
- Git

---

## Local Setup — With Docker (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/your-org/mobo.git
cd mobo

# 2. Copy environment files
cp services/user-service/.env.example services/user-service/.env
cp services/ride-service/.env.example services/ride-service/.env
cp services/payment-service/.env.example services/payment-service/.env
cp services/location-service/.env.example services/location-service/.env
cp api-gateway/.env.example api-gateway/.env
cp mobile/.env.example mobile/.env

# 3. Fill in your credentials in each .env file (see Environment Variables section below)

# 4. Start all services
docker-compose up --build

# 5. The API is available at:
#    http://localhost:3000/api
```

The first run will automatically:
- Start a PostgreSQL + PostGIS database
- Run database/init.sql to create all tables
- Start all microservices

---

## Local Setup — Without Docker

Run each service in a separate terminal.

### 1. Database

Install PostgreSQL 15+ with the PostGIS extension, then:

```bash
psql -U postgres -c "CREATE USER mobo_user WITH PASSWORD 'mobo_pass';"
psql -U postgres -c "CREATE DATABASE mobo OWNER mobo_user;"
psql -U postgres -c "CREATE EXTENSION IF NOT EXISTS postgis;" mobo
psql -U mobo_user -d mobo -f database/init.sql
psql -U mobo_user -d mobo -f database/migration_001.sql
```

### 2. API Gateway

```bash
cd api-gateway
cp .env.example .env
# Edit .env with your values
npm install
npm start
```

### 3. User Service

```bash
cd services/user-service
cp .env.example .env
# Edit .env with your values (Twilio, SMTP, JWT secret)
npm install
npm start
```

### 4. Ride Service

```bash
cd services/ride-service
cp .env.example .env
# Edit .env (Google Maps API key optional but recommended)
npm install
npm start
```

### 5. Payment Service

```bash
cd services/payment-service
cp .env.example .env
# Edit .env with Flutterwave, MTN, Orange Money credentials
npm install
npm start
```

### 6. Location Service

```bash
cd services/location-service
cp .env.example .env
npm install
npm start
```

---

## Environment Variables Guide

### API Gateway (`api-gateway/.env`)

| Variable              | Description                                    |
|-----------------------|------------------------------------------------|
| `PORT`                | Port to run on (default: 3000)                 |
| `JWT_SECRET`          | Secret for verifying JWTs (min 32 chars)       |
| `USER_SERVICE_URL`    | URL of user-service                            |
| `RIDE_SERVICE_URL`    | URL of ride-service                            |
| `PAYMENT_SERVICE_URL` | URL of payment-service                         |
| `LOCATION_SERVICE_URL`| URL of location-service                        |

### User Service (`services/user-service/.env`)

| Variable              | Description                                          |
|-----------------------|------------------------------------------------------|
| `DATABASE_URL`        | PostgreSQL connection string                         |
| `JWT_SECRET`          | Same secret as API Gateway                           |
| `JWT_EXPIRES_IN`      | Token expiry (e.g., `7d`)                            |
| `TWILIO_ACCOUNT_SID`  | Twilio SID for SMS OTP                               |
| `TWILIO_AUTH_TOKEN`   | Twilio auth token                                    |
| `TWILIO_PHONE_NUMBER` | Twilio sender phone number                           |
| `SMTP_HOST`           | SMTP server host (e.g., `smtp.gmail.com`)            |
| `SMTP_PORT`           | SMTP port (587 for TLS)                              |
| `SMTP_USER`           | SMTP username / email address                        |
| `SMTP_PASS`           | SMTP password / app-specific password                |

### Ride Service (`services/ride-service/.env`)

| Variable               | Description                                    |
|------------------------|------------------------------------------------|
| `DATABASE_URL`         | PostgreSQL connection string                   |
| `JWT_SECRET`           | Same secret as API Gateway                     |
| `GOOGLE_MAPS_API_KEY`  | Google Maps Directions API key (optional)      |
| `LOCATION_SERVICE_URL` | Internal URL of location-service               |

### Payment Service (`services/payment-service/.env`)

| Variable                  | Description                                 |
|---------------------------|---------------------------------------------|
| `FLUTTERWAVE_SECRET_KEY`  | Flutterwave secret key (for card payments)  |
| `MTN_API_USER`            | MTN MoMo API user UUID                      |
| `MTN_API_KEY`             | MTN MoMo API key                            |
| `MTN_SUBSCRIPTION_KEY`    | MTN MoMo subscription key (Ocp-Apim key)   |
| `ORANGE_CLIENT_ID`        | Orange Money OAuth client ID                |
| `ORANGE_CLIENT_SECRET`    | Orange Money OAuth client secret            |

---

## Running the Mobile App (Expo)

```bash
cd mobile
cp .env.example .env
# Set EXPO_PUBLIC_API_URL to your API Gateway URL

npm install
npx expo start

# For iOS simulator:
npx expo start --ios

# For Android emulator:
npx expo start --android

# For physical device: scan the QR code with Expo Go app
```

The mobile app requires:
- Expo Go app on your phone, or
- Xcode (iOS) / Android Studio (Android) for simulators

---

## Running the Admin Dashboard

```bash
cd admin
npm install
npm start

# Dashboard is available at http://localhost:3005
# Default admin credentials are set in your database seed
```

To build for production:

```bash
cd admin
npm run build
# Outputs to admin/build — deploy to Netlify, Vercel, or any static host
```

---

## API Endpoints Reference

All endpoints are prefixed with `/api`. Protected routes require `Authorization: Bearer <token>`.

### Authentication

| Method | Endpoint               | Description                   | Auth |
|--------|------------------------|-------------------------------|------|
| POST   | `/auth/signup`         | Register a new user           | No   |
| POST   | `/auth/login`          | Login with phone + password   | No   |
| POST   | `/auth/verify`         | Verify OTP code               | No   |
| POST   | `/auth/resend-otp`     | Resend OTP                    | No   |
| POST   | `/auth/logout`         | Logout (invalidate session)   | Yes  |

### User / Profile

| Method | Endpoint                            | Description                       | Auth |
|--------|-------------------------------------|-----------------------------------|------|
| GET    | `/users/profile`                    | Get current user's profile        | Yes  |
| PUT    | `/users/profile`                    | Update profile                    | Yes  |
| PUT    | `/users/language`                   | Update preferred language         | Yes  |
| DELETE | `/users/account`                    | Delete account (soft)             | Yes  |
| GET    | `/users/notifications`              | Get notifications                 | Yes  |
| PUT    | `/users/notifications/:id/read`     | Mark notification read            | Yes  |
| GET    | `/users/loyalty`                    | Get loyalty points and history    | Yes  |
| POST   | `/users/teen-account`               | Create a teen sub-account         | Yes  |
| GET    | `/users/teen-accounts`              | List teen accounts                | Yes  |
| GET    | `/users/subscription`               | Get subscription plan + benefits  | Yes  |
| PUT    | `/users/push-token`                 | Update Expo push token            | Yes  |

### Corporate Accounts

| Method | Endpoint                            | Description                       | Auth |
|--------|-------------------------------------|-----------------------------------|------|
| POST   | `/users/corporate`                  | Create a corporate account        | Yes  |
| GET    | `/users/corporate`                  | Get corporate account + members   | Yes  |
| POST   | `/users/corporate/members`          | Add a member to corporate account | Yes  |
| DELETE | `/users/corporate/members/:userId`  | Remove a member                   | Yes  |
| GET    | `/users/corporate/rides`            | List rides by corporate members   | Yes  |

### Rides

| Method | Endpoint                  | Description                          | Auth |
|--------|---------------------------|--------------------------------------|------|
| POST   | `/rides/request`          | Request a new ride                   | Yes  |
| GET    | `/rides`                  | List user's rides                    | Yes  |
| GET    | `/rides/:id`              | Get single ride details              | Yes  |
| PATCH  | `/rides/:id/accept`       | Driver accepts a ride                | Yes  |
| PATCH  | `/rides/:id/status`       | Update ride status                   | Yes  |
| POST   | `/rides/:id/cancel`       | Cancel a ride                        | Yes  |
| POST   | `/rides/:id/rate`         | Rate a completed ride                | Yes  |
| POST   | `/rides/:id/tip`          | Add tip to completed ride            | Yes  |
| POST   | `/rides/:id/round-up`     | Round up fare to wallet              | Yes  |
| GET    | `/rides/:id/messages`     | Get in-ride messages                 | Yes  |
| POST   | `/rides/:id/messages`     | Send an in-ride message              | Yes  |

### Promo Codes

| Method | Endpoint              | Description                             | Auth |
|--------|-----------------------|-----------------------------------------|------|
| GET    | `/rides/promos`       | List active promos not used by user     | Yes  |
| POST   | `/rides/promo/apply`  | Validate and calculate promo discount   | Yes  |

### Fare

| Method | Endpoint              | Description                              | Auth     |
|--------|-----------------------|------------------------------------------|----------|
| GET    | `/fare/estimate`      | Get fare estimate for all ride types     | Optional |
| GET    | `/fare/surge`         | Check surge pricing at a location        | No       |

### Payments

| Method | Endpoint                          | Description                         | Auth |
|--------|-----------------------------------|-------------------------------------|------|
| POST   | `/payments/methods`               | Add a payment method                | Yes  |
| GET    | `/payments/methods`               | List payment methods                | Yes  |
| PUT    | `/payments/methods/:id/default`   | Set default payment method          | Yes  |
| DELETE | `/payments/methods/:id`           | Delete a payment method             | Yes  |
| POST   | `/payments/charge`                | Charge for a completed ride         | Yes  |
| GET    | `/payments/history`               | Payment history                     | Yes  |
| POST   | `/payments/refund/:id`            | Request a refund                    | Yes  |
| GET    | `/payments/wallet`                | Get wallet balance                  | Yes  |
| POST   | `/payments/subscribe`             | Subscribe to a plan (basic/premium) | Yes  |
| GET    | `/payments/subscription`          | Get subscription status             | Yes  |

### Location

| Method | Endpoint                       | Description                          | Auth |
|--------|--------------------------------|--------------------------------------|------|
| POST   | `/location`                    | Update current location              | Yes  |
| GET    | `/location/:userId`            | Get user's last known location       | Yes  |
| GET    | `/location/history`            | Location history                     | Yes  |
| GET    | `/location/surge`              | Surge zones at current location      | Yes  |
| GET    | `/location/route/estimate`     | Route estimate (Google Maps/Havers.) | Yes  |
| GET    | `/drivers/nearby`              | Find nearby online drivers           | Yes  |

---

## Fare Structure (XAF)

All fares are in West/Central African CFA Francs (XAF).

| Component       | Amount             |
|-----------------|--------------------|
| Base fare       | 1,000 XAF          |
| Per km          | 700 XAF            |
| Per minute      | 100 XAF            |
| Booking fee     | 500 XAF flat       |
| Service fee     | 20% of subtotal    |
| Cancellation    | 350 XAF            |
| Minimum fare    | 2,000 XAF          |

### Ride Type Multipliers

| Type      | Multiplier |
|-----------|------------|
| Standard  | 1.0x       |
| Shared    | 0.75x      |
| Comfort   | 1.3x       |
| Luxury    | 2.0x       |
| Bike      | 0.6x       |
| Scooter   | 0.65x      |
| Delivery  | 1.1x       |
| Scheduled | 1.05x      |

### Subscription Discounts

| Plan    | Price (XAF/month) | Discount |
|---------|-------------------|----------|
| None    | 0                 | 0%       |
| Basic   | 5,000             | 10% off  |
| Premium | 10,000            | 20% off  |

---

## Deployment Guide

### Supabase (Database)

1. Create a project at [supabase.com](https://supabase.com)
2. Go to Settings > Database and copy the connection string
3. In the Supabase SQL editor, paste and run `database/init.sql`
4. Then run `database/migration_001.sql`
5. Set `DATABASE_URL` in each service's `.env` to the Supabase connection string
6. Add `?sslmode=require` to the end of the connection string

### Render (Backend Services)

1. Push your code to GitHub
2. At [render.com](https://render.com), create a new **Web Service** for each microservice:
   - **Build command:** `npm install`
   - **Start command:** `node server.js`
   - Set all environment variables from the corresponding `.env.example`
3. Create services in this order: user-service, payment-service, location-service, ride-service, api-gateway
4. Use the Render-provided URLs to set inter-service environment variables (e.g., `USER_SERVICE_URL`)

### Netlify (Admin Dashboard)

```bash
cd admin
npm run build
```

1. Drag the `admin/build` folder to [netlify.com/drop](https://app.netlify.com/drop), or
2. Connect your GitHub repo to Netlify and set build settings:
   - **Build command:** `npm run build`
   - **Publish directory:** `build`
   - **Base directory:** `admin`
3. Set `REACT_APP_API_URL` environment variable to your Render API Gateway URL

### Expo EAS Build (Mobile App)

```bash
npm install -g eas-cli
eas login
eas build:configure

# Build for Android
eas build --platform android

# Build for iOS
eas build --platform ios

# Submit to stores
eas submit --platform android
eas submit --platform ios
```

---

## How to Get API Keys

### Google Maps API Key

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable these APIs: **Directions API**, **Maps SDK for Android**, **Maps SDK for iOS**, **Geocoding API**
4. Go to Credentials > Create Credentials > API Key
5. Restrict the key to your app's package name / bundle ID for security

### Twilio (SMS OTP)

1. Sign up at [twilio.com](https://twilio.com)
2. From the Twilio Console, copy your **Account SID** and **Auth Token**
3. Get a Twilio phone number (buy one from the console — ~$1/month)
4. For Africa: enable international permissions under Messaging > Settings > Geo Permissions

### Flutterwave (Card Payments)

1. Sign up at [flutterwave.com](https://flutterwave.com)
2. Complete KYC verification for your country
3. In the Dashboard > Settings > API Keys, copy your test and live keys
4. For production, complete full merchant verification

### MTN Mobile Money API

1. Apply for developer access at [momodeveloper.mtn.com](https://momodeveloper.mtn.com)
2. Create an app in the Collections product
3. Generate sandbox credentials (API User UUID, API Key)
4. Get your Subscription Key (Primary Key) from the product page
5. For production, submit an integration request to MTN

### Orange Money API

1. Sign up at [developer.orange.com](https://developer.orange.com)
2. Create an app and subscribe to the **Orange Money** API
3. Copy your **Client ID** and **Client Secret** from the app credentials

---

## Key Features

- **Multi-currency**: CFA Francs (XAF) with transparent fare breakdown
- **Ride Types**: Standard, Comfort, Luxury, Shared, Bike, Scooter, Delivery, Scheduled
- **Payment Methods**: MTN Mobile Money, Orange Money, Wave, Cash, Card
- **Surge Pricing**: Automatic during peak hours (7–9am, 5–8pm) and in custom zones
- **Promo Codes**: Percentage or fixed discount codes with usage tracking
- **Loyalty Points**: Earn 1 point per 100 XAF spent; round up fare to wallet
- **Subscriptions**: Basic (5,000 XAF/month, 10% off) or Premium (10,000 XAF/month, 20% off)
- **Teen Accounts**: Sub-accounts linked to parent with ride notifications
- **Corporate Accounts**: Company accounts with member management and monthly spend tracking
- **In-Ride Messaging**: Real-time messages between rider and driver via Socket.IO
- **Push Notifications**: Expo push notifications via stored device tokens
- **Multilingual**: English, French, Swahili
- **Admin Dashboard**: Real-time map, surge zone management, safety reports, user management

---

## Database Migrations

When updating an existing database, run migrations in order:

```bash
# Run the first migration (corporate accounts, push tokens)
psql -U mobo_user -d mobo -f database/migration_001.sql
```

New migrations should be named `migration_002.sql`, `migration_003.sql`, etc.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes following the existing code style
4. Ensure all controllers use `async/await` with `try/catch`
5. All monetary values must be in XAF (integers, no decimals)
6. Test your changes locally with Docker
7. Submit a pull request with a clear description

### Code Style Guidelines

- Node.js controllers: `async/await` with `try/catch`, return `{ success, message, data }` shape
- React components: functional components with hooks
- Database: use parameterized queries (`$1, $2, ...`) — never string interpolation
- Currency: always XAF integers (e.g., `1500` not `15.00`)

---

## License

MIT — Built with love for African cities.
