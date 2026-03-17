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

## Architecture

Microservices with Node.js + Express + PostgreSQL/PostGIS

| Service          | Port | Responsibility                        |
|------------------|------|---------------------------------------|
| API Gateway      | 3000 | Routing, auth, rate limiting          |
| User Service     | 3001 | Auth, profiles, teen accounts         |
| Ride Service     | 3002 | Ride lifecycle, fares, surge pricing  |
| Payment Service  | 3003 | Payments, wallets, subscriptions      |
| Location Service | 3004 | Real-time tracking, nearby drivers    |

## Quick Start

```bash
# Clone and start
docker-compose up --build

# API base URL
http://localhost:3000/api
```

## Key Features

- **Multi-currency**: CFA Francs (XAF) with transparent fare breakdown
- **Ride Types**: Standard, Comfort, Luxury, Shared, Bike, Scooter, Delivery, Scheduled
- **Payment Methods**: MTN Mobile Money, Orange Money, Wave, Cash, Card
- **Surge Pricing**: Automatic during peak hours and special events
- **Loyalty Points**: Earn 1 point per 100 XAF spent; round-up to wallet
- **Subscriptions**: Basic (5,000 XAF/month, 10% off) or Premium (10,000 XAF/month, 20% off)
- **Teen Accounts**: Sub-accounts linked to parent with notifications
- **Multilingual**: English, French, Swahili

## Fare Structure (XAF)

| Component     | Amount         |
|---------------|----------------|
| Base fare     | 1,000 XAF      |
| Per km        | 700 XAF        |
| Per minute    | 100 XAF        |
| Booking fee   | 500 XAF        |
| Service fee   | 20% of subtotal|
| Cancellation  | 350 XAF        |

## API Endpoints

### Auth
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/verify`
- `POST /api/auth/resend-otp`

### Rides
- `POST /api/rides/request`
- `GET  /api/fare/estimate`
- `PATCH /api/rides/:id/accept`
- `PATCH /api/rides/:id/status`
- `POST /api/rides/:id/rate`
- `POST /api/rides/:id/tip`

### Payments
- `POST /api/payments/methods`
- `POST /api/payments/charge`
- `GET  /api/payments/history`
- `POST /api/payments/subscribe`

### Location
- `POST /api/location`
- `GET  /api/drivers/nearby`
- `GET  /api/location/surge`
- `GET  /api/location/route/estimate`

## Environment Variables

Copy `.env.example` to `.env` and fill in your credentials for Twilio, Flutterwave, Stripe, and Google Maps.

## License

MIT — Built with love for African cities.
