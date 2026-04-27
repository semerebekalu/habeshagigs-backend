# 🚀 Railway Quick Start - Deploy in 5 Minutes

## What's New

✅ **Marketplace Search** - Enhanced with 7 filters  
✅ **Availability Calendar** - New feature for freelancers  

---

## Deploy Now (3 Steps)

### Step 1: Push Code (1 min)
```bash
git add .
git commit -m "Add marketplace filters and availability calendar"
git push origin main
```

Railway will auto-deploy. ✅

### Step 2: Run Migration (1 min)
```bash
railway run npm run migrate
```

This adds the unique constraint to `availability_calendar` table. ✅

### Step 3: Test (1 min)
```bash
node test-railway.js
```

Verify everything works. ✅

---

## That's It! 🎉

Your new features are live at:
**https://habeshagigs.up.railway.app**

---

## Quick Test

```bash
# Test marketplace search
curl https://habeshagigs.up.railway.app/api/marketplace

# Test with filters
curl "https://habeshagigs.up.railway.app/api/marketplace?keyword=developer&min_rate=20&verified=true"
```

---

## What You Can Do Now

### Marketplace Search (Public - No Auth)
```
GET /api/marketplace?keyword=dev&min_rate=20&max_rate=50&min_rating=4.0&verified=true&location=Addis
```

**7 Filters Available:**
- `keyword` - Search name, title, bio
- `skill_id` - Filter by skill
- `min_rate` / `max_rate` - Price range
- `min_rating` - Minimum rating
- `verified` - Only verified freelancers
- `location` - Ethiopian city/region

### Availability Calendar (Requires Auth)

**Set Availability:**
```bash
PUT /api/users/:id/availability
{
  "dates": [
    {"date": "2026-05-01", "is_available": true},
    {"date": "2026-05-02", "is_available": false}
  ]
}
```

**Get Availability:**
```bash
GET /api/users/:id/availability?start_date=2026-05-01&end_date=2026-05-31
```

---

## Need Help?

**Check deployment:**
```bash
railway logs
```

**Verify migration:**
```bash
railway connect
SHOW CREATE TABLE availability_calendar;
```

**Full documentation:**
- `RAILWAY_DEPLOYMENT.md` - Complete guide
- `DEPLOY_CHECKLIST.md` - Step-by-step checklist
- `MARKETPLACE_AVAILABILITY_GUIDE.md` - API reference

---

## Frontend Integration

### JavaScript Example

```javascript
// Search marketplace
const freelancers = await fetch(
  '/api/marketplace?keyword=developer&min_rate=20&verified=true'
).then(r => r.json());

// Set availability
await fetch(`/api/users/${userId}/availability`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    dates: [
      { date: '2026-05-01', is_available: true }
    ]
  })
});

// Get availability
const availability = await fetch(
  `/api/users/${userId}/availability?start_date=2026-05-01&end_date=2026-05-31`
).then(r => r.json());
```

---

## Success! ✅

Both features are now live on Railway and ready to use!
