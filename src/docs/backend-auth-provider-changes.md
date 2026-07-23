# Backend Changes: Google and Mobile Login

The frontend supports Google Identity Services and mobile OTP login. Add these
auth endpoints to `cricket-score-counter-backend-server`.

## Google login

Endpoint:

```http
POST /api/v1/auth/google
```

Payload:

```json
{
  "idToken": "google_id_token",
  "credential": "same_token_for_google_identity_services_compat"
}
```

Backend behavior:

- Verify the token with Google using `GOOGLE_CLIENT_ID`.
- Read Google `sub`, `email`, `name`, and `picture`.
- Find existing user by `googleId` or email.
- Create the user when not found.
- Return the existing app auth response:

```json
{
  "message": "Google login successful",
  "token": "app_jwt",
  "user": {
    "id": "...",
    "name": "...",
    "email": "..."
  }
}
```

Recommended user fields:

```ts
googleId?: string;
authProvider: "password" | "google" | "mobile";
avatarUrl?: string;
```

## Mobile OTP login

Endpoint:

```http
POST /api/v1/auth/mobile/request-otp
```

Payload:

```json
{
  "phoneNumber": "+918128313138"
}
```

Response:

```json
{
  "message": "OTP sent"
}
```

Endpoint:

```http
POST /api/v1/auth/mobile/verify-otp
```

Payload:

```json
{
  "phoneNumber": "+918128313138",
  "otp": "123456"
}
```

Backend behavior:

- Normalize phone number to E.164.
- Generate and store hashed OTP with expiry for request.
- Verify OTP and expiry.
- Find or create a user by `phoneNumber`.
- Return the existing app auth response with JWT and user.

Recommended user fields:

```ts
phoneNumber?: string;
phoneVerifiedAt?: Date;
authProvider: "password" | "google" | "mobile";
```

The frontend also tries fallback route names for compatibility:

- `/api/v1/auth/login/google`
- `/api/v1/auth/phone/request-otp`
- `/api/v1/auth/phone/verify-otp`
- `/api/v1/auth/otp/send`
- `/api/v1/auth/otp/verify`

Preferred production routes are `/auth/google`,
`/auth/mobile/request-otp`, and `/auth/mobile/verify-otp`.
