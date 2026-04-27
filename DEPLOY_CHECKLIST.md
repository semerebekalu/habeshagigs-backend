# 🚀 Railway Deployment Checklist

## Pre-Deployment

- [x] Code implemented and verified locally
- [x] Migration file created (`032_availability_calendar_unique.sql`)
- [x] Documentation complete
- [x] Test scripts created

## Deployment Steps

### 1. Push to Repository
```bash
git add .
git commit -m "Add marketplace filters and availability calendar"
git push origin main
```

### 2. Wait for Railway Auto-Deploy
- Go to Railway Dashboard
- Watch deployment progress
- Wait for "Success" status

### 3. Run Migration
Choose one method:

**Method A: Railway CLI (Recommended)**
```bash
railway run npm run migrate
```

**Method B: Railway Dashboard**
1. Go to your service → Settings → Deploy
2. Run one-time command: `npm run migrate`

**Method C: Direct SQL**
```bash
railway connect
```
Then run:
```sql
ALTER TABLE availability_calendar 
ADD UNIQUE KEY unique_freelancer_date (freelancer_id, date);
```

### 4. Verify Deployment
```bash
# Test marketplace search
curl https://habeshagigs.up.railway.app/api/marketplace

# Should return JSON with freelancer data
```

### 5. Run Tests
```bash
node test-railway.js
```

## Post-Deployment Verification

### ✅ Checklist

- [ ] Railway deployment shows "Success"
- [ ] No errors in Railway logs (`railway logs`)
- [ ] Migration completed successfully
- [ ] Marketplace search returns data
- [ ] Availability endpoints respond (test with auth)
- [ ] Database has unique constraint

### Quick Tests

```bash
# 1. Marketplace search works
curl https://habeshagigs.up.railway.app/api/marketplace

# 2. With filters
curl "https://habeshagigs.up.railway.app/api/marketplace?min_rate=20&verified=true"

# 3. Availability endpoint exists (will need auth)
curl https://habeshagigs.up.railway.app/api/users/1/availability
```

## Troubleshooting

### Deployment Failed
```bash
railway logs
```
Look for errors and fix them.

### Migration Failed
**Error: "Duplicate key name"**
- Constraint already exists, skip this step

**Error: "Table doesn't exist"**
- Run all migrations: `railway run npm run migrate`

### 500 Errors
1. Check Railway logs
2. Verify database connection
3. Check environment variables

## Success Indicators

✅ Railway deployment status: Success  
✅ Logs show: "✅ Startup schema checks complete"  
✅ Marketplace search returns JSON  
✅ No 500 errors in logs  
✅ Migration completed  

## Next Steps

1. **Test with Frontend**
   - Update marketplace page to use filters
   - Add availability calendar widget

2. **Monitor**
   - Watch Railway logs for errors
   - Check performance metrics
   - Monitor database queries

3. **Iterate**
   - Gather user feedback
   - Add more features
   - Optimize performance

---

## Quick Commands Reference

```bash
# View logs
railway logs

# Run migration
railway run npm run migrate

# Test endpoints
node test-railway.js

# Connect to database
railway connect

# SSH into container
railway shell
```

---

## Files Changed in This Deployment

- ✅ `src/routes/users.js` - Added availability endpoints
- ✅ `src/migrations/032_availability_calendar_unique.sql` - New migration
- ✅ `test-railway.js` - Railway test script
- ✅ Documentation files

---

## Support

If you encounter issues:
1. Check Railway logs: `railway logs`
2. Review RAILWAY_DEPLOYMENT.md
3. Run verification: `node test-endpoints-simple.js`
4. Test on Railway: `node test-railway.js`
