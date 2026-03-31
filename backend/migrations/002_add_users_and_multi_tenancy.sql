-- Migration: Add users, user_topics, and multi-tenancy columns
-- Run this against your production database (Railway Postgres)

-- 1. Create users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    name TEXT,
    tier TEXT DEFAULT 'free',
    stripe_customer_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create user_topics join table
CREATE TABLE IF NOT EXISTS user_topics (
    user_id TEXT REFERENCES users(id),
    topic_slug TEXT REFERENCES topics(slug),
    role TEXT NOT NULL DEFAULT 'subscriber',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, topic_slug)
);

-- 3. Add new columns to existing topics table
ALTER TABLE topics ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';
ALTER TABLE topics ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(id);
