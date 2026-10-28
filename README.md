# InHouseGym Backend

Products, offers, users aur rentals ko **sab devices par sync** rakhne wala chhota sa API server.
Frontend (InHouseGym website) ka admin dashboard isi se baat karta hai.

## Isme kya hai

| Endpoint | Kaam |
|---|---|
| `GET /api/health` | Server zinda hai ya nahi |
| `GET /api/products` | Poora equipment catalog lao |
| `PUT /api/products` | Catalog save karo (**admin key chahiye**) |
| `GET /api/offer` | Sale/offer setting lao |
| `PUT /api/offer` | Sale/offer setting save karo (**admin key chahiye**) |
| `POST /api/auth/register` | Naya user banao (password hash karke save hota hai) |
| `POST /api/auth/login` | User login (hash se password check hota hai) |
| `POST /api/auth/reset-password` | Forgot password ke baad OTP verify hone par password badlo |
| `GET /api/users` | Saare registered users (**admin key chahiye**, password kabhi nahi bhejte) |
| `DELETE /api/users/:id` | User delete karo (**admin key chahiye**) |
| `POST /api/users/migrate` | Purane laptop ke users ko backend me lao (**admin key chahiye**) |
| `GET /api/rentals` | Saare rentals, ya `?email=...` se ek customer ke rentals (**admin key chahiye**) |
| `POST /api/rentals` | Checkout par rental save karo |
| `POST /api/rentals/migrate` | Purane laptop ke rentals ko backend me lao (**admin key chahiye**) |
| `PUT /api/rentals/:id` | Rental cancel / status badlo (sirf status fields) |
| `DELETE /api/rentals/:id` | Rental delete karo (**admin key chahiye**) |

Admin wali calls me header bhejna hota hai: `x-admin-key: <tumhara ADMIN_KEY>`

## Admin cross-device fix (2026-10-27)

Pehle users aur rentals sirf browser ke localStorage me save hote the, isliye admin ko dusre
device par kuch nahi dikhta tha. Ab signup, login, checkout aur admin dashboard isi backend
se baat karte hain. Admin dashboard pehli baar khulne par laptop ke purane local data ko
bhi backend par migrate kar deta hai, taaki purana data gayab na ho. Naya data seedha
backend par save hota hai, isliye har device ka admin wahi data dekhta hai.

## Update karna hai to (pehle se live service ke liye)

Ye backend pehle se GitHub repo `giitsolutions/inhouse-gym-backend-` (aakhir me `-` hai)
aur Render service `inhouse-gym-backend` par live hai. Naya service banane ki zaroorat nahi hai:

1. Is folder ke files ko usi GitHub repo me push karo (`.env` kabhi push mat karo).
2. Render par service khud naya code deploy kar lega (auto-deploy on hai to).
3. Koi naya environment variable nahi chahiye — purane `MONGODB_URI` aur `ADMIN_KEY` hi kaafi hain.
   `bcryptjs` naya dependency hai, jo `package.json` me hai, isliye Render par `npm install` par khud install ho jayega.
4. Deploy ke baad `https://inhouse-gym-backend.onrender.com/api/health` par `{"ok":true}` check karo.

## Setup (step by step)

### Step 1 — MongoDB Atlas (free database)

1. [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) par free account banao
2. **Create Cluster** → `M0 Free` tier chuno → cluster banao (2-3 min lagte hain)
3. **Database Access** → **Add New Database User** → username + password banao (password kahin note kar lo)
4. **Network Access** → **Add IP Address** → **Allow Access from Anywhere** (`0.0.0.0/0`) — Render ka IP fix nahi hota, isliye ye chahiye
5. Cluster par **Connect** → **Drivers** → **Node.js** → connection string copy karo, usme `<password>` ki jagah apna password daalo:
   `mongodb+srv://<username>:<password>@<cluster>.mongodb.net/inhouse-gym`

### Step 2 — GitHub par daalo

1. Is folder ko ek naye GitHub repo me push karo (jaise `inhouse-gym-backend`)
2. Dhyaan rahe: `.env` file **kabhi push mat karo** (`.gitignore` me already hai)

### Step 3 — Render par deploy

1. [render.com](https://render.com) → **New +** → **Web Service** → apna repo connect karo
2. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - Plan: **Free**
3. **Environment Variables** me 2 add karo:
   - `MONGODB_URI` = Step 1 wala connection string
   - `ADMIN_KEY` = koi strong secret — **yehi value frontend ke `ADMIN_KEY` me bhi rakhni hai**
4. **Deploy** dabao → 2-4 min me URL milega, jaise `https://inhouse-gym-backend.onrender.com`
5. Browser me `https://<tumhara-url>/api/health` kholo — `{"ok":true}` dikhe to server chal raha hai

### Step 4 — Frontend jodo

Frontend ke `src/main.jsx` me (sabse upar, storage keys ke paas):

```js
const API_URL = "https://inhouse-gym-backend.onrender.com"; // apna Render URL
const ADMIN_KEY = "<tumhara ADMIN_KEY>"; // Render par jo ADMIN_KEY rakha, wahi
```

Bas. Frontend pehli baar khulne par backend se fresh data layega, aur admin me har save backend par bhi jayega.

### Step 5 — Pehli sync (important!)

Deploy ke baad database **khaali** hai. **Laptop** par admin dashboard kholo aur koi chhota change karke **Save** dabao (jaise kisi product ka naam) — poora catalog backend me upload ho jayega. Uske baad phone par site refresh karo — sab dikhega.

## Notes

- Render free tier par 15 min idle rehne ke baad server so jata hai; pehli request par ~30-50 second lag sakte hain. Uske baad sab fast.
- `ADMIN_KEY` kisi ko mat batao — jiske paas ye hai wo products/offer badal sakta hai.
- Local me test karna ho to: `.env.example` ko copy karke `.env` banao, values bharke `npm start` chalao.
