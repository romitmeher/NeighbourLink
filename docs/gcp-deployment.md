# GCP deployment

The CI/CD workflow in `.github/workflows/gcp-deploy.yml` deploys the demo in
development mode to two Cloud Run
services:

- `neighbourlink-api`: FastAPI backend
- `neighbourlink-web`: React build served by Nginx and proxied to the API

It also runs the Alembic migration as a Cloud Run Job before deploying the API.
PostgreSQL remains external and is supplied through Secret Manager.

## One-time GCP setup

1. Create a GCP project and enable Artifact Registry, Cloud Build, Cloud Run,
   Secret Manager, and IAM Credentials APIs.
2. Create an Artifact Registry Docker repository and set repository/region as
   GitHub repository variables:
   - `GCP_REGION`, for example `asia-south1`
   - `GCP_ARTIFACT_REPOSITORY`, for example `neighbourlink`
3. Configure GitHub Actions Workload Identity Federation and set these secrets:
   - `GCP_PROJECT_ID`
   - `GCP_WORKLOAD_IDENTITY_PROVIDER`
   - `GCP_DEPLOYER_SERVICE_ACCOUNT`
4. Create Secret Manager secrets named `DATABASE_URL` and `SESSION_SECRET`.
   The deployer service account needs Secret Manager Secret Accessor,
   Cloud Run Admin, Cloud Run Job Runner, Artifact Registry Writer, Cloud Build
   Builder, and Service Account User roles.
5. Push to `main` or run **Deploy NeighbourLink to GCP** manually.

The workflow runs backend tests, frontend typecheck/build, migrations, API
deployment, and web deployment. It does not store credentials in GitHub files.

## Important production limitation

The workflow intentionally uses `APP_ENV=development` so the local demo payment
checkout and development OTP are available. Do not use this configuration for
production.

Cloud Run's local filesystem is ephemeral. The current upload implementation
uses `UPLOAD_DIR=/tmp/uploads`, which is suitable for a demo but not durable.
Before production use, move uploads to Cloud Storage and add a scheduled worker
execution for lifecycle/refund jobs.
