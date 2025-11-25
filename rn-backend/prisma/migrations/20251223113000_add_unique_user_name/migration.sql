-- Enforce unique display names for user registration
CREATE UNIQUE INDEX "User_name_key" ON "User"("name");
