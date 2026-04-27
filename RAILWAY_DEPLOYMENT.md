# Railway Deployment Guide - Marketplace Search & Availability Calendar

## Overview

You're deploying to Railway, which means you have a live MySQL database. Here's how to deploy and test the new features.

---

## 🚀 Deployment Steps

### Step 1: Push Code to Repository

```bash
git add .
git commit -m "Add marketplace search filters and availability calendar endpoints"
git push origin main
```

Railway will automatically deploy when you push to your connected branch.

### Step 2: Run Migration on Railway

You need to run the new migration to add the unique constraint to `availability_calendar`.

**Option A: Using Railway CLI**
```bash
railway run npm run migrate
```

**Option B: Using Railway Dashboard**
1. Go to your Railway project
2. Click on your service
3. Go to "Settings" → "Deploy"
4. Add a one-time command: `npm run migrate`

**Option C: SSH into Railway**
```bash
railway shell
npm run migrate
exit
```

**Option D: Manual SQL (if above don't work)**
1. Go to Railway Dashboard → Your MySQL service
2. Click "Connect" → "MySQL Client"
3. Run this SQL:
```sql
ALTER TABLE availability_calendar 
ADD UNIQUE KEY unique_freelancer_date (freelancer_id, date);
```

---

## 🧪 Testing on Railway

### Get Your Railway URL

Your app URL from .env: `https://habeshagigs.up.railway.app`

### Test Marketplace Search

```bash
# Basic search
curl https://habeshagigs.up.railway.app/api/marketplace

# With filters
curl "https://habeshagigs.up.railway.app/api/marketplace?keyword=developer&min_rate=20&verified=true"

# Price range
curl "https://habeshagigs.up.railway.app/api/marketplace?min_rate=15&max_rate=40"

# High-rated freelancers
curl "https://habeshagigs.up.railway.app/api/marketplace?min_rating=4.5&verified=true"

# Location search
curl "https://habeshagigs.up.railway.app/api/marketplace?location=Addis"
```

### Test Availability Calendar

**Step 1: Login to get JWT token**
```bash
curl -X POST https://habeshagigs.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "your@email.com", "password": "yourpassword"}'
```

Copy the `token` from the response.

**Step 2: Set availability**
```bash
curl -X PUT https://habeshagigs.up.railway.app/api/users/YOUR_USER_ID/availability \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dates": [
      {"date": "2026-05-01", "is_available": true},
      {"date": "2026-05-02", "is_available": true},
      {"date": "2026-05-03", "is_available": false}
    ]
  }'
```

**Step 3: Get availability**
```bash
# All dates
curl https://habeshagigs.up.railway.app/api/users/YOUR_USER_ID/availability

# Date range
curl "https://habeshagigs.up.railway.app/api/users/YOUR_USER_ID/availability?start_date=2026-05-01&end_date=2026-05-31"
```

---

## 🔧 Railway-Specific Test Script

I'll create a test script that uses your Railway URL:

```bash
# Set your Railway URL
export RAILWAY_URL=https://habeshagigs.up.railway.app

# Run tests
node test-railway.js
```

---

## 📊 Monitoring on Railway

### Check Deployment Status
1. Go to Railway Dashboard
2. Click on your service
3. Check "Deployments" tab
4. Look for the latest deployment

### View Logs
1. Railway Dashboard → Your service
2. Click "Logs" tab
3. Look for any errors during startup

### Check Database
1. Railway Dashboard → MySQL service
2. Click "Connect" → "MySQL Client"
3. Verify the unique constraint was added:
```sql
SHOW CREATE TABLE availability_calendar;
```

You should see:
```sql
UNIQUE KEY `unique_freelancer_date` (`freelancer_id`,`date`)
```

---

## 🐛 Troubleshooting

### Migration Fails
**Error:** "Duplicate key name 'unique_freelancer_date'"
**Solution:** The constraint already exists. Skip this migration.

### 500 Error on Availability Endpoint
**Possible causes:**
1. Migration not run (unique constraint missing)
2. Database connection issue
3. Check Railway logs for details

**Solution:**
```bash
railway logs
```

### CORS Issues
If testing from browser and getting CORS errors, the server already has CORS enabled in `server.js`.

---

## 📝 Quick Checklist

- [ ] Code pushed to repository
- [ ] Railway deployed successfully
- [ ] Migration run (unique constraint added)
- [ ] Marketplace search tested
- [ ] Availability calendar tested (with auth)
- [ ] No errors in Railway logs

---

## 🎯 What's New in This Deployment

### Marketplace Search Enhancements
- ✅ Already working, no changes needed
- ✅ All 7 filters functional
- ✅ Redis caching enabled

### Availability Calendar (NEW)
- ✅ `PUT /api/users/:id/availability` - Set/update availability
- ✅ `GET /api/users/:id/availability` - Get availability with date range
- ✅ Batch operations support
- ✅ Upsert logic (update or insert)
- ✅ Date validation (YYYY-MM-DD format)

### Database Changes
- ✅ New migration: `032_availability_calendar_unique.sql`
- ✅ Adds unique constraint to prevent duplicate dates

---

## 🚦 Deployment Verification

After deployment, verify everything works:

```bash
# 1. Check server is running
curl https://habeshagigs.up.railway.app/

# 2. Test marketplace search
curl https://habeshagigs.up.railway.app/api/marketplace

# 3. Check if you get JSON response (not HTML error page)
# If you get JSON with freelancer data, it's working!
```

---

## 💡 Pro Tips

1. **Use Railway CLI for faster testing:**
   ```bash
   railway link
   railway logs --follow
   ```

2. **Test locally with Railway database:**
   ```bash
   railway run npm start
   ```
   This connects to your Railway MySQL database locally.

3. **Quick migration check:**
   ```bash
   railway run node -e "require('./src/config/db').db.query('SHOW CREATE TABLE availability_calendar').then(r => console.log(r[0][0]))"
   ```

---

## 📞 Need Help?

If you encounter issues:
1. Check Railway logs: `railway logs`
2. Verify migration ran: Check database schema
3. Test endpoints with curl commands above
4. Check server.js has routes registered

---

## ✅ Success Indicators

You'll know it's working when:
- ✅ Marketplace search returns freelancer data
- ✅ Availability PUT returns `{"success": true, "updated": X}`
- ✅ Availability GET returns array of dates
- ✅ No 500 errors in Railway logs
- ✅ Database has unique constraint on availability_calendar

---

## Next Steps After Deployment

1. **Update Frontend:**
   - Add filter controls to marketplace page
   - Create availability calendar widget
   - Integrate with booking system

2. **Monitor Performance:**
   - Check Redis cache hit rate
   - Monitor API response times
   - Watch for any errors

3. **User Testing:**
   - Test marketplace search with real users
   - Get feedback on availability calendar UX
   - Iterate based on feedback
