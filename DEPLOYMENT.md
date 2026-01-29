# Deployment and Operations Guide

## PR Sentinel Deployment Architecture

### Local Development
- **Stack**: Docker Compose (backend + mongo + frontend dev server)
- **Run**: `make dev` or `docker-compose -f docker-compose.dev.yml up --build`
- **Extension**: Load unpacked from `frontend-chromeExtension/dist`

### Azure Production (App Service)
- **Backend**: Azure App Service for Containers (Linux B1+)
- **Database**: Azure Cosmos DB (Mongo API)
- **Secrets**: Azure Key Vault
- **Registry**: Azure Container Registry (ACR)

### Azure Production (Container Instances)
- **Simpler deployment** for low-traffic scenarios
- **No auto-scaling** but cost-effective
- **See README.md** for ACI CLI commands

---

## Pre-Deployment Checklist

- [ ] All tests passing: `make validate`
- [ ] `.env.example` reviewed and secrets identified
- [ ] Docker images build without errors: `make build`
- [ ] Extension ZIP size < 20MB: `make size-check`
- [ ] ESLint rules enforced: `make lint`
- [ ] Pre-commit hooks installed: `make pre-commit-install`
- [ ] Seed script tested locally: `make backend-seed`
- [ ] TTL indexes verified on dev database
- [ ] Rate limiting configured and tested

---

## Post-Deployment Validation

After deploying to Azure, verify:

1. **Health Checks**:
   ```bash
   curl https://<app-name>.azurewebsites.net/health/live
   curl https://<app-name>.azurewebsites.net/health/ready
   ```

2. **API Connectivity**:
   ```bash
   curl -X POST https://<app-name>.azurewebsites.net/api/v1/analyze-pr \
     -H "Content-Type: application/json" \
     -d '{"pr_url": "https://github.com/owner/repo/pull/123"}'
   ```

3. **MongoDB Connection**:
   - Verify connection string in Key Vault
   - Check Cosmos DB firewall rules

4. **Extension Configuration**:
   - Update extension Options page to point to prod API URL
   - Test analyze flow end-to-end

---

## Monitoring and Troubleshooting

### View Logs
```bash
# App Service logs
az webapp log tail --name pr-sentinel-api --resource-group $RESOURCE_GROUP

# Container logs (ACI)
az container logs --name pr-sentinel-backend --resource-group $RESOURCE_GROUP
```

### Check Resource Usage
```bash
az container show --name pr-sentinel-backend --resource-group $RESOURCE_GROUP
```

### Scale Operations
```bash
# App Service auto-scale
az monitor autoscale create \
  --name pr-sentinel-autoscale \
  --resource-group $RESOURCE_GROUP \
  --resource pr-sentinel-plan \
  --resource-type "Microsoft.Web/serverfarms" \
  --min-count 1 \
  --max-count 5
```

---

## Key Vault Integration (Production)

### Setup
1. Create Key Vault: `az keyvault create --name pr-sentinel-kv --resource-group $RESOURCE_GROUP`
2. Add secrets:
   ```bash
   az keyvault secret set --vault-name pr-sentinel-kv --name jwt-secret --value "$JWT_SECRET"
   az keyvault secret set --vault-name pr-sentinel-kv --name github-client-secret --value "$GITHUB_CLIENT_SECRET"
   az keyvault secret set --vault-name pr-sentinel-kv --name mongo-uri --value "$MONGO_URI"
   ```
3. Enable App Service managed identity and grant access

### Code Integration
- See `backend/app/core/config.py` for Key Vault TODO
- Use `azure-identity` and `azure-keyvault-secrets` libraries
- Replace `os.getenv()` with Key Vault SDK calls

---

## Database Backup and Recovery

### Backup Cosmos DB
```bash
# Use Azure Backup Center (managed backup) or mongodump
docker exec pr-sentinel-mongo mongodump --uri "$MONGO_URI" --out /backup
```

### Restore Cosmos DB
```bash
docker exec pr-sentinel-mongo mongorestore --uri "$MONGO_URI" /backup
```

---

## Zero-Downtime Deployments

### Using Deployment Slots
```bash
# Create staging slot
az webapp deployment slot create --name pr-sentinel-api --resource-group $RESOURCE_GROUP --slot staging

# Deploy to staging
az webapp deployment container config --name pr-sentinel-api --slot staging --enable-cd true

# Test staging
curl https://pr-sentinel-api-staging.azurewebsites.net/health/live

# Swap to production
az webapp deployment slot swap --name pr-sentinel-api --resource-group $RESOURCE_GROUP --slot staging
```

---

## CI/CD Integration

### GitHub Actions Example
```yaml
# .github/workflows/deploy.yml
name: Deploy to Azure

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Validate
        run: make validate
      
      - name: Build Docker image
        run: docker build -t ${{ secrets.ACR_NAME }}.azurecr.io/pr-sentinel-backend:${{ github.sha }} ./backend
      
      - name: Push to ACR
        run: |
          az login --service-principal -u ${{ secrets.AZURE_CLIENT_ID }} -p ${{ secrets.AZURE_CLIENT_SECRET }} --tenant ${{ secrets.AZURE_TENANT_ID }}
          az acr login --name ${{ secrets.ACR_NAME }}
          docker push ${{ secrets.ACR_NAME }}.azurecr.io/pr-sentinel-backend:${{ github.sha }}
      
      - name: Deploy to App Service
        run: |
          az webapp deployment container config --name pr-sentinel-api --resource-group pr-sentinel-rg --enable-cd true
```

---

## Troubleshooting

### Backend won't start
- Check logs: `az webapp log tail --name pr-sentinel-api --resource-group $RESOURCE_GROUP`
- Verify all required env vars set in App Service
- Test locally: `make dev`

### Extension can't reach backend
- Check CORS settings in backend (should include extension origin)
- Verify JWT token not expired
- Check network connectivity from extension to backend

### TTL cleanup not working
- Verify MongoDB TTL index created: `db.jobs.getIndexes()`
- Check that documents have `createdAt` field
- Verify MongoDB version supports TTL (3.0+)

### Database connection timeout
- Check Cosmos DB firewall rules
- Verify connection string includes credentials
- Test connection: `mongosh "$MONGO_URI"`

---

## Cost Optimization

- Use **Cosmos DB Serverless** for dev/staging (pay-per-request)
- Use **App Service B1** for prototype (lowest tier)
- Monitor resource usage via Azure Monitor
- Use **Azure for Students** credits ($100/month)
- Consider **ACI** for low-traffic scenarios (cheaper than App Service)

---

## Azure for Students Resources

- **$100 monthly credit**: https://azure.microsoft.com/en-us/free/students/
- **Pricing calculator**: https://azure.microsoft.com/en-us/pricing/calculator/
- **Cosmos DB pricing**: https://docs.microsoft.com/en-us/azure/cosmos-db/pricing/

---

## Support and Resources

- [Azure CLI Reference](https://learn.microsoft.com/en-us/cli/azure/)
- [App Service Documentation](https://learn.microsoft.com/en-us/azure/app-service/)
- [Cosmos DB Documentation](https://learn.microsoft.com/en-us/azure/cosmos-db/)
- [Key Vault Documentation](https://learn.microsoft.com/en-us/azure/key-vault/)
