# Image2 Scene Deployment

Production site:

- Main Image2 case-library site: `https://image2.lsb0713.online`
- Standalone Docker scene service: `https://scene.lsb0713.online`
- Public picture studio: `https://picture.lsb0713.online`

The gacha page belongs to the main Image2 case-library flow and should be
validated at:

```text
https://image2.lsb0713.online/image2-cases/gacha
```

## Deploy

```powershell
cd D:\codex-work\seedance2
Copy-Item deploy\image2\production.env.example deploy\image2\production.env
# Fill production.env with real secrets. Do not commit it.
.\deploy\image2\deploy-image2-scene.ps1
```

## Nginx

The app joins the existing `docker_default` network and is reachable from
`docker-nginx-1` as:

```text
http://image2-scene:3000
```

Install the HTTP server block:

```powershell
Copy-Item deploy\image2\nginx-scene.conf D:\codex-work\daihuo\dify\docker\nginx\conf.d\scene.lsb0713.online.conf -Force
docker exec docker-nginx-1 nginx -t
docker exec docker-nginx-1 nginx -s reload
```

Local reverse-proxy smoke:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1/ -Headers @{ Host = "scene.lsb0713.online" }
Invoke-WebRequest -UseBasicParsing http://127.0.0.1/ -Headers @{ Host = "picture.lsb0713.online" }
```

## DNS / HTTPS

Current production path uses Cloudflare Tunnel:

```text
scene.lsb0713.online
picture.lsb0713.online
  -> 92ac3453-3575-45d8-9eda-6981a19df1a1.cfargotunnel.com
  -> cloudflared handwriting-photo-site
  -> http://127.0.0.1:80
  -> docker-nginx-1
  -> http://image2-scene:3000
```

Emergency Windows fallback for `picture.lsb0713.online` when Docker/Nginx local
port 80 is down:

```text
picture.lsb0713.online
  -> cloudflared handwriting-photo-site
  -> http://127.0.0.1:3013
  -> Next.js production server
```

The fallback server is started by:

```powershell
.\deploy\image2\start-picture-studio.ps1
```

Created watchdog task name:

```text
PictureStudioNextWatchdog
```

It runs every 5 minutes. If `127.0.0.1:3013` is already listening, the script
exits immediately; if the server has stopped, it starts the Next.js production
server again.

DNS was created with:

```powershell
cloudflared tunnel route dns handwriting-photo-site scene.lsb0713.online
cloudflared tunnel route dns handwriting-photo-site picture.lsb0713.online
```

The local tunnel config is:

```text
D:\codex-work\aihomework\output\handwriting-web-site\cloudflared-handwriting.yml
```

It must include:

```yaml
ingress:
  - hostname: handwriting.lsb0713.online
    service: http://127.0.0.1:8787
  - hostname: scene.lsb0713.online
    service: http://127.0.0.1:80
  - hostname: picture.lsb0713.online
    service: http://127.0.0.1:80
  - service: http_status:404
```

If the fallback is active, the picture route should temporarily be:

```yaml
  - hostname: picture.lsb0713.online
    service: http://127.0.0.1:3013
```

The tunnel is registered as a Windows logon scheduled task:

```text
Image2SceneCloudflaredTunnel
```

If Cloudflare Tunnel is replaced by direct origin HTTPS later, use
`nginx-scene-https.conf.example` after placing a valid cert/key that covers both
`scene.lsb0713.online` and `picture.lsb0713.online` in the mounted Nginx
SSL/certbot path.

## Smoke

Before the main-site gacha smoke, make sure the Supabase project has the gacha migration:

```powershell
npm run check:image2-gacha-migration
npm run migrate:image2-gacha-supabase -- --dry-run=true
npm run migrate:image2-gacha-supabase
```

If this machine does not have `SUPABASE_DB_URL` and `psql`, run
`supabase/migrations/202606030001_image2_gacha_runs.sql` in Supabase SQL Editor instead.

Before enabling public generation on `picture.lsb0713.online`, check the
username/password account and per-user generation history storage:

```powershell
npm run check:picture-auth-history-migration
npm run health:picture-auth-history
```

`npm run health:picture-auth-history` can pass in two modes:

- `dedicated-picture-tables`: the formal `picture_accounts` and
  `picture_generation_runs` tables are applied.
- `image2_asset_snapshots fallback`: current live fallback. Username accounts use
  `user_profiles`; generation history is stored per user in
  `image2_asset_snapshots.snapshot.pictureStudioHistory`. This keeps pictures
  from being lost while the formal migration is still pending.

To switch to the formal table shape, apply the migration:

```powershell
npm run migrate:picture-auth-history-supabase -- --dry-run=true
npm run migrate:picture-auth-history-supabase
npm run health:picture-auth-history
```

If this machine does not have `SUPABASE_DB_URL` and `psql`, run
`supabase/migrations/202606040003_picture_accounts_history.sql` in Supabase SQL
Editor instead, then rerun `npm run health:picture-auth-history`. The site can
continue using the fallback mode before this migration is applied.

```powershell
npm run typecheck
npm run build
npm run check:image2-license-migration
npm run check:image2-wallet-migration
npm run check:image2-workbench-migration
npm run check:image2-gacha-migration
npm run check:picture-auth-history-migration

docker compose --env-file deploy\image2\production.env -f docker-compose.image2.yml build
docker compose --env-file deploy\image2\production.env -f docker-compose.image2.yml up -d

curl.exe -i https://scene.lsb0713.online/
curl.exe -i https://picture.lsb0713.online/
curl.exe -i https://scene.lsb0713.online/api/image2/entitlements
curl.exe -I https://picture.lsb0713.online/api/image2/output/example/nonexistent.png
npm run smoke:image2-domains

# If the deploy machine DNS cache still returns NXDOMAIN for picture.lsb0713.online,
# verify the same picture routing through the local container and forwarded host.
node tools/smoke-image2-domains.mjs --picture-base=http://127.0.0.1:3052 --picture-host=picture.lsb0713.online --timeout-ms=30000

$env:IMAGE2_SMOKE_BASE_URL="https://image2.lsb0713.online"
npm run health:image2-gacha
npm run smoke:image2-gacha

$env:PICTURE_AUTH_REAL_SMOKE_BASE_URL="https://picture.lsb0713.online"
npm run health:picture-auth-history
npm run smoke:picture-auth-history:real
```

The gacha smoke belongs to `https://image2.lsb0713.online`, not the standalone
`scene.lsb0713.online` Docker service. The health check verifies env/table readiness with `ADMIN_TOKEN`; the smoke verifies 收藏夹来源、抽卡记录、评分收藏和配方保存，不触发真实作图。
