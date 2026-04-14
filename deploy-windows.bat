@echo off
echo.
echo  StayPilot - Deploy to Netlify
echo  ================================
echo.

:: Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
  echo  ERROR: Node.js not found.
  echo  Download from: https://nodejs.org  (LTS version)
  echo  Then run this script again.
  pause
  exit /b 1
)

echo  Step 1/4: Installing packages...
call npm install
if %errorlevel% neq 0 ( echo Install failed. & pause & exit /b 1 )

echo.
echo  Step 2/4: Building the app...
call npm run build
if %errorlevel% neq 0 ( echo Build failed. & pause & exit /b 1 )

echo.
echo  Step 3/4: Logging into Netlify...
call npx netlify-cli login
if %errorlevel% neq 0 ( echo Login failed. & pause & exit /b 1 )

echo.
echo  Step 4/4: Deploying...
call npx netlify-cli deploy --prod --site e78fdeb9-e1bb-4255-ac34-22bfbabe5fa4 --dir .next
if %errorlevel% neq 0 ( echo Deploy failed. & pause & exit /b 1 )

echo.
echo  SUCCESS! Your app is live at:
echo  https://staypilot-flora-lazur.netlify.app
echo.
pause
