-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'CONFIRMED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "confirmationEmailSentAt" TIMESTAMP(3),
ADD COLUMN     "failureReason" TEXT;
