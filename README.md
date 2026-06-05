# Petrafi — Trucking Sales & CRM

Next.js app for projects, quotes (haul + material pricing), vendors, contractors, and haul rate zones.

## Documentation

See [docs/PRD.md](docs/PRD.md) for the full product requirements, data model, and architecture with diagrams.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3002](http://localhost:3002).

Data is stored in **browser localStorage** by default (yellow banner in the app).

## Pricing rules (summary)

- **Hauling**: non-taxable service; tax does not apply to haul sell.
- **Material**: tax applies to material sell when route is marked *Material taxable*.
- **Broker fee**: configurable % of **haul buy** (Settings) — platform income; net buy = buy − broker.
- **Hauling GP**: sell − net buy per ton × qty.
- **Auto haul rates**: on quote edit, *Calc haul rate* geocodes pickup/dropoff, finds mileage zone, fills buy from zone table and sell with margin % from Settings.

## Remote storage (optional)

1. Create D1: `npm run d1:create`
2. Update `database_id` in `wrangler.jsonc`
3. Migrate: `npm run d1:migrate` (or `d1:migrate:remote` for production)
4. Set `NEXT_PUBLIC_CRM_REMOTE=true` in `.env.local` or `wrangler.jsonc` vars
5. Run with API backing:
   - **Next dev + file API**: `npm run dev` — `/api/db` persists to `.data/petrafi-db.json`
   - **Cloudflare**: `npm run preview:cloudflare` or `npm run deploy`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server on port 3002 |
| `npm run build` | Production build |
| `npm run deploy` | Build + deploy to Cloudflare |
