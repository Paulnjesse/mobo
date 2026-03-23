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
     │  2FA, social   │  │ food, fleets │  │ wallets, express pay│
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

| Service          | Port | Responsibility                                                   |
|------------------|------|------------------------------------------------------------------|
| API Gateway      | 3000 | Routing, JWT auth, rate limiting, CORS, OpenTelemetry tracing   |
| User Service     | 3001 | Auth (OTP/social/2FA), profiles, teen/family/corporate accounts |
| Ride Service     | 3002 | Ride lifecycle, fares, surge, promos, food delivery, fleet mgmt |
| Payment Service  | 3003 | Payments, wallets, subscriptions, refunds, express pay          |
| Location Service | 3004 | Real-time driver tracking, nearby drivers, Socket.IO            |
| Admin Dashboard  | 3005 | React admin panel (Create React App)                            |

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
- Run all migrations from migration_001.sql through migration_019.sql
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

# Run all migrations in order
node database/run_migrations.js
# or manually:
# psql -U mobo_user -d mobo -f database/migration_001.sql
# ... through migration_019.sql
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
# Edit .env with your values (Twilio, SMTP, JWT secret, Google/Apple OAuth)
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
| `GOOGLE_CLIENT_ID`    | Google OAuth client ID (for social login)            |
| `GOOGLE_CLIENT_SECRET`| Google OAuth client secret                           |
| `APPLE_CLIENT_ID`     | Apple OAuth client ID (for Sign in with Apple)       |

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

| Method | Endpoint               | Description                          | Auth |
|--------|------------------------|--------------------------------------|------|
| POST   | `/auth/signup`         | Register a new user                  | No   |
| POST   | `/auth/login`          | Login with phone + password          | No   |
| POST   | `/auth/verify`         | Verify OTP code                      | No   |
| POST   | `/auth/resend-otp`     | Resend OTP                           | No   |
| POST   | `/auth/logout`         | Logout (invalidate session)          | Yes  |
| POST   | `/auth/social/google`  | Sign in with Google                  | No   |
| POST   | `/auth/social/apple`   | Sign in with Apple                   | No   |
| POST   | `/auth/2fa/setup`      | Set up TOTP two-factor auth          | Yes  |
| POST   | `/auth/2fa/verify`     | Verify TOTP code                     | Yes  |
| POST   | `/auth/2fa/disable`    | Disable two-factor auth              | Yes  |

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

### Family Accounts

| Method | Endpoint                                 | Description                        | Auth |
|--------|------------------------------------------|------------------------------------|------|
| POST   | `/users/family`                          | Create a family account            | Yes  |
| GET    | `/users/family`                          | Get family account + members       | Yes  |
| POST   | `/users/family/members`                  | Add a member to family account     | Yes  |
| DELETE | `/users/family/members/:userId`          | Remove a member                    | Yes  |

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
| POST   | `/rides/:id/share`        | Generate shareable trip link         | Yes  |
| GET    | `/rides/share/:token`     | View shared trip (public)            | No   |
| POST   | `/rides/:id/split`        | Initiate fare split                  | Yes  |
| POST   | `/rides/recurring`        | Set up a recurring ride              | Yes  |

### Food Delivery

| Method | Endpoint                       | Description                          | Auth |
|--------|--------------------------------|--------------------------------------|------|
| GET    | `/food/restaurants`            | List nearby restaurants              | Yes  |
| GET    | `/food/restaurants/:id/menu`   | Get restaurant menu                  | Yes  |
| POST   | `/food/orders`                 | Place a food order                   | Yes  |
| GET    | `/food/orders`                 | List user's food orders              | Yes  |
| GET    | `/food/orders/:id`             | Get single food order                | Yes  |
| PATCH  | `/food/orders/:id/cancel`      | Cancel a food order                  | Yes  |

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
| POST   | `/payments/express-pay`           | Instant driver payout               | Yes  |

### Location

| Method | Endpoint                       | Description                          | Auth |
|--------|--------------------------------|--------------------------------------|------|
| POST   | `/location`                    | Update current location              | Yes  |
| GET    | `/location/:userId`            | Get user's last known location       | Yes  |
| GET    | `/location/history`            | Location history                     | Yes  |
| GET    | `/location/surge`              | Surge zones at current location      | Yes  |
| GET    | `/location/route/estimate`     | Route estimate (Google Maps/Havers.) | Yes  |
| GET    | `/drivers/nearby`              | Find nearby online drivers           | Yes  |

### Fleet Management

| Method | Endpoint                             | Description                         | Auth        |
|--------|--------------------------------------|-------------------------------------|-------------|
| POST   | `/fleets`                            | Create a fleet                      | fleet_owner |
| GET    | `/fleets`                            | List my fleets                      | fleet_owner |
| GET    | `/fleets/:id`                        | Get fleet details                   | fleet_owner |
| POST   | `/fleets/:id/vehicles`               | Add a vehicle to a fleet            | fleet_owner |
| DELETE | `/fleets/:id/vehicles/:vehicleId`    | Remove a vehicle from a fleet       | fleet_owner |
| PUT    | `/fleets/:id/vehicles/:vehicleId/assign` | Assign driver to fleet vehicle  | fleet_owner |

---

## Fare Structure (XAF)

All fares are in West/Central African CFA Francs (XAF).

| Component       | Amount             |
|-----------------|---------------------|
| Base fare       | 1,000 XAF          |
| Per km          | 700 XAF            |
| Per minute      | 100 XAF            |
| Booking fee     | 500 XAF flat       |
| Service fee     | 20% of subtotal    |
| Cancellation    | 350 XAF            |
| Minimum fare    | 2,000 XAF          |
| Waiting fee     | Per minute after grace period |

### Ride Type Multipliers

| Type       | Multiplier |
|------------|------------|
| Standard   | 1.0x       |
| Shared     | 0.75x      |
| Comfort    | 1.3x       |
| Luxury     | 2.0x       |
| Bike       | 0.6x       |
| Scooter    | 0.65x      |
| Delivery   | 1.1x       |
| Scheduled  | 1.05x      |
| Rental     | Package-based (1h/2h/4h/8h) |
| Outstation | Variable   |
| WAV        | 1.2x (Wheelchair Accessible) |
| Pool       | 0.6x per seat (carpool) |

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
4. Run all migrations using `node database/run_migrations.js` or run each `migration_001.sql` through `migration_019.sql` in order
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

### Google OAuth (Social Login)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Under your project, go to **APIs & Services > Credentials**
3. Create an **OAuth 2.0 Client ID** for a Web Application
4. Set the redirect URI to your API's `/auth/social/google/callback`
5. Copy the **Client ID** and **Client Secret** into `services/user-service/.env`

### Apple Sign In

1. Sign in to [developer.apple.com](https://developer.apple.com)
2. Go to **Certificates, Identifiers & Profiles > Identifiers**
3. Enable **Sign In with Apple** for your App ID
4. Create a **Services ID** for the web callback URL
5. Generate a **Key** for Sign In with Apple and copy the Key ID

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

### Rides & Booking
- **Ride Types**: Standard, Comfort, Luxury, Shared, Pool (carpool), Bike, Scooter, Delivery, Scheduled, Rental, Outstation, WAV (Wheelchair Accessible)
- **Multiple Stops**: Add intermediate stops to a ride request
- **Upfront Pricing**: Locked fare before the ride starts
- **Fare Splitting**: Split cost with other passengers
- **Recurring Rides**: Schedule daily, weekday, weekend, or weekly repeating rides
- **Ride for Others**: Book a ride for another person by name/phone
- **Preferred Drivers**: Save and request favourite drivers
- **Concierge Bookings**: Book rides on behalf of passengers
- **USSD Booking**: Book rides without internet via USSD sessions
- **Child Seat**: Request child seat(s) when booking
- **Quiet Mode / AC Preference**: Set ride comfort preferences

### Payments & Wallet
- **Multi-currency**: CFA Francs (XAF) with transparent fare breakdown
- **Payment Methods**: MTN Mobile Money, Orange Money, Wave, Cash, Card (Flutterwave)
- **Express Pay**: Instant driver payouts to mobile money
- **Fare Splitting**: Shared payments across multiple participants
- **Wallet**: Top up and round-up fare to wallet
- **Subscriptions**: Basic (5,000 XAF/month, 10% off) or Premium (10,000 XAF/month, 20% off)

### Safety & Security
- **Two-Factor Authentication (TOTP)**: Admin and user 2FA with backup codes
- **Social Login**: Sign in with Google or Apple
- **Shareable Trip Links**: Share live trip link with trusted contacts
- **Trusted Contacts**: Notify contacts automatically on trip start or SOS
- **Ride Check-ins**: Automatic safety check if unusual stop detected
- **In-Ride Audio Recording**: Encrypted ride recordings (30-day retention, admin-access only)
- **Route Deviation Alerts**: Automatic alerts when driver deviates from route
- **Speed Alerts**: Notifications when driver exceeds speed threshold
- **Driver Real-ID Checks**: Selfie verification before going online
- **Driver Biometric Verification**: Smile ID-powered biometric checks with confidence scores
- **Driver Background Checks**: Tracked per driver with expiry dates
- **Safety Zones**: Map-based incident zone alerts (flooding, crime, road closures, etc.)
- **Ride Disputes**: Structured dispute filing with evidence uploads and admin resolution

### Driver Features
- **Driver Tiers**: Bronze, Gold, Platinum, Diamond based on performance
- **Bonus Challenges & Streaks**: Gamified incentive system
- **Destination Mode**: Set a direction and only receive rides going that way
- **Fatigue Tracking**: Online hour tracking with break prompts
- **Earnings Guarantee**: Minimum hourly earnings guarantee windows
- **Fuel Card**: Discounted fuel with transaction tracking
- **Vehicle Maintenance Tracker**: Service reminders by km

### Fleet Management
- **Fleet Owner Role**: Separate `fleet_owner` user role
- **Fleet Creation**: Create and manage one or more fleets per owner
- **Vehicle Registry**: Add vehicles (standard, comfort, luxury, van, bike, scooter) with insurance docs
- **Driver Assignment**: Assign drivers to specific fleet vehicles
- **Admin Approval**: Fleets require admin approval before activation
- **Fleet Size Constraints**: Configurable `min_vehicles` and `max_vehicles` per fleet

### Accounts & Community
- **Teen Accounts**: Sub-accounts linked to parent with ride notifications
- **Family Accounts**: Shared payment with per-member spend limits
- **Corporate Accounts**: Company accounts with member management
- **Referral Program**: Earn 1,000 XAF for referrer and 500 XAF for referred user
- **Loyalty Points**: Earn 1 point per 100 XAF spent; round-up fare to wallet

### Food Delivery
- **Restaurant Listings**: Browse nearby restaurants by city
- **Menu Browsing**: Full menu with categories, images, pricing
- **Food Orders**: Place, track, and cancel food orders
- **Delivery via Drivers**: Orders assigned to nearby MOBO drivers
- **OTP Pickup Verification**: Secure handoff with one-time codes

### Platform & Infrastructure
- **Ads Management**: Admin-managed ad banners (internal promotions + business sponsors)
- **Surge Pricing**: Automatic during peak hours (7–9am, 5–8pm) and custom zones
- **Promo Codes**: Percentage or fixed discount codes with usage tracking
- **Demand Heat Map**: Visual zone-based demand intensity map
- **Developer API Keys**: API access management with monthly call limits and webhooks
- **In-Ride Messaging**: Real-time messages between rider and driver via Socket.IO
- **Push Notifications**: Expo push notifications via stored device tokens
- **Multilingual**: English, French, Swahili
- **Multi-city**: Easily configurable per-city markets
- **OpenTelemetry Tracing**: Distributed tracing via API Gateway
- **Monitoring**: Prometheus metrics + Grafana dashboards
- **Cloudflare Rate Limiting**: Edge-level rate limiting worker
- **Admin Dashboard**: 23-page React admin panel with real-time map, fleet management, dispute resolution, surge zone management, driver background checks, document expiry alerts, safety reports, ads management, and more

---

## Admin Dashboard Pages

| Page                | Description                                              |
|---------------------|----------------------------------------------------------|
| Dashboard           | KPI overview, live stats                                 |
| Users               | User management and profiles                            |
| Drivers             | Driver management, approvals, tiers                     |
| Rides               | Live and historical ride management                     |
| Payments            | Payment history and wallet management                   |
| Fleet Management    | Fleet and vehicle management, driver assignment          |
| Location Map        | Real-time driver/rider map with satellite toggle         |
| Surge Pricing       | Create and manage surge zones                           |
| Promotions          | Promo code management                                   |
| Safety Reports      | View and resolve safety incidents                       |
| Safety Zones        | Manage incident zones overlaid on map                   |
| Disputes            | Ride dispute review and resolution                      |
| Background Checks   | Driver background check tracking                        |
| Document Expiry     | Alert on expiring driver insurance / vehicle documents  |
| Deliveries          | Food delivery order management                          |
| Food Management     | Restaurant and menu management                          |
| Fare Management     | Configure base fares, multipliers, surge rules          |
| Ads Management      | Internal and business ad banner management              |
| Notifications       | Send push notifications to users or drivers             |
| Multi-City          | City and market configuration                           |
| Settings            | Platform-wide settings                                  |
| Two-Factor Setup    | Admin 2FA enrollment and management                     |
| Login Page          | Secure admin login with 2FA                             |

---

## Database Migrations

When updating an existing database, run migrations in order:

```bash
# Recommended: use the migration runner
node database/run_migrations.js

# Or manually run each file:
psql -U mobo_user -d mobo -f database/migration_001.sql
# ... repeat through ...
psql -U mobo_user -d mobo -f database/migration_019.sql
```

### Migration Summary

| Migration | Description                                                            |
|-----------|------------------------------------------------------------------------|
| 001       | Corporate accounts, push tokens                                        |
| 002       | Fleet owner role, fleets, fleet vehicles                               |
| 003       | Multiple stops, preferred drivers, Women+ Connect, ride check-ins, lost & found, driver bonus streaks, referrals, family accounts, concierge bookings, express pay |
| 004       | *(see file)*                                                           |
| 005       | Security: shareable trip links, trusted contacts, ride disputes, driver real-ID checks, fatigue tracking, speed alerts |
| 006       | *(see file)*                                                           |
| 007       | Admin 2FA (TOTP), driver background checks, rating abuse tracking, safety zones, ride audio recordings |
| 008–009   | *(see files)*                                                          |
| 010       | Tipping, fare splitting, rental ride type, price lock, driver earnings daily cache |
| 011       | *(see file)*                                                           |
| 012       | Waiting time charges, WAV ride type, preferred language                |
| 013–014   | *(see files)*                                                          |
| 015       | Driver tiers, heat map demand zones, saved places, recurring rides, earnings guarantee, fuel card, maintenance tracker, developer API keys, USSD booking, child seat, ride-for-others, upfront pricing, split payment |
| 016       | *(see file)*                                                           |
| 017       | Ads management table with seeded internal + business ads               |
| 018       | Ride preferences (quiet mode, AC, music), food delivery tables (restaurants, menus, orders) |
| 019       | Biometric driver verifications (Smile ID), pool/carpool ride groups, social auth (Google, Apple) |

New migrations should be named `migration_020.sql`, `migration_021.sql`, etc.

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
