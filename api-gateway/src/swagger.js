'use strict';
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MOBO API',
      version: '1.0.0',
      description: `
MOBO Ride-Hailing Platform API — Your City. Your Ride. Your Community.

## Authentication
All protected endpoints require a Bearer token in the Authorization header:
\`\`\`
Authorization: Bearer <your_jwt_token>
\`\`\`

Obtain a token via **POST /api/auth/login**.

## Base URL
All endpoints are prefixed with \`/api\`.

## Rate Limits
- Global: 200 requests / 15 minutes
- Auth endpoints: 20 requests / 15 minutes
- Payment endpoints: 10 requests / 5 minutes
      `,
      contact: {
        name: 'MOBO Engineering',
        email: 'engineering@mobo.cm',
      },
      license: { name: 'Proprietary' },
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Local development' },
      { url: 'https://mobo-api-gateway.onrender.com', description: 'Production (Render)' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from /api/auth/login',
        },
      },
      schemas: {
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Success' },
            data: { type: 'object' },
            requestId: { type: 'string', format: 'uuid' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Validation failed' },
            code: { type: 'string', example: 'VALIDATION_ERROR' },
            fields: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
            requestId: { type: 'string', format: 'uuid' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            full_name: { type: 'string', example: 'Jean Dupont' },
            phone: { type: 'string', example: '+237612345678' },
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['rider', 'driver', 'fleet_owner', 'admin'] },
            subscription_plan: { type: 'string', enum: ['none', 'basic', 'premium'] },
            loyalty_points: { type: 'integer', example: 150 },
            wallet_balance: { type: 'number', example: 5000 },
            is_verified: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Ride: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            rider_id: { type: 'string', format: 'uuid' },
            driver_id: { type: 'string', format: 'uuid', nullable: true },
            pickup_address: { type: 'string' },
            dropoff_address: { type: 'string' },
            status: { type: 'string', enum: ['requested', 'accepted', 'arriving', 'in_progress', 'completed', 'cancelled'] },
            ride_type: { type: 'string', enum: ['standard', 'xl', 'moto', 'benskin', 'women', 'delivery', 'luxury'] },
            fare: { type: 'number', example: 2500 },
            payment_method: { type: 'string', enum: ['cash', 'wallet', 'mtn_mobile_money', 'orange_money', 'wave', 'card'] },
            surge_multiplier: { type: 'number', example: 1.2 },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        FareEstimate: {
          type: 'object',
          properties: {
            base: { type: 'number', example: 1800 },
            serviceFee: { type: 'number', example: 360 },
            bookingFee: { type: 'number', example: 500 },
            total: { type: 'number', example: 2660 },
            surgeMultiplier: { type: 'number', example: 1.0 },
            distanceKm: { type: 'number', example: 4.2 },
            durationMin: { type: 'integer', example: 12 },
          },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Authentication & registration' },
      { name: 'Users', description: 'User profile management' },
      { name: 'Rides', description: 'Ride booking & management' },
      { name: 'Fare', description: 'Fare estimation & pricing' },
      { name: 'Payments', description: 'Payments, wallet & subscriptions' },
      { name: 'Location', description: 'Real-time location & nearby drivers' },
      { name: 'Drivers', description: 'Driver-specific endpoints' },
      { name: 'Fleet', description: 'Fleet owner management' },
      { name: 'Delivery', description: 'Package & food delivery' },
      { name: 'Safety', description: 'SOS & safety features' },
    ],
    paths: {
      '/api/health': {
        get: {
          tags: ['Auth'],
          summary: 'API Gateway health check',
          responses: {
            200: {
              description: 'Gateway is healthy',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } },
            },
          },
        },
      },
      '/api/auth/signup': {
        post: {
          tags: ['Auth'],
          summary: 'Register a new user',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['full_name', 'phone', 'password'],
                  properties: {
                    full_name: { type: 'string', example: 'Jean Dupont' },
                    phone: { type: 'string', example: '+237612345678' },
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 6 },
                    role: { type: 'string', enum: ['rider', 'driver', 'fleet_owner'], default: 'rider' },
                    country: { type: 'string', default: 'Cameroon' },
                    language: { type: 'string', enum: ['en', 'fr', 'sw'], default: 'fr' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'User created — OTP sent to phone' },
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            409: { description: 'Phone or email already registered' },
          },
        },
      },
      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login with phone/email and password',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    phone: { type: 'string', example: '+237612345678' },
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Login successful — returns JWT token and user object' },
            401: { description: 'Invalid credentials' },
          },
        },
      },
      '/api/auth/verify': {
        post: {
          tags: ['Auth'],
          summary: 'Verify OTP sent to phone',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['phone', 'otp_code'],
                  properties: {
                    phone: { type: 'string' },
                    otp_code: { type: 'string', example: '123456' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Phone verified' },
            400: { description: 'Invalid or expired OTP' },
          },
        },
      },
      '/api/users/profile': {
        get: {
          tags: ['Users'],
          summary: 'Get current user profile',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'User profile', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
            401: { description: 'Unauthorized' },
          },
        },
        put: {
          tags: ['Users'],
          summary: 'Update user profile',
          security: [{ BearerAuth: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    full_name: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    city: { type: 'string' },
                    language: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'Profile updated' } },
        },
      },
      '/api/rides': {
        post: {
          tags: ['Rides'],
          summary: 'Request a new ride',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['pickup_location', 'dropoff_location', 'pickup_address', 'dropoff_address'],
                  properties: {
                    pickup_address: { type: 'string' },
                    dropoff_address: { type: 'string' },
                    pickup_location: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
                    dropoff_location: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
                    ride_type: { type: 'string', enum: ['standard', 'xl', 'moto', 'women', 'delivery'], default: 'standard' },
                    payment_method: { type: 'string', enum: ['cash', 'wallet', 'mtn_mobile_money', 'orange_money', 'wave', 'card'] },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Ride requested', content: { 'application/json': { schema: { $ref: '#/components/schemas/Ride' } } } },
            400: { description: 'Validation error' },
            401: { description: 'Unauthorized' },
          },
        },
        get: {
          tags: ['Rides'],
          summary: 'List rides for current user',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
            { name: 'status', in: 'query', schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'List of rides' } },
        },
      },
      '/api/fare': {
        post: {
          tags: ['Fare'],
          summary: 'Get fare estimate before booking',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['pickup_location', 'dropoff_location'],
                  properties: {
                    pickup_location: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
                    dropoff_location: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
                    ride_type: { type: 'string', default: 'standard' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Fare estimate', content: { 'application/json': { schema: { $ref: '#/components/schemas/FareEstimate' } } } },
          },
        },
      },
      '/api/payments/charge': {
        post: {
          tags: ['Payments'],
          summary: 'Charge payment for a completed ride',
          security: [{ BearerAuth: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['ride_id', 'method'],
                  properties: {
                    ride_id: { type: 'string', format: 'uuid' },
                    method: { type: 'string', enum: ['cash', 'wallet', 'mtn_mobile_money', 'orange_money', 'wave', 'card'] },
                    phone: { type: 'string', description: 'Required for mobile money methods' },
                    tip: { type: 'number' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Payment initiated or completed' },
            402: { description: 'Payment failed' },
          },
        },
      },
      '/api/location/nearby-drivers': {
        get: {
          tags: ['Location'],
          summary: 'Get nearby available drivers',
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'lat', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'lng', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'radius', in: 'query', schema: { type: 'integer', default: 5000, description: 'Radius in metres' } },
            { name: 'ride_type', in: 'query', schema: { type: 'string', default: 'standard' } },
          ],
          responses: { 200: { description: 'List of nearby drivers with locations' } },
        },
      },
    },
  },
  apis: [], // We're using inline paths above instead of JSDoc
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
