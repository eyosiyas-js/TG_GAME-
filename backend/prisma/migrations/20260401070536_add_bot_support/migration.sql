-- AlterTable
ALTER TABLE "User" ADD COLUMN     "botConfig" JSONB,
ADD COLUMN     "isBot" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BotGameState" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "winningNumbers" INTEGER[],
    "calledNumbers" INTEGER[],
    "moveCount" INTEGER NOT NULL DEFAULT 0,
    "strategy" TEXT NOT NULL DEFAULT 'OPTIMAL',
    "nextMoveAt" TIMESTAMP(3),
    "isWinning" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotGameState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BotGameState_matchId_key" ON "BotGameState"("matchId");

-- AddForeignKey
ALTER TABLE "BotGameState" ADD CONSTRAINT "BotGameState_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
