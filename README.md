# Security Check-in Bot

WhatsApp bot for security personnel to report their location and photo, logged automatically to Google Sheets.

## How it works

1. Guard sends their **location** via WhatsApp
2. Guard sends a **photo** of their post
3. Bot logs a row to Google Sheets: timestamp, name, phone, GPS, map link, photo link
4. Guard receives a confirmation message

---

## Setup

### 1. Google Cloud — Service Account

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g. `SecurityBot`)
3. Enable these APIs:
   - **Google Sheets API**
   - **Google Drive API**
4. Go to **IAM & Admin → Service Accounts → Create Service Account**
5. Name it `securitybot`, click Create
6. Click the service account → **Keys → Add Key → JSON**
7. Download the JSON file — you'll paste its contents into Railway

### 2. Google Sheet

1. Open your existing Google Sheet
2. Copy the **Spreadsheet ID** from the URL:
   `https://docs.google.com/spreadsheets/d/**SPREADSHEET_ID**/edit`
3. Add headers to row 1:
   `Timestamp | Name | Phone | Latitude | Longitude | Map Link | Photo`
4. **Share the sheet** with your service account email
   (looks like `securitybot@your-project.iam.gserviceaccount.com`)
   — give it **Editor** access

### 3. Deploy to Railway

1. Push this folder to a GitHub repo
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select your repo
4. Go to **Variables** tab and add all values from `.env.example`
5. Railway will auto-deploy and give you a public URL like:
   `https://security-bot-production.up.railway.app`

### 4. Register webhook in Meta

1. Go to Meta App Dashboard → **WhatsApp → Configuration**
2. **Callback URL**: `https://your-railway-url.up.railway.app/webhook`
3. **Verify Token**: same value as your `VERIFY_TOKEN` env var
4. Subscribe to: `messages`
5. Click **Verify and Save**

---

## Environment Variables

| Variable | Description |
|---|---|
| `WHATSAPP_TOKEN` | Meta access token (rotate regularly) |
| `PHONE_NUMBER_ID` | From Meta WhatsApp API Setup page |
| `BUSINESS_ID` | From Meta WhatsApp API Setup page |
| `VERIFY_TOKEN` | Any secret string you choose |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full contents of service account JSON |
| `SPREADSHEET_ID` | ID from your Google Sheet URL |
| `DRIVE_FOLDER_ID` | Optional: Drive folder for photos |

---

## Google Sheet columns

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| Timestamp | Name | Phone | Latitude | Longitude | Map Link | Photo |
