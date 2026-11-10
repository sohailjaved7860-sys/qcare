# QCare Candles: store, backend and admin (v1)

This is the first working slice of the QCare spec: the existing site, now connected to a database,
with server-priced orders, stock, and an admin dashboard. Payment is by UPI QR sent on WhatsApp.

## What is in this folder

| Path | What it is |
|---|---|
| `index.html`, `css/`, `js/`, `assets/` | The public shop (your existing design, split into cacheable files) |
| `policies.html` | Shipping, payment, cancellation, returns, refund, privacy, terms. **Has 14 yellow placeholders you must replace** |
| `admin/` | Admin dashboard (sign-in required) |
| `supabase/schema.sql` | The whole backend: tables, security rules, order logic. Run once |
| `js/config.js` | The only file you edit to connect the site to Supabase and to change contact details |
| `.github/workflows/keepalive.yml` | Daily ping so the free Supabase project is not paused |

## How an order works

1. Customer fills the cart and delivery details and taps **Place order**.
2. The database (not the browser) prices the cart, checks stock and coupon, saves the order as
   *Awaiting payment* and returns an order number such as `QC1001`.
3. The site shows the amount and a button that opens WhatsApp with the order number.
4. You open **Admin > Orders > QC1001**. The total there is the real one. Tap
   **WhatsApp: request payment**, attach your UPI QR, send.
5. When the money shows in your bank / UPI app, type the UTR into the order and tap **Mark paid**.
   Stock is deducted at this moment. A screenshot from the customer is not proof of payment.
6. Pack, enter courier and tracking number, **Mark shipped**, then **WhatsApp: send tracking**.
7. **Mark delivered**. Cancelling a paid, unshipped order puts the stock back automatically.

If Supabase is unreachable, the shop still works: the order goes to WhatsApp as text, clearly marked
"not saved on the website", exactly like your old site.

## Setup (about 30 minutes)

Use a business-controlled email for every account, and turn on two-factor login for GitHub and Supabase.

**1. Supabase**
- Create a project at supabase.com (region: Mumbai). Save the database password in a password manager.
- SQL Editor > New query > paste all of `supabase/schema.sql` > Run. It must finish without errors.
- Authentication > Users > Add user: your login email and a long password.
- Authentication settings: switch **off** "Allow new users to sign up".
- SQL Editor, run (with your email):
  ```sql
  insert into public.admins (user_id, role)
  select id, 'owner' from auth.users where email = 'YOUR-LOGIN-EMAIL';
  ```
  For a helper later, add their user the same way with role `'staff'` (no access to coupons/settings).

**2. Connect the site**
- Project Settings > API: copy the Project URL and the **publishable** key (older projects call it the `anon` key).
- Paste both into `js/config.js`. Never put the secret / `service_role` key in any file in this folder.

**3. GitHub Pages**
- Create a repository, upload the contents of this folder, Settings > Pages > Deploy from branch `main`.
- Settings > Pages > Custom domain: `qcare.in`, tick Enforce HTTPS.
- At your domain registrar add four A records for `@`: `185.199.108.153`, `185.199.109.153`,
  `185.199.110.153`, `185.199.111.153`, and a CNAME `www` pointing to `YOUR-USERNAME.github.io`.
- Repo Settings > Secrets and variables > Actions > Variables: add `SUPABASE_URL` and `SUPABASE_KEY`
  (same two values as config.js) so the keep-alive job runs.

**4. First things to do in the admin** (`https://qcare.in/admin/`)
- Products: weigh one fully packed parcel and correct **Packed weight** (it is set to 100 g as a guess).
- Products: enter **Making cost** for each variant if you want the margin figure.
- Products: tap **Set** to enter stock. Until you do, an item is "not tracked" and always available.
- Settings: check the shipping charges. Leave GST off until your GSTIN arrives, then switch it on there.

**5. Before you tell anyone the site is live**
- Replace every yellow placeholder in `policies.html`.
- Place a test order on your phone, take it through paid > shipped > delivered, and cancel a second one.
- Settings > Download full backup. Do this weekly: the free Supabase plan keeps no backups.

## Security: what protects you, and what does not yet

Protects you now
- The public key can read no table. The shop can call exactly five database functions.
- Prices, shipping, coupon and total are computed in the database. Editing the page or the WhatsApp
  text changes nothing in your records.
- Order status, payment and stock can only change through logged admin functions. Even an admin
  cannot edit an order total.
- Double-taps and retries cannot create duplicate orders.
- Limits: 5 orders per phone per hour, 15 per IP, 300 site-wide.
- Strict Content-Security-Policy; no third-party scripts (three.js and the Supabase client are bundled).

Not covered yet (be aware)
- No CAPTCHA. Someone determined can still fill your order list with junk up to the hourly limits.
  You would cancel them; no money or stock is affected because stock moves only when you mark paid.
- Admin login has no second factor yet. Use a long unique password.
- The address shown on the Contact section is a home address. Decide if you want that public.
- Free Supabase can still pause or be down. The WhatsApp fallback covers ordering; the admin will not load.
- Tested against a local Postgres + PostgREST with a stand-in for Supabase login. Not yet run
  against a real Supabase project: real sign-in and product image upload are the two parts to check first.

## Not built yet, in the order I would do them

1. Policies finalised, test orders, go live with this.
2. GST invoices (PDF with invoice numbers) once the GSTIN is issued and your accountant confirms the format.
3. Razorpay or Cashfree when you are ready for a gateway (needs one server function for the webhook).
4. Shiprocket or similar for live rates, PIN serviceability, AWB and labels, replacing the flat rates.
5. Expense entry and a real profit and loss report; customer accounts; reviews.
6. CRM sync, loyalty, referrals, WhatsApp Business API automation. Only when volume justifies the cost.
