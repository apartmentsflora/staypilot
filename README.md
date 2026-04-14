# StayPilot — Flora & Lazur
Reservation system · Beds24 · Booking.com · Website sync

---

## Your site is already configured on Netlify
**URL:** https://staypilot-flora-lazur.netlify.app  
All environment variables are already set. Just run the deploy script.

---

## Deploy — pick your system

### Windows
1. Install Node.js LTS from https://nodejs.org (if not already installed)
2. Unzip this ZIP to a folder on your desktop
3. Double-click **deploy-windows.bat**
4. A browser opens — log in to Netlify — done

### Mac or Linux
1. Install Node.js LTS from https://nodejs.org (if not already installed)
2. Unzip, open Terminal in that folder, run:
   chmod +x deploy-mac-linux.sh && ./deploy-mac-linux.sh
3. Log in to Netlify in the browser that opens — done

---

## Login after deploy
URL:      https://staypilot-flora-lazur.netlify.app
Email:    admin@staypilot.local
Password: StayPilot2026!

---

## Webhook URLs
Beds24:       https://staypilot-flora-lazur.netlify.app/api/integrations/beds24/webhook
Booking.com:  https://staypilot-flora-lazur.netlify.app/api/integrations/booking/webhook
Website:      https://staypilot-flora-lazur.netlify.app/api/integrations/website/webhook
Availability: https://staypilot-flora-lazur.netlify.app/api/availability?start=YYYY-MM-DD&end=YYYY-MM-DD
