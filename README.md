# Fuel economy tracker

A simple React + Supabase web app for phone-friendly fuel tracking. Each user can:

- sign up or sign in with email and password
- add multiple cars
- save refills with odometer, fuel price, liters added, and a full-tank flag
- view fuel economy in liters per 100 km using the full-to-full method

## Stack

- React + Vite
- Supabase Auth
- Supabase Postgres with row-level security

## Local setup

1. Create a Supabase project.
2. In Supabase SQL Editor, run `supabase/schema.sql`.
3. Copy `.env.example` to `.env`.
4. Fill in your Supabase values:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - optional: `VITE_APP_TITLE`
   - optional: `VITE_CURRENCY`
5. Install dependencies:
   - `npm install`
6. Start the app:
   - `npm run dev`

## Fuel economy logic

The app uses the **full-to-full** method:

- partial refills are saved and carried forward
- once a refill is marked as **filled to the top**, the app calculates fuel economy for the distance since the previous full refill
- economy is shown as liters per 100 km

This gives more accurate numbers than trying to estimate consumption from partial fills alone.
