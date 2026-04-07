# Copilot Instructions

## Repository Overview

Logto is an open-source identity platform (OIDC + OAuth 2.1 + SAML). This is a private fork — see [README.md](../README.md) for fork-specific changes.

pnpm monorepo with three workspace groups:
- `packages/*` — main packages (core server, frontend SPAs, schemas, CLI, etc.)
- `packages/toolkit/*` — low-level shared libs (`connector-kit`, `core-kit`, `language-kit`)
- `packages/connectors/connector-*` — 50+ social/email/SMS connectors

---

## Commands

### Setup
```bash
pnpm i                     # Install all deps (pnpm enforced; Node ^22.14.0 required)
pnpm prepack               # Generate types + build shared libs — run before first dev start
```

### Development
```bash
pnpm dev                   # Start all packages in parallel watch mode
pnpm start                 # Start core server only (production entrypoint)
```

### Build & Check
```bash
pnpm ci:build                              # Build all packages
pnpm ci:lint                               # ESLint all packages in parallel
pnpm ci:stylelint                          # Stylelint all packages in parallel
pnpm -r --filter @logto/core build        # Build one specific package
pnpm -r --filter @logto/console check     # Type-check one package
```

### Unit Tests

```bash
# Root — run all unit tests
pnpm ci:test

# Inside a package directory:
pnpm test                                         # All tests in package

# jest packages (core, console, experience, account):
pnpm test -- --testPathPattern=routes/application # Match by path fragment
pnpm test -- --testNamePattern="GET /applications" # Match by test name

# vitest packages (schemas, cli, tunnel, api, shared, all connectors):
pnpm test src/index.test.ts                        # Single file
pnpm test src/index.test.ts --reporter=verbose     # Verbose output
```

**Test runner per package:**
| Package(s) | Runner | Notes |
|---|---|---|
| `core` | jest | Must `pnpm build` first — tests run against compiled `build/` |
| `console`, `experience`, `account` | jest | jsdom + SWC; runs against source |
| `elements` | jest + Playwright | `playwright install --with-deps` required |
| `schemas`, `cli`, `tunnel`, `api`, `shared` | vitest | |
| `connectors/connector-*` | vitest | |
| `integration-tests` | jest + Puppeteer | Docker-only; see Local Dev section |

---

## Local Development (Windows 11 + VSCode + Docker)

### Prerequisites

- **Node.js** `^22.14.0` (use nvm-windows or fnm)
- **pnpm** `^10` — `npm i -g pnpm`
- **Docker Desktop** for Windows (WSL2 backend recommended)
- **WSL2** (needed to run `.sh` integration scripts) — `wsl --install`

### Option A: Source-based Dev (recommended for feature work)

Run the server directly on the host; only the database runs in Docker.

**1. Start PostgreSQL**
```powershell
docker run -d --name logto-pg `
  -e POSTGRES_PASSWORD=p0stgr3s `
  -p 5432:5432 `
  postgres:17-alpine
```

**2. Create `.env` at repo root**
```env
DB_URL=postgresql://postgres:p0stgr3s@localhost:5432/logto
ENDPOINT=http://localhost:3001
ADMIN_ENDPOINT=http://localhost:3002
```

**3. Seed database + start dev server**
```powershell
pnpm i
pnpm prepack
pnpm cli db seed          # Initialize DB schema + default data
pnpm dev                  # Start all packages in watch mode
```

Ports:
- `http://localhost:3001` — main app / OIDC
- `http://localhost:3002` — admin console

**4. Link local connectors (optional, needed when developing a new connector)**
```powershell
pnpm cli connector link -p .
```
This creates symlinks from `packages/core/connectors/` to each connector package.  
Restart the dev server after linking.

**5. Deploy DB alterations (after pulling upstream schema changes)**
```powershell
pnpm alteration deploy
```

### Option B: Docker-based Integration Tests

Integration tests run fully inside Docker. The test runner runs on the host and communicates with the containerized Logto via `localhost:3001`.

**Requirement**: Run from WSL2 (the integration script is a bash `.sh` file).

```bash
# Inside WSL2 terminal, from repo root:
pnpm test:integration api         # API tests
pnpm test:integration experience  # UI/browser tests (Puppeteer)
pnpm test:integration console     # Admin console UI tests
pnpm test:integration well-known  # Well-known endpoint tests

# Skip Docker rebuild (faster on second run):
NO_BUILD=1 pnpm test:integration api

# With coverage:
COVERAGE=1 pnpm test:integration api
```

What the script does internally:
1. `docker compose -f docker-compose.integration.yml up --build -d --wait` — starts Postgres + Redis + Logto
2. Runs `packages/integration-tests` jest suite from host against `localhost:3001`
3. Tears down containers + volumes on completion

### Option C: Custom Test Image via Harbor

For iterative integration testing without rebuilding from scratch every time:

```powershell
# Build the integration test image
docker build -f Dockerfile.integration -t ghcr.io/zzmark/logto:dev-test .

# Push to GHCR
docker push ghcr.io/zzmark/logto:dev-test
```

Then in `docker-compose.integration.yml`, replace `build:` with `image:`:
```yaml
logto:
  image: harbor.zzmark.top/bolian/logto:dev-test
  # build:               ← comment out
  #   context: .
  #   dockerfile: Dockerfile.integration
```

### VSCode Recommended Extensions

- **ESLint** (`dbaeumer.vscode-eslint`)
- **Prettier** (`esbenp.prettier-vscode`)
- **Vitest** (`vitest.explorer`) — run/debug vitest tests inline
- **Jest** (`orta.vscode-jest`) — run/debug jest tests inline
- **Remote - WSL** (`ms-vscode-remote.remote-wsl`) — for integration test scripts

---

## Architecture

### Key Packages

| Package | Role |
|---|---|
| `@logto/core` | Koa 2 HTTP server — OIDC provider, management API, tenant orchestration |
| `@logto/schemas` | PostgreSQL table definitions, Zod types, DB alteration (migration) scripts |
| `@logto/console` | React 18 + Vite admin dashboard SPA |
| `@logto/experience` | React 18 + Vite sign-in/sign-up flow SPA |
| `@logto/account` | React 18 + Vite user account center SPA |
| `@logto/elements` | Lit-based web components |
| `@logto/shared` | Node.js utilities shared across server packages |
| `@logto/phrases` / `@logto/phrases-experience` | i18n strings |
| `@logto/cli` | `logto` CLI — DB seeding, connector management, alteration deployment |
| `@logto/connector-kit` | Base interfaces all connectors must implement |

### Core Server (`packages/core/src`)

**Framework**: Koa 2 + `koa-router`

**Routing** — `src/routes/init.ts` is the root registrar. Three router types:
- `ManagementApiRouter` — authenticated management API (requires JWT via `koaAuth`)
- `AnonymousRouter` — public endpoints (well-known, status, authn callbacks)
- `UserRouter` — user-facing API protected by OIDC session (`koaOidcAuth`)

**Each route file follows this pattern:**
```typescript
export default function applicationRoutes<T extends ManagementApiRouter>(
  ...[router, tenant]: RouterInitArgs<T>
) {
  const { queries, libraries } = tenant;

  router.get('/applications',
    koaPagination(),
    koaGuard({ query: z.object({...}), response: z.array(Applications.guard), status: 200 }),
    async (ctx, next) => {
      ctx.body = await queries.applications.findApplications(...);
      return next();
    }
  );
}
```

**Database** — `@silverhand/slonik` (PostgreSQL). Structure:
- `src/database/` — generic helpers (`insertInto`, `updateWhere`, `findEntityById`, etc.)
- `src/queries/` — per-entity query classes, instantiated in `Queries` class
- `src/tenants/Tenant.ts` — `Queries` class holds all query instances per tenant

**Multi-tenancy** — Each request is resolved to a `Tenant` instance. `Tenant` owns:
- `envSet` — per-tenant env/config
- `queries` — all DB query instances
- `libraries` — business logic (hooks, passcodes, JWT customizers, etc.)
- `provider` — OIDC provider instance
- `connectors` — loaded connector instances

**OIDC** — Custom fork of `node-oidc-provider` in `src/oidc/`. Mounted at `/oidc`.

**Caching** — Optional Redis (`REDIS_URL` env var). Enabled in `src/caches/`.

**Path alias** — `#src/*` → `src/*`. Use this for all intra-package imports in `core`.

### Schemas & Migrations (`packages/schemas`)

Tables defined with `createModel()` + raw SQL + Zod:
```typescript
export const Applications = createModel(`
  create table applications (
    tenant_id varchar(21) not null references tenants(id),
    id varchar(21) not null,
    ...
  );
`)
  .extend('oidcClientMetadata', oidcClientMetadataGuard)
  .extend('customClientMetadata', customClientMetadataGuard);
```

DB migrations are called **alterations** — numbered scripts in `src/alterations/`:
```bash
pnpm alteration deploy       # Apply pending alterations
pnpm cli db seed             # Seed fresh DB (dev/test only)
pnpm cli db seed --test      # Seed with test data
```

The fixed release group `@logto/core + @logto/schemas + @logto/api + @logto/cli + @logto/create` must be versioned together (see Changesets).

### Middleware (`packages/core/src/middleware`)

Key middleware used in most routes:

| Middleware | Usage |
|---|---|
| `koaGuard({ body, params, query, response, status })` | Zod validation for request/response — always use this |
| `koaPagination()` | Parses `?page=&page_size=`; sets `ctx.pagination`; adds `Link` header |
| `koaAuth(envSet, indicator)` | JWT authentication for management API |
| `koaAuditLog(queries)` | Audit logging — applied to experience router |
| `koaManagementApiHooks(hooks)` | Fires post-operation webhooks |
| `koaTenantGuard(tenantId, queries)` | Checks tenant suspension in cloud mode |
| `koaOidcAuth(tenant)` | OIDC session auth for user API |

### Environment Variables (`packages/core/src/env-set`)

Required:
```env
DB_URL=postgresql://user:pass@host:5432/dbname
```

Common optional:
```env
ENDPOINT=http://localhost:3001           # Main app URL
ADMIN_ENDPOINT=http://localhost:3002     # Admin console URL
REDIS_URL=redis://localhost:6379         # Enables distributed cache
TRUST_PROXY_HEADER=1                     # Enable X-Forwarded-* (behind reverse proxy)
SECRET_VAULT_KEK=<base64>               # Secret encryption key
DEV_FEATURES_ENABLED=true               # Enable dev-only features (default: true in non-prod)
IGNORE_CONNECTOR_VERSION_CHECK=true     # Skip connector-kit version check
```

---

## Connector Development

### File Structure

```
packages/connectors/connector-{name}/
├── src/
│   ├── index.ts          # Main entry — exports createXxxConnector
│   ├── constant.ts       # Endpoints, defaultMetadata, timeouts
│   ├── types.ts          # Zod guards + TypeScript types for config/response
│   ├── utils.ts^         # Helper functions
│   ├── index.test.ts     # Unit tests (vitest)
│   ├── mock.ts^          # Mock data for tests
│   └── utils.test.ts^
├── logo.svg              # Connector logo (required)
├── logo-dark.svg^        # Dark mode logo
├── README.md             # Config guide for users
└── package.json          # Merged with templates/package.json at sync
```
`^` = optional

### Step 1 — Scaffold from existing connector

Copy an existing connector and rename:
```powershell
# From repo root
Copy-Item -Recurse packages\connectors\connector-github packages\connectors\connector-{name}
```

Update in the new package:
- `package.json` — `name`, `version`, `description`
- `src/constant.ts` — `defaultMetadata.id`, `defaultMetadata.target`, endpoints
- `src/types.ts` — config Zod guard + response guards
- `src/index.ts` — implement the four functions (see below)
- `logo.svg` / `README.md`

### Step 2 — Implement `index.ts` (Social connector pattern)

```typescript
import { ConnectorError, ConnectorErrorCodes, ConnectorType, validateConfig } from '@logto/connector-kit';
import type { CreateConnector, GetAuthorizationUri, GetUserInfo, SocialConnector } from '@logto/connector-kit';
import ky, { HTTPError } from 'ky';
import { defaultMetadata, authorizationEndpoint, accessTokenEndpoint, userInfoEndpoint, defaultTimeout } from './constant.js';
import { myConfigGuard } from './types.js';

const getAuthorizationUri =
  (getConfig: GetConnectorConfig): GetAuthorizationUri =>
  async ({ state, redirectUri, scope }) => {
    const config = await getConfig(defaultMetadata.id);
    validateConfig(config, myConfigGuard);
    const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: redirectUri, state });
    return `${authorizationEndpoint}?${params}`;
  };

const getUserInfo =
  (getConfig: GetConnectorConfig): GetUserInfo =>
  async (data) => {
    // 1. Extract auth code from callback data
    // 2. Exchange for access token
    // 3. Fetch user profile
    // Return: { id: string, email?, name?, avatar?, rawData? }
  };

const createMyConnector: CreateConnector<SocialConnector> = async ({ getConfig }) => ({
  metadata: defaultMetadata,
  type: ConnectorType.Social,
  configGuard: myConfigGuard,
  getAuthorizationUri: getAuthorizationUri(getConfig),
  getUserInfo: getUserInfo(getConfig),
});

export default createMyConnector;
```

**For passwordless (email/SMS) connectors**, implement `sendMessage` instead:
```typescript
import type { EmailConnector, CreateConnector } from '@logto/connector-kit';
import { ConnectorType } from '@logto/connector-kit';

const createMyEmailConnector: CreateConnector<EmailConnector> = async ({ getConfig }) => ({
  metadata: defaultMetadata,
  type: ConnectorType.Email,
  configGuard: myConfigGuard,
  sendMessage: sendMessage(getConfig),
});
```

### Step 3 — Define metadata in `constant.ts`

```typescript
import type { ConnectorMetadata } from '@logto/connector-kit';
import { ConnectorPlatform, ConnectorConfigFormItemType } from '@logto/connector-kit';

export const defaultMetadata: ConnectorMetadata = {
  id: 'my-connector-universal',   // Must be globally unique
  target: 'my-provider',          // Provider identity (used for social identity linking)
  platform: ConnectorPlatform.Universal,
  name: { en: 'My Provider', 'zh-CN': '...' },
  logo: './logo.svg',
  logoDark: './logo-dark.svg',
  description: { en: '...' },
  readme: './README.md',
  formItems: [
    { key: 'clientId', type: ConnectorConfigFormItemType.Text, label: 'Client ID', required: true },
    { key: 'clientSecret', type: ConnectorConfigFormItemType.Text, label: 'Client Secret', required: true },
  ],
};
export const defaultTimeout = 5000;
```

### Step 4 — Test the connector

**Unit tests** (run from connector directory):
```powershell
cd packages\connectors\connector-{name}
pnpm test                      # Run all tests
pnpm test src/index.test.ts    # Single file
pnpm test --watch              # Watch mode
```

**Local integration test**:
```powershell
# Link connector to running dev server
pnpm cli connector link -p .

# Restart dev server to pick up new connector
# Then visit: http://localhost:3002 → Connectors → Add connector
```

### Step 5 — Sync with template

After modifying `package.json`, re-run the sync to keep connector in sync with the template:
```powershell
node packages/connectors/templates/sync-preset.js
```

### Error Handling in Connectors

Always use `ConnectorError` with a `ConnectorErrorCodes` code:
```typescript
import { ConnectorError, ConnectorErrorCodes } from '@logto/connector-kit';

// Common codes:
throw new ConnectorError(ConnectorErrorCodes.InvalidConfig, 'missing clientId');
throw new ConnectorError(ConnectorErrorCodes.AuthorizationFailed, error_description);
throw new ConnectorError(ConnectorErrorCodes.SocialAccessTokenInvalid);
throw new ConnectorError(ConnectorErrorCodes.InvalidResponse, zodError);
throw new ConnectorError(ConnectorErrorCodes.General, rawBody);
```

---

## Adding a New API Route

1. Create `packages/core/src/routes/<feature>.ts` (or `<feature>/index.ts` for larger features)
2. Register in `packages/core/src/routes/init.ts`
3. Add `koaGuard` to every handler — no unvalidated `ctx.request.body` access
4. Use `tenant.queries.*` for DB access; add new query methods to `src/queries/` if needed
5. Throw `RequestError` (not raw `Error`) for user-facing errors:

```typescript
import RequestError from '#src/errors/RequestError/index.js';

throw new RequestError({ code: 'application.not_found', status: 404 }, { id });
```

---

## Conventions

### TypeScript & Modules

- All packages: **ESM** (`"type": "module"` everywhere)
- Library packages (`tsup` → `lib/`); App packages (`vite`)
- Shared tsup config: `tsup.shared.config.ts` (`entry: ['src/index.ts']`, `outDir: 'lib'`, `format: ['esm']`, `dts: false`)
- Use `#src/*` path alias within `core` — never relative `../../` across deep paths

### Validation

- **Zod** is the only validation library — no Joi, Yup, etc.
- Route I/O: `koaGuard({ body, params, query, response, status })`
- Connector config: `validateConfig(config, myGuard)` then `myGuard.parse(config)`
- Always use `z.safeParse` when you need to handle failure explicitly; use `.parse` when failure should throw

### ESLint

- `import/no-unused-modules: error` — every export must be consumed
- `no-console: error` in `core` — use the internal logger, never `console.log`
- Per-package `.eslintrc.cjs` extends `@silverhand/eslint-config` (server) or `@silverhand/eslint-config-react` (UI)

### Commits

Format: `<type>(<scope>): <subject>` — max 110 chars

**Types**: `feat` `fix` `chore` `docs` `refactor` `test` `style` `perf` `ci` `build` `revert` `api` `release`

**Scopes**: `connector` `console` `core` `demo-app` `test` `phrases` `schemas` `shared` `experience` `experience-legacy` `deps` `deps-dev` `cli` `toolkit` `cloud` `app-insights` `elements` `translate` `tunnel` `account-elements` `account` `api`

### Changesets

```bash
pnpm changeset    # Create changeset for user-visible changes
```

- `@logto/core`, `@logto/schemas`, `@logto/api`, `@logto/cli`, `@logto/create` are **fixed** — always bump together
- Internal dependency bumps: auto `minor`
