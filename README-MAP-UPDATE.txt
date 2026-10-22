MetroMate Ahmedabad — map and journey planner update

Run
---
1. Extract the ZIP completely.
2. Open the 44489962 folder in VS Code.
3. Open Terminal and run: node server.js
4. Visit http://localhost:3000 (sign-in / create-account page). After signing in, the app opens map.html. You can also visit http://localhost:3000/auth.html directly.
5. Keep the terminal open while using the website.

Changes in this build
---------------------
- Naranpura reference radius changed to 10 km.
- Journey input dropdowns show place names only; mode labels appear in the results.
- Results compare Metro, BRTS, AMTS, BRTS + Metro and AMTS + Metro with estimated time/fare labels.
- Each result can create a demo journey-request QR and download a JSON request file. The QR is NOT a payment QR and does not transfer money.
- Added /api/osm-stops, which attempts to load mapped bus stops within 10 km from OpenStreetMap Overpass. Internet is required for this lookup.
- If OpenStreetMap is unavailable, the page falls back to its built-in sample bus stops. This is not a complete official list.
- Payment/booking API responses now say DEMO_ONLY instead of falsely claiming a successful real payment.

Important data limitations
--------------------------
OpenStreetMap coverage and operator tags are incomplete. Stops with no AMTS/BRTS operator tag are displayed as local bus-stop candidates and labelled unverified; some BRTS stops may not be classified correctly if their tags are missing. This build does not yet have verified official route numbers, every stop-to-stop connection, live departures, or authoritative fare calculations. Journey durations/fares are planning estimates based on straight-line distance, not guaranteed route results.

Payment limitation
------------------
A real payable UPI QR requires a verified merchant UPI ID or a payment gateway integration. This demo only generates a journey request QR and does not accept or transfer real money.

Login / sign-up update
----------------------
- The root URL opens the sign-in / create-account page.
- New users can choose Create account; returning users choose Sign in.
- After successful sign-in or account creation, the browser opens map.html.
- Directly opening map.html requires a valid sign-in. Use Sign out in the header to return to auth.html.
- Accounts and sessions are handled by the local Node.js server and SQLite database. Keep node server.js running. This is a local educational demo, not a production identity service.
