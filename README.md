# cricket-score-counter-backend

## Environment

Create `.env` from `.env.example` and replace `<db_password>` in `MONGODB_URI`.

## Auth API

### Signup

`POST /api/v1/auth/signup`

```json
{
  "name": "Monik",
  "email": "monik@example.com",
  "password": "password123"
}
```

### Login

`POST /api/v1/auth/login`

```json
{
  "email": "monik@example.com",
  "password": "password123"
}
```

Auth success responses include both tokens:

```json
{
  "token": "access-token",
  "accessToken": "access-token",
  "refreshToken": "refresh-token",
  "user": {}
}
```

### Refresh Token

`POST /api/v1/auth/refresh`

Aliases:

- `POST /api/v1/auth/refresh-token`
- `POST /api/v1/auth/token/refresh`

```json
{
  "refreshToken": "refresh-token"
}
```

Response uses the same auth success shape with a new access token and refresh
token. Frontend should store both tokens, attach `accessToken` as
`Authorization: Bearer <accessToken>`, call refresh on `401`, store the returned
tokens, and retry the original request.

### Google Login

`POST /api/v1/auth/google`

Fallback route also supported: `POST /api/v1/auth/login/google`

```json
{
  "idToken": "google-id-token",
  "credential": "google-id-token"
}
```

Requires `GOOGLE_CLIENT_ID`.

### Mobile OTP Login

Request OTP:

`POST /api/v1/auth/mobile/request-otp`

Fallback routes also supported:

- `POST /api/v1/auth/phone/request-otp`
- `POST /api/v1/auth/otp/send`

```json
{
  "phoneNumber": "+918128313138"
}
```

Verify OTP:

`POST /api/v1/auth/mobile/verify-otp`

Fallback routes also supported:

- `POST /api/v1/auth/phone/verify-otp`
- `POST /api/v1/auth/otp/verify`

```json
{
  "phoneNumber": "+918128313138",
  "otp": "123456"
}
```

### Mobile number login (SMS via Brevo)

**`SMS_DELIVERY=direct`** turns SMS off: `request-otp` returns the code as
`{ "otp": "123456", "delivery": "direct" }` and the app fills it in. Limits,
expiry and the login/signup rules still apply, but the code no longer proves
the person owns the number, so anyone can log in to a registered number.
Remove it (or set `SMS_DELIVERY=brevo`) to send real SMS again.

Codes are sent with Brevo's transactional SMS API
(`POST https://api.brevo.com/v3/transactionalSMS/send`) using `BREVO_API_KEY`
and `BREVO_SMS_SENDER` (see `.env.example`). SMS needs Brevo credits, and
Indian numbers also need a DLT-registered sender and template
(`BREVO_SMS_TEMPLATE`, placeholders `{code}` and `{minutes}`).

- `GET /api/v1/auth/config` → `{ "mobileOtpLogin": true|false }`. The app only
  shows mobile login when this is true (SMS configured, or in development
  where codes are printed to the server log).
- `POST /api/v1/auth/mobile/request-otp` `{ "phoneNumber", "intent": "login"|"signup" }`
  - `intent: "login"` with an unregistered number → `404 ACCOUNT_NOT_FOUND`,
    and no SMS is sent.
  - `429 OTP_COOLDOWN` within 60 s of the last code, `429 OTP_LIMIT` after 5
    codes in an hour (both include `resendAfterSeconds`).
- `POST /api/v1/auth/mobile/verify-otp` `{ "phoneNumber", "otp", "intent", "name"? }`
  → login response. `intent: "signup"` creates the account (using `name`
  if given). Codes expire after 10 minutes and 5 wrong tries cancel a code.

### Logout

`POST /api/v1/auth/logout`

Requires `Authorization: Bearer <token>`.

### Email verification (email/password signups)

Codes are sent through **Brevo's transactional email API** when
`BREVO_API_KEY` and `BREVO_SENDER_EMAIL` are set (free plan: 300 emails/day;
the sender address must be verified in Brevo). Otherwise they fall back to
SMTP via Nodemailer (`SMTP_USER`, `SMTP_PASS`, optional `SMTP_HOST`,
`SMTP_PORT`, `MAIL_FROM`). See `.env.example`. With neither configured,
codes are printed to the server log in development and the endpoints return
`503` in production. Emails are tagged `verify_email` / `reset_password`, so
they can be filtered in Brevo's transactional logs.

- `POST /api/v1/auth/signup` now returns `201` **without tokens**:
  `{ "verificationRequired": true, "email": "...", "resendAfterSeconds": 60 }`
  and emails a 6-digit code. Signing up again with an email that was never
  verified updates the name/password and sends a new code.
- `POST /api/v1/auth/email/verify` `{ "email", "otp" }` → the normal login
  response (tokens + user) once the code is correct.
- `POST /api/v1/auth/email/resend` `{ "email" }` → sends a new code.
- `POST /api/v1/auth/login` for an unverified account returns `403`
  `{ "code": "EMAIL_NOT_VERIFIED", "email" }` and sends a fresh code.

Accounts created before verification existed (no `emailVerified` field) and
Google accounts count as verified. Google sign-in now requires Google's
`email_verified` flag before creating or linking an account.

Limits: codes expire after 10 minutes, 5 wrong tries invalidate a code,
60 seconds between sends, and at most 5 emails per address per hour (all
configurable with `EMAIL_OTP_*` env vars).

### Google sign-in

`POST /api/v1/auth/google` `{ "idToken", "intent": "login" | "signup" }`

- `intent: "login"` (the Login page) never creates an account. An
  unregistered Google account gets `404 { "code": "ACCOUNT_NOT_FOUND" }`.
- `intent: "signup"` (the Sign Up page) creates the account if needed.
- No `intent` (older app versions) behaves like `"signup"`.

Existing accounts with the same email are linked, and only emails Google
reports as verified are accepted.

### Sign in with Apple (iOS app)

`POST /api/v1/auth/apple`

```json
{
  "identityToken": "<JWT from Apple>",
  "authorizationCode": "<one-time code from Apple>",
  "nonce": "<raw nonce; the app gave Apple sha256hex(nonce)>",
  "intent": "login",
  "name": "Only sent on the first Apple authorization"
}
```

- The identity token is verified against Apple's public keys: `iss`,
  `aud` (`APPLE_CLIENT_ID`, default `com.cricketscorecounter.mobile`), `exp`
  and `nonce`.
- Users are found by `appleId` (the token's `sub`), then linked by an
  Apple-verified email. `intent` works like Google's: `"login"` answers
  `404 { "code": "ACCOUNT_NOT_FOUND" }`, `"signup"` creates the account (no
  email code step; emails may be `@privaterelay.appleid.com`).
- The `authorizationCode` is exchanged for an Apple refresh token (stored as
  `appleRefreshToken`, not selected by default), which is revoked when the
  account is deleted. Needs `APPLE_TEAM_ID`, `APPLE_KEY_ID` and
  `APPLE_PRIVATE_KEY` (a "Sign in with Apple" `.p8` key); without them sign-in
  still works but nothing can be revoked.
- Errors: `400 INVALID_REQUEST`, `401 INVALID_APPLE_TOKEN`,
  `502 APPLE_UNAVAILABLE`.

### Reset Password

Step 1 — `POST /api/v1/auth/forgot-password` `{ "email" }` emails a code.
The response is the same whether or not the account exists.

Step 2 — `POST /api/v1/auth/reset-password`

```json
{
  "email": "monik@example.com",
  "otp": "123456",
  "newPassword": "newpassword123"
}
```

Returns the normal login response. Requests without a valid code are refused.

### Delete Account (permanent, hard delete)

`DELETE /api/v1/auth/account`

Requires `Authorization: Bearer <token>`.

```json
{
  "confirmation": "DELETE",
  "password": "current-password"
}
```

`password` is required only when the account has one (Google-only,
Apple-only and phone-OTP accounts send just `confirmation`). Accounts that
signed in with Apple also have their Apple token revoked first (best effort;
a failed revoke is logged and never blocks deletion).

In one MongoDB transaction, this physically deletes the user and everything
they own: tournaments plus their teams and fixtures, saved player teams,
player profiles they created, players, saved matches, analytics events
(including anonymous events from sessions they were signed in on), and
pending OTP codes. The user record is deleted last. Nothing is soft-deleted
or anonymised. Existing access tokens stop working immediately, because
`requireAuth` rejects tokens whose user no longer exists.

| Status | Meaning |
|--------|---------|
| `200`  | `{ "deleted": true }`, also returned when the account was already deleted |
| `400`  | `confirmation` is not `"DELETE"` |
| `401`  | Missing or invalid token |
| `403`  | Password missing or incorrect |
| `429`  | More than 5 attempts in 15 minutes |
| `500`  | Deletion failed and was rolled back; nothing was deleted |

## Tournament API

All tournament routes require `Authorization: Bearer <token>`.

Normal saved matches and tournament matches use separate database collections
because tournament matches also store fixture ids, toss, batting order, winner,
and points-table state. To keep frontend saving simple, `POST /api/v1/matches`
can also complete/sync a tournament match when tournament metadata is included.

For a tournament scorer save, send normal saved-match fields plus:

```json
{
  "tournamentId": "tournament-id",
  "tournamentMatchId": "optional-tournament-match-id",
  "team1Id": "team-1-id",
  "team2Id": "team-2-id",
  "winnerTeamId": "winner-team-id",
  "winnerTeamName": "Winner Team",
  "status": "completed",
  "resultText": "Winner Team won by 12 runs"
}
```

The response will include normal `match` and, when tournament sync succeeds,
`tournamentMatch`, `tournamentTeams`, `tournament`, and `redirectTo`.

Supported Phase 1 values:

- `format`: `league`, `knockout`
- `ballType`: `tennis`, `leather`, `custom`
- `squadMode`: `teams_only`, `with_players`
- `status`: `draft`, `active`, `completed`

### Create Tournament

`POST /api/v1/tournaments`

```json
{
  "name": "Sunday Premier League",
  "organizerName": "Monik",
  "startDate": "2026-07-01",
  "endDate": "2026-07-10",
  "location": "Ahmedabad",
  "logoUrl": "https://example.com/logo.png",
  "ballType": "tennis",
  "oversPerMatch": 10,
  "format": "league",
  "squadMode": "teams_only"
}
```

### List Tournaments

`GET /api/v1/tournaments`

Optional filter:

`GET /api/v1/tournaments?status=active`

### Get Tournament With Teams

`GET /api/v1/tournaments/:tournamentId`

### Update Tournament

`PATCH /api/v1/tournaments/:tournamentId`

Send only changed fields.

```json
{
  "status": "active",
  "oversPerMatch": 12,
  "squadMode": "with_players"
}
```

### Delete Tournament

`DELETE /api/v1/tournaments/:tournamentId`

### Register Team

`POST /api/v1/tournaments/:tournamentId/teams`

```json
{
  "name": "Falcons XI",
  "logoUrl": "https://example.com/team-logo.png",
  "captainName": "Rahul Sharma",
  "contactNumber": "+919999999999",
  "players": [
    {
      "name": "Rahul Sharma",
      "role": "Batter",
      "contactNumber": "+919999999999"
    },
    {
      "name": "Amit Patel",
      "role": "Bowler"
    }
  ]
}
```

### List Teams

`GET /api/v1/tournaments/:tournamentId/teams`

Teams are returned with `playerCount` and `statistics`, sorted like a simple points table.
Legacy `stats` is also returned and is derived from `statistics`.

### Update Team

`PATCH /api/v1/tournaments/:tournamentId/teams/:teamId`

Send only changed fields.

```json
{
  "captainName": "Amit Patel",
  "contactNumber": "+918888888888"
}
```

### Replace Team Players

`PUT /api/v1/tournaments/:tournamentId/teams/:teamId/players`

```json
{
  "players": [
    {
      "name": "Rahul Sharma",
      "role": "Batter"
    },
    {
      "name": "Amit Patel",
      "role": "Bowler"
    }
  ]
}
```

### Update Team Statistics

`PATCH /api/v1/tournaments/:tournamentId/teams/:teamId/statistics`

```json
{
  "statistics": {
    "matchesPlayed": 2,
    "wins": 2,
    "losses": 0,
    "ties": 0,
    "noResults": 0,
    "points": 4,
    "runsFor": 180,
    "runsAgainst": 140,
    "wicketsTaken": 12,
    "wicketsLost": 8,
    "ballsFaced": 120,
    "ballsBowled": 120,
    "netRunRate": 1.42
  }
}
```

### Delete Team

`DELETE /api/v1/tournaments/:tournamentId/teams/:teamId`

### Recalculate Points Table

`POST /api/v1/tournaments/:tournamentId/statistics/recalculate`

Aliases for the frontend sync button:

- `POST /api/v1/tournaments/:tournamentId/statistics/sync`
- `POST /api/v1/tournaments/:tournamentId/points-table/sync`

Rebuilds every team statistic from completed tournament matches and returns the
updated sorted `teams` list, completed matches, and refreshed tournament.

```json
{
  "message": "Points table synced",
  "teams": [],
  "completedMatches": [],
  "completedMatchesCount": 0,
  "tournament": {}
}
```

### List Tournament Matches

`GET /api/v1/tournaments/:tournamentId/matches`

Use `GET /api/v1/tournaments/:tournamentId/matches?status=completed` to show
completed matches in the tournament UI.

### Start Tournament Match With Toss

`POST /api/v1/tournaments/:tournamentId/matches/start`

Before calling this, frontend should ask who won the toss and whether they chose
to bat or bowl. Send either `battingFirstTeamId` directly or send toss fields so
the backend derives it.

```json
{
  "team1Id": "team-1-id",
  "team2Id": "team-2-id",
  "tossWinnerTeamId": "team-1-id",
  "tossDecision": "bat",
  "battingFirstTeamId": "team-1-id",
  "scorerMatchId": "scorer-game-id"
}
```

The response includes `match.battingFirstTeamId` and
`match.battingFirstTeamName`.

### Complete Tournament Match

`POST /api/v1/tournaments/:tournamentId/matches/:matchId/complete`

Or, when the scoring screen only has the scorer/game id:

`POST /api/v1/tournaments/:tournamentId/matches/complete`

This updates the match result and recalculates the full points table from all
completed matches. The response includes `redirectTo` so the frontend can return
the user to the tournament page after finishing a match. It also returns
`tournament` and updated sorted `teams`, so the frontend can refresh immediately.

```json
{
  "scorerMatchId": "scorer-game-id",
  "team1Id": "team-1-id",
  "team2Id": "team-2-id",
  "winnerTeamId": "team-id",
  "winnerTeamName": "Falcons XI",
  "resultText": "Falcons XI won by 12 runs",
  "snapshot": {}
}
```

### Fix Tournament Match

`PATCH /api/v1/tournaments/:tournamentId/matches/:matchId/fix`

Use this to correct a completed match manually. It accepts the same body as
complete match, and also accepts simple custom innings if the full scorer
snapshot is not available.

```json
{
  "winnerTeamId": "team-id",
  "resultText": "Falcons XI won by 12 runs",
  "team1Inning": {
    "runs": 86,
    "wickets": 5,
    "overs": "8.0"
  },
  "team2Inning": {
    "runs": 74,
    "wickets": 7,
    "overs": "8.0"
  }
}
```

For a tied match, send an empty `winnerTeamId` or `winnerTeamName: "Tied"`.

## Stats API

### Get Platform Stats

`GET /api/v1/stats`

No authentication required. Returns the total number of registered users and
the number of currently connected (active) users, based on live Socket.IO
connections.

```json
{
  "totalUsers": 1240,
  "activeUsers": 37
}
```

The backend also broadcasts `ACTIVE_USERS_COUNT` over the existing Socket.IO
connection whenever a client connects or disconnects, so clients already
listening for live updates can update the active-user count without polling:

```json
{
  "count": 37
}
```

## Analytics API

Lightweight, self-hosted daily tracking: page views, signups/logins, tournament
creation, and match start/completion, all stored in MongoDB (no third-party
analytics service).

### Track Event

`POST /api/v1/analytics/track`

No authentication required (works for anonymous visitors); if an
`Authorization: Bearer <token>` header is present, the event is attributed to
that user.

```json
{
  "type": "PAGE_VIEW",
  "path": "/tournaments",
  "sessionId": "client-generated-anon-id"
}
```

Supported `type` values: `PAGE_VIEW`, `USER_SIGNUP`, `USER_LOGIN`,
`TOURNAMENT_CREATED`, `MATCH_STARTED`, `MATCH_COMPLETED`. The last five are
also recorded automatically server-side (signup/login, tournament creation,
match start/complete), so the frontend only needs to call this for
`PAGE_VIEW`.

### Daily Stats

`GET /api/v1/analytics/daily?days=30`

Admin only (`Authorization: Bearer <token>` for an allowlisted account, see
`ANALYTICS_ADMIN_EMAILS`). Returns one bucket per day for the requested
range (max 90 days):

```json
{
  "days": [
    {
      "day": "2026-08-31",
      "activeUsers": 42,
      "newSignups": 3,
      "logins": 18,
      "tournamentsCreated": 1,
      "matchesStarted": 5,
      "matchesCompleted": 4,
      "pageViews": 130
    }
  ]
}
```

`activeUsers` counts distinct browser sessions that day, deduped by the
client-generated `sessionId` (not by user id) -- this stays stable across
login/logout/signup within the same visit, so one real visitor is never
counted more than once just because they switched accounts mid-visit.

### Summary Stats

`GET /api/v1/analytics/summary`

Admin only. Returns `today`, `last7Days`, and `last30Days` totals (same
shape as one daily bucket above) plus `topPages` (the 10 most-viewed paths
in the last 7 days).

### Admin Access

Only accounts whose email is in `ANALYTICS_ADMIN_EMAILS` (comma-separated
env var, defaults to `gotimonik@gmail.com`) can call the `daily` and
`summary` endpoints; everyone else gets `403`.

### Local/Dev Traffic Is Excluded

Every event (including the ones recorded automatically server-side) is
dropped before it's saved if the request looks local -- its `Origin`,
`Referer`, or `Host` header is `localhost`/`127.0.0.1`/`::1` (any port). This
keeps local development and manual API testing out of the real daily
numbers automatically, with no separate cleanup step needed.
