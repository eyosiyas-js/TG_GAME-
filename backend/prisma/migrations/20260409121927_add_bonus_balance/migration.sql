-- CreateEnum
CREATE TYPE "BannerType" AS ENUM ('TEXT', 'IMAGE');

-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN     "bonusBalance" DECIMAL(12,2) NOT NULL DEFAULT 0.00;

-- CreateTable
CREATE TABLE "Banner" (
    "id" TEXT NOT NULL,
    "type" "BannerType" NOT NULL,
    "title" TEXT,
    "message" TEXT,
    "imageUrl" TEXT,
    "linkUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);
