# Tournament API Contract

The client calls these endpoints through `AuthService.request`, so every
logged-in request should accept:

```http
Authorization: Bearer <token>
Content-Type: application/json
```

Base path: `/api/v1`

## Database Shape

```sql
create table tournaments (
  id text primary key,
  user_id text not null,
  name text not null,
  organizer_name text not null,
  start_date date not null,
  end_date date not null,
  location text not null,
  logo_url text,
  ball_type text not null check (ball_type in ('tennis', 'leather', 'custom')),
  custom_ball_type text,
  overs_per_match integer not null,
  format text not null check (format in ('league', 'knockout')),
  squad_mode text not null default 'teams_only'
    check (squad_mode in ('teams_only', 'with_players')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tournament_teams (
  id text primary key,
  tournament_id text not null references tournaments(id) on delete cascade,
  name text not null,
  logo_url text,
  captain_name text not null,
  contact_number text not null,
  played integer not null default 0,
  won integer not null default 0,
  lost integer not null default 0,
  points integer not null default 0,
  balls_faced integer not null default 0,
  balls_bowled integer not null default 0,
  net_run_rate numeric(8, 3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tournament_players (
  id text primary key,
  team_id text not null references tournament_teams(id) on delete cascade,
  name text not null,
  role text,
  created_at timestamptz not null default now()
);

create table tournament_matches (
  id text primary key,
  tournament_id text not null references tournaments(id) on delete cascade,
  team1_id text not null references tournament_teams(id) on delete restrict,
  team2_id text not null references tournament_teams(id) on delete restrict,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'completed')),
  winner_team_id text references tournament_teams(id) on delete set null,
  result_text text,
  scorer_match_id text,
  snapshot jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (team1_id <> team2_id)
);

create unique index tournament_matches_pair_unique
  on tournament_matches (
    tournament_id,
    least(team1_id, team2_id),
    greatest(team1_id, team2_id)
  );
```

## Endpoints

### List tournaments

`GET /api/v1/tournaments`

```json
{
  "tournaments": [
    {
      "id": "tournament_123",
      "name": "Summer Cup",
      "organizerName": "Monik",
      "startDate": "2026-06-20",
      "endDate": "2026-06-24",
      "location": "Ahmedabad",
      "logoUrl": "",
      "ballType": "tennis",
      "customBallType": "",
      "oversPerMatch": 10,
      "format": "league",
      "squadMode": "teams_only",
      "teams": [],
      "matches": [],
      "createdAt": "2026-06-17T08:00:00.000Z",
      "updatedAt": "2026-06-17T08:00:00.000Z"
    }
  ]
}
```

### Create tournament

`POST /api/v1/tournaments`

Request body:

```json
{
  "name": "Summer Cup",
  "organizerName": "Monik",
  "startDate": "2026-06-20",
  "endDate": "2026-06-24",
  "location": "Ahmedabad",
  "logoUrl": "",
  "ballType": "tennis",
  "customBallType": "",
  "oversPerMatch": 10,
  "format": "league",
  "squadMode": "teams_only"
}
```

Response:

```json
{
  "tournament": {}
}
```

### Get tournament

`GET /api/v1/tournaments/:id`

Response:

```json
{
  "tournament": {}
}
```

### Update tournament

`PUT /api/v1/tournaments/:id`

Accepts the same body as create and returns:

```json
{
  "tournament": {}
}
```

### Register team

`POST /api/v1/tournaments/:id/teams`

Request body:

```json
{
  "name": "Royal Strikers",
  "logoUrl": "",
  "captainName": "Rahul Patel",
  "contactNumber": "+91 90000 00000",
  "players": [
    { "name": "Rahul Patel", "role": "Captain" },
    { "name": "Amit Shah", "role": "Batter" }
  ]
}
```

Response:

```json
{
  "team": {
    "id": "team_123",
    "name": "Royal Strikers",
    "logoUrl": "",
    "captainName": "Rahul Patel",
    "contactNumber": "+91 90000 00000",
    "players": [],
    "stats": {
      "played": 0,
      "won": 0,
      "lost": 0,
      "points": 0,
      "ballsFaced": 0,
      "ballsBowled": 0,
      "netRunRate": 0
    },
    "createdAt": "2026-06-17T08:00:00.000Z",
    "updatedAt": "2026-06-17T08:00:00.000Z"
  }
}
```

### Update team

`PUT /api/v1/tournaments/:id/teams/:teamId`

Accepts the same body as register team and returns:

```json
{
  "team": {}
}
```

### Start tournament match

`POST /api/v1/tournaments/:id/matches/start`

This endpoint should require the authenticated user to own the tournament.
If a non-completed match already exists for the same pair, return it and keep
it in `in_progress`; otherwise create a new match.

Request body:

```json
{
  "team1Id": "team_123",
  "team2Id": "team_456"
}
```

Response:

```json
{
  "match": {
    "id": "tournament_match_123",
    "tournamentId": "tournament_123",
    "team1Id": "team_123",
    "team2Id": "team_456",
    "team1Name": "Royal Strikers",
    "team2Name": "City Challengers",
    "status": "in_progress",
    "winnerTeamId": "",
    "winnerTeamName": "",
    "resultText": "",
    "scorerMatchId": "",
    "startedAt": "2026-06-17T08:05:00.000Z",
    "completedAt": "",
    "createdAt": "2026-06-17T08:05:00.000Z",
    "updatedAt": "2026-06-17T08:05:00.000Z"
  }
}
```

### Complete tournament match

`POST /api/v1/tournaments/:id/matches/:matchId/complete`

This endpoint should require the authenticated user to own the tournament.
After completion, update the related team stats atomically:

- Winner: `played + 1`, `won + 1`, `points + 2`
- Loser: `played + 1`, `lost + 1`
- Store `resultText`, `scorerMatchId`, optional score `snapshot`, and
  `completedAt`

Request body:

```json
{
  "winnerTeamId": "team_123",
  "winnerTeamName": "Royal Strikers",
  "resultText": "Royal Strikers won by 18 runs",
  "scorerMatchId": "tournament_match_123",
  "snapshot": {}
}
```

Response:

```json
{
  "match": {
    "id": "tournament_match_123",
    "tournamentId": "tournament_123",
    "team1Id": "team_123",
    "team2Id": "team_456",
    "team1Name": "Royal Strikers",
    "team2Name": "City Challengers",
    "status": "completed",
    "winnerTeamId": "team_123",
    "winnerTeamName": "Royal Strikers",
    "resultText": "Royal Strikers won by 18 runs",
    "scorerMatchId": "tournament_match_123",
    "startedAt": "2026-06-17T08:05:00.000Z",
    "completedAt": "2026-06-17T09:20:00.000Z",
    "createdAt": "2026-06-17T08:05:00.000Z",
    "updatedAt": "2026-06-17T09:20:00.000Z"
  }
}
```
