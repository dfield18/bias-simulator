-- Add topic_type column to topics table
ALTER TABLE topics ADD COLUMN IF NOT EXISTS topic_type TEXT DEFAULT 'political';
