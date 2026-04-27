# Marketplace Search & Availability Calendar - Implementation Guide

## Overview

This guide covers two key features:
1. **Marketplace Search with Filters** - Search and filter freelancers
2. **Freelancer Availability Calendar** - Manage date-specific availability

---

## 1. Marketplace Search with Filters

### Endpoint
```
GET /api/marketplace
```

### Features
- ✅ **No authentication required** - Public endpoint
- ✅ **Multiple filters** - Combine filters for precise results
- ✅ **Redis caching** - 3-minute cache for fast responses
- ✅ **Performance** - Returns results within 3 seconds
- ✅ **Limit** - Maximum 50 results per query

### Query Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `keyword` | string | Search in name, title, or bio | `?keyword=developer` |
| `skill_id` | integer | Filter by specific skill ID | `?skill_id=5` |
| `min_rate` | float | Minimum hourly rate (ETB) | `?min_rate=10` |
| `max_rate` | float | Maximum hourly rate (ETB) | `?max_rate=50` |
| `min_rating` | float | Minimum average rating (1-5) | `?min_rating=4.0` |
| `verified` | boolean | Only verified freelancers | `?verified=true` |
| `location` | string | Ethiopian city/region | `?location=Addis` |

### Response Format

```json
[
  {
    "id": 15,
    "full_name": "John Doe",
    "is_verified": 1,
    "title": "Full Stack Developer",
    "hourly_rate": 25.00,
    "avg_rating": 4.8,
    "reputation_level": "Gold",
    "completion_rate": 95.5,
    "response_rate": 98.2,
    "avg_response_time_hrs": 2.5,
    "location": "Addis Ababa",
    "top_skills": "JavaScript,React,Node.js,MongoDB",
    "response_time_label": "Responds in ~3h"
  }
]
```

### Example Requests

#### Basic Search
```bash
curl http://localhost:3000/api/marketplace
```

#### Search by Keyword
```bash
curl "http://localhost:3000/api/marketplace?keyword=developer"
```

#### Price Range Filter
```bash
curl "http://localhost:3000/api/marketplace?min_rate=15&max_rate=40"
```

#### High-Rated Verified Freelancers
```bash
curl "http://localhost:3000/api/marketplace?min_rating=4.5&verified=true"
```

#### Location-Based Search
```bash
curl "http://localhost:3000/api/marketplace?location=Addis%20Ababa"
```

#### Combined Filters
```bash
curl "http://localhost:3000/api/marketplace?keyword=designer&min_rate=20&min_rating=4.0&verified=true&location=Addis"
```

### Implementation Details

**File:** `src/routes/marketplace.js`

**Key Features:**
- SQL query builder with dynamic WHERE clauses
- GROUP_CONCAT for aggregating skills
- Redis caching with 180-second TTL
- Response time label generation
- Excludes banned/suspended users

**Caching Strategy:**
- Cache key includes all query parameters
- 3-minute TTL ensures fresh results
- Graceful fallback if Redis is unavailable

---

## 2. Freelancer Availability Calendar

### Endpoints

#### Set/Update Availability
```
PUT /api/users/:id/availability
```

#### Get Availability
```
GET /api/users/:id/availability
```

### Features
- ✅ **Batch updates** - Set multiple dates at once
- ✅ **Upsert logic** - Updates existing dates, inserts new ones
- ✅ **Date range queries** - Filter by start/end date
- ✅ **Authentication required** - Freelancers only
- ✅ **Unique constraint** - One entry per freelancer per date

### Set/Update Availability

**Method:** `PUT /api/users/:id/availability`

**Authentication:** Required (JWT token)

**Authorization:** User must be the owner and have freelancer role

**Request Body:**
```json
{
  "dates": [
    { "date": "2026-05-01", "is_available": true },
    { "date": "2026-05-02", "is_available": true },
    { "date": "2026-05-03", "is_available": false },
    { "date": "2026-05-04", "is_available": true }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "updated": 4
}
```

**Validation:**
- Date format must be `YYYY-MM-DD`
- `dates` must be a non-empty array
- User must be authenticated as freelancer
- User must own the profile

**Error Responses:**

```json
// 403 - Not authorized
{ "error": "FORBIDDEN" }

// 403 - Not a freelancer
{ "error": "FREELANCER_ONLY" }

// 422 - Invalid date format
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid date format. Use YYYY-MM-DD"
}

// 422 - Missing dates array
{
  "error": "VALIDATION_ERROR",
  "message": "dates array required"
}
```

### Get Availability

**Method:** `GET /api/users/:id/availability`

**Authentication:** Not required (public)

**Query Parameters:**

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `start_date` | string | Filter from date (YYYY-MM-DD) | `?start_date=2026-05-01` |
| `end_date` | string | Filter to date (YYYY-MM-DD) | `?end_date=2026-05-31` |

**Response:**
```json
[
  { "date": "2026-05-01", "is_available": 1 },
  { "date": "2026-05-02", "is_available": 1 },
  { "date": "2026-05-03", "is_available": 0 },
  { "date": "2026-05-04", "is_available": 1 }
]
```

### Example Requests

#### Set Availability for Multiple Dates
```bash
curl -X PUT http://localhost:3000/api/users/15/availability \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dates": [
      { "date": "2026-05-01", "is_available": true },
      { "date": "2026-05-02", "is_available": false }
    ]
  }'
```

#### Get All Availability
```bash
curl http://localhost:3000/api/users/15/availability
```

#### Get Availability for Date Range
```bash
curl "http://localhost:3000/api/users/15/availability?start_date=2026-05-01&end_date=2026-05-31"
```

#### Update Existing Date
```bash
curl -X PUT http://localhost:3000/api/users/15/availability \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dates": [
      { "date": "2026-05-01", "is_available": false }
    ]
  }'
```

### Implementation Details

**File:** `src/routes/users.js`

**Database Schema:**
```sql
CREATE TABLE availability_calendar (
    id INT PRIMARY KEY AUTO_INCREMENT,
    freelancer_id INT NOT NULL,
    date DATE NOT NULL,
    is_available TINYINT(1) DEFAULT 1,
    UNIQUE KEY unique_freelancer_date (freelancer_id, date),
    CONSTRAINT fk_ac_freelancer FOREIGN KEY (freelancer_id) 
        REFERENCES users(id) ON DELETE CASCADE
);
```

**Key Features:**
- Uses `INSERT ... ON DUPLICATE KEY UPDATE` for upsert logic
- Unique constraint prevents duplicate entries
- Batch insert for performance
- Date range filtering with optional start/end dates
- Cascade delete when user is deleted

---

## Testing

### Prerequisites
1. MySQL database running
2. Server running on port 3000
3. At least one freelancer account created

### Run Automated Tests

```bash
# Test marketplace search only
node test-marketplace-availability.js

# Test with authentication (for availability calendar)
TOKEN=your_jwt_token USER_ID=15 node test-marketplace-availability.js
```

### Manual Testing

#### 1. Test Marketplace Search

```bash
# Basic search
curl http://localhost:3000/api/marketplace

# With filters
curl "http://localhost:3000/api/marketplace?min_rate=20&verified=true"
```

#### 2. Test Availability Calendar

First, get a JWT token by logging in:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "freelancer@example.com", "password": "password123"}'
```

Then use the token:
```bash
# Set availability
curl -X PUT http://localhost:3000/api/users/15/availability \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dates": [{"date": "2026-05-01", "is_available": true}]}'

# Get availability
curl http://localhost:3000/api/users/15/availability
```

---

## Database Migration

To add the unique constraint to the availability_calendar table:

```bash
npm run migrate
```

Or manually run:
```sql
ALTER TABLE availability_calendar 
ADD UNIQUE KEY unique_freelancer_date (freelancer_id, date);
```

---

## Performance Considerations

### Marketplace Search
- **Caching:** 3-minute Redis cache reduces database load
- **Indexing:** Ensure indexes on:
  - `users.role`
  - `users.is_banned`
  - `users.is_suspended`
  - `freelancer_profiles.hourly_rate`
  - `freelancer_profiles.avg_rating`
  - `freelancer_skills.freelancer_id`
  - `freelancer_skills.skill_id`

### Availability Calendar
- **Batch Operations:** Use batch inserts for multiple dates
- **Unique Constraint:** Prevents duplicate entries and enables upsert
- **Indexing:** Ensure indexes on:
  - `availability_calendar.freelancer_id`
  - `availability_calendar.date`
  - Composite index on `(freelancer_id, date)` (created by unique constraint)

---

## Frontend Integration Examples

### Marketplace Search Component

```javascript
// Fetch freelancers with filters
async function searchFreelancers(filters) {
  const params = new URLSearchParams();
  
  if (filters.keyword) params.append('keyword', filters.keyword);
  if (filters.minRate) params.append('min_rate', filters.minRate);
  if (filters.maxRate) params.append('max_rate', filters.maxRate);
  if (filters.minRating) params.append('min_rating', filters.minRating);
  if (filters.verified) params.append('verified', 'true');
  if (filters.location) params.append('location', filters.location);
  if (filters.skillId) params.append('skill_id', filters.skillId);
  
  const response = await fetch(`/api/marketplace?${params}`);
  return await response.json();
}

// Usage
const freelancers = await searchFreelancers({
  keyword: 'developer',
  minRate: 20,
  minRating: 4.0,
  verified: true
});
```

### Availability Calendar Component

```javascript
// Set availability for a month
async function setMonthAvailability(userId, year, month, availableDates) {
  const dates = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    dates.push({
      date,
      is_available: availableDates.includes(day)
    });
  }
  
  const response = await fetch(`/api/users/${userId}/availability`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ dates })
  });
  
  return await response.json();
}

// Get availability for display
async function getAvailability(userId, startDate, endDate) {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate
  });
  
  const response = await fetch(`/api/users/${userId}/availability?${params}`);
  return await response.json();
}

// Usage
await setMonthAvailability(15, 2026, 5, [1, 2, 4, 5, 8, 9]); // Available on these days
const availability = await getAvailability(15, '2026-05-01', '2026-05-31');
```

---

## Requirements Mapping

### Marketplace Search
- ✅ **Requirement 8.3:** Marketplace search with filters
- ✅ **Requirement 8.4:** Return results within 3 seconds
- ✅ **Requirement 15.3:** Price range filter
- ✅ **Requirement 15.4:** Location filter

### Availability Calendar
- ✅ **Requirement 2.7:** Freelancer availability calendar
- ✅ **Requirement 4.7:** Availability calendar endpoint

---

## Troubleshooting

### Marketplace Search Issues

**Problem:** No results returned
- Check if freelancers exist in database
- Verify filters aren't too restrictive
- Check if Redis is causing issues (disable temporarily)

**Problem:** Slow response times
- Check database indexes
- Verify Redis is running
- Check if query is too complex

### Availability Calendar Issues

**Problem:** 403 FORBIDDEN error
- Verify JWT token is valid
- Check user ID matches token
- Ensure user has freelancer role

**Problem:** Duplicate key error
- Run migration to add unique constraint
- Check if trying to insert same date twice

**Problem:** Invalid date format error
- Ensure date format is `YYYY-MM-DD`
- Check for leading zeros in month/day

---

## Next Steps

1. **Add to Frontend:**
   - Build marketplace search UI with filter controls
   - Create availability calendar widget for freelancer profiles
   - Add date picker for clients to check availability

2. **Enhancements:**
   - Add availability status to marketplace search results
   - Implement recurring availability patterns (e.g., "available every Monday")
   - Add notification when client tries to book unavailable date

3. **Testing:**
   - Add property-based tests for filter combinations
   - Test edge cases (leap years, timezone handling)
   - Load testing for marketplace search

---

## Summary

Both features are now fully implemented and ready for use:

✅ **Marketplace Search** - Fully functional with 7 filter types, caching, and fast response times

✅ **Availability Calendar** - Complete CRUD operations with batch updates and date range queries

The implementation follows the spec requirements and includes proper error handling, validation, and performance optimizations.
