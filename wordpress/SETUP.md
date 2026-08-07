# Rare Comics Collectors — WordPress Setup Guide

> Complete step-by-step from zero to live store.

---

## Prerequisites

- A computer with Node.js 18+ installed (for the GoCollect scraper)
- A credit/debit card for the Hostinger plan
- Your Stripe and/or PayPal account credentials
- Optional: CGC Dealer API key (apply at cgccomics.com/dealer-program)
- Optional: Anthropic API key for AI grading (console.anthropic.com)

---

## Step 1 — Buy Hostinger Hosting

1. Go to **https://www.hostinger.com/web-hosting**
2. Choose **Business** or **Premium** plan (Business recommended — it includes a free domain)
3. Register the domain **rarecomicscollectors.com** (or your preferred name)
4. Complete checkout — you'll receive a confirmation email

> The Business plan gives you enough PHP memory (256 MB) for WooCommerce + Elementor.

---

## Step 2 — Install WordPress

1. Log in to **hPanel** (hpanel.hostinger.com)
2. Go to **Websites → Add Website**
3. Select **WordPress** as the platform
4. Fill in site title: `Rare Comics Collectors`, admin email, username, password
5. Click **Install** — WordPress will be ready in ~2 minutes
6. Note down your **WP Admin URL**: `https://yourdomain.com/wp-admin`

---

## Step 3 — Install Required Plugins via WP Admin

Log in to WP Admin → **Plugins → Add New** and install + activate each:

| Plugin | Where to find |
|--------|--------------|
| WooCommerce | WordPress.org (free) |
| Elementor | WordPress.org (free) |
| Elementor Pro | elementor.com (paid — needed for full theme builder) |
| WooCommerce Stripe Gateway | WordPress.org (free) |
| WooCommerce PayPal Payments | WordPress.org (free) |

After activating WooCommerce, run the **Setup Wizard**:
- Currency: USD
- Selling location: your country
- Skip shipping for now (digital/collector items, manual shipping)

---

## Step 4 — Upload the RCC Custom Plugins

The three plugins live in `wordpress/plugins/`. Upload each one:

1. In WP Admin go to **Plugins → Add New → Upload Plugin**
2. Upload and activate in this order:
   - `rcc-comics-woocommerce.zip` — graded comic product type
   - `rcc-cgc-verifier.zip` — live CGC cert lookup widget
   - `rcc-grading-estimator.zip` — AI photo grading estimator

**To create the .zip files** (Windows PowerShell):
```powershell
Compress-Archive -Path wordpress/plugins/rcc-comics-woocommerce     -DestinationPath rcc-comics-woocommerce.zip
Compress-Archive -Path wordpress/plugins/rcc-cgc-verifier           -DestinationPath rcc-cgc-verifier.zip
Compress-Archive -Path wordpress/plugins/rcc-grading-estimator      -DestinationPath rcc-grading-estimator.zip
```

---

## Step 5 — Configure API Keys

### CGC Cert Verifier
1. WP Admin → **Settings → RCC Cert Verifier**
2. Paste your **CGC Dealer API key** (apply at cgccomics.com/dealer-program)
3. Save — without a key the widget still works but links to CGC's public lookup

### AI Grading Estimator
1. WP Admin → **Settings → RCC Grading Estimator**
2. Choose provider: **Anthropic Claude** (recommended) or OpenAI GPT-4o
3. Paste your API key and save
4. Get a Claude key: **console.anthropic.com** → API Keys → Create Key

---

## Step 6 — Import the 18 Comics as WooCommerce Products

1. WP Admin → **Products → Import**
2. Click **Choose File** and select `wordpress/import/woo-products.csv`
3. Click **Continue** → on the mapping screen WooCommerce auto-maps standard columns
4. For the `meta:_rcc_*` columns, map each to **"Don't import"** or leave as-is — the plugin reads them directly from post meta
5. Click **Run the importer** — all 18 comics will appear under **Products**
6. Open each product, change the **Product Type** dropdown to **Graded Comic**, fill in any missing meta fields, and click Update

> **Tip:** After import, add cover images by going to each product and uploading a scan via the **Product Image** box.

---

## Step 7 — Set Up Payment Methods

### Stripe (Credit / Debit Cards)
1. WP Admin → **WooCommerce → Settings → Payments → Stripe**
2. Click **Set up** → sign in to or create your Stripe account
3. Toggle **Enable Stripe** on — test mode first, then live when ready

### PayPal
1. WP Admin → **WooCommerce → Settings → Payments → PayPal Payments**
2. Click **Set up** → connect your PayPal Business account
3. Enable **PayPal Smart Buttons** for checkout

### Manual / Bank Transfer (optional)
1. WP Admin → **WooCommerce → Settings → Payments → Direct bank transfer**
2. Enable and fill in your bank details — customers will see them at checkout

---

## Step 8 — Build Pages with Elementor

Create these pages in WP Admin → **Pages → Add New**, set the template to **Elementor Canvas**, then open in Elementor:

| Page | Suggested content |
|------|-------------------|
| **Shop** | Add an **HTML widget** → paste `[rcc_comics_grid columns="3" limit="18"]` |
| **Golden Age** | `[rcc_comics_grid era="Golden Age" columns="3"]` |
| **Silver Age** | `[rcc_comics_grid era="Silver Age" columns="3"]` |
| **Verify Certificate** | `[rcc_cert_verify]` inside an HTML widget |
| **Grade My Comic** | `[rcc_grading_estimator]` inside an HTML widget |
| **About / Policies** | Text widgets with your return policy, grading policy, shipping info |

**Apply brand styles:** Elementor → **Site Settings → Custom CSS** → paste the contents of `wordpress/elementor-brand-kit.css`.

**Add Google Fonts:**
1. Elementor → Site Settings → Typography
2. Primary font: **Inter** (body)
3. Secondary font: **Playfair Display** (headings)

---

## Step 9 — Run the GoCollect Scraper (Optional Price Updates)

The scraper pulls recent CGC sale prices from GoCollect.com and regenerates `woo-products.csv`.

```bash
cd wordpress/scraper
npm install
node gocollect-scraper.js           # all 18 comics
node gocollect-scraper.js --era golden
node gocollect-scraper.js --era silver
```

After it completes, re-import `wordpress/import/woo-products.csv` via **Products → Import** (check **Update existing products**) to refresh prices.

> GoCollect may occasionally block automated requests. When that happens the scraper falls back to the hardcoded prices already in the CSV. Just re-run after a few hours.

---

## Shortcode Reference

| Shortcode | What it does |
|-----------|-------------|
| `[rcc_comics_grid]` | Product grid — accepts `era`, `limit`, `columns` |
| `[rcc_cert_verify]` | Live CGC certificate lookup widget |
| `[rcc_grading_estimator]` | AI photo grading upload form |

---

## Brand Colour Reference

| Token | Hex | Use |
|-------|-----|-----|
| Red primary | `#e11d48` | Buttons, badges, logo "Rarecomic" |
| Red deep | `#9f1239` | Hover states, logo "collectors" |
| Red light | `#fff1f2` | Section backgrounds, key-issue banners |
| Ink 900 | `#0f172a` | Headlines |
| Ink 600 | `#475569` | Body text |
| Ink 400 | `#94a3b8` | Captions, metadata |
