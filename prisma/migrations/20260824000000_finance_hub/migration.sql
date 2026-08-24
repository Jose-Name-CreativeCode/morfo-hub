ALTER TABLE "AppSettings"
ADD COLUMN "financeConfigJson" TEXT NOT NULL DEFAULT '{}';

ALTER TABLE "IncomeRecord"
ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'morfo',
ADD COLUMN "accountId" TEXT,
ADD COLUMN "ownerUserId" TEXT;

ALTER TABLE "ExpenseRecord"
ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'morfo',
ADD COLUMN "accountId" TEXT,
ADD COLUMN "ownerUserId" TEXT;

UPDATE "IncomeRecord"
SET "scope" = COALESCE(NULLIF(("rawJson"::jsonb)->>'scope', ''), 'morfo'),
    "accountId" = NULLIF(("rawJson"::jsonb)->>'accountId', '');

UPDATE "ExpenseRecord"
SET "scope" = COALESCE(NULLIF(("rawJson"::jsonb)->>'scope', ''), 'morfo'),
    "accountId" = NULLIF(("rawJson"::jsonb)->>'accountId', '');

CREATE INDEX "IncomeRecord_scope_idx" ON "IncomeRecord"("scope");
CREATE INDEX "IncomeRecord_ownerUserId_idx" ON "IncomeRecord"("ownerUserId");
CREATE INDEX "IncomeRecord_accountId_idx" ON "IncomeRecord"("accountId");
CREATE INDEX "ExpenseRecord_scope_idx" ON "ExpenseRecord"("scope");
CREATE INDEX "ExpenseRecord_ownerUserId_idx" ON "ExpenseRecord"("ownerUserId");
CREATE INDEX "ExpenseRecord_accountId_idx" ON "ExpenseRecord"("accountId");

CREATE TABLE "FinancialAccount" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "institution" TEXT NOT NULL DEFAULT '',
  "startingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "creditLimit" DOUBLE PRECISION,
  "statementDay" INTEGER,
  "paymentDay" INTEGER,
  "color" TEXT NOT NULL DEFAULT '#7c5cff',
  "ownerUserId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinancialAccount_scope_idx" ON "FinancialAccount"("scope");
CREATE INDEX "FinancialAccount_ownerUserId_idx" ON "FinancialAccount"("ownerUserId");

CREATE TABLE "RecurringRule" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "category" TEXT NOT NULL DEFAULT '',
  "accountId" TEXT,
  "frequency" TEXT NOT NULL,
  "dayOne" INTEGER,
  "dayTwo" INTEGER,
  "ownerUserId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecurringRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecurringRule_scope_idx" ON "RecurringRule"("scope");
CREATE INDEX "RecurringRule_ownerUserId_idx" ON "RecurringRule"("ownerUserId");
