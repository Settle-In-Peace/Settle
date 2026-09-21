import 'dotenv/config';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { dataSource } from '../data-source';
import { CreateUsers1700000000000 } from './1700000000000-CreateUsers';
import { UpdateUserNames1700000000001 } from './1700000000001-UpdateUserNames';
import { CreateActivities1700000000002 } from './1700000000002-CreateActivities';
import { CreateDebts1700000000003 } from './1700000000003-CreateDebts';
import { CreateProvidersAndLeads1700000000004 } from './1700000000004-CreateProvidersAndLeads';
import { FixPasskeyColumns1700000000005 } from './1700000000005-FixPasskeyColumns';
import { AddLeadQualityTier1700000000006 } from './1700000000006-AddLeadQualityTier';
import { CreateCoachingEntities1700000000007 } from './1700000000007-CreateCoachingEntities';
import { AddMatchEmailSentAtAndProviderEmailVerified1700000000008 } from './1700000000008-AddMatchEmailSentAtAndProviderEmailVerified';
import { CreateMatches1700000000007_5 } from './1700000000007-CreateMatches';
import { AddMissingUserColumns1700000000009 } from './1700000000009-AddMissingUserColumns';
import { CreateDeposits1700000000010 } from './1700000000010-CreateDeposits';
import { AddPhoneOtpColumns1700000000011 } from './1700000000011-AddPhoneOtpColumns';
import { AddNotificationPreferences1700000000012 } from './1700000000012-AddNotificationPreferences';
import { AddLeadConsentAuditColumns1700000000012 } from './1700000000012-AddLeadConsentAuditColumns';
import { CreateCrmTables1700000000013 } from './1700000000013-CreateCrmTables';
import { AddUserDeletedAt1700000000014 } from './1700000000014-AddUserDeletedAt';
import { CreateRefreshTokens1700000000015 } from './1700000000015-CreateRefreshTokens';
import { AddUserSecurityColumns1700000000016 } from './1700000000016-AddUserSecurityColumns';
import { CreateDebtSettlementCrmTables1700000000017 } from './1700000000017-CreateDebtSettlementCrmTables';
import { AddProviderStripeColumns1700000000018 } from './1700000000018-AddProviderStripeColumns';
import { AddSalesLeadColumns1700000000019 } from './1700000000019-AddSalesLeadColumns';
import { CreateCollectionTables1700000000020 } from './1700000000020-CreateCollectionTables';
import { CreateSkipTraceTables1700000000021 } from './1700000000021-CreateSkipTraceTables';
import { CreateCallLogTables1700000000022 } from './1700000000022-CreateCallLogTables';
import { CreateCreditReportTables1700000000023 } from './1700000000023-CreateCreditReportTables';
import { CreateBackgroundCheckTables1700000000024 } from './1700000000024-CreateBackgroundCheckTables';
import { AddSalesFollowUpColumns1700000000025 } from './1700000000025-AddSalesFollowUpColumns';
import { CreateDebtPortfolioTables1700000000030 } from './1700000000030-CreateDebtPortfolioTables';
import { CreatePaymentPlanTables1700000000031 } from './1700000000031-CreatePaymentPlanTables';

type MigrationConstructor = new () => MigrationInterface;

// Keep this list ordered by the timestamp prefix in each migration filename.
const migrations: MigrationConstructor[] = [
  CreateUsers1700000000000,
  UpdateUserNames1700000000001,
  CreateActivities1700000000002,
  CreateDebts1700000000003,
  CreateProvidersAndLeads1700000000004,
  FixPasskeyColumns1700000000005,
  AddLeadQualityTier1700000000006,
  CreateCoachingEntities1700000000007,
  CreateMatches1700000000007_5,
  AddMatchEmailSentAtAndProviderEmailVerified1700000000008,
  AddMissingUserColumns1700000000009,
  CreateDeposits1700000000010,
  AddPhoneOtpColumns1700000000011,
  AddNotificationPreferences1700000000012,
  AddLeadConsentAuditColumns1700000000012,
  CreateCrmTables1700000000013,
  AddUserDeletedAt1700000000014,
  CreateRefreshTokens1700000000015,
  AddUserSecurityColumns1700000000016,
  CreateDebtSettlementCrmTables1700000000017,
  AddProviderStripeColumns1700000000018,
  AddSalesLeadColumns1700000000019,
  CreateCollectionTables1700000000020,
  CreateSkipTraceTables1700000000021,
  CreateCallLogTables1700000000022,
  CreateCreditReportTables1700000000023,
  CreateBackgroundCheckTables1700000000024,
  AddSalesFollowUpColumns1700000000025,
  CreateDebtPortfolioTables1700000000030,
  CreatePaymentPlanTables1700000000031,
];

async function ensureMigrationsTable(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(`
    CREATE TABLE IF NOT EXISTS "migrations" (
      "id" SERIAL PRIMARY KEY,
      "name" varchar(255) NOT NULL UNIQUE,
      "applied_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function hasMigrationBeenApplied(
  queryRunner: QueryRunner,
  migrationName: string,
): Promise<boolean> {
  const appliedMigrations: { id: number }[] = await queryRunner.query(
    'SELECT "id" FROM "migrations" WHERE "name" = $1 LIMIT 1',
    [migrationName],
  );

  return appliedMigrations.length > 0;
}

async function runMigration(): Promise<void> {
  await dataSource.initialize();
  console.log('Database connected');

  const queryRunner = dataSource.createQueryRunner();

  try {
    await queryRunner.connect();
    await ensureMigrationsTable(queryRunner);

    for (const Migration of migrations) {
      const migration = new Migration();
      const migrationName = migration.name || Migration.name;

      if (await hasMigrationBeenApplied(queryRunner, migrationName)) {
        console.log(`Skipping already applied migration: ${migrationName}`);
        continue;
      }

      console.log(`Running migration: ${migrationName}`);
      await queryRunner.startTransaction();

      try {
        await migration.up(queryRunner);
        await queryRunner.query(
          'INSERT INTO "migrations" ("name") VALUES ($1)',
          [migrationName],
        );
        await queryRunner.commitTransaction();
        console.log(`Completed migration: ${migrationName}`);
      } catch (error) {
        if (queryRunner.isTransactionActive) {
          await queryRunner.rollbackTransaction();
        }
        console.error(`Migration failed: ${migrationName}`, error);
        throw error;
      }
    }

    console.log('All migrations completed successfully');
  } finally {
    if (queryRunner.isReleased === false) {
      await queryRunner.release();
    }

    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

runMigration().catch((error) => {
  console.error('Migration runner failed:', error);
  process.exitCode = 1;
});
