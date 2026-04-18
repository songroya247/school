# UE School — Deployment Guide

Live at: **https://school.ultimateedge.info**

---

## File Structure

```
/
├── index.html              ← Landing page
├── login.html              ← Sign up / Login (4-step)
├── confirm.html            ← Email confirmation holding page
├── forgot-password.html    ← Password reset request
├── reset-password.html     ← New password entry
├── dashboard.html          ← Student dashboard (protected)
├── classroom.html          ← Video lessons + quick quiz (protected)
├── cbt.html                ← CBT practice engine (protected)
├── report.html             ← Mastery report (own + shareable token)
├── pricing.html            ← Pricing & Paystack checkout
├── contact.html            ← Contact form → Supabase
├── 404.html                ← GitHub Pages fallback
├── css/
│   └── main.css
└── js/
    ├── app.js              ← Shared: toast, slider
    ├── supabase.js         ← Supabase client (reference)
    ├── auth.js             ← Signup, login, password reset
    ├── auth-guard.js       ← Session protection + nav rendering
    ├── dashboard.js        ← Live dashboard data engine
    ├── smartpath.js        ← SmartPath™ recommendation engine
    ├── grading.js          ← Mastery/accuracy/XP calculation
    ├── questions.js        ← Question bank (60+ questions, 7 subjects)
    ├── classroom.js        ← Classroom curriculum + quiz engine
    └── payment.js          ← Paystack inline checkout
```

---

## GitHub Pages Setup

1. Push this folder to a GitHub repository (e.g. `ultimateedge-school`)
2. Go to **Settings → Pages**
3. Set source: **Deploy from a branch → main → / (root)**
4. Set custom domain: `school.ultimateedge.info`
5. Enable **Enforce HTTPS**

### CNAME file
Create a file named `CNAME` (no extension) in the root with contents:
```
school.ultimateedge.info
```

### DNS Setup (at your domain registrar)
Add a CNAME record:
```
Type:  CNAME
Host:  school
Value: your-github-username.github.io
TTL:   3600
```

---

## Supabase Configuration

**Project URL:** `https://hazwqyvnolgdkokehjhr.supabase.co`

### Auth Settings (Supabase Dashboard → Auth → URL Configuration)
```
Site URL:      https://school.ultimateedge.info
Redirect URLs: https://school.ultimateedge.info/**
               https://school.ultimateedge.info/confirm.html
               https://school.ultimateedge.info/reset-password.html
```

### Email Templates
In Auth → Email Templates, update the confirmation email redirect to:
```
https://school.ultimateedge.info/confirm.html
```

### Run these SQL files in order (Supabase SQL Editor)
1. `schema.sql` — creates all tables, RLS policies, indexes
2. `migration.sql` — adds v4.1 columns if upgrading

---

## Paystack Configuration

Live Public Key: `pk_live_681bc4436b4c4249010d01795bb05f655cd470eb`

Plans:
| Plan | Code | Amount |
|------|------|--------|
| Monthly | `PLN_jctl2fmbtbprn79` | ₦1,500 |
| Quarterly | `PLN_7k27rm469etnc8y` | ₦3,500 |
| Annual | `PLN_vg1odwe75m793nk` | ₦12,000 |

Paystack Webhook (optional for auto-renewal):
- URL: `https://school.ultimateedge.info/webhook` (requires a backend — not implemented in static version)

---

## Going Live Checklist

- [ ] Push all files to GitHub
- [ ] GitHub Pages enabled with custom domain
- [ ] HTTPS enforced
- [ ] Supabase Site URL + Redirect URLs set
- [ ] Supabase schema.sql run
- [ ] Paystack plans created (already done)
- [ ] Test signup → email confirm → dashboard flow
- [ ] Test payment → subscription activation
- [ ] Test CBT session → results saved to Supabase
- [ ] Test report share link
- [ ] Test contact form (check Supabase contact_submissions table)

---

## Tech Stack

- **Frontend:** Vanilla HTML, CSS, JavaScript (zero frameworks, zero build tools)
- **Auth & Database:** Supabase (PostgreSQL + Row Level Security)
- **Payments:** Paystack Inline JS
- **Hosting:** GitHub Pages (free, custom domain)
- **Fonts:** Google Fonts (Syne, DM Sans, Inter, JetBrains Mono)

---

## Support

Contact: school.ultimateedge.info/contact.html