## Description

This PR includes deployment infrastructure improvements and bug fixes for the cipas-semantics service and Next.js development server. Key changes include fixing a critical import error in the semantic clone detection API, updating the deployment workflow for Azure VM, and configuring cross-origin permissions for the frontend.

## Related Issues

- Jira: [GRADLOOP-XXX](https://your-jira-instance/browse/GRADLOOP-XXX)
- Fixes deployment pipeline issues

## Type of Change

- [x] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [x] Documentation update

## Changes Made

- **Fixed cipas-semantics service import error**: Added missing `detection_module` import in `apps/services/cipas-services/cipas-semantics/api/main.py` to resolve F821 linting errors and enable proper model initialization on startup
- **Updated deployment workflow**: Changed VM path from `/home/iamdasun/Projects/4yrg/gradeloop-core-v2` to `/home/azureuser/Projects/4yrg/gradeloop-core-v2` in `.github/workflows/deploy.yml`
- **Added production environment configuration**: Created `.env.production` file with production-ready settings for all microservices
- **Configured Next.js cross-origin permissions**: Added `allowedDevOrigins` configuration in `apps/web/next.config.ts` to allow requests from Azure VM IP (57.155.2.141)

## Testing

Describe the tests you ran and how to reproduce:

1. **CIPAS Semantics Service**:
   ```bash
   cd apps/services/cipas-services/cipas-semantics
   python -m py_compile api/main.py
   # Verify no F821 errors
   ```

2. **Deployment Workflow**:
   - Push to `main` branch
   - Verify GitHub Actions workflow triggers successfully
   - Confirm SSH deployment to Azure VM completes without errors

3. **Next.js Development Server**:
   ```bash
   cd apps/web
   npm run dev
   # Access from Azure VM IP - verify no cross-origin warnings
   ```

4. **Docker Compose Deployment**:
   ```bash
   cp .env.production .env
   docker-compose -f docker-compose.prod.yaml up -d --build
   # Verify all services start successfully
   ```

## Screenshots (if applicable)

N/A

## Checklist

- [x] My code follows the project's style guidelines
- [x] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understanding areas
- [ ] I have made corresponding changes to the documentation
- [x] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published

## Database Changes

- [ ] New migrations added
- [ ] Migrations tested (up and down)
- [x] No breaking schema changes
- [ ] Seed data updated (if needed)

## Dependencies

- [x] No new dependencies
- [ ] New dependencies documented in README
- [ ] Dependencies approved by team

## Deployment Notes

**Important**: Before merging, ensure the following GitHub Secrets are configured:

| Secret Name | Value |
|-------------|-------|
| `AZURE_VM_HOST` | `57.155.2.141` |
| `AZURE_VM_USERNAME` | `azureuser` |
| `AZURE_VM_SSH_KEY` | Contents of `~/.ssh/gradeloop-dev-vm-1_key.pem` |
| `AZURE_VM_SSH_PASSPHRASE` | (leave empty if no passphrase) |

**Post-merge steps**:
1. SSH into Azure VM: `ssh -i ~/.ssh/gradeloop-dev-vm-1_key.pem azureuser@57.155.2.141`
2. Navigate to project directory: `cd /home/azureuser/Projects/4yrg/gradeloop-core-v2`
3. Copy production config: `cp .env.production .env`
4. Update secrets in `.env.production` (database passwords, JWT keys, API keys)
5. Deploy: `docker-compose -f docker-compose.prod.yaml up -d --build`
