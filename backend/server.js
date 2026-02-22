import express from "express";
import fs from "fs";
import csv from "csv-parser";
import cors from "cors";
import { supabase, TABLE_PRODUCTS } from "./supabase.js";

const app = express();
const PORT = process.env.PORT || 8083;

// Diagnostic logs for Railway
console.log(`[DIAG] process.env.PORT: ${process.env.PORT}`);
console.log(`[DIAG] process.env.RAILWAY_STATIC_URL: ${process.env.RAILWAY_STATIC_URL}`);
console.log(`[DIAG] All Env Keys: ${Object.keys(process.env).filter(k => k.includes('PORT') || k.includes('RAILWAY')).join(', ')}`);

// Heartbeat to confirm process stays alive
setInterval(() => {
  console.log(`[HEARTBEAT] ${new Date().toISOString()} - Up and running on port ${PORT}`);
}, 30000);

// Tableau qui contiendra les données du CSV (JSON)
let produits = [];
let csvLoaded = false;

// Middlewares
const DEFAULT_ORIGINS = [
  "http://localhost:8080",
  "http://localhost:8081",
  "http://localhost:8082",
  "http://localhost:8083",
  "http://localhost:5173",
  "https://tekh-backend-production.up.railway.app",
  "https://tekh.up.railway.app"
];

const ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map(s => s.trim())
  : DEFAULT_ORIGINS;

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (ORIGINS.indexOf(origin) !== -1 || ORIGINS.includes("*")) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Rejected origin: ${origin}`);
      callback(null, true); // Fallback: allow for now to debug
    }
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  credentials: true
}));
app.use(express.json());

// Logging simple des requêtes
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Lire le fichier CSV AU DÉMARRAGE
function loadCsv() {
  produits = [];
  csvLoaded = false;
  const fileUrl = new URL("./tab_cleaned.csv", import.meta.url);
  console.log("Chargement du CSV depuis:", fileUrl.pathname);
  fs.createReadStream(fileUrl)
    .on("error", (err) => {
      console.error("Erreur lecture CSV:", err);
    })
    .pipe(csv())
    .on("data", (row) => {
      produits.push(row);
    })
    .on("end", () => {
      csvLoaded = true;
      console.log("CSV chargé:", produits.length, "produits");
    });
}

loadCsv();

async function importCsvOnce() {
  if (!supabase) {
    console.warn("[API] Supabase non configuré: import CSV ignoré");
    return;
  }
  try {
    // Try primary table first
    console.log(`[API] Tentative de connexion à la table: ${TABLE_PRODUCTS}`);
    let { count, error: countErr } = await supabase
      .from(TABLE_PRODUCTS)
      .select("id", { count: "exact", head: true });

    let activeTable = TABLE_PRODUCTS;

    // Fallback logic if primary table missing
    if (countErr && countErr.code === 'PGRST205' && TABLE_PRODUCTS !== 'produits') {
      console.warn(`[API] Table ${TABLE_PRODUCTS} introuvable (PGRST205). Repli sur 'produits'.`);
      const fallback = await supabase
        .from('produits')
        .select("id", { count: "exact", head: true });

      if (!fallback.error) {
        activeTable = 'produits';
        count = fallback.count;
        countErr = null;
      }
    }

    if (countErr) {
      console.error("[API] Erreur comptage Supabase:", countErr);
      return;
    }

    if ((count || 0) > 0) {
      console.log(`[API] Table ${activeTable} déjà peuplée (${count}). Import initial ignoré.`);
      return;
    }

    if (!csvLoaded) {
      console.log("[API] CSV pas encore chargé, attente avant import...");
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (produits.length === 0) {
      console.warn("[API] Aucun produit en mémoire à importer.");
      return;
    }

    // Insertion en lot
    console.log(`[API] Importation de ${produits.length} produits dans ${activeTable}...`);
    const { error: insErr } = await supabase.from(activeTable).insert(produits);
    if (insErr) {
      console.error("[API] Erreur import CSV -> Supabase:", insErr);
      return;
    }
    console.log(`[API] CSV importé avec succès dans ${activeTable}`);
  } catch (e) {
    console.error("[API] Exception fatale importCsvOnce:", e);
  }
}

importCsvOnce();

// Route test
app.get("/", (req, res) => {
  res.send(`API OK - Version 1.1 - Port: ${PORT}`);
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    port: PORT,
    env_port: process.env.PORT || "not set",
    csv: csvLoaded,
    supabase: !!supabase,
    products_count: produits.length
  });
});

// Route produits
app.get("/produits", async (req, res) => {
  console.log(`[API] Request to /produits from ${req.headers.origin || 'unknown'}`);
  if (!csvLoaded) return res.status(503).json({ error: "Chargement des données en cours" });

  if (supabase) {
    try {
      // Logic for table fallback here too
      let result = await supabase.from(TABLE_PRODUCTS).select("*");
      if (result.error && result.error.code === 'PGRST205' && TABLE_PRODUCTS !== 'produits') {
        result = await supabase.from('produits').select("*");
      }

      if (!result.error && result.data) return res.json(result.data);
      if (result.error) console.warn("[API] Supabase error, falling back to local CSV:", result.error.message);
    } catch (e) {
      console.warn("[API] /produits exception: fallback CSV");
    }
  }

  return res.json(produits);
});

// Alias pour le simulateur
app.get("/api/products", (_req, res) => {
  if (!csvLoaded) return res.status(503).json({ error: "Chargement des données en cours" });
  return res.json(produits);
});

// Route produit par id
app.get("/produits/:id", async (req, res) => {
  const { id } = req.params;
  if (supabase) {
    const { data, error } = await supabase
      .from(TABLE_PRODUCTS)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return res.status(404).json({ error: error.message });
    return res.json(data);
  }
  const item = produits.find((p) => String(p.id) === String(id));
  if (!item) return res.status(404).json({ error: "Produit introuvable" });
  return res.json(item);
});

// Mise à jour du stock
app.patch("/produits/:id/stock", async (req, res) => {
  const { id } = req.params;
  const { stock } = req.body || {};
  if (typeof stock === "undefined") return res.status(400).json({ error: "Champ 'stock' requis" });
  if (supabase) {
    const { error } = await supabase
      .from(TABLE_PRODUCTS)
      .update({ stock })
      .eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  }
  const idx = produits.findIndex((p) => String(p.id) === String(id));
  if (idx < 0) return res.status(404).json({ error: "Produit introuvable" });
  produits[idx].stock = stock;
  return res.json({ success: true });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[API] Serveur démarré sur :`);
  console.log(` - Port public (Railway) : ${PORT}`);
  console.log(` - Interface : 0.0.0.0`);
  console.log(` - Date : ${new Date().toLocaleString()}`);
});

server.on("error", (err) => {
  console.error("Erreur serveur:", err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
