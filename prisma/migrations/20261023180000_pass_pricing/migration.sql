-- AlterTable
ALTER TABLE "payment_settings" ADD COLUMN     "passDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "priceMicros" BIGINT NOT NULL DEFAULT 5000000,
ADD COLUMN     "pricingUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "upgrade_requests" ADD COLUMN     "passDays" INTEGER NOT NULL DEFAULT 7;


-- Prices are whole cents between $1 and $500 (USD, charged 1:1 in USDT); passes last 1 to 60 days.
ALTER TABLE "payment_settings" ADD CONSTRAINT "payment_settings_price_range" CHECK ("priceMicros" BETWEEN 1000000 AND 500000000 AND "priceMicros" % 10000 = 0);
ALTER TABLE "payment_settings" ADD CONSTRAINT "payment_settings_pass_days_range" CHECK ("passDays" BETWEEN 1 AND 60);
ALTER TABLE "upgrade_requests" ADD CONSTRAINT "upgrade_requests_pass_days_range" CHECK ("passDays" BETWEEN 1 AND 60);
