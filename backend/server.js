import express from "express";
import fs from "fs";
import csv from "csv-parser";
import cors from "cors";
import { supabase, TABLE_PRODUCTS } from "./supabase.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Tableau qui contiendra les données du CSV (JSON)
let produits = [];
let csvLoaded = false;

// Middlewares
const DEFAULT_ORIGINS = "http://localhost:8080,http://localhost:8081,http://localhost:8082,http://localhost:8083,http://localhost:5173";
const ORIGINS = (process.env.CORS_ORIGIN || DEFAULT_ORIGINS)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({
  origin: ORIGINS,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
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
    // Vérifier s'il y a déjà des lignes
    const { count, error: countErr } = await supabase
      .from(TABLE_PRODUCTS)
      .select("id", { count: "exact", head: true });
    if (countErr) {
      console.error("[API] Erreur comptage Supabase:", countErr);
      return;
    }
    if ((count || 0) > 0) {
      console.log(`[API] Table ${TABLE_PRODUCTS} déjà peuplée (${count}). Import initial ignoré.`);
      return;
    }
    if (!csvLoaded) {
      console.log("[API] CSV pas encore chargé, attente avant import...");
      // Attendre un court délai pour s'assurer du chargement
      await new Promise((r) => setTimeout(r, 500));
    }
    if (produits.length === 0) {
      console.warn("[API] Aucun produit en mémoire à importer.");
      return;
    }
    // Insertion en lot
    const { error: insErr } = await supabase.from(TABLE_PRODUCTS).insert(produits);
    if (insErr) {
      console.error("[API] Erreur import CSV -> Supabase:", insErr);
      return;
    }
    console.log("[API] CSV importé dans Supabase (", produits.length, ")");
  } catch (e) {
    console.error("[API] Exception importCsvOnce:", e);
  }
}

importCsvOnce();

// Route test
app.get("/", (req, res) => {
  res.send("API OK");
});

// Route produits
app.get("/produits", async (_req, res) => {
  if (!csvLoaded) return res.status(503).json({ error: "Chargement des données en cours" });

  // Si on veut quand même essayer de synchroniser avec Supabase mais sans bloquer
  if (supabase) {
    try {
      const { data, error } = await supabase.from(TABLE_PRODUCTS).select("*");
      if (!error && data) return res.json(data);
    } catch (e) {
      console.warn("[API] /produits: fallback CSV (Supabase unreachable)");
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

const server = app.listen(PORT, () => {
  console.log("API démarrée sur le port", PORT);
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
