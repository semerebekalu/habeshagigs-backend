# Requirements Document: Real-Time Notifications Dashboard

## Introduction

The Real-Time Notifications Dashboard is a comprehensive notification system for the Ethio Gigs freelance marketplace platform. It provides users with a centralized interface to view, manage, and configure notifications across multiple categories (Jobs, Payments, Messages, System, Admin). The system leverages existing Socket.io infrastructure for real-time updates and integrates with the current notifications database schema.

This feature enhances user engagement by delivering instant notifications with visual and audio feedback, supports bilingual UI (English/Amharic), and provides granular control over notification preferences. The dashboard is accessible from a navbar bell icon and supports mobile-responsive design from 320px to 1280px+ screen widths.

## Glossary

- **Notification_Center**: The UI component (dropdown or modal) that displays all user notifications in a centralized interface
- **Notification_Dashboard**: The main notification management interface with filtering, preferences, and history
- **Socket_Server**: The Socket.io server handling real-time bidirectional communication for instant notification delivery
- **Notification_Category**: Classification of notifications into types: jobs, payments, messages, system, admin
- **Desktop_Notification**: Browser-based notification displayed outside the application window using the Notifications API
- **Badge_Counter**: Visual indicator on the bell icon showing the count of unread notifications (max display: 99+)
- **Notification_Preferences**: User-configurable settings controlling which notification categories are enabled and delivery methods
- **Notification_Sound**: Audio feedback played when a new notification arrives (if enabled by user)
- **Infinite_Scroll**: Pagination technique that automatically loads more notifications when user scrolls to bottom
- **Read_Status**: Boolean indicator showing whether a notification has been viewed by the user
- **Notification_Parser**: Component that validates and transforms notification payloads into structured Notification objects
- **Pretty_Printer**: Component that formats Notification objects back into valid JSON payloads
- **Round_Trip_Property**: Correctness property ensuring parse(print(x)) equals x for all valid notifications

---

## Requirements

### Requirement 1: Notification Center UI Component

**User Story:** As a user, I want to access all my notifications from a centralized interface, so that I can stay informed about platform activities without navigating to multiple pages.

#### Acceptance Criteria

1. WHEN a user clicks the notification bell icon in the navigation bar, THE Notification_Center SHALL display a dropdown or modal interface within 300 milliseconds
2. THE Notification_Center SHALL display notifications in reverse chronological order with newest notifications first
3. THE Notification_Center SHALL show notification title, message preview (first 80 characters), timestamp, and read status for each notification
4. THE Notification_Center SHALL display an unread Badge_Counter on the bell icon showing the count of unread notifications
5. WHEN the unread count exceeds 99, THE Badge_Counter SHALL display "99+" instead of the exact number
6. THE Notification_Center SHALL support both English and Amharic languages based on user preference from the i18n system
7. THE Notification_Center SHALL be responsive and functional on screen sizes from 320px to 1280px+
8. WHEN a user clicks outside the Notification_Center, THE Notification_Center SHALL close the dropdown or modal

### Requirement 2: Notification Click Navigation

**User Story:** As a user, I want to navigate to relevant pages when I click a notification, so that I can quickly access the content related to the notification.

#### Acceptance Criteria

1. WHEN a user clicks on a notification, THE Notification_Center SHALL mark it as read within 200 milliseconds
2. WHEN a user clicks on a notification, THE Notification_Center SHALL navigate to the relevant page based on event_type
3. WHEN event_type is "contract_signed", THE Notification_Center SHALL navigate to contract.html with the contract ID
4. WHEN event_type is "payment_released", THE Notification_Center SHALL navigate to dashboard.html wallet section
5. WHEN event_type is "proposal_accepted", THE Notification_Center SHALL navigate to dashboard.html contracts section
6. WHEN event_type is "work_submitted", THE Notification_Center SHALL navigate to dashboard.html deliveries section
7. WHEN event_type is "dispute_raised", THE Notification_Center SHALL navigate to dashboard.html disputes section
8. WHEN a notification is marked as read, THE Notification_Center SHALL update the Badge_Counter in real-time

### Requirement 3: Individual Notification Management

**User Story:** As a user, I want to manage individual notifications, so that I can control which notifications I've reviewed.

#### Acceptance Criteria

1. THE Notification_Center SHALL display a "mark as read" button for each unread notification
2. WHEN a user clicks "mark as read" on an unread notification, THE Notification_Center SHALL update the is_read column to 1 within 200 milliseconds
3. THE Notification_Center SHALL display a "mark as unread" button for each read notification
4. WHEN a user clicks "mark as unread" on a read notification, THE Notification_Center SHALL update the is_read column to 0 within 200 milliseconds
5. WHEN a notification status changes, THE Notification_Center SHALL update the Badge_Counter without page refresh
6. THE Notification_Center SHALL emit a Socket.io event when notification status changes to update other connected sessions

### Requirement 4: Bulk Notification Management

**User Story:** As a user, I want to manage all notifications at once, so that I can quickly clear or mark multiple notifications without individual actions.

#### Acceptance Criteria

1. THE Notification_Center SHALL display a "Mark all as read" button at the top of the notification list
2. WHEN a user clicks "Mark all as read", THE Notification_Center SHALL update all unread notifications to read status within 1 second
3. THE Notification_Center SHALL display a "Clear all" button at the top of the notification list
4. WHEN a user clicks "Clear all", THE Notification_Center SHALL display a confirmation dialog with "Cancel" and "Confirm" buttons
5. WHEN a user confirms "Clear all", THE Notification_Center SHALL delete all notifications for the current user from the database within 1 second
6. WHEN notifications are cleared, THE Notification_Center SHALL update the Badge_Counter to 0
7. THE Notification_Center SHALL display "No notifications" message when the notification list is empty

### Requirement 5: Category Filtering

**User Story:** As a user, I want to filter notifications by category, so that I can focus on specific types of notifications that matter most to me.

#### Acceptance Criteria

1. THE Notification_Center SHALL provide category filter buttons for: All, Jobs, Payments, Messages, System, and Admin
2. WHEN a user selects a category filter, THE Notification_Center SHALL display only notifications matching that event_type within 300 milliseconds
3. THE Notification_Center SHALL show the count of notifications for each category next to the filter button
4. WHEN no notifications exist for a selected category, THE Notification_Center SHALL display "No notifications in this category"
5. THE Notification_Center SHALL persist the selected filter in sessionStorage during the user session
6. WHERE the user role is not admin, THE Notification_Center SHALL hide the Admin category filter button
7. WHEN the page loads, THE Notification_Center SHALL restore the previously selected filter from sessionStorage

### Requirement 6: Real-Time Notification Delivery

**User Story:** As a user, I want to receive notifications in real-time, so that I don't miss important events while using the platform.

#### Acceptance Criteria

1. WHEN a new notification is created for a user, THE Socket_Server SHALL emit a "notification:new" event to the user's socket room within 500 milliseconds
2. WHEN a user receives a "notification:new" event, THE Notification_Center SHALL add the notification to the list without page refresh
3. WHEN a new notification arrives, THE Notification_Center SHALL increment the Badge_Counter in real-time
4. WHEN a new notification arrives, THE Notification_Center SHALL display the notification at the top of the list
5. THE Notification_Center SHALL animate the new notification entry with a fade-in effect
6. THE Socket_Server SHALL maintain persistent connections for authenticated users using Socket.io rooms named "user:{userId}"

### Requirement 7: Socket Connection Management

**User Story:** As a user, I want the notification system to handle connection issues gracefully, so that I don't lose notifications when my internet connection is unstable.

#### Acceptance Criteria

1. WHEN a user's socket connection is lost, THE Socket_Server SHALL attempt to reconnect automatically within 5 seconds
2. WHEN the socket reconnects, THE Notification_Center SHALL fetch any missed notifications from the server
3. THE Notification_Center SHALL display a connection status indicator showing "Connected", "Reconnecting", or "Disconnected"
4. WHEN the connection status is "Disconnected" for more than 30 seconds, THE Notification_Center SHALL display a warning message
5. THE Socket_Server SHALL authenticate socket connections using JWT tokens from the user session
6. WHEN authentication fails, THE Socket_Server SHALL disconnect the socket and log the authentication error

### Requirement 8: Notification Sound Feedback

**User Story:** As a user, I want to hear a sound when new notifications arrive, so that I'm alerted even when not looking at the screen.

#### Acceptance Criteria

1. WHEN a new notification arrives, THE Notification_Center SHALL play a notification sound IF the user has sound enabled in preferences
2. THE Notification_Center SHALL use a subtle, non-intrusive sound file (duration < 1 second)
3. THE Notification_Center SHALL not play sound for notifications older than 10 seconds (to avoid sound spam on page load)
4. THE Notification_Center SHALL respect browser autoplay policies and handle blocked audio gracefully
5. WHEN sound playback fails, THE Notification_Center SHALL log the error but continue displaying the notification
6. THE Notification_Center SHALL store the sound file in public/sounds/notification.mp3

### Requirement 9: Desktop Notification Integration

**User Story:** As a user, I want to receive desktop notifications, so that I'm alerted about important events even when the browser tab is not active.

#### Acceptance Criteria

1. WHEN a new notification arrives, THE Notification_Center SHALL display a Desktop_Notification IF the user has enabled desktop notifications in preferences
2. WHEN desktop notifications are enabled but permission not granted, THE Notification_Center SHALL request browser notification permission
3. THE Desktop_Notification SHALL display the notification title and message preview (first 80 characters)
4. THE Desktop_Notification SHALL include the Ethio Gigs logo as the notification icon
5. WHEN a user clicks a Desktop_Notification, THE Notification_Center SHALL focus the browser window and navigate to the relevant page
6. THE Notification_Center SHALL not display desktop notifications when the browser tab is active and focused
7. WHEN browser notification permission is denied, THE Notification_Center SHALL disable the desktop notification toggle in preferences

### Requirement 10: Notification Preferences Panel

**User Story:** As a user, I want to control which types of notifications I receive, so that I'm not overwhelmed by notifications I don't care about.

#### Acceptance Criteria

1. THE Notification_Dashboard SHALL provide a preferences panel accessible from a settings icon in the Notification_Center header
2. THE Notification_Dashboard SHALL display toggle switches for each notification category: Jobs, Payments, Messages, System, Admin
3. WHEN a user toggles a category, THE Notification_Dashboard SHALL update the notification_preferences table within 500 milliseconds
4. THE Notification_Dashboard SHALL update both in_app_enabled and email_enabled columns based on the toggle state
5. THE Notification_Dashboard SHALL provide a separate toggle for notification sound (stored in user preferences or localStorage)
6. THE Notification_Dashboard SHALL provide a separate toggle for desktop notifications (stored in user preferences or localStorage)
7. THE Notification_Dashboard SHALL save all preference changes immediately without requiring a save button
8. THE Notification_Dashboard SHALL display the current state of all preferences when opened
9. WHERE the user role is not admin, THE Notification_Dashboard SHALL hide the Admin category toggle

### Requirement 11: Notification History with Infinite Scroll

**User Story:** As a user, I want to view my notification history with pagination, so that I can review past notifications without performance issues.

#### Acceptance Criteria

1. THE Notification_Center SHALL initially load the 20 most recent notifications ordered by created_at DESC
2. WHEN a user scrolls to within 100 pixels of the bottom, THE Notification_Center SHALL load the next 20 notifications within 500 milliseconds
3. THE Notification_Center SHALL display a loading spinner while fetching additional notifications
4. WHEN no more notifications exist, THE Notification_Center SHALL display "No more notifications" at the bottom of the list
5. THE Notification_Center SHALL maintain scroll position after loading additional notifications
6. THE Notification_Center SHALL use offset-based pagination with query parameters: limit=20, offset={current_count}
7. THE Notification_Center SHALL cache loaded notifications in memory to avoid redundant API calls during the session

### Requirement 12: Notification Timestamp Display

**User Story:** As a user, I want to see when notifications were created, so that I can understand the timeline of events.

#### Acceptance Criteria

1. THE Notification_Center SHALL display relative timestamps for notifications less than 24 hours old (e.g., "5 minutes ago", "2 hours ago")
2. THE Notification_Center SHALL display absolute timestamps for notifications older than 24 hours (e.g., "Jan 15, 2025")
3. THE Notification_Center SHALL update relative timestamps every minute without page refresh
4. THE Notification_Center SHALL support bilingual timestamp formatting (English/Amharic) based on user language preference
5. WHEN a user hovers over a timestamp, THE Notification_Center SHALL display a tooltip with the full date and time

### Requirement 13: Notification API Endpoints

**User Story:** As a developer, I want RESTful API endpoints for notification management, so that the frontend can interact with the notification system.

#### Acceptance Criteria

1. THE Notification_Dashboard SHALL provide GET /api/notifications endpoint to fetch notifications with pagination
2. THE GET /api/notifications endpoint SHALL accept query parameters: limit, offset, category, is_read
3. THE Notification_Dashboard SHALL provide PATCH /api/notifications/:id/read endpoint to mark a notification as read
4. THE Notification_Dashboard SHALL provide PATCH /api/notifications/:id/unread endpoint to mark a notification as unread
5. THE Notification_Dashboard SHALL provide PATCH /api/notifications/mark-all-read endpoint to mark all notifications as read
6. THE Notification_Dashboard SHALL provide DELETE /api/notifications/clear-all endpoint to delete all notifications
7. THE Notification_Dashboard SHALL provide GET /api/notifications/unread-count endpoint to fetch the unread count
8. THE Notification_Dashboard SHALL provide GET /api/notifications/preferences endpoint to fetch user preferences
9. THE Notification_Dashboard SHALL provide PUT /api/notifications/preferences endpoint to update user preferences
10. ALL notification endpoints SHALL require authentication using the existing auth middleware
11. ALL notification endpoints SHALL return responses within 300 milliseconds (95th percentile)

### Requirement 14: Performance Optimization

**User Story:** As a user, I want the notification system to be fast and responsive, so that I can interact with notifications without delays.

#### Acceptance Criteria

1. THE Notification_Center SHALL load initial content within 2 seconds on 3G network connections
2. THE Notification_Center SHALL cache the unread count in Redis with a TTL of 60 seconds
3. THE Notification_Center SHALL use database indexes on notifications table columns: user_id, is_read, created_at, event_type
4. THE Notification_Center SHALL limit notification queries to the last 90 days to improve performance
5. THE Notification_Center SHALL compress notification payloads using gzip for API responses
6. THE Notification_Center SHALL debounce scroll events for infinite scroll to prevent excessive API calls
7. THE Notification_Center SHALL use CSS animations instead of JavaScript animations for better performance

### Requirement 15: Accessibility Compliance

**User Story:** As a user with disabilities, I want the notification system to be accessible, so that I can use it with assistive technologies.

#### Acceptance Criteria

1. THE Notification_Center SHALL be navigable using keyboard only with Tab, Enter, Escape, and Arrow keys
2. THE Notification_Center SHALL provide ARIA labels for all interactive elements (buttons, links, toggles)
3. THE Notification_Center SHALL use semantic HTML elements (nav, button, ul, li) for proper structure
4. THE Notification_Center SHALL maintain color contrast ratio of at least 4.5:1 for text (WCAG 2.1 AA)
5. THE Notification_Center SHALL announce new notifications to screen readers using aria-live regions
6. THE Notification_Center SHALL provide focus indicators for all interactive elements
7. THE Notification_Center SHALL support screen reader navigation with proper heading hierarchy (h1, h2, h3)
8. WHEN the Notification_Center opens, THE Notification_Center SHALL move keyboard focus to the first notification or "No notifications" message

### Requirement 16: Mobile Responsive Design

**User Story:** As a mobile user, I want the notification system to work well on my device, so that I can manage notifications on the go.

#### Acceptance Criteria

1. THE Notification_Center SHALL display as a full-screen modal on screen widths below 768px
2. THE Notification_Center SHALL display as a dropdown on screen widths 768px and above
3. THE Notification_Center SHALL use touch-friendly button sizes (minimum 44x44 pixels) on mobile devices
4. THE Notification_Center SHALL support swipe gestures to mark notifications as read on touch devices
5. THE Notification_Center SHALL optimize font sizes for readability on small screens (minimum 14px)
6. THE Notification_Center SHALL hide less important UI elements on mobile to maximize content space
7. THE Notification_Center SHALL use responsive CSS Grid or Flexbox for layout adaptation

### Requirement 17: Error Handling and Edge Cases

**User Story:** As a user, I want the notification system to handle errors gracefully, so that I'm informed when something goes wrong.

#### Acceptance Criteria

1. WHEN a notification API call fails, THE Notification_Center SHALL display an error message "Failed to load notifications. Please try again."
2. WHEN a notification API call fails, THE Notification_Center SHALL provide a "Retry" button
3. WHEN the Socket connection fails repeatedly, THE Notification_Center SHALL fall back to polling every 30 seconds
4. WHEN a notification payload is malformed, THE Notification_Center SHALL log the error and skip that notification
5. WHEN the user has no notifications, THE Notification_Center SHALL display "No notifications yet" with an illustration
6. WHEN a notification navigation fails, THE Notification_Center SHALL display an error toast and keep the notification unread
7. THE Notification_Center SHALL implement exponential backoff for failed API retries (1s, 2s, 4s, 8s, max 30s)

---

## Parser and Serializer Requirements

### Requirement 18: Notification Payload Parser

**User Story:** As a developer, I want to parse notification payloads consistently, so that notifications are displayed correctly across all channels.

#### Acceptance Criteria

1. WHEN a notification payload is received, THE Notification_Parser SHALL parse it into a Notification object with fields: id, user_id, event_type, title, message, is_read, created_at
2. WHEN an invalid notification payload is provided, THE Notification_Parser SHALL return a descriptive error with the invalid field name
3. THE Notification_Parser SHALL validate required fields: user_id, event_type, title, message
4. THE Notification_Parser SHALL validate event_type against allowed categories: jobs, payments, messages, system, admin
5. THE Notification_Parser SHALL validate user_id is a positive integer
6. THE Notification_Parser SHALL validate is_read is a boolean (0 or 1)
7. THE Notification_Parser SHALL validate created_at is a valid ISO 8601 datetime string

### Requirement 19: Notification Pretty Printer

**User Story:** As a developer, I want to format notification objects back into JSON, so that I can serialize notifications for API responses and Socket.io events.

#### Acceptance Criteria

1. THE Notification_Pretty_Printer SHALL format Notification objects into valid JSON payloads
2. THE Notification_Pretty_Printer SHALL include all required fields: id, user_id, event_type, title, message, is_read, created_at
3. THE Notification_Pretty_Printer SHALL format created_at as ISO 8601 datetime string
4. THE Notification_Pretty_Printer SHALL format is_read as boolean (true/false) instead of integer (0/1)
5. THE Notification_Pretty_Printer SHALL omit null or undefined fields from the output

### Requirement 20: Round-Trip Property for Notifications

**User Story:** As a developer, I want to ensure notification parsing and printing are inverses, so that no data is lost during serialization.

#### Acceptance Criteria

1. FOR ALL valid Notification objects, parsing then printing then parsing SHALL produce an equivalent object (round-trip property)
2. THE Notification_Parser SHALL handle both integer (0/1) and boolean (true/false) values for is_read
3. THE Notification_Pretty_Printer SHALL normalize is_read to boolean format
4. THE round-trip property SHALL be tested with property-based testing using at least 100 random notification objects
5. THE round-trip property SHALL hold for all valid event_type values: jobs, payments, messages, system, admin
6. THE round-trip property SHALL preserve timestamp precision to the second (no millisecond loss)

---

## Technical Requirements

### Browser Support
- Chrome (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Edge (latest 2 versions)

### Performance Targets
- Page load time: < 2 seconds
- Real-time update latency: < 500ms
- API response time: < 300ms (95th percentile)
- Socket.io connection establishment: < 1 second
- Notification rendering: < 100ms per notification

### Integration Points
- Existing notifications table (id, user_id, event_type, title, title_am, message, message_am, is_read, created_at)
- Existing notification_preferences table (user_id, event_type, in_app_enabled, email_enabled)
- Existing notificationService.js (enqueueNotification, setIo functions)
- Socket.io server for real-time updates (Socket rooms: "user:{userId}")
- Redis for caching unread counts and session data
- Existing i18n system (src/i18n/en.json, src/i18n/am.json)
- Existing auth middleware (src/middleware/auth.js)

### Database Schema Additions
No new tables required. The existing schema supports all requirements:
- notifications table: stores all notification data
- notification_preferences table: stores user preferences per category

### Success Metrics
- Notification engagement rate > 60% (percentage of notifications clicked)
- Real-time update success rate > 99% (percentage of notifications delivered via Socket.io)
- User satisfaction score > 4.5/5 (from user surveys)
- Average notification load time < 500ms
- Socket connection uptime > 99.5%

---

## Notes

- All features must support bilingual UI (English/Amharic) using the existing i18n system (src/i18n/en.json, src/i18n/am.json)
- Real-time features require Socket.io connection; graceful degradation to polling if WebSocket unavailable
- Desktop notifications require browser Notifications API permission
- Notification sound requires browser autoplay permission (may be blocked by default)
- The existing notificationService.js already handles notification creation and Socket.io emission
- The notification bell icon should be added to the existing navbar in all HTML pages
- Notification preferences are stored per event_type, not per category (categories are UI groupings)
- Event type to category mapping: 
  - Jobs: proposal_accepted, milestone_overdue, work_submitted
  - Payments: payment_released, withdrawal_approved, withdrawal_rejected, referral_reward
  - Messages: (future integration with messaging system)
  - System: kyc_approved, kyc_rejected, contract_signed, contract_completed
  - Admin: (admin-specific notifications)
- The system should handle notification cleanup (delete notifications older than 90 days) via a scheduled cron job
- Redis caching should be used for unread counts to reduce database load
- Database indexes should be added to optimize notification queries: INDEX idx_user_read (user_id, is_read), INDEX idx_user_created (user_id, created_at)
