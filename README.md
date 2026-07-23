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

### Logout

`POST /api/v1/auth/logout`

Requires `Authorization: Bearer <token>`.

### Reset Password

`POST /api/v1/auth/reset-password`

```json
{
  "email": "monik@example.com",
  "newPassword": "newpassword123"
}
```

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
