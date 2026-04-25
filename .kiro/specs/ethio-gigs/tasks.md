# Implementation Plan: Ethio Gigs (HibreWork)

## Overview

Implement the Ethio Gigs freelance marketplace platform as a Node.js/Express + MySQL + Socket.io application. Tasks are ordered to build foundational infrastructure first, then core features, then advanced modules. Each task builds on the previous and ends with full integration.

## Tasks

- [x] 1. Project structure, database schema, and core middleware
  - Create the full directory structure: `src/modules/`, `src/middleware/`, `src/utils/`, `src/config/`, `src/routes/`
  - Write `src/config/db.js` to initialize MySQL connection pool using environment variables
  - Write `src/config/redis.js` to initialize Redis client for caching and token revocation
  - Write all SQL migration files under `src/migrations/` to create every table defined in the data models: `users`, `freelancer_profiles`, `skills`, `freelancer_skills`, `portfolio_items`, `availability_calendar`, `jobs`, `job_skills`, `gigs`, `gig_packages`, `proposals`, `contracts`, `milestones`, `transactions`, `conversations`, `messages`, `notifications`, `notification_preferences`, `kyc_submissions`, `skill_badges`, `disputes`, `reviews`, `certifications`, `user_certifications`
  - Write `src/middleware/auth.js` for JWT verification middleware
  - Write `src/middleware/errorHandler.js` for centralized error handling returning structured error codes
  - Write `src/middleware/validate.js` for request validation using express-validator
  - Wire all middleware into `server.js`
  - _Requirements: 1.1, 1.5, 6.2, 7.1_

- [x] 2. Auth module — registration, OTP, login, and account lockout
  - [x] 2.1 Implement registration endpoint (`POST /api/auth/register`)
    - Validate email/phone uniqueness; return `409 EMAIL_ALREADY_REGISTERED` on duplicate
    - Hash password with bcrypt; insert user row; generate and store OTP; send OTP via email/SMS within 60 seconds
    - _Requirements: 1.1, 1.2, 1.3, 1.8_

  - [ ]* 2.2 Write property test for no-duplicate-accounts (Property 1)
    - **Property 1: No Duplicate Accounts**
    - **Validates: Requirements 1.3**

  - [x] 2.3 Implement OTP verification and resend endpoints (`POST /api/auth/verify-otp`, `POST /api/auth/resend-otp`)
    - _Requirements: 1.2_

  - [x] 2.4 Implement login endpoint (`POST /api/auth/login`) with account lockout
    - Issue JWT on success; increment `failed_login_attempts` on failure; lock account for 15 minutes after 5 consecutive failures; send lockout email notification
    - _Requirements: 1.5, 1.6_

  - [ ]* 2.5 Write property test for login-returns-token (Property 2)
    - **Property 2: Login Returns Token for Valid Credentials**
    - **Validates: Requirements 1.5**

  - [x] 2.6 Implement password reset flow (`POST /api/auth/forgot-password`, `POST /api/auth/reset-password`)
    - Generate time-limited token expiring after 30 minutes; reject expired tokens with `400 RESET_TOKEN_EXPIRED`
    - _Requirements: 1.7_

  - [ ]* 2.7 Write property test for reset-token-expiry (Property 3)
    - **Property 3: Password Reset Token Expiry**
    - **Validates: Requirements 1.7**

  - [x] 2.8 Implement Google OAuth (`GET /api/auth/google`, `GET /api/auth/google/callback`)
    - _Requirements: 1.4_

  - [x] 2.9 Implement role-switch endpoint (`POST /api/auth/switch-role`) and logout (`POST /api/auth/logout`)
    - Add token to Redis revocation list on logout
    - _Requirements: 1.9_

  - [ ]* 2.10 Write unit tests for account lockout and role-switch
    - Test 5 consecutive failed logins trigger lockout and email
    - Test role switch persists `active_role` correctly
    - _Requirements: 1.6, 1.9_

- [ ] 3. Checkpoint — Ensure all auth tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. User and Freelancer profile module
  - [x] 4.1 Implement profile read and update endpoints (`GET /api/users/:id`, `PUT /api/users/:id/profile`)
    - Enforce bio ≤ 1000 characters; return `422 VALIDATION_ERROR` on violation
    - Support both English and Amharic bio fields (`bio`, `bio_am`)
    - _Requirements: 2.1, 2.8_

  - [ ]* 4.2 Write property test for bio-length-constraint (Property 4)
    - **Property 4: Bio Length Constraint**
    - **Validates: Requirements 2.1**

  - [x] 4.3 Implement skill management endpoints
    - `POST /api/users/:id/skills` and `DELETE /api/users/:id/skills/:skillId`
    - Enforce maximum 20 skills per freelancer; return `422` on exceeding limit
    - _Requirements: 2.2_

  - [ ]* 4.4 Write property test for skill-count-limit (Property 5)
    - **Property 5: Skill Count Limit**
    - **Validates: Requirements 2.2**

  - [x] 4.5 Implement portfolio management endpoints (`POST /api/users/:id/portfolio`, `DELETE /api/users/:id/portfolio/:itemId`)
    - Enforce maximum 30 portfolio items; support image, document, and link types
    - _Requirements: 2.3_

  - [ ]* 4.6 Write property test for portfolio-item-count-limit (Property 6)
    - **Property 6: Portfolio Item Count Limit**
    - **Validates: Requirements 2.3**

  - [x] 4.7 Implement availability calendar endpoint (`PUT /api/users/:id/availability`)
    - _Requirements: 2.7_

  - [x] 4.8 Implement profile completion progress indicator logic
    - Compute and return completion percentage based on missing photo, bio, and skills
    - _Requirements: 2.9_

  - [x] 4.9 Implement favorites endpoints (`POST /api/users/favorites/:targetId`, `DELETE /api/users/favorites/:targetId`, `GET /api/users/favorites`)
    - _Requirements: 3.2_

  - [x] 4.10 Implement reviews endpoint (`GET /api/users/:id/reviews`)
    - _Requirements: 2.6, 3.6_

- [x] 5. Jobs, Gigs, and Proposals module
  - [x] 5.1 Implement job CRUD endpoints (`POST /api/jobs`, `GET /api/jobs`, `GET /api/jobs/:id`, `PUT /api/jobs/:id`, `DELETE /api/jobs/:id`)
    - Store required skills via `job_skills`; support fixed and hourly project types; track status
    - _Requirements: 4.2, 3.4_

  - [x] 5.2 Implement gig CRUD with packages (`POST /api/gigs`, `GET /api/gigs/:id`, `PUT /api/gigs/:id`)
    - Create up to three packages (basic, standard, premium) with deliverables stored as JSON
    - _Requirements: 4.1, 4.7_

  - [x] 5.3 Implement proposal endpoints (`POST /api/proposals`, `GET /api/proposals/job/:jobId`, `PUT /api/proposals/:id/status`)
    - Support accept, reject, shortlist status transitions
    - _Requirements: 4.4, 4.6_

  - [x] 5.4 Implement freelancer invite endpoint (`POST /api/proposals/:id/invite`)
    - _Requirements: 3.5_

  - [x] 5.5 Implement AI job description generator (`POST /api/ai/generate-job`)
    - Call AI service (OpenAI/Claude) with user summary; return structured job description
    - _Requirements: 4.10_

  - [x] 5.6 Implement 7-day no-proposal notification job
    - Write a scheduled task (cron) that queries jobs with no proposals after 7 days and sends notification via Notification module; set `no_proposal_notified = 1` to prevent duplicate sends
    - _Requirements: 4.9_

  - [ ]* 5.7 Write unit tests for 7-day no-proposal notification trigger
    - Test that notification is sent exactly once after 7 days with no proposals
    - _Requirements: 4.9_

- [ ] 6. Checkpoint — Ensure all jobs/gigs/proposals tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Payment, Escrow, and Wallet module
  - [x] 7.1 Implement fee calculation utility (`src/utils/feeCalculator.js`)
    - Pure function: given gross amount, return `{ fee, net }` where `fee + net === gross` and `fee >= 0`
    - _Requirements: 6.10_

  - [ ]* 7.2 Write property test for fee-calculation-consistency (Property 13)
    - **Property 13: Fee Calculation Consistency**
    - **Validates: Requirements 6.10**

  - [x] 7.3 Implement escrow funding endpoint (`POST /api/payments/initiate`)
    - Deduct `amount + fee` from client wallet; create escrow record; create `escrow_fund` transaction row; return error on insufficient balance
    - _Requirements: 6.2, 6.10_

  - [ ]* 7.4 Write property test for escrow-funding-invariant (Property 10)
    - **Property 10: Escrow Funding Invariant**
    - **Validates: Requirements 6.2**

  - [x] 7.5 Implement payment gateway webhook handler (`POST /api/payments/webhook`)
    - Handle Telebirr, CBE Birr, Visa/MasterCard callbacks; update transaction status; fund escrow on success; notify user on failure
    - _Requirements: 6.1, 6.8_

  - [x] 7.6 Implement milestone release endpoint (`POST /api/escrow/release-milestone`)
    - Validate milestone is approved; credit freelancer wallet; update escrow balance; create `milestone_release` transaction; enforce dispute freeze
    - _Requirements: 6.3, 6.5_

  - [ ]* 7.7 Write property test for escrow-release-correctness (Property 11)
    - **Property 11: Escrow Release Correctness**
    - **Validates: Requirements 6.3, 6.4**

  - [x] 7.8 Implement full escrow release endpoint (`POST /api/escrow/release-full`)
    - Release remaining escrow to freelancer wallet on contract completion
    - _Requirements: 6.4_

  - [x] 7.9 Implement milestone count enforcement
    - Reject milestone creation when contract already has 10 milestones
    - _Requirements: 6.5_

  - [ ]* 7.10 Write property test for milestone-count-limit (Property 12)
    - **Property 12: Milestone Count Limit**
    - **Validates: Requirements 6.5**

  - [x] 7.11 Implement wallet withdrawal endpoint (`POST /api/wallet/withdraw`) and balance endpoint (`GET /api/wallet/balance`)
    - _Requirements: 6.6, 6.9_

  - [x] 7.12 Implement transaction history endpoint (`GET /api/payments/history`)
    - _Requirements: 6.9_

  - [x] 7.13 Implement invoice PDF generation endpoint (`GET /api/invoices/:contractId`)
    - Generate downloadable PDF with contract details, amounts, dates, and parties using a PDF library (e.g., pdfkit)
    - _Requirements: 6.7_

  - [ ]* 7.14 Write unit test for invoice PDF generation
    - Test that a completed contract produces a valid PDF with correct fields
    - _Requirements: 6.7_

  - [x] 7.15 Implement escrow refund endpoint (`POST /api/escrow/refund`)
    - Admin-only; refund escrow to client wallet; create `refund` transaction
    - _Requirements: 7.8_

- [ ] 8. Checkpoint — Ensure all payment/escrow tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Messaging module with Socket.io
  - [x] 9.1 Implement conversation and message REST endpoints
    - `GET /api/chat/conversations/:userId`, `GET /api/chat/messages/:conversationId`, `POST /api/chat/messages`
    - Support text, image, document, and voice content types; enforce 25 MB file size limit
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 9.2 Write property test for file-attachment-size-limit (Property 9)
    - **Property 9: File Attachment Size Limit**
    - **Validates: Requirements 5.3**

  - [x] 9.3 Implement Socket.io chat events (`chat:send`, `chat:receive`, `chat:typing`, `chat:read`)
    - Deliver messages within 2 seconds; update `is_read` on `chat:read` event; emit read receipts
    - _Requirements: 5.1, 5.5_

  - [x] 9.4 Implement inline translation for messages (`POST /api/translate`)
    - Call AI service to translate Amharic ↔ English on demand; return translated text inline
    - _Requirements: 5.4_

  - [x] 9.5 Implement message report endpoint (`POST /api/chat/report/:messageId`)
    - Set `is_reported = 1`; add to admin moderation queue
    - _Requirements: 5.8_

  - [ ]* 9.6 Write unit test for offline message notification
    - Test that a push/email notification is enqueued when recipient is offline
    - _Requirements: 5.7_

- [x] 10. Notification module
  - [x] 10.1 Implement notification service (`src/modules/notification/notificationService.js`)
    - Write `enqueueNotification(userId, eventType, payload)` that checks `notification_preferences` before inserting into `notifications` table and dispatching email/push
    - Support bilingual titles and messages (`title`, `title_am`, `message`, `message_am`)
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ]* 10.2 Write property test for notification-preference-enforcement (Property 17)
    - **Property 17: Notification Preference Enforcement**
    - **Validates: Requirements 10.3**

  - [x] 10.3 Implement notification REST endpoints
    - `GET /api/notifications/:userId`, `POST /api/notifications/read/:id`, `POST /api/notifications/read-all`, `PUT /api/notifications/preferences`
    - Clear unread count badge immediately on mark-all-read
    - _Requirements: 10.4, 10.5_

  - [x] 10.4 Implement Socket.io `notification:new` event
    - Push new notifications to connected clients in real time
    - _Requirements: 10.1_

  - [x] 10.5 Wire notification service into all triggering modules
    - Auth (lockout), Proposals (received, accepted, rejected), Milestones (approved, payment released), Messages (new message), Disputes (raised, resolved), KYC (approved, rejected), Reputation (level-up), Admin alerts (KYC pending, dispute raised, flagged account)
    - _Requirements: 10.1, 10.2, 10.6_

  - [ ]* 10.6 Write unit tests for notification triggers
    - Test each event type triggers the correct notification within SLA
    - _Requirements: 10.1, 10.6_

- [x] 11. KYC, Trust, and Dispute module
  - [x] 11.1 Implement KYC submission and status endpoints (`POST /api/kyc/submit`, `GET /api/kyc/status/:userId`)
    - Accept National ID document and selfie uploads; set `kyc_status = 'pending'`; notify admin queue within 60 seconds
    - _Requirements: 7.1, 7.2_

  - [x] 11.2 Implement KYC admin review endpoint (`POST /api/kyc/review/:id`)
    - On approval: set `is_verified = 1`, `kyc_status = 'approved'`, update profile verified badge within 5 minutes; on rejection: set reason and notify freelancer
    - _Requirements: 7.3, 7.4_

  - [ ]* 11.3 Write unit tests for KYC flow
    - Test approval sets verified badge; test rejection sends notification with reason
    - _Requirements: 7.3, 7.4_

  - [x] 11.4 Implement skill assessment endpoints (`POST /api/skill-tests/:skillId/start`, `POST /api/skill-tests/:attemptId/submit`, `GET /api/skill-badges/:userId`)
    - Award `Skill_Badge` within 10 minutes of passing; link badge to skill
    - _Requirements: 7.5, 7.6_

  - [ ]* 11.5 Write unit test for skill badge award
    - Test that passing an assessment awards the badge within 10 minutes
    - _Requirements: 7.6_

  - [x] 11.6 Implement dispute endpoints (`POST /api/disputes`, `GET /api/disputes/:id`, `PUT /api/disputes/:id/resolve`)
    - On dispute creation: set contract status to `disputed`, freeze escrow (block release/withdrawal); on resolution: unfreeze escrow and apply admin decision
    - _Requirements: 7.8, 7.9_

  - [ ]* 11.7 Write property test for escrow-frozen-on-dispute (Property 14)
    - **Property 14: Escrow Frozen on Dispute**
    - **Validates: Requirements 7.8, 7.9**

  - [x] 11.8 Implement automated fraud detection flag
    - Write a background job that queries suspicious payment patterns (e.g., multiple failed transactions, rapid withdrawals) and flags accounts for admin review
    - _Requirements: 7.7_

- [ ] 12. Checkpoint — Ensure all KYC/trust/dispute tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Smart Matching Engine
  - [x] 13.1 Implement match score computation (`src/modules/match/matchScore.js`)
    - Pure function: given a job and a freelancer, compute composite score from skill match, average rating, price alignment, and response time
    - _Requirements: 8.1_

  - [ ]* 13.2 Write property test for matching-engine-ranking-monotonicity (Property 15)
    - **Property 15: Matching Engine Ranking Monotonicity**
    - **Validates: Requirements 8.1**

  - [x] 13.3 Implement match recommendations endpoint (`GET /api/match/job/:jobId`)
    - Return ranked list of up to 10 freelancers within 5 seconds; cache results in Redis
    - _Requirements: 4.3, 8.2_

  - [ ]* 13.4 Write property test for matching-engine-result-count (Property 8)
    - **Property 8: Matching Engine Result Count**
    - **Validates: Requirements 4.3, 8.2**

  - [x] 13.5 Implement marketplace search endpoint (`GET /api/marketplace`)
    - Support filters: skill category, price range, rating threshold, delivery time, verification status, location (Ethiopian city/region)
    - Return results within 3 seconds
    - _Requirements: 8.3, 8.4, 15.3, 15.4_

  - [ ]* 13.6 Write property test for marketplace-price-filter-correctness (Property 19)
    - **Property 19: Marketplace Price Filter Correctness**
    - **Validates: Requirements 15.3**

  - [x] 13.7 Implement trending skills endpoint (`GET /api/skills/trending`)
    - Aggregate top 10 most in-demand skills from job postings; cache and refresh weekly
    - _Requirements: 8.6, 16.4_

  - [x] 13.8 Implement match score refresh job
    - Write a scheduled task that recomputes and caches freelancer match scores within 24 hours of rating, completed jobs, or response time changes
    - _Requirements: 8.5_

- [x] 14. Reputation module
  - [x] 14.1 Implement reputation score and level computation (`src/modules/reputation/reputationEngine.js`)
    - Pure function: given completed jobs, average rating, completion rate, and response rate, compute score and map to level (Bronze → Silver → Gold → Platinum → Diamond)
    - _Requirements: 9.1_

  - [ ]* 14.2 Write property test for reputation-level-determinism (Property 16)
    - **Property 16: Reputation Level Determinism**
    - **Validates: Requirements 9.1, 9.2**

  - [x] 14.3 Implement reputation recalculation trigger
    - After any review submission or contract completion, recompute and persist `reputation_score` and `reputation_level` in `freelancer_profiles` within 24 hours
    - _Requirements: 9.2_

  - [x] 14.4 Implement reputation data endpoint (`GET /api/reputation/:freelancerId`)
    - Return level, score, completion rate, response rate, satisfaction score, and all reviews
    - _Requirements: 9.3, 9.4, 9.6_

  - [x] 14.5 Implement review submission endpoint (`POST /api/reviews`)
    - Validate rating in [1, 5]; link to contract; trigger reputation recalculation
    - _Requirements: 3.6, 9.6_

  - [ ]* 14.6 Write property test for review-rating-range (Property 7)
    - **Property 7: Review Rating Range**
    - **Validates: Requirements 3.6**

  - [ ]* 14.7 Write unit test for reputation level-up notification
    - Test that reaching a new level triggers a notification within 10 minutes
    - _Requirements: 9.5_

- [ ] 15. Checkpoint — Ensure all matching/reputation tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Admin module
  - [x] 16.1 Implement admin stats endpoint (`GET /api/admin/stats`)
    - Return total registered users, active jobs, total transaction volume, dispute resolution rate; update daily
    - _Requirements: 13.7_

  - [x] 16.2 Implement user management endpoints (`GET /api/admin/users`, `PUT /api/admin/users/:id/suspend`, `PUT /api/admin/users/:id/ban`)
    - Enforce admin-only access; add banned/suspended tokens to Redis revocation list
    - _Requirements: 13.1, 13.2, 7.10_

  - [ ]* 16.3 Write unit test for admin suspend/ban
    - Test that suspended/banned users cannot authenticate
    - _Requirements: 7.10_

  - [x] 16.4 Implement admin KYC queue endpoints (`GET /api/admin/kyc`, `PUT /api/admin/kyc/:id/review`)
    - _Requirements: 13.3_

  - [x] 16.5 Implement admin dispute queue endpoints (`GET /api/admin/disputes`, `PUT /api/admin/disputes/:id`)
    - _Requirements: 13.6_

  - [x] 16.6 Implement admin escrow management endpoint (`GET /api/admin/escrow`)
    - View all escrow transactions; flag suspicious; manually release or refund
    - _Requirements: 13.5_

  - [x] 16.7 Implement admin content moderation endpoints
    - Review and remove reported jobs, gigs, and messages; warn users
    - _Requirements: 13.4_

  - [x] 16.8 Implement admin announcements endpoint (`POST /api/admin/announcements`)
    - Send platform-wide or targeted notifications via Notification module
    - _Requirements: 13.8_

- [x] 17. i18n and Bilingual interface module
  - [x] 17.1 Create translation string bundles for English and Amharic
    - Write `src/i18n/en.json` and `src/i18n/am.json` covering all static UI labels, navigation items, error messages, and system notification strings
    - _Requirements: 14.1, 14.4_

  - [x] 17.2 Implement i18n endpoint (`GET /api/i18n/:lang`)
    - Return the full string bundle for the requested language
    - _Requirements: 14.1_

  - [x] 17.3 Implement language preference persistence
    - On language toggle, call `PUT /api/users/:id/profile` to persist `language_pref`; load preference on session start
    - _Requirements: 14.2_

  - [ ]* 17.4 Write property test for language-preference-persistence (Property 18)
    - **Property 18: Language Preference Persistence**
    - **Validates: Requirements 14.2**

  - [x] 17.5 Ensure Ethiopic script rendering
    - Add Ethiopic-compatible font (e.g., Noto Sans Ethiopic) to the frontend; verify legibility at all breakpoints (320px–1280px+)
    - _Requirements: 14.3_

- [x] 18. Learning Academy module
  - [x] 18.1 Implement certification CRUD and enrollment endpoints
    - `GET /api/academy/certifications`, `POST /api/academy/certifications/:id/enroll`, `POST /api/academy/certifications/:id/complete`
    - On completion: award linked `Skill_Badge` and insert `user_certifications` row
    - _Requirements: 16.1, 16.2_

  - [x] 18.2 Implement learning resources listing endpoint
    - `GET /api/academy/resources` with filter by skill category and free/paid
    - _Requirements: 16.3_

- [x] 19. Frontend — Landing page and marketplace UI
  - [x] 19.1 Build landing page (`index.html` / frontend entry)
    - Hero section, service category grid, featured freelancer cards, "How It Works" section (bilingual), and client testimonials
    - Fully responsive: 320px mobile, 768px tablet, 1280px+ desktop
    - _Requirements: 15.1, 15.5, 15.6_

  - [x] 19.2 Build marketplace page with search and filter UI
    - Freelancer cards showing name, title, rating, hourly rate, level badge, and verification status
    - Keyword search, skill category, price range, rating, and location filters; no login required
    - Display results within 3 seconds
    - _Requirements: 15.2, 15.3, 15.4_

  - [x] 19.3 Build language toggle component
    - Accessible from every page; persist selection; switch all static labels and system messages
    - _Requirements: 14.1, 14.2_

- [x] 20. Freelancer and Client dashboards
  - [x] 20.1 Build Freelancer dashboard UI
    - Total earnings (all-time and current month), active contracts with milestone progress, pending proposals list, reviews section, withdrawal interface, and 12-month earnings chart
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [x] 20.2 Build Client dashboard UI
    - Total spending, active contracts, open jobs, pending proposals, spending breakdown chart, saved freelancers list, and inline milestone release button
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 21. Final integration and wiring
  - [x] 21.1 Wire all API routes into Express router
    - Register all module routers in `server.js`; apply auth middleware to protected routes; apply admin middleware to admin routes
    - _Requirements: 1.5, 7.1, 13.1_

  - [x] 21.2 Wire Socket.io events for chat and notifications
    - Authenticate Socket.io connections via JWT; join user-specific rooms; handle `chat:send`, `chat:receive`, `chat:typing`, `chat:read`, `notification:new`
    - _Requirements: 5.1, 10.1_

  - [x] 21.3 Wire all notification triggers across modules
    - Confirm every event listed in Requirement 10.1 dispatches through `notificationService.enqueueNotification`
    - _Requirements: 10.1, 10.2_

  - [x] 21.4 Wire reputation recalculation into review and contract completion flows
    - _Requirements: 9.2_

  - [x] 21.5 Wire match score refresh into freelancer profile update flow
    - _Requirements: 8.5_

  - [ ]* 21.6 Write integration tests for critical end-to-end flows
    - Test: register → KYC → post job → receive proposal → fund escrow → complete milestone → release payment → submit review
    - Test: payment gateway webhook processing for Telebirr and Visa
    - _Requirements: 6.1, 6.2, 6.3, 7.1, 7.3_

- [ ] 22. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use [fast-check](https://github.com/dubzzz/fast-check) with a minimum of 100 iterations per property
- Unit tests cover specific examples and edge cases; property tests validate universal invariants
- Checkpoints ensure incremental validation at each major module boundary
- The existing `server.js` and `uploads/` directory should be preserved and extended, not replaced
