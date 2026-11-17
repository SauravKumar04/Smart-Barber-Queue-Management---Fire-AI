# QueueLess

QueueLess lets customers scan a barbershop’s QR code, join its queue, and check their place from a private link. The shop owner manages the queue and barber chairs from a separate dashboard.

## Run locally

You’ll need Node.js 22.12 or later and MongoDB. A standard local MongoDB server on port 27017 works for development.

```sh
npm ci --prefix backend
npm ci --prefix frontend
cp backend/.env.example backend/.env
```

Set `MONGO_URI` in `backend/.env` to your connection string. Set `JWT_SECRET` to a random secret generated with `openssl rand -hex 32`. For Atlas, add your IP to the network access list and use a database user with access to the QueueLess database.

For local MongoDB, use the sample URI and make sure your MongoDB service is running. Run one backend process when using a standalone server.

Start the backend and frontend in separate terminals from the repository root:

```sh
npm run dev --prefix backend
npm run dev --prefix frontend
```

Open [http://localhost:5173](http://localhost:5173). Register as a shop owner, create a shop, and use **Open join page** to join as a customer. The customer pages require no account. If you change the backend port, copy `frontend/.env.example` to `frontend/.env` and update `API_PROXY_TARGET`.

To scan a QR code from another device during development, set `PUBLIC_APP_URL` to the machine’s LAN address and port, such as `http://192.168.1.20:5173`. Restart the backend, then open the owner portal at that same address and download the QR code again. Both devices must be able to reach that address over the local network.

## Gmail notifications

Set `SMTP_USER` to your Gmail address and `SMTP_PASS` to an app password from a Google account with 2-Step Verification and app passwords enabled. Google’s setup instructions are available in [Gmail Help](https://support.google.com/mail/answer/185833). Use `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, and set `EMAIL_FROM` to the account address or an approved sender alias.

The backend attempts a confirmation email and an approaching-turn email once per entry. A failed or interrupted attempt is left as-is to reduce duplicate mail. The queue keeps working without SMTP credentials or during a mail failure. The customer can always save the private status link from the confirmation page. Links expire seven days after joining.

## Queue rules

- Tokens reset daily for each shop. The shop day uses `SHOP_TIME_ZONE`, which defaults to `Asia/Kolkata`. Waiting entries from earlier days retain their queue order.
- Start service for the first waiting customer when a chair is free. Existing entries retain their chosen service and estimated duration after settings change.
- Customer position counts waiting customers. Estimated wait also accounts for services already in progress and the available chairs. Both portals refresh every 12 seconds.
- The live dashboard counts services completed today. Fieldwork figures come from valid timing rows in the original `data.csv` and include one approximate arrival.

## Checks

```sh
npm test --prefix backend
npm run build --prefix frontend
TEST_MONGO_URI='mongodb://127.0.0.1:27017/' npm test --prefix backend
```

The third command requires a test MongoDB server and permission to create and drop a randomly named test database. It uses test-only queue entries and a local server that deliberately rejects SMTP connections. To verify Gmail delivery, use your own address in a test shop and check for the confirmation and approaching-turn emails. Use a test deployment’s final HTTPS URL to verify a downloaded QR code from a phone.

## Production

Use a MongoDB replica set or sharded cluster for production so queue changes can use transactions. Build the frontend with `npm run build --prefix frontend`. Set `NODE_ENV=production`, the public HTTPS `PUBLIC_APP_URL`, and the backend environment variables at the host. Start with `npm start --prefix backend`. Express serves the built site and API from one origin. Keep `frontend/dist` and the original `data.csv` in the deployment. Set `TRUST_PROXY_HOPS` to the number of trusted proxy hops in front of Express if applicable. Keep the JWT secret stable across deploys to preserve sessions and private customer links.
