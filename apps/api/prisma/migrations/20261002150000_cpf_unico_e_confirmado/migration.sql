-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cpfVerifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_cpfHash_key" ON "User"("cpfHash");
