# Requirements Document

## Introduction

Ethio Gigs (also known as HibreWork) is a bilingual (Amharic + English) freelance marketplace platform built for Ethiopia. It connects verified Ethiopian freelancers with local and global clients through a trust-first model featuring local payment integrations (Telebirr, CBE Birr, bank transfer), National ID / KYC verification, escrow-based payments, and a smart matching engine. The platform is designed mobile-first with a clean SaaS aesthetic and is built to scale globally from an Ethiopian foundation.

---

## Glossary

- **Platform**: The Ethio Gigs / HibreWork web application
- **Freelancer**: A registered user who offers services or skills for hire
- **Client**: A registered user who posts jobs and hires freelancers
- **Admin**: A privileged Platform operator who manages users, content, payments, and disputes
- **Gig**: A service package offered by a Freelancer with defined scope and pricing
- **Job**: A project posted by a Client seeking freelance services
- **Proposal**: A Freelancer's application to a Job
- **Escrow**: A Platform-held payment fund released upon milestone or project completion
- **KYC**: Know Your Customer — identity verification using National ID and supporting documents
- **Milestone**: A defined deliverable checkpoint within a Job contract
- **Dispute**: A formal conflict raised by a Freelancer or Client regarding a contract
- **Reputation_System**: The level and badge system tracking Freelancer performance (Bronze → Silver → Gold → Platinum → Diamond)
- **Smart_Matching_Engine**: The algorithm that recommends Freelancers to Clients based on skills, ratings, price, and response time
- **Notification_Service**: The system responsible for delivering in-app, email, and push notifications
- **Payment_Gateway**: The integration layer handling Telebirr, CBE Birr, bank transfer, Visa, and MasterCard transactions
- **Wallet**: A Freelancer's or Client's in-platform balance account
- **Skill_Badge**: A verified credential awarded after passing a skill assessment test
- **Translation_Service**: The AI-powered Amharic ↔ English translation component within the messaging system
- **Invoice_Generator**: The automated system that produces downloadable invoices for completed contracts

---

## Requirements

### Requirement 1: User Registration and Authentication

**User Story:** As a visitor, I want to register and authenticate securely, so that I can access the platform as a Freelancer or Client.

#### Acceptance Criteria

1. THE Platform SHALL support registration with email address, phone number, and password.
2. WHEN a visitor submits a registration form, THE Platform SHALL send a one-time verification code to the provided email or phone number within 60 seconds.
3. WHEN a visitor provides an already-registered email or phone number, THE Platform SHALL display a descriptive error message without creating a duplicate account.
4. THE Platform SHALL allow users to register using Google OAuth as an alternative to email/password registration.
5. WHEN a user submits login credentials, THE Platform SHALL authenticate the user and issue a session token within 3 seconds.
6. IF a user enters incorrect credentials 5 consecutive times, THEN THE Platform SHALL temporarily lock the account for 15 minutes and notify the user via email.
7. THE Platform SHALL support password reset via a time-limited link sent to the registered email address, expiring after 30 minutes.
8. WHEN a user registers, THE Platform SHALL require selection of account type: Freelancer or Client.
9. THE Platform SHALL allow a single user account to switch between Freelancer and Client roles without re-registration.

---

### Requirement 2: Freelancer Profile

**User Story:** As a Freelancer, I want to build a detailed profile, so that Clients can evaluate my skills, experience, and credibility.

#### Acceptance Criteria

1. THE Platform SHALL allow a Freelancer to set a display name, professional title, bio (up to 1000 characters), hourly rate, and availability status.
2. THE Platform SHALL allow a Freelancer to add up to 20 skills from a predefined taxonomy, with optional proficiency levels.
3. THE Platform SHALL allow a Freelancer to upload portfolio items including images, documents, and external links, with a maximum of 30 items.
4. WHEN a Freelancer completes KYC verification, THE Platform SHALL display a verified badge on the Freelancer's profile.
5. THE Platform SHALL display a Freelancer's Reputation_System level (Bronze → Silver → Gold → Platinum → Diamond) based on computed performance metrics.
6. THE Platform SHALL display a Freelancer's average rating, total completed jobs, completion rate, and average response time on the profile page.
7. THE Platform SHALL allow a Freelancer to set an availability calendar indicating available and unavailable dates.
8. THE Platform SHALL support both Amharic and English content in profile bio and descriptions.
9. WHEN a Freelancer's profile is incomplete (missing photo, bio, or at least one skill), THE Platform SHALL display a profile completion progress indicator.

---

### Requirement 3: Client Account and Project Management

**User Story:** As a Client, I want to manage my hiring activities from a dedicated dashboard, so that I can track projects, payments, and freelancer relationships efficiently.

#### Acceptance Criteria

1. THE Platform SHALL provide a Client dashboard displaying active jobs, hired freelancers, pending proposals, and total spending.
2. THE Platform SHALL allow a Client to save Freelancers to a favorites list for future reference.
3. THE Platform SHALL allow a Client to view the full payment history and spending breakdown per project.
4. WHEN a Client posts a Job, THE Platform SHALL display the Job in the Client's hiring dashboard with status tracking (Open, In Progress, Completed, Cancelled).
5. THE Platform SHALL allow a Client to invite specific Freelancers to apply to a posted Job.
6. THE Platform SHALL allow a Client to rate and review a Freelancer upon contract completion, with a rating from 1 to 5 stars and a written review.

---

### Requirement 4: Gig and Job System

**User Story:** As a Freelancer or Client, I want to post gigs and jobs and manage applications, so that work can be discovered and contracted efficiently.

#### Acceptance Criteria

1. THE Platform SHALL allow a Freelancer to create a Gig with up to three packages: Basic, Standard, and Premium, each with a title, description, price, delivery time, and list of included deliverables.
2. THE Platform SHALL allow a Client to post a Job with a title, description, required skills, budget range, project type (fixed or hourly), and deadline.
3. WHEN a Client posts a Job, THE Platform SHALL use the Smart_Matching_Engine to suggest up to 10 relevant Freelancers within 5 seconds.
4. THE Platform SHALL allow a Freelancer to submit a Proposal to a Job, including a cover letter, proposed price, and estimated delivery time.
5. WHEN a Client receives a Proposal, THE Platform SHALL notify the Client via the Notification_Service within 60 seconds.
6. THE Platform SHALL allow a Client to accept, reject, or shortlist Proposals from the hiring dashboard.
7. THE Platform SHALL allow a Freelancer to offer fixed-price Gig packages directly purchasable by Clients without a Job posting.
8. THE Platform SHALL allow a Client to request a custom offer from a Freelancer outside of standard Gig packages.
9. IF a Job remains open with no Proposals for 7 days, THEN THE Platform SHALL notify the Client with suggestions to adjust the budget or required skills.
10. THE Platform SHALL support an AI-powered Job description generator that produces a structured Job description from a short user-provided summary.

---

### Requirement 5: Messaging System

**User Story:** As a Freelancer or Client, I want to communicate in real time, so that I can discuss project details, share files, and collaborate effectively.

#### Acceptance Criteria

1. THE Platform SHALL provide real-time chat between Freelancers and Clients with message delivery within 2 seconds under normal network conditions.
2. THE Platform SHALL allow users to send text messages, images, documents (PDF, DOCX, XLSX), and voice notes within the chat interface.
3. THE Platform SHALL allow users to share files up to 25 MB per message attachment.
4. WHEN a user sends a message in Amharic, THE Translation_Service SHALL offer an English translation inline, and vice versa.
5. THE Platform SHALL display message read receipts indicating whether a message has been delivered and read.
6. THE Platform SHALL retain chat history for the duration of the contract and for 12 months after contract completion.
7. IF a user receives a new message while offline, THEN THE Notification_Service SHALL deliver a push or email notification within 5 minutes.
8. THE Platform SHALL allow users to report abusive or inappropriate messages to the Admin moderation queue.

---

### Requirement 6: Payment System

**User Story:** As a Freelancer or Client, I want to send and receive payments securely using local and international methods, so that financial transactions are safe, fast, and accessible.

#### Acceptance Criteria

1. THE Payment_Gateway SHALL support Telebirr, CBE Birr, Ethiopian bank transfer, Visa, and MasterCard as payment methods.
2. WHEN a Client initiates a contract, THE Platform SHALL hold the agreed payment amount in Escrow before work begins.
3. WHEN a Freelancer completes a Milestone and the Client approves it, THE Platform SHALL release the Milestone payment from Escrow to the Freelancer's Wallet within 24 hours.
4. WHEN a contract is completed and approved by the Client, THE Platform SHALL release the full remaining Escrow balance to the Freelancer's Wallet within 24 hours.
5. THE Platform SHALL support milestone-based payment structures, allowing a contract to be divided into up to 10 Milestones.
6. THE Platform SHALL allow a Freelancer to withdraw Wallet funds to a linked Telebirr account, CBE Birr account, or bank account within 3 business days of withdrawal request.
7. THE Invoice_Generator SHALL produce a downloadable PDF invoice for each completed contract, including contract details, amounts, dates, and parties.
8. IF a payment transaction fails, THEN THE Payment_Gateway SHALL notify the initiating user with a descriptive error and retain the Escrow funds without disbursement.
9. THE Platform SHALL display a real-time Wallet balance and full transaction history on the Freelancer and Client dashboards.
10. THE Platform SHALL apply a platform service fee to each completed transaction and display the fee breakdown transparently before payment confirmation.

---

### Requirement 7: Trust and Safety — KYC Verification

**User Story:** As a platform operator, I want all users to undergo identity verification, so that the platform maintains trust and reduces fraud.

#### Acceptance Criteria

1. THE Platform SHALL require Freelancers to submit a National ID document and a selfie photograph to complete KYC verification.
2. WHEN a KYC submission is received, THE Platform SHALL notify the Admin moderation queue within 60 seconds.
3. WHEN an Admin approves a KYC submission, THE Platform SHALL update the Freelancer's profile with a verified badge within 5 minutes.
4. IF a KYC submission is rejected, THEN THE Platform SHALL notify the Freelancer with a descriptive reason and allow resubmission.
5. THE Platform SHALL allow Freelancers to take skill assessment tests to earn Skill_Badges displayed on their profiles.
6. WHEN a Freelancer passes a skill assessment test, THE Platform SHALL award the corresponding Skill_Badge within 10 minutes.
7. THE Platform SHALL implement automated fraud detection that flags accounts exhibiting suspicious payment or activity patterns for Admin review.
8. THE Platform SHALL provide a dispute resolution workflow allowing either party to raise a Dispute on an active contract, triggering Admin mediation.
9. WHEN a Dispute is raised, THE Platform SHALL freeze the relevant Escrow funds until the Dispute is resolved by an Admin.
10. THE Platform SHALL allow an Admin to suspend or permanently ban a user account based on verified policy violations.

---

### Requirement 8: Smart Matching Engine

**User Story:** As a Client, I want the platform to recommend the most suitable Freelancers for my job, so that I can hire efficiently without extensive manual searching.

#### Acceptance Criteria

1. THE Smart_Matching_Engine SHALL rank Freelancers for a given Job based on skill match score, average rating, price range alignment, and average response time.
2. WHEN a Client posts a Job, THE Smart_Matching_Engine SHALL return a ranked list of up to 10 Freelancer recommendations within 5 seconds.
3. THE Smart_Matching_Engine SHALL support location-based filtering, allowing Clients to restrict results to Freelancers in a specified Ethiopian city or region.
4. THE Platform SHALL allow Clients to filter the marketplace by skill category, price range, rating threshold, delivery time, and verification status.
5. THE Smart_Matching_Engine SHALL update a Freelancer's match score within 24 hours of a change in their rating, completed jobs, or response time.
6. THE Platform SHALL display skill trend analytics showing the most in-demand skills in Ethiopia, updated weekly.

---

### Requirement 9: Reputation System

**User Story:** As a Freelancer, I want to earn levels and badges based on my performance, so that my credibility is visible and I can attract higher-value clients.

#### Acceptance Criteria

1. THE Reputation_System SHALL assign every Freelancer a level from the sequence: Bronze, Silver, Gold, Platinum, Diamond, based on a computed score derived from completed jobs, average rating, completion rate, and response rate.
2. THE Reputation_System SHALL recalculate a Freelancer's level within 24 hours of any change to the underlying performance metrics.
3. THE Platform SHALL display the Freelancer's current level badge prominently on the profile page and Freelancer cards in search results.
4. THE Platform SHALL display a Freelancer's completion rate (completed jobs / accepted jobs × 100) and response rate (responses within 24 hours / total messages received × 100) on the profile page.
5. WHEN a Freelancer reaches a new level, THE Notification_Service SHALL notify the Freelancer within 10 minutes of the level change.
6. THE Platform SHALL display a satisfaction score derived from the average of all Client ratings received by the Freelancer.

---

### Requirement 10: Notification System

**User Story:** As a Freelancer or Client, I want to receive timely notifications about platform activity, so that I can respond quickly and stay informed.

#### Acceptance Criteria

1. THE Notification_Service SHALL deliver in-app notifications for the following events: new Job invite, new Proposal received, Proposal accepted or rejected, Milestone approved, payment released, new message received, Dispute raised, and Dispute resolved.
2. THE Notification_Service SHALL deliver email notifications for all events listed in criterion 1 within 5 minutes of the triggering event.
3. THE Platform SHALL allow users to configure notification preferences, enabling or disabling email and in-app notifications per event type.
4. THE Platform SHALL display an unread notification count badge on the notification icon in the navigation bar.
5. WHEN a user marks all notifications as read, THE Platform SHALL clear the unread count badge immediately.
6. THE Notification_Service SHALL deliver Admin alerts for flagged accounts, pending KYC submissions, and raised Disputes within 2 minutes of the triggering event.

---

### Requirement 11: Freelancer Dashboard

**User Story:** As a Freelancer, I want a centralized dashboard, so that I can manage my earnings, active projects, proposals, and withdrawals in one place.

#### Acceptance Criteria

1. THE Platform SHALL display a Freelancer dashboard showing total earnings (all time and current month), active contracts, pending proposals, and average rating.
2. THE Platform SHALL display a list of active contracts with status, Client name, Milestone progress, and next payment amount.
3. THE Platform SHALL display a proposals list showing submitted proposals with status (Pending, Shortlisted, Accepted, Rejected).
4. THE Platform SHALL display a reviews section showing all Client reviews received, sorted by most recent.
5. THE Platform SHALL provide a withdrawal interface allowing a Freelancer to initiate a Wallet withdrawal to a linked payment account.
6. THE Platform SHALL display an earnings chart showing monthly earnings over the past 12 months.

---

### Requirement 12: Client Dashboard

**User Story:** As a Client, I want a centralized dashboard, so that I can manage my hires, project progress, and spending efficiently.

#### Acceptance Criteria

1. THE Platform SHALL display a Client dashboard showing total spending (all time and current month), active contracts, open jobs, and pending proposals awaiting review.
2. THE Platform SHALL display a list of active contracts with Freelancer name, project title, Milestone progress, and next payment due.
3. THE Platform SHALL display a spending breakdown chart by project and by month over the past 12 months.
4. THE Platform SHALL display a saved Freelancers list with quick-access links to each Freelancer's profile.
5. THE Platform SHALL allow a Client to release a Milestone payment directly from the dashboard without navigating to the contract page.

---

### Requirement 13: Admin Panel

**User Story:** As an Admin, I want a comprehensive management panel, so that I can oversee users, content, payments, and disputes across the platform.

#### Acceptance Criteria

1. THE Platform SHALL provide an Admin panel accessible only to users with the Admin role.
2. THE Platform SHALL allow an Admin to view, search, filter, suspend, and permanently ban user accounts.
3. THE Platform SHALL allow an Admin to review and approve or reject KYC submissions with a written reason.
4. THE Platform SHALL allow an Admin to review and moderate reported Jobs, Gigs, and messages, with the ability to remove content or warn users.
5. THE Platform SHALL allow an Admin to view all Escrow transactions, flag suspicious transactions, and manually release or refund Escrow funds.
6. THE Platform SHALL allow an Admin to manage Disputes by reviewing evidence, communicating with both parties, and issuing a resolution decision.
7. THE Platform SHALL display platform analytics including total registered users, active jobs, total transaction volume, and dispute resolution rate, updated daily.
8. THE Platform SHALL allow an Admin to send platform-wide or targeted announcements to users via the Notification_Service.

---

### Requirement 14: Bilingual Interface (Amharic + English)

**User Story:** As a user, I want to use the platform in either Amharic or English, so that the platform is accessible to all Ethiopians regardless of language preference.

#### Acceptance Criteria

1. THE Platform SHALL support full UI rendering in both Amharic and English, switchable via a language toggle accessible from every page.
2. WHEN a user selects a language, THE Platform SHALL persist the language preference across sessions.
3. THE Platform SHALL render Amharic text using the Ethiopic script (Unicode block U+1200–U+137F) with a legible font at all supported screen sizes.
4. THE Platform SHALL translate all static UI labels, navigation items, error messages, and system notifications into both Amharic and English.
5. THE Translation_Service SHALL provide inline AI-powered translation of user-generated content (messages, job descriptions, bios) between Amharic and English on demand.

---

### Requirement 15: Landing Page and Marketplace Discovery

**User Story:** As a visitor, I want an informative landing page and a searchable marketplace, so that I can understand the platform's value and find the right freelancer quickly.

#### Acceptance Criteria

1. THE Platform SHALL display a landing page with a hero section, service category grid, featured Freelancer cards, a "How It Works" section, and client testimonials.
2. THE Platform SHALL display a marketplace page listing Freelancer cards with name, title, rating, hourly rate, level badge, and verification status.
3. THE Platform SHALL allow visitors to search the marketplace by keyword, skill category, price range, rating, and location without requiring login.
4. THE Platform SHALL display search results within 3 seconds of query submission.
5. THE Platform SHALL display a "How It Works" section explaining the steps for both Clients and Freelancers in both Amharic and English.
6. THE Platform SHALL be fully responsive and functional on mobile devices with screen widths from 320px to 428px, tablets from 768px to 1024px, and desktops from 1280px and above.

---

### Requirement 16: Skill Certification and Learning Academy

**User Story:** As a Freelancer, I want access to skill certifications and learning resources, so that I can improve my skills and increase my earning potential.

#### Acceptance Criteria

1. THE Platform SHALL provide a skill certification marketplace where Freelancers can purchase and complete certification courses.
2. WHEN a Freelancer completes a certification course, THE Platform SHALL award a Skill_Badge linked to the certification on the Freelancer's profile.
3. THE Platform SHALL provide a Freelance Learning Academy section with free and paid learning resources organized by skill category.
4. THE Platform SHALL display skill trend analytics showing the top 10 most in-demand skills in Ethiopia, updated weekly, to guide Freelancer learning decisions.
