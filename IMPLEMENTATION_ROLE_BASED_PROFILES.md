# Implementation: Role-Based Profile Sections

## Goal
Enhance the profile page to dynamically show different sections based on user role (freelancer, client, admin).

## Implementation Steps

### Step 1: Enhance Backend API ✅
**File:** `src/routes/users.js`

Add endpoint to get user's role context:
```javascript
GET /api/users/:id/role-context
```

Returns:
```json
{
  "role": "freelancer",
  "active_role": "freelancer",
  "can_switch": true,
  "available_roles": ["freelancer", "client"]
}
```

### Step 2: Create Role-Based UI Components
**File:** `public/js/profile-roles.js` (NEW)

Functions:
- `getRoleContext(userId)` - Fetch role information
- `renderFreelancerSections()` - Show freelancer-specific tabs
- `renderClientSections()` - Show client-specific tabs
- `renderAdminSections()` - Show admin-specific tabs
- `showRoleSwitcher()` - Display role switch button

### Step 3: Enhance Profile Page
**File:** `public/profile.html` (MODIFY)

Add:
- Role switcher button (for dual-role users)
- Client-specific tabs (Jobs, Hired, Spending)
- Admin-specific tabs (Stats, Management)
- Dynamic tab visibility based on role

### Step 4: Create Client Dashboard Components
**Files:** 
- `public/js/client-profile.js` (NEW)
- Client sections: Posted Jobs, Hired Freelancers, Spending

### Step 5: Create Admin Dashboard Components
**Files:**
- `public/js/admin-profile.js` (NEW)
- Admin sections: Platform Stats, User Management

## Let's Build!

Starting with Step 1...
