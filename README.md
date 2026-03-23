# Tournament API

Backend API pour le SaaS de gestion de tournois.

## Stack

- **Node.js + Express** — serveur HTTP
- **Prisma + SQLite** — ORM + base de données locale
- **JWT + bcrypt** — authentification

## Installation

```bash
npm install
npx prisma migrate dev --name init
npm run prisma:seed
```

## Lancement

```bash
npm run dev
```

Le serveur démarre sur `http://localhost:4000`.

## Lancement Prisma Studio

```bash
npx prisma studio
```

Le serveur démarre sur `http://localhost:5555`.

## Endpoints

### Auth
- `POST /api/auth/register` — inscription (crée un organizer)
- `POST /api/auth/login` — connexion
- `GET /api/auth/me` — profil courant (auth requise)

### Tournaments (auth requise)
- `GET /api/tournaments` — liste (filtrée par rôle)
- `GET /api/tournaments/:id` — détail
- `POST /api/tournaments` — création
- `PUT /api/tournaments/:id` — mise à jour complète
- `DELETE /api/tournaments/:id` — suppression

### Matches (auth requise)
- `PUT /api/tournaments/:tournamentId/matches/:matchId` — mise à jour d'un match
