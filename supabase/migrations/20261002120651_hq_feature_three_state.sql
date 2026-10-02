-- Additive authorization states. Business records are never removed on downgrade.
ALTER TYPE public."StoreFeatureEntitlementStatus" ADD VALUE IF NOT EXISTS 'LOCKED';
ALTER TYPE public."StoreFeatureEntitlementStatus" ADD VALUE IF NOT EXISTS 'HIDDEN';
