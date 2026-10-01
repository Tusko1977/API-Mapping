# API Mapping Catalogue

A CRUD grid: a static Next.js (React) + Tailwind CSS frontend, backed by an ASP.NET Core
Minimal API against SQL Server, both hosted as one IIS site. (Originally a MongoDB/Vercel
proof of concept - see git history if you need that version.)

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

## Database

Run once per environment, in SSMS, in order:

1. `db/001_create_database.sql` - creates the `ITAS_API_Mapping` database and `dbo.Entities` table.
2. `db/002_create_app_login.sql` - grants the app's identity (`HIVEDOME\dev02_itas_svc`, the shared
   Windows service account used by other apps on this instance) read/write access.

Both scripts are idempotent - safe to re-run.

## Run locally

Two processes, running side by side:

**API** (`api/`, ASP.NET Core, .NET 10 SDK required):
```
cd api
copy appsettings.Local.json.example appsettings.Local.json
```
Edit `appsettings.Local.json` if your connection needs differ from the template, then:
```
dotnet run
```
Runs on http://localhost:5068 by default. Uses Windows Authentication (`Trusted_Connection=True`) -
your own Windows login needs `db_datareader`/`db_datawriter` on `ITAS_API_Mapping` for this to work
locally (separate from the service account used in production - ask your DBA).

**Frontend** (repo root, Node.js 20 LTS+ required):
```
npm install
copy .env.example .env.local
npm run dev
```
Open http://localhost:3000. `.env.local`'s `NEXT_PUBLIC_API_BASE_URL` points the frontend at the
API running on a different port; the API's dev CORS policy allows `localhost:3000`.

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
to wherever the API is running (`http://localhost:5068` locally; the deployed IIS site's URL once
that's set up). Running **Create entity** saves the new id into `entityId`, which Get / Update /
Delete use.

## Building for IIS

```
npm run build:iis
```

Runs `next build` (static export, per `output: "export"` in `next.config.mjs`) and copies the
result into `api/wwwroot`. The ASP.NET Core app serves that as static files alongside its own
`/api/*` endpoints (`app.UseStaticFiles()` in `api/Program.cs`), so the whole app - frontend and
API - is one deployable unit and one IIS site once published. `api/wwwroot` is git-ignored, since
it's build output; run this before every publish.

IIS site configuration itself (ASP.NET Core Module install, app pool identity, bindings) is a
separate step, not yet documented here.

## Project layout

```
src/
  app/
    page.tsx                     Page shell
    layout.tsx, globals.css
  components/EntityGrid.tsx      Grid, search, add/edit/delete UI
  lib/entity.ts                  Field limits, types, client-side validation
api/                              ASP.NET Core Minimal API (.NET 10)
  Program.cs                      Endpoint mappings + static file hosting
  Entities/                       Entity model, request DTO, validation
  Data/                           IEntityRepository + SqlEntityRepository (Dapper)
  Api/ApiResults.cs               Shared response helpers
  appsettings.Local.json.example  Connection string template (copy -> appsettings.Local.json)
db/                                SQL Server setup scripts (run in SSMS)
scripts/copy-export-to-api.mjs    Used by `npm run build:iis`
postman/                          Postman collection
```
