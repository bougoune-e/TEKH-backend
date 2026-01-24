import { calculerEstimation, Diagnostics } from "./src/lib/pricing";

const tests = [
    {
        name: "Base Case: Perfect Condition",
        prixBase: 100000,
        diagnostics: { ecran_casse: false, batterie_faible: false, face_id_hs: false, camera_hs: false, etat_moyen: false },
        expected: 75000 // 100000 * 0.75
    },
    {
        name: "Screen Broken (Priority)",
        prixBase: 100000,
        diagnostics: { ecran_casse: true, batterie_faible: true, face_id_hs: true, camera_hs: true, etat_moyen: true },
        expected: 22500 // (100000 * 0.75) * 0.30 = 22500. Ignores other malus.
    },
    {
        name: "Battery Weak (-20000)",
        prixBase: 100000,
        diagnostics: { ecran_casse: false, batterie_faible: true, face_id_hs: false, camera_hs: false, etat_moyen: false },
        expected: 55000 // 75000 - 20000
    },
    {
        name: "Face ID HS (-40%)",
        prixBase: 100000,
        diagnostics: { ecran_casse: false, batterie_faible: false, face_id_hs: true, camera_hs: false, etat_moyen: false },
        expected: 45000 // 75000 * 0.60
    },
    {
        name: "Camera HS (-20%)",
        prixBase: 100000,
        diagnostics: { ecran_casse: false, batterie_faible: false, face_id_hs: false, camera_hs: true, etat_moyen: false },
        expected: 60000 // 75000 * 0.80
    },
    {
        name: "Condition Average (-10%)",
        prixBase: 100000,
        diagnostics: { ecran_casse: false, batterie_faible: false, face_id_hs: false, camera_hs: false, etat_moyen: true },
        expected: 67500 // 75000 * 0.90
    },
    {
        name: "Combined Malus (Battery + Average)",
        prixBase: 100000,
        diagnostics: { ecran_casse: false, batterie_faible: true, face_id_hs: false, camera_hs: false, etat_moyen: true },
        // Pivot = 75000
        // Battery: 75000 - 20000 = 55000
        // Average: 55000 * 0.90 = 49500
        expected: 49500
    },
    {
        name: "Floor Price (Low Value)",
        prixBase: 10000,
        diagnostics: { ecran_casse: true, batterie_faible: false, face_id_hs: false, camera_hs: false, etat_moyen: false },
        // Pivot = 7500
        // Screen: 7500 * 0.30 = 2250
        // Floor: 5000
        expected: 5000
    }
];

let failed = 0;
console.log("Running Pricing Tests...");
tests.forEach(t => {
    const result = calculerEstimation(t.prixBase, t.diagnostics);
    if (result !== t.expected) {
        console.error(`[FAIL] ${t.name}: Expected ${t.expected}, got ${result}`);
        failed++;
    } else {
        console.log(`[PASS] ${t.name}`);
    }
});

if (failed > 0) process.exit(1);
console.log("All tests passed!");
