# API Mapping Catalogue

A proof-of-concept CRUD grid built with Next.js (React), Tailwind CSS and MongoDB, deployable to Vercel.

## Columns

| Field            | API property     | Max length | Notes                                   |
|------------------|------------------|-----------:|-----------------------------------------|
| URL/Mutation     | `name`           | 150        |                                         |
| Description      | `description`    | 255        |                                         |
| Tables Affected  | `tablesAffected` | 255        |                                         |
| Verb             | `verb`           | 6          | One of GET, POST, PUT, PATCH, DELETE    |
| Resource         | `resource`       | 15         |                                         |
| Edit / Delete    | –                | –          | Row actions                             |

All fields are required (blank or whitespace-only values are rejected).
The **URL/Mutation + Verb** combination must be unique (case-insensitive), so `AccountHeader`/GET and
`AccountHeader`/POST can both exist, but not two `AccountHeader`/GET rows.

## Run locally

1. Install **Node.js 20 LTS or newer** from https://nodejs.org (includes `npm`).
2. In this folder, install dependencies:
   ```
   npm install
   ```
3. Copy `.env.example` to `.env.local` and put your MongoDB connection string in `MONGODB_URI`.
   (In MongoDB Atlas: Database → Connect → Drivers. Also allow your IP under Network Access.)
   The `entities` collection is created automatically on first insert.
4. Start the dev server:
   ```
   npm run dev
   ```
5. Open http://localhost:3000

## API endpoints

| Method | URL                          | Purpose                          | Success |
|--------|------------------------------|----------------------------------|---------|
| GET    | `/api/entities?search=term`  | List (optionally search) entities | 200     |
| GET    | `/api/entities/:id`          | Get one entity                   | 200     |
| POST   | `/api/entities`              | Create an entity                 | 201     |
| PUT    | `/api/entities/:id`          | Update an entity (all fields)    | 200     |
| DELETE | `/api/entities/:id`          | Delete an entity                 | 204     |

Validation errors return `400` with `{ "errors": { "field": "message" } }`; a duplicate URL/Mutation + Verb
returns `409` with `{ "errors": { "name": "URL/Mutation \"X\" with verb GET already exists.", "verb": "Used with this URL/Mutation." } }`;
missing ids return `404`.

### Postman

Import `postman/ApiMappingCatalogue.postman_collection.json`. Set the `baseUrl` collection variable
(default `http://localhost:3000`). Running **Create entity** saves the new id into `entityId`,
which Get / Update / Delete use.

## Deploy to Vercel

1. Push this folder to a GitHub repository (`.env.local` is git-ignored and won't be pushed).
2. In Vercel, **Add New → Project** and import the repository (framework is detected as Next.js).
3. Under **Settings → Environment Variables**, add `MONGODB_URI` (and optionally `MONGODB_DB`).
4. In MongoDB Atlas **Network Access**, allow `0.0.0.0/0`, since Vercel does not use fixed IPs.
5. Deploy, then point Postman's `baseUrl` at your Vercel URL.

## Moving to IIS + SQL Server later

All database access goes through the `EntityRepository` interface in `src/lib/repository.ts`.
To switch to SQL Server:

1. Create a table matching the column limits above, e.g.
   ```sql
   CREATE TABLE Entities (
     Id             INT IDENTITY PRIMARY KEY,
     Name           NVARCHAR(150)  NOT NULL,
     Description    NVARCHAR(255)  NOT NULL,
     TablesAffected NVARCHAR(255)  NOT NULL,
     Verb           NVARCHAR(6)    NOT NULL,
     Resource       NVARCHAR(15)   NOT NULL,
     CreatedAt      DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
     UpdatedAt      DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
     CONSTRAINT UQ_Entities_Name_Verb UNIQUE (Name, Verb)  -- case-insensitive under the default collation
   );
   ```
2. Add a `SqlEntityRepository` (e.g. using the `mssql` package) implementing the same five methods,
   and change the export at the bottom of `src/lib/repository.ts`. Map SQL unique-constraint
   violations (error 2627 / 2601) to `DuplicateEntityError`.
3. Host on IIS by running `npm run build` and `npm start` behind IIS using the
   URL Rewrite + Application Request Routing (reverse proxy) modules, or iisnode.

The UI and API routes don't need to change.

## Project layout

```
src/
  app/
    page.tsx                     Page shell
    api/entities/route.ts        GET (list/search), POST
    api/entities/[id]/route.ts   GET, PUT, DELETE
  components/EntityGrid.tsx      Grid, search, add/edit/delete UI
  lib/
    entity.ts                    Field limits, types, validation
    repository.ts                Storage interface (swap point for SQL)
    mongoEntityRepository.ts     MongoDB implementation
    mongodb.ts                   Connection handling
postman/                         Postman collection
```
