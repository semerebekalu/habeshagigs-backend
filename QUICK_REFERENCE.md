# Quick Reference: Marketplace Search & Availability Calendar

## Marketplace Search

### Endpoint
```
GET /api/marketplace
```

### Filters
| Filter | Example |
|--------|---------|
| Keyword | `?keyword=developer` |
| Skill | `?skill_id=5` |
| Price Min | `?min_rate=20` |
| Price Max | `?max_rate=50` |
| Rating | `?min_rating=4.0` |
| Verified | `?verified=true` |
| Location | `?location=Addis` |

### Example
```bash
curl "http://localhost:3000/api/marketplace?keyword=dev&min_rate=20&verified=true"
```

---

## Availability Calendar

### Set Availability
```bash
PUT /api/users/:id/availability
Authorization: Bearer TOKEN

{
  "dates": [
    { "date": "2026-05-01", "is_available": true },
    { "date": "2026-05-02", "is_available": false }
  ]
}
```

### Get Availability
```bash
GET /api/users/:id/availability?start_date=2026-05-01&end_date=2026-05-31
```

---

## Testing

```bash
# Run all tests
node test-marketplace-availability.js

# With authentication
TOKEN=your_token USER_ID=15 node test-marketplace-availability.js
```

---

## Migration

```bash
npm run migrate
```

---

## Files Changed

- ✅ `src/routes/users.js` - Added availability endpoints
- ✅ `src/migrations/032_availability_calendar_unique.sql` - New migration
- ✅ `test-marketplace-availability.js` - Test suite
- ✅ Documentation files

---

## Status

✅ Marketplace Search - Working  
✅ Availability Calendar - Implemented  
✅ Tests - Created  
✅ Documentation - Complete
