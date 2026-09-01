# SAEON Observations Monitor Deployment

The production deployment should be code-only through GitHub. The database and uploaded files stay in Docker volumes on the server.

Production URL: https://observationsmonitor.saeon.ac.za/
Production checkout: `/opt/saeon-observations-monitor-v2`

## Normal Deploy

SSH to the server and run:

```sh
cd /opt/saeon-observations-monitor-v2
./scripts/deploy-server.sh
```

That script:

- pulls the current Git branch from GitHub
- validates `.env` and `api/.env`
- rebuilds only the `api` and `web` images
- keeps the existing Postgres, export, and image Docker volumes
- restarts the API and web containers
- smoke-tests the local web and API ports

## First-Time Server Setup

The server should have one checkout:

```sh
sudo mkdir -p /opt/saeon-observations-monitor-v2
sudo chown -R marc:marc /opt/saeon-observations-monitor-v2
git clone https://github.com/SAEON/SOM.git /opt/saeon-observations-monitor-v2
```

Create server-only environment files:

```sh
cd /opt/saeon-observations-monitor-v2
cp .env.example .env
cp api/.env.example api/.env
```

Then edit `.env` and `api/.env` with the real passwords/secrets. Do not commit those files.

For this server, `.env` should include:

```sh
POSTGRES_PASSWORD=...
NODE_ENV=production
ENABLE_BACKGROUND_JOBS=true
LOGGERNET_REJECT_UNAUTHORIZED=false
LOGGERNET_HOST_OVERRIDE=192.168.111.70
TABLE_VALUE_REQUEST_TIMEOUT_MS=90000
WEB_HOST_PORT=3080
API_HOST_PORT=3081
DB_HOST_PORT=55432
```

## Database Rule

Never remove `saeon-observations-monitor-v2_loggernet-db-data` during a normal deploy. That volume is the live database.

Only restore or replace the database volume when intentionally doing a full database migration or disaster recovery.

## GitHub-Based Deploy

The included GitHub Actions workflow is set to `workflow_dispatch` and expects a self-hosted runner on the production server. That is the safest GitHub route because the server already has VPN/network access to LogNet and Docker.

Until a self-hosted runner is installed, use the manual server command:

```sh
cd /opt/saeon-observations-monitor-v2
./scripts/deploy-server.sh
```

## Quick Health Checks

```sh
docker compose ps
curl -fsS http://localhost:3081/api/public/site-status
curl -fsS http://localhost:3080/ >/dev/null && echo web-ok
```

After logging in:

```sh
curl -b saeon.cookies http://localhost:3081/api/background-status
```

## Trigger Writer Sync After Deploy

After deployments that affect LoggerNet metadata, raw mappings, or reporting views, trigger the writer once so the server immediately discovers new sites, tables, and fields before the next scheduled run.

From the production server:

```sh
cd /opt/saeon-observations-monitor-v2

curl -k -c /tmp/loggernet.cookies \
  -H "Content-Type: application/json" \
  -d '{"username":"Marc","password":"YOUR_PASSWORD"}' \
  https://observationsmonitor.saeon.ac.za/api/login

curl -k -b /tmp/loggernet.cookies \
  -X POST \
  https://observationsmonitor.saeon.ac.za/api/background/run-writer

curl -k -b /tmp/loggernet.cookies \
  https://observationsmonitor.saeon.ac.za/api/background-status

rm -f /tmp/loggernet.cookies
```

Watch progress with:

```sh
docker compose logs -f api
```

The writer should start with `Discover server metadata`, then continue into active table values, availability, and reporting refreshes.
