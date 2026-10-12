-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RoleName" ADD VALUE 'ASSISTANT_SECRETARY';
ALTER TYPE "RoleName" ADD VALUE 'ASSISTANT_TREASURER';
ALTER TYPE "RoleName" ADD VALUE 'PIO';
ALTER TYPE "RoleName" ADD VALUE 'REPRESENTATIVE';
