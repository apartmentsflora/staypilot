#!/bin/bash
set -e

echo ""
echo " StayPilot - Deploy to Netlify"
echo " ================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo " ERROR: Node.js not found."
  echo " Download from: https://nodejs.org  (LTS version)"
  exit 1
fi

echo " Step 1/4: Installing packages..."
npm install

echo ""
echo " Step 2/4: Building the app..."
npm run build

echo ""
echo " Step 3/4: Logging into Netlify (browser will open)..."
npx netlify-cli login

echo ""
echo " Step 4/4: Deploying to your site..."
npx netlify-cli deploy --prod --site e78fdeb9-e1bb-4255-ac34-22bfbabe5fa4 --dir .next

echo ""
echo " SUCCESS! Your app is live at:"
echo " https://staypilot-flora-lazur.netlify.app"
echo ""
