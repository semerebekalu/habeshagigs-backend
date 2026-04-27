-- Add unique constraint to availability_calendar to prevent duplicate date entries
ALTER TABLE availability_calendar 
ADD UNIQUE KEY unique_freelancer_date (freelancer_id, date);
