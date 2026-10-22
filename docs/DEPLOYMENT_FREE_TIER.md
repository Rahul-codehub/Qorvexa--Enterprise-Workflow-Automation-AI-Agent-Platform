# Free-Tier Deployment Guide

This runbook deploys the **current foundation** at $0 for a low-traffic student demonstration. It is not a production SLA design. Free tier terms can change; verify each provider before creating an account.

```text
Browser --> Vercel (Next.js) --> https://api-your-project.duckdns.org
                                      |
                                      +--> Oracle Always Free VM: Caddy -> API / worker / AI service
                                      +--> MongoDB Atlas Free cluster
                                      +--> Upstash Redis Free database
```

## 1. Create the free managed services

### MongoDB Atlas

1. Create one **Free / M0** cluster.
2. Create a database user with a long generated password.
3. After creating the Oracle VM, add only its public IP as `x.x.x.x/32` under Network Access. Do not leave `0.0.0.0/0` enabled.
4. Copy its driver connection string into `MONGODB_URI` in the production environment file.
5. Leave the optional paid backup feature disabled.

### Upstash Redis

1. Create one free Redis database.
2. Copy its TLS connection string into `REDIS_URL`; it should begin with `rediss://`.
3. Do not upgrade it to pay-as-you-go if the project must remain strictly free.

The worker uses the Redis TCP URL, not the REST API URL.

## 2. Create a free public API name

1. Create a subdomain at Duck DNS, for example `api-your-project.duckdns.org`.
2. After you create the Oracle VM, point that subdomain at the VM's reserved public IPv4 address.
3. Wait for DNS propagation before starting Caddy. Caddy will then obtain and renew a free TLS certificate automatically.

## 3. Create the Oracle Always Free VM

1. In your Oracle Cloud **home region**, create an Always Free Ubuntu VM. The Ampere A1 allocation is preferred when capacity exists.
2. Reserve its public IPv4 address so the Duck DNS record does not change.
3. In Oracle Cloud networking, allow inbound TCP only on ports `22`, `80`, and `443`.
4. Install Docker Engine and Docker Compose on the VM using Docker's official Linux instructions.
5. If UFW is enabled, allow only the same ports:

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Never open ports `27017`, `6379`, `4000`, or `8000` to the internet.

## 4. Deploy the backend services

On the VM:

```bash
git clone <your-github-repository-url> qorvexa
cd qorvexa
cp .env.production.example .env.production
nano .env.production
```

Set these values in `.env.production`:

```dotenv
WEB_ORIGIN=https://your-project.vercel.app
MONGODB_URI=<Atlas connection string>
REDIS_URL=<Upstash TLS connection string>
JWT_ACCESS_SECRET=<unique random value, 32+ characters>
JWT_REFRESH_SECRET=<different unique random value, 32+ characters>
AI_SERVICE_URL=http://ai-service:8000
AI_PROVIDER=mock
QORVEXA_DOMAIN=api-your-project.duckdns.org
```

Start the deployment:

```bash
docker compose -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.production.yml ps
docker compose -f docker-compose.production.yml logs -f api worker ai-service caddy
```

Verify from your local machine:

```powershell
Invoke-RestMethod https://api-your-project.duckdns.org/api/v1/health
```

## 5. Deploy the frontend to Vercel

1. Push the repository to a private or public GitHub repository. Never commit `.env`, `.env.production`, or provider passwords.
2. Import the repository in Vercel.
3. Configure the Next.js app under `apps/web` as the project root directory.
4. Add `NEXT_PUBLIC_API_BASE_URL=https://api-your-project.duckdns.org` only when frontend code begins calling the API. This value is public by design; never add database, Redis, JWT, or provider secrets to Vercel client variables.
5. Deploy, then copy the resulting `https://<project>.vercel.app` URL into the VM's `WEB_ORIGIN` value and redeploy the backend:

```bash
docker compose -f docker-compose.production.yml up -d
```

## 6. Updating safely

```bash
cd ~/qorvexa
git pull --ff-only
docker compose -f docker-compose.production.yml up -d --build
docker image prune -f
```

Before each update, make sure `.env.production` still exists and is not tracked by Git.

## Current deployment limitations

- The current project is a Phase 1 foundation. The web shell does not yet use authenticated API data, and the worker does not yet execute workflow graphs.
- The AI service intentionally uses only the labeled deterministic mock provider.
- Atlas M0 and Upstash free tiers are suitable for a demo, not a high-availability production system.
- A custom paid domain is optional; the Duck DNS subdomain is sufficient for a free HTTPS demo.
