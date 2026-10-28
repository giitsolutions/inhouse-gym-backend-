// InHouseGym backend — products, offers, users aur rentals sab devices par sync rakhta hai.
// Deploy: Render (Web Service). Database: MongoDB Atlas (free tier).
//
// FIX (2026-10-27): pehle users aur rentals sirf browser ke localStorage me save hote the,
// isliye admin ko dusre laptop/mobile par kuch nahi dikhta tha. Ab signup, login,
// checkout aur admin dashboard isi backend se baat karte hain, isliye data har device par dikhta hai.
// Password kabhi seedha (plaintext) save nahi hota — bcrypt hash me save hota hai.
// Users aur rentals ki list sirf admin key se milti hai, products/offer ki tarah public nahi hai.

require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");

const app = express();
app.use(cors()); // frontend kahin se bhi hosted ho, chalne do
// Rentals me Aadhaar/PAN document ki data-URL bhi aa sakti hai (max 2 MB per file),
// isliye limit 2 MB se badhakar 20 MB rakhi hai. Ek rental document MongoDB ki 16 MB limit
// ke andar rehna chahiye; zyada items ek saath ho to checkout ko chhote batches me bhejo.
app.use(express.json({ limit: "20mb" }));

const PORT = process.env.PORT || 5000;
const ADMIN_KEY = process.env.ADMIN_KEY || "change-this-admin-key";

// ---------- Database ----------
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((e) => console.error("MongoDB connection error:", e.message));

// Ek hi collection, key-value style: "products" aur "offer" do documents.
// Poora catalog ek saath save hota hai (frontend bhi poora array bhejta hai),
// isliye alag-alag product routes ki zaroorat nahi — simple aur robust.
const kvSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  data: mongoose.Schema.Types.Mixed,
  updatedAt: { type: Date, default: Date.now },
});
const KV = mongoose.model("KV", kvSchema);

// ---------- Users ----------
// email hamesha lowercase me save hoti hai, taaki "ABC@x.com" aur "abc@x.com" alag user na bane.
const userSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    // Checkout se aane wali KYC info (masked numbers + file names; file data bhi ho sakta hai)
    customerAadhaar: { type: String, default: "" },
    customerPan: { type: String, default: "" },
    customerAadhaarFile: { type: String, default: "" },
    customerAadhaarFileName: { type: String, default: "" },
    customerPanFile: { type: String, default: "" },
    customerPanFileName: { type: String, default: "" },
  },
  { timestamps: true }
);
const User = mongoose.model("User", userSchema);

// ---------- Rentals / Orders ----------
// strict:false isliye hai taaki frontend ka poora rental object (product fields,
// order fields, customer fields) bina kuch khoye save ho jaye. Original local id
// bhi "id" field me rehta hai, taaki purane cancel/delete logic kaam karein.
const rentalSchema = new mongoose.Schema(
  {
    id: mongoose.Schema.Types.Mixed,
    order: { type: String, default: "" },
    status: { type: String, default: "Active" },
    customerName: { type: String, default: "" },
    customerPhone: { type: String, default: "" },
    customerAddress: { type: String, default: "" },
    customerCity: { type: String, default: "" },
    customerPin: { type: String, default: "" },
    customerAadhaar: { type: String, default: "" },
    customerPan: { type: String, default: "" },
    customerAadhaarFile: { type: String, default: "" },
    customerAadhaarFileName: { type: String, default: "" },
    customerPanFile: { type: String, default: "" },
    customerPanFileName: { type: String, default: "" },
    customerEmail: { type: String, default: "", lowercase: true, trim: true },
  },
  { strict: false, timestamps: true }
);
const Rental = mongoose.model("Rental", rentalSchema);

// ---------- Helpers ----------
function publicUser(doc) {
  if (!doc) return null;
  const u = doc.toObject ? doc.toObject() : doc;
  const { passwordHash, __v, ...rest } = u;
  return rest;
}

function isBcryptHash(value) {
  return typeof value === "string" && /^\$2[aby]\$/.test(value);
}

async function hashPassword(password) {
  return bcrypt.hash(String(password), 10);
}

// Sirf wahi likh/padh sakta hai jiske paas sahi ADMIN_KEY ho.
// Products/offer ka GET public hai (public data), lekin users/rentals ka GET
// personal data hai, isliye us par admin key zaroori hai.
function needAdmin(req, res, next) {
  if (req.headers["x-admin-key"] !== ADMIN_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

function validEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email.trim());
}

// Rental ko _id, ya purani local "id", ya order number se dhoondho.
async function findRentalByParam(param) {
  if (mongoose.Types.ObjectId.isValid(param)) {
    const byId = await Rental.findById(param);
    if (byId) return byId;
  }
  const byLocalId = await Rental.findOne({ id: param });
  if (byLocalId) return byLocalId;
  // id number bhi ho sakta hai (Date.now())
  if (!Number.isNaN(Number(param))) {
    const byNumId = await Rental.findOne({ id: Number(param) });
    if (byNumId) return byNumId;
  }
  return null;
}

// ---------- Routes ----------
app.get("/api/health", (req, res) => res.json({ ok: true }));

app.get("/api/products", async (req, res) => {
  try {
    const doc = await KV.findOne({ key: "products" });
    res.json(doc ? doc.data : []);
  } catch (e) {
    res.status(500).json({ error: "db error" });
  }
});

app.put("/api/products", needAdmin, async (req, res) => {
  try {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({ error: "products must be an array" });
    }
    await KV.findOneAndUpdate(
      { key: "products" },
      { key: "products", data: req.body, updatedAt: new Date() },
      { upsert: true }
    );
    res.json({ ok: true, count: req.body.length });
  } catch (e) {
    res.status(500).json({ error: "db error" });
  }
});

app.get("/api/offer", async (req, res) => {
  try {
    const doc = await KV.findOne({ key: "offer" });
    res.json(doc ? doc.data : null);
  } catch (e) {
    res.status(500).json({ error: "db error" });
  }
});

app.put("/api/offer", needAdmin, async (req, res) => {
  try {
    await KV.findOneAndUpdate(
      { key: "offer" },
      { key: "offer", data: req.body || {}, updatedAt: new Date() },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "db error" });
  }
});

// ---------- Auth / Users ----------
// Signup: naya user banao, password hash karke save karo.
app.post("/api/auth/register", async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    const email = (req.body.email || "").trim().toLowerCase();
    const password = req.body.password || "";
    if (!name || !validEmail(email) || String(password).length < 6) {
      return res.status(400).json({ error: "name, valid email and 6+ character password required" });
    }
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: "account already exists" });
    const user = await User.create({
      name,
      email,
      passwordHash: await hashPassword(password),
    });
    res.status(201).json(publicUser(user));
  } catch (e) {
    if (e && e.code === 11000) return res.status(409).json({ error: "account already exists" });
    res.status(500).json({ error: "db error" });
  }
});

// Login: hash se password check karo, kabhi password wapas mat bhejo.
app.post("/api/auth/login", async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const password = req.body.password || "";
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "invalid email or password" });
    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) return res.status(401).json({ error: "invalid email or password" });
    res.json(publicUser(user));
  } catch (e) {
    res.status(500).json({ error: "db error" });
  }
});

// Forgot password: frontend OTP verify karne ke baad hi ye call karta hai.
// Is route par OTP check nahi hota, isliye isko sirf usi flow se call karo.
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const newPassword = req.body.newPassword || "";
    if (!validEmail(email) || String(newPassword).length < 6) {
      return res.status(400).json({ error: "valid email and 6+ character password required" });
    }
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "account not found" });
    user.passwordHash = await hashPassword(newPassword);
    await user.save();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "db error" });
  }
});

// Admin: saare registered users (passwordHash kabhi nahi bhejte).
app.get("/api/users", needAdmin, async (req, res) => {
  try {
    const users = await User.find({}).sort({ createdAt: 1 });
    res.json(users.map(publicUser));
  } catch (e) {
    res.status(500).json({ error: "db error" });
  }
});

// Admin: user delete — _id, email, ya purani local id kisi se bhi.
app.delete("/api/users/:id", needAdmin, async (req, res) => {
  try {
    const param = decodeURIComponent(req.params.id);
    let deleted = null;
    if (mongoose.Types.ObjectId.isValid(param)) {
      deleted = await User.findByIdAndDelete(param);
    }
    if (!deleted && validEmail(param)) {
      deleted = await User.findOneAndDelete({ email: param.toLowerCase() });
    }
    if (!deleted) return res.status(404).json({ error: "user not found" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "db error" });
  }
});

// Admin one-time migration: laptop ke localStorage wale purane users ko backend me lao.
// Pehle se maujood user ka password overwrite nahi hota, sirf KYC fields update hoti hain.
// Naye user ka password hash karke save hota hai.
app.post("/api/users/migrate", needAdmin, async (req, res) => {
  try {
    const list = Array.isArray(req.body) ? req.body : [];
    let created = 0;
    let updated = 0;
    for (const item of list) {
      if (!item || !validEmail(item.email)) continue;
      const email = item.email.trim().toLowerCase();
      const existing = await User.findOne({ email });
      const kyc = {
        customerAadhaar: item.customerAadhaar || "",
        customerPan: item.customerPan || "",
        customerAadhaarFile: item.customerAadhaarFile || "",
        customerAadhaarFileName: item.customerAadhaarFileName || "",
        customerPanFile: item.customerPanFile || "",
        customerPanFileName: item.customerPanFileName || "",
      };
      const hasKyc = Object.values(kyc).some(Boolean);
      if (existing) {
        if (hasKyc) {
          await User.updateOne({ email }, { $set: kyc });
          updated++;
        }
        continue;
      }
      if (!item.password && !item.passwordHash) continue;
      const passwordHash = isBcryptHash(item.passwordHash)
        ? item.passwordHash
        : isBcryptHash(item.password)
          ? item.password
          : await hashPassword(item.password);
      await User.create({ name: item.name || "", email, passwordHash, ...kyc });
      created++;
    }
    res.json({ ok: true, created, updated });
  } catch (e) {
    res.status(500).json({ error: "db error" });
  }
});

// ---------- Rentals / Orders ----------
// Admin: saare rentals. ?email=... ho to sirf us customer ke rentals.
// Customer ka "My Rentals" page bhi isi route ko email ke saath call karta hai.
app.get("/api/rentals", needAdmin, async (req, res) => {
  try {
    const email = (req.query.email || "").trim().toLowerCase();
    const query = email ? { customerEmail: email } : {};
    const rentals = await Rental.find(query).sort({ createdAt: -1 });
    res.json(rentals);
  } catch (e) {
    res.status(500).json({ error: "db error" });
  }
});

// Checkout: ek rental ya rentals ka array save karo.
app.post("/api/rentals", async (req, res) => {
  try {
    const list = Array.isArray(req.body) ? req.body : [req.body];
    if (!list.length || list.some((r) => !r || typeof r !== "object")) {
      return res.status(400).json({ error: "rental object required" });
    }
    const cleaned = list.map((r) => {
      const { password, passwordHash, _id, __v, ...rest } = r;
      if (rest.customerEmail) rest.customerEmail = String(rest.customerEmail).trim().toLowerCase();
      return rest;
    });
    const created = await Rental.insertMany(cleaned);
    res.status(201).json(created);
  } catch (e) {
    res.status(500).json({ error: "db error" });
  }
});

// Admin one-time migration: laptop ke purane rentals ko backend me lao.
// Jo rental pehle se backend me hai (same local id, ya same order + product), use dobara nahi banate.
app.post("/api/rentals/migrate", needAdmin, async (req, res) => {
  try {
    const list = Array.isArray(req.body) ? req.body : [];
    let created = 0;
    let skipped = 0;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const { _id, __v, password, passwordHash, ...rest } = item;
      if (rest.customerEmail) rest.customerEmail = String(rest.customerEmail).trim().toLowerCase();
      let exists = null;
      if (rest.id !== undefined && rest.id !== null) {
        exists = await Rental.findOne({ id: rest.id });
      }
      if (!exists && rest.order && rest.name) {
        exists = await Rental.findOne({ order: rest.order, name: rest.name });
      }
      if (exists) {
        skipped++;
        continue;
      }
      await Rental.create(rest);
      created++;
    }
    res.json({ ok: true, created, skipped });
  } catch (e) {
    res.status(500).json({ error: "db error" });
  }
});

// Cancel / status update: sirf status fields update hote hain, customer data nahi.
// Isliye customer apna rental cancel kar sakta hai bina admin key ke.
app.put("/api/rentals/:id", async (req, res) => {
  try {
    const param = decodeURIComponent(req.params.id);
    const rental = await findRentalByParam(param);
    if (!rental) return res.status(404).json({ error: "rental not found" });
    const allowed = {};
    if (req.body.status) allowed.status = req.body.status;
    if (req.body.cancelledAt) allowed.cancelledAt = req.body.cancelledAt;
    if (req.body.cancelledBy) allowed.cancelledBy = req.body.cancelledBy;
    Object.assign(rental, allowed);
    await rental.save();
    res.json(rental);
  } catch (e) {
    res.status(500).json({ error: "db error" });
  }
});

// Admin: rental delete.
app.delete("/api/rentals/:id", needAdmin, async (req, res) => {
  try {
    const param = decodeURIComponent(req.params.id);
    const rental = await findRentalByParam(param);
    if (!rental) return res.status(404).json({ error: "rental not found" });
    await rental.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "db error" });
  }
});

app.listen(PORT, () => console.log("InHouseGym backend running on port " + PORT));
