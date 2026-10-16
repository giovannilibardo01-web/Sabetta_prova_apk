import React, { useState, useEffect, useMemo, useRef, useContext, createContext } from "react";

/* ==========================================================================
   SABETTA IN PIAZZA — app mobile (iOS / Android) per la spesa di frutta e verdura
   --------------------------------------------------------------------------
   Vista cliente  : banco, prodotto, carrello, cassa, ordini, assistente Betta, profilo
   Vista negozio  : coda ordini, pesata, merce del giorno con MODALITÀ AGGIORNAMENTO
                    (freeze + bozza + pubblicazione), fasce di consegna, andamento
   Assistente     : "Betta", Q&A con AI, con motore locale di riserva e passaggio
                    al telefono del negozio quando serve una persona
   Nessuna dipendenza esterna. Persistenza opzionale via window.storage.
   ========================================================================== */

/* --------------------------------- regole -------------------------------- */
const MIN_ORDINE = 2.0;
const COSTO_CONSEGNA = 1.9;
const CONSEGNA_GRATIS_DA = 20.0;
const APERTURA = 8;
const CHIUSURA = 20;
const CAPIENZA_FASCIA = 6;
const ANTICIPO = 0.75;
const PIN_NEGOZIO = "1234";
const TELEFONO = "0831 123 456";
const TEL_URL = "tel:+390831123456";
const NEGOZIO = "Via Ferrante Fornari 8, Brindisi";
const CAP_ZONA = "72100";
const CITTA_ZONA = "Brindisi";
const GIORNO_CHIUSO = 0; // domenica
const PRESET_ORE = [
  { id: "mattina", t: "Mattina 8–13", ore: [8, 9, 10, 11, 12] },
  { id: "pranzo", t: "Pranzo 13–16", ore: [13, 14, 15] },
  { id: "sera", t: "Sera 16–20", ore: [16, 17, 18, 19] },
];

/* --------------------------------- utilità ------------------------------- */
const eur = (n) => (Number(n) || 0).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const num = (n) => (Number(n) || 0).toLocaleString("it-IT", { maximumFractionDigits: 2 });
const pad = (n) => String(n).padStart(2, "0");
const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const GG = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
const MM = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const fasciaTxt = (h) => `${pad(h)}:00 – ${pad(h + 1)}:00`;
const quandoTxt = (o, lungo = false) => (
  o.spedizione ? (lungo ? "Spedizione con corriere in 1-3 giorni" : "Spedizione con corriere")
    : o.subito ? (lungo ? "Il prima possibile, entro due ore" : "Il prima possibile")
      : `${giornoTxt(o.giorno)}, ${fasciaTxt(o.fascia)}`);
const oraTxt = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function giorniUtili(n = 7) {
  const oggi = new Date();
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + i);
    out.push({
      key: dkey(d), data: d, chiuso: d.getDay() === GIORNO_CHIUSO,
      titolo: i === 0 ? "Oggi" : i === 1 ? "Domani" : GG[d.getDay()],
      sotto: `${d.getDate()} ${MM[d.getMonth()]}`,
    });
  }
  return out;
}
function giornoTxt(key) {
  const g = giorniUtili(8).find((x) => x.key === key);
  return g ? `${g.titolo} ${g.sotto}` : key;
}
function dkeyPiu(n) {
  const d = new Date();
  return dkey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}
const settimana = (key) => new Date(`${key}T12:00:00`).getDay();
function indirizzoFuoriZona(c) {
  if (!c) return false;
  const cap = (c.cap || "").trim();
  const citta = (c.citta || "").trim().toLowerCase();
  const dichiarato = cap.length === 5 || (citta !== "" && !citta.includes("brindisi"));
  return dichiarato && !zonaOk(c);
}
function zonaOk(c) {
  if (!c) return false;
  const cap = (c.cap || "").trim();
  const citta = (c.citta || "").trim().toLowerCase();
  return cap === CAP_ZONA && (citta === "" || citta.includes("brindisi"));
}
function comprimiOre(ore) {
  const s = [...ore].sort((a, b) => a - b);
  const blocchi = [];
  s.forEach((h) => {
    const u = blocchi[blocchi.length - 1];
    if (u && h === u[1] + 1) u[1] = h;
    else blocchi.push([h, h]);
  });
  return blocchi.map(([a, b]) => `${pad(a)}:00–${pad(b + 1)}:00`).join(", ");
}

/* ------------------------------- persistenza ----------------------------- */
const CHIAVE = "sabetta_app_v2";
async function leggi() {
  try {
    if (typeof window === "undefined" || !window.storage) return null;
    const r = await window.storage.get(CHIAVE, false);
    return r && r.value ? JSON.parse(r.value) : null;
  } catch (e) { return null; }
}
async function scrivi(d) {
  try {
    if (typeof window === "undefined" || !window.storage) return;
    await window.storage.set(CHIAVE, JSON.stringify(d), false);
  } catch (e) { /* la demo prosegue in memoria */ }
}

/* --------------------------------- catalogo ------------------------------ */
const REPARTI = [
  { id: "tutto", nome: "Tutto" },
  { id: "frutta", nome: "Frutta" },
  { id: "verdura", nome: "Verdura" },
  { id: "dispensa", nome: "Dispensa" },
  { id: "aromi", nome: "Odori" },
  { id: "pronti", nome: "Già pronti" },
];

const CATALOGO = [
  { id: "p1", nome: "Pomodori da sugo", cat: "verdura", unita: "kg", prezzo: 2.9, giacenza: 42, origine: "Campagne di Mesagne (BR)", art: "pomodoro", maturazione: true, attivo: true, sconto: 15, delGiorno: true, nota: "Perfetti per la conserva e per il sugo lento." },
  { id: "p9", nome: "Pomodorini in cestino da 500 g", cat: "verdura", unita: "g500", prezzo: 1.9, giacenza: 18, origine: "Campagne di Mesagne (BR)", art: "pomodoro", attivo: true, nota: "Già pesati e pronti, comodi da portare." },
  { id: "p2", nome: "Insalata gentile", cat: "verdura", unita: "cespo", prezzo: 1.2, giacenza: 30, origine: "Orto di Tuturano (BR)", art: "insalata", attivo: true, nota: "Raccolta stamattina, foglia tenera." },
  { id: "p3", nome: "Zucchine chiare", cat: "verdura", unita: "kg", prezzo: 1.9, giacenza: 36, origine: "San Vito dei Normanni (BR)", art: "zucchina", attivo: true, nota: "Piccole e sode, buone anche crude." },
  { id: "p4", nome: "Melanzane lunghe", cat: "verdura", unita: "kg", prezzo: 1.7, giacenza: 24, origine: "Cellino San Marco (BR)", art: "melanzana", attivo: true, nota: "Poche sementi, ottime alla parmigiana." },
  { id: "p10", nome: "Carciofi brindisini", cat: "verdura", unita: "pezzo", prezzo: 0.9, giacenza: 40, origine: "Agro di Brindisi", art: "carciofo", attivo: true, nota: "Teneri, senza spine: buoni anche crudi in insalata." },
  { id: "p5", nome: "Patate novelle", cat: "verdura", unita: "kg", prezzo: 1.2, giacenza: 80, origine: "Galatina (LE)", art: "patata", attivo: true, nota: "Pasta gialla, tengono bene la cottura." },
  { id: "p6", nome: "Cipolle ramate", cat: "verdura", unita: "kg", prezzo: 1.4, giacenza: 50, origine: "Acquaviva delle Fonti (BA)", art: "cipolla", attivo: true },
  { id: "p7", nome: "Carote novelle", cat: "verdura", unita: "kg", prezzo: 1.1, giacenza: 44, origine: "Polignano a Mare (BA)", art: "carota", attivo: true },
  { id: "p8", nome: "Peperoni rossi", cat: "verdura", unita: "kg", prezzo: 2.6, giacenza: 16, origine: "Torre Santa Susanna (BR)", art: "peperone", attivo: true },
  { id: "f1", nome: "Mele annurche", cat: "frutta", unita: "kg", prezzo: 2.4, giacenza: 55, origine: "Valle di Maddaloni (CE)", art: "mela", maturazione: true, attivo: true, nota: "Croccanti e profumate, le classiche del melaio." },
  { id: "f2", nome: "Banane", cat: "frutta", unita: "kg", prezzo: 1.8, giacenza: 60, origine: "Ecuador, commercio equo", art: "banana", maturazione: true, attivo: true },
  { id: "f3", nome: "Arance tarocco", cat: "frutta", unita: "kg", prezzo: 1.6, giacenza: 70, origine: "Piana di Catania", art: "arancia", attivo: true, sconto: 20, delGiorno: true, nota: "Succose, buone anche da spremere." },
  { id: "f4", nome: "Pere Williams", cat: "frutta", unita: "kg", prezzo: 2.2, giacenza: 26, origine: "Emilia-Romagna", art: "pera", maturazione: true, attivo: true },
  { id: "f5", nome: "Fragole", cat: "frutta", unita: "g500", prezzo: 3.5, giacenza: 12, origine: "Rutigliano (BA)", art: "fragola", attivo: true },
  { id: "f6", nome: "Uva Italia", cat: "frutta", unita: "kg", prezzo: 2.8, giacenza: 20, origine: "Noicattaro (BA)", art: "uva", attivo: true },
  { id: "f7", nome: "Limoni del Gargano", cat: "frutta", unita: "kg", prezzo: 2.6, giacenza: 33, origine: "Gargano (FG)", art: "limone", attivo: true },
  { id: "a1", nome: "Basilico fresco", cat: "aromi", unita: "mazzo", prezzo: 1.0, giacenza: 20, origine: "Orto di Tuturano (BR)", art: "basilico", attivo: true },
  { id: "a2", nome: "Prezzemolo", cat: "aromi", unita: "mazzo", prezzo: 0.8, giacenza: 25, origine: "Orto di Tuturano (BR)", art: "basilico", attivo: true },
  { id: "a3", nome: "Aglio rosso", cat: "aromi", unita: "testa", prezzo: 0.7, giacenza: 40, origine: "Sulmona (AQ)", art: "aglio", attivo: true },
  { id: "r1", nome: "Misto per minestrone", cat: "pronti", unita: "vaschetta", prezzo: 2.5, giacenza: 14, origine: "Preparato in negozio", art: "misto", attivo: true, nota: "Già pulito e tagliato: in pentola e via." },
  { id: "r2", nome: "Insalata lavata e pronta", cat: "pronti", unita: "busta", prezzo: 1.8, giacenza: 22, origine: "Preparata in negozio", art: "busta", attivo: true },
  { id: "r3", nome: "Frutta tagliata", cat: "pronti", unita: "vaschetta", prezzo: 3.2, giacenza: 10, origine: "Preparata in negozio", art: "tagliata", attivo: true },
];

const UNITA = {
  kg: { et: "kg", br: "kg", plur: "kg", passo: 0.5, misura: "peso" },
  g200: { et: "cestino da 200 g", br: "200 g", plur: "cestini da 200 g", passo: 1, misura: "cestino" },
  g500: { et: "cestino da 500 g", br: "500 g", plur: "cestini da 500 g", passo: 1, misura: "cestino" },
  pezzo: { et: "pezzo", br: "pezzo", plur: "pezzi", passo: 1 },
  cespo: { et: "cespo", br: "cespo", plur: "cespi", passo: 1 },
  mazzo: { et: "mazzo", br: "mazzo", plur: "mazzi", passo: 1 },
  testa: { et: "testa", br: "testa", plur: "teste", passo: 1 },
  cestino: { et: "cestino", br: "cestino", plur: "cestini", passo: 1 },
  busta: { et: "busta", br: "busta", plur: "buste", passo: 1 },
  vaschetta: { et: "vaschetta", br: "vaschetta", plur: "vaschette", passo: 1 },
};
const UNITA_ELENCO = ["kg", "g200", "g500", "pezzo", "cespo", "mazzo", "testa", "busta", "vaschetta"];
const DISEGNI = [
  "default", "pomodoro", "insalata", "zucchina", "melanzana", "carciofo", "patata", "cipolla", "carota", "peperone",
  "broccolo", "cavolfiore", "finocchio", "sedano", "cetriolo", "zucca", "funghi", "spinaci", "peperoncino", "fagiolini",
  "mela", "banana", "arancia", "pera", "fragola", "uva", "limone", "pesca", "ciliegie", "anguria", "melone", "kiwi",
  "ananas", "mandarino", "fico", "basilico", "aglio", "misto", "busta", "tagliata", "cassa",
  "conserva", "sottolio", "olio", "taralli", "frisella", "miele", "marmellata", "pasta", "vino", "legumi",
];
const un = (u) => UNITA[u] || { et: u, br: u, plur: u, passo: 1 };
const passo = (p) => un(p.unita).passo;
const qtaTxt = (u, q) => (u === "kg" ? `${num(q)} kg` : `${q} ${q === 1 ? un(u).et : un(u).plur}`);
const arr2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const prezzoDi = (p) => (p && p.sconto ? arr2(p.prezzo * (1 - p.sconto / 100)) : p ? p.prezzo : 0);
const inOfferta = (p) => !!(p && p.sconto > 0);

/* --------------------------------- coupon -------------------------------- */
const TIPI_COUPON = [
  { id: "percento", t: "Sconto in percentuale", s: "Toglie una percentuale dalla spesa." },
  { id: "euro", t: "Sconto in euro", s: "Toglie una cifra fissa dalla spesa." },
  { id: "consegna", t: "Consegna gratis", s: "Azzera il costo di consegna." },
];
const COUPON_INIZIALI = [
  { codice: "BENVENUTO10", tipo: "percento", valore: 10, minimo: 10, scadenza: "", maxUsi: 0, usi: 0, attivo: true, nota: "Primo ordine dall app" },
  { codice: "CONSEGNAGRATIS", tipo: "consegna", valore: 0, minimo: 8, scadenza: "", maxUsi: 50, usi: 0, attivo: true, nota: "Spinta sugli ordini piccoli" },
];
const couponTxt = (c) => (c.tipo === "percento" ? `−${c.valore}%` : c.tipo === "euro" ? `−${eur(c.valore)}` : "Consegna gratis");

function verificaCoupon(codice, coupons, parziale) {
  const cod = String(codice || "").trim().toUpperCase();
  if (!cod) return { ok: false, msg: "Scrivi il codice dello sconto." };
  const c = (coupons || []).find((x) => x.codice.toUpperCase() === cod);
  if (!c) return { ok: false, msg: "Questo codice non esiste. Controlla le lettere." };
  if (!c.attivo) return { ok: false, msg: "Questo codice non è più attivo." };
  if (c.scadenza && dkey(new Date()) > c.scadenza) return { ok: false, msg: "Questo codice è scaduto." };
  if (c.maxUsi > 0 && c.usi >= c.maxUsi) return { ok: false, msg: "Questo codice ha finito gli utilizzi." };
  if (parziale < (c.minimo || 0)) return { ok: false, msg: `Il codice vale da ${eur(c.minimo)} di spesa: ti mancano ${eur(c.minimo - parziale)}.` };
  return { ok: true, c };
}

function calcola(parziale, ritiro, c) {
  let consegna = ritiro ? 0 : parziale >= CONSEGNA_GRATIS_DA ? 0 : COSTO_CONSEGNA;
  let sconto = 0;
  if (c) {
    if (c.tipo === "consegna") consegna = 0;
    else if (c.tipo === "euro") sconto = Math.min(c.valore, parziale);
    else sconto = arr2(parziale * (c.valore / 100));
  }
  return { consegna, sconto: arr2(sconto), totale: arr2(parziale - sconto + consegna) };
}

function normalizzaCatalogo(lista) {
  return (lista || []).map((p) => {
    const q = { ...p };
    if (q.prima && !q.sconto) { q.sconto = Math.max(0, Math.round((1 - q.prezzo / q.prima) * 100)); q.delGiorno = true; }
    delete q.prima;
    if (!UNITA[q.unita]) q.unita = q.grammi === 200 ? "g200" : q.grammi === 500 && q.unita === "cestino" ? "g500" : q.unita;
    q.sconto = Number(q.sconto) || 0;
    return q;
  });
}
const MATURAZIONE = ["Da mangiare subito", "Tra due o tre giorni"];
const SOSTITUZIONI = [
  { id: "simile", t: "Sostituisci con un prodotto simile", s: "Scegliamo noi la cosa più vicina, stesso prezzo." },
  { id: "chiama", t: "Chiamami prima di sostituire", s: "Ti telefoniamo e decidi tu." },
  { id: "togli", t: "Togli il prodotto dall'ordine", s: "Paghi solo quello che arriva." },
];
const STATI = [
  { id: "nuovo", t: "Ricevuto", c: "Abbiamo preso l'ordine." },
  { id: "preparazione", t: "In preparazione", c: "Stiamo scegliendo la merce." },
  { id: "consegna", t: "In arrivo", c: "La spesa è per strada." },
  { id: "consegnato", t: "Consegnato", c: "Buon appetito." },
];

/* --------------------------- ruoli e squadra ----------------------------- */
const RUOLI = {
  admin: { t: "Sabetta · titolare", s: "Vede e gestisce tutto", tabs: ["ordini", "merce", "clienti", "sconti", "altro"], prezzi: true, clienti: true, merce: true, squadra: true, soldi: true },
  magazzino: { t: "Magazzino", s: "Prepara gli ordini e carica la merce", tabs: ["ordini", "merce", "altro"], prezzi: true, clienti: false, merce: true, squadra: false, soldi: false },
  consegna: { t: "Consegne", s: "Porta la spesa e incassa", tabs: ["giro", "ordini", "altro"], prezzi: false, clienti: false, merce: false, squadra: false, soldi: true },
};
const OPERATORI_INIZIALI = [
  { id: "op1", nome: "Sabetta", ruolo: "admin", pin: "1234", attivo: true },
  { id: "op2", nome: "Magazzino", ruolo: "magazzino", pin: "2222", attivo: true },
  { id: "op3", nome: "Consegne", ruolo: "consegna", pin: "3333", attivo: true },
];

/* ------------------------------- fedeltà --------------------------------- */
const PUNTI_PER_EURO = 1;
const PUNTI_PER_ORDINE = 10;
const PUNTI_BUONO = 100;      // punti necessari
const VALORE_BUONO = 5;       // euro
const LIVELLI = [
  { id: "bronzo", t: "Pomodoro di bronzo", corto: "Bronzo", da: 0, v: "#B87333", v2: "#8C5426", b: "Accumuli 1 punto per ogni euro di spesa." },
  { id: "silver", t: "Pomodoro Silver", corto: "Silver", da: 150, v: "#A9B4C0", v2: "#7C8794", b: "Consegna gratis da 15 € di spesa." },
  { id: "gold", t: "Pomodoro Gold", corto: "Gold", da: 400, v: "#E0B32A", v2: "#B08812", b: "Consegna sempre gratis e offerte in anteprima." },
];
const livelloDi = (punti) => LIVELLI.slice().reverse().find((l) => (punti || 0) >= l.da) || LIVELLI[0];
const puntiOrdine = (o) => Math.max(0, Math.floor((o.parziale || 0) * PUNTI_PER_EURO) + PUNTI_PER_ORDINE);
const solaCifre = (t) => String(t || "").replace(/\D/g, "");

/* ---------------------- foto e video dal telefono ------------------------ */
const LIMITE_VIDEO = 2.6 * 1024 * 1024; // oltre questa misura il video resta solo sul telefono
const PESO_MAX_SALVATAGGIO = 4200000;

function leggiFile(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

function comprimiFoto(file, max = 1280, qualita = 0.72) {
  return new Promise((res, rej) => {
    leggiFile(file).then((dati) => {
      const img = new Image();
      img.onload = () => {
        try {
          const sc = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.width * sc));
          c.height = Math.max(1, Math.round(img.height * sc));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL("image/jpeg", qualita));
        } catch (e) { res(dati); }
      };
      img.onerror = () => res(dati);
      img.src = dati;
    }).catch(rej);
  });
}

function fotogrammaVideo(url) {
  return new Promise((res) => {
    try {
      const v = document.createElement("video");
      v.preload = "metadata"; v.muted = true; v.playsInline = true; v.src = url;
      const scatta = () => {
        try {
          const c = document.createElement("canvas");
          const w = v.videoWidth || 640, h = v.videoHeight || 360;
          const sc = Math.min(1, 900 / Math.max(w, h));
          c.width = Math.round(w * sc); c.height = Math.round(h * sc);
          c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
          res(c.toDataURL("image/jpeg", 0.68));
        } catch (e) { res(""); }
      };
      v.onloadeddata = () => { try { v.currentTime = Math.min(0.8, (v.duration || 2) / 4); } catch (e) { scatta(); } };
      v.onseeked = scatta;
      v.onerror = () => res("");
      setTimeout(() => res(""), 4000);
    } catch (e) { res(""); }
  });
}

function alleggerisci(dati) {
  let out = { ...dati, posts: (dati.posts || []).map((p) => ({
    ...p,
    media: (p.media || []).map((m) => (m.temporaneo ? { ...m, src: "" } : m)),
  })) };
  if (JSON.stringify(out).length < PESO_MAX_SALVATAGGIO) return out;
  const posts = out.posts.slice();
  for (let i = posts.length - 1; i >= 0; i--) {
    if (posts[i].media && posts[i].media.length) {
      posts[i] = { ...posts[i], media: posts[i].media.slice(0, 1) };
      out = { ...out, posts };
      if (JSON.stringify(out).length < PESO_MAX_SALVATAGGIO) return out;
    }
  }
  for (let i = posts.length - 1; i >= 0; i--) {
    if (posts[i].media && posts[i].media.length) {
      posts[i] = { ...posts[i], media: [] };
      out = { ...out, posts };
      if (JSON.stringify(out).length < PESO_MAX_SALVATAGGIO) return out;
    }
  }
  return out;
}

/* ------------------------------- community ------------------------------- */
const TIPI_POST = [
  { id: "novita", t: "Novità", c: "#1F6B45" },
  { id: "offerta", t: "Offerta", c: "#C6351E" },
  { id: "avviso", t: "Avviso", c: "#B98313" },
  { id: "ricetta", t: "Ricetta", c: "#5B3A78" },
];
const POST_INIZIALI = [
  {
    id: "po1", tipo: "novita", titolo: "Arrivate le prime fragole di Sant'Agata",
    testo: "Stamattina al mercato ne abbiamo prese due bancali: profumate, piccole, di quelle che si sentono da lontano. Le teniamo in cella solo il tempo di sistemarle, poi vanno sul banco.",
    art: "fragola", link: "", prodotto: "f5", fissato: true, cuori: 12, creato: "",
  },
  {
    id: "po2", tipo: "ricetta", titolo: "La frisella come la facciamo noi",
    testo: "Bagnata dieci secondi sotto l'acqua, pomodoro schiacciato con le mani, origano, olio nuovo e un pizzico di sale. Niente altro. Se avanza, il giorno dopo è ancora buona.",
    art: "frisella", link: "", prodotto: "m4", fissato: false, cuori: 24, creato: "",
  },
  {
    id: "po3", tipo: "avviso", titolo: "Giovedì chiudiamo alle 14",
    testo: "Andiamo a caricare la merce nuova dal produttore. Le consegne del pomeriggio riprendono venerdì dalle 8, potete già prenotare in app.",
    art: "cassa", link: "", prodotto: "", fissato: false, cuori: 5, creato: "",
  },
];

/* ------------------------- pacco da giù e bottega ------------------------ */
const ZONE_SPEDIZIONE = [
  { id: "sud", t: "Sud e isole", costo: 7.9, giorni: "1-2 giorni", cap: ["7", "8", "9"] },
  { id: "centro", t: "Centro", costo: 9.9, giorni: "2 giorni", cap: ["0", "5", "6"] },
  { id: "nord", t: "Nord", costo: 11.9, giorni: "2-3 giorni", cap: ["1", "2", "3", "4"] },
];
const SPEDIZIONE_GRATIS_DA = 60;
function zonaSpedizione(cap) {
  const c = solaCifre(cap);
  if (c.length !== 5) return null;
  return ZONE_SPEDIZIONE.find((z) => z.cap.includes(c[0])) || ZONE_SPEDIZIONE[2];
}
const PACCHI_INIZIALI = [
  {
    id: "pk1", nome: "Pacco Classico", peso: "5 kg", prezzo: 29, attivo: true, art: "misto",
    nota: "Il pacco che tutti aspettano: verdura e frutta di stagione, più i sapori di casa.",
    dentro: ["Pomodori da sugo 1 kg", "Friselle di grano 500 g", "Taralli al finocchietto 400 g", "Olio EVO 250 ml", "Frutta di stagione 2 kg"],
  },
  {
    id: "pk2", nome: "Pacco Famiglia", peso: "10 kg", prezzo: 49, attivo: true, art: "cassa",
    nota: "Doppia porzione, per chi sta fuori con tutta la famiglia.",
    dentro: ["Pomodori da sugo 2 kg", "Friselle 1 kg", "Taralli 800 g", "Olio EVO 500 ml", "Conserva di pomodoro 2 vasi", "Frutta di stagione 4 kg"],
  },
  {
    id: "pk3", nome: "Pacco Dispensa", peso: "4 kg", prezzo: 39, attivo: true, art: "conserva",
    nota: "Solo cose che durano: conserve, olio, taralli. Perfetto da regalare.",
    dentro: ["Conserva di pomodoro 3 vasi", "Pomodori secchi 200 g", "Olio EVO 500 ml", "Taralli 800 g", "Origano del Salento"],
  },
];
const BOTTEGA = [
  { id: "m1", nome: "Conserva di pomodoro", cat: "dispensa", tipo: "market", unita: "pezzo", prezzo: 4.5, giacenza: 40, origine: "Fatta in casa a Brindisi", venditore: "Sabetta ortofrutta", art: "conserva", attivo: true, sconto: 0, spedibile: true, nota: "Pomodori nostri, passati e invasati a fine estate." },
  { id: "m2", nome: "Olio EVO del Salento 500 ml", cat: "dispensa", tipo: "market", unita: "pezzo", prezzo: 8.9, giacenza: 30, origine: "Frantoio di Ostuni (BR)", venditore: "Frantoio Marangi", art: "olio", attivo: true, sconto: 0, spedibile: true },
  { id: "m3", nome: "Taralli al finocchietto 400 g", cat: "dispensa", tipo: "market", unita: "pezzo", prezzo: 3.2, giacenza: 45, origine: "Forno di Mesagne (BR)", venditore: "Panificio Quarta", art: "taralli", attivo: true, sconto: 0, spedibile: true },
  { id: "m4", nome: "Friselle di grano 500 g", cat: "dispensa", tipo: "market", unita: "pezzo", prezzo: 3.8, giacenza: 35, origine: "Forno di Mesagne (BR)", venditore: "Panificio Quarta", art: "frisella", attivo: true, sconto: 0, spedibile: true },
  { id: "m5", nome: "Pomodori secchi sott'olio 200 g", cat: "dispensa", tipo: "market", unita: "pezzo", prezzo: 5.5, giacenza: 24, origine: "Torre Santa Susanna (BR)", venditore: "Masseria Le Stanzie", art: "conserva", attivo: true, sconto: 0, spedibile: true },
  { id: "m6", nome: "Origano del Salento", cat: "dispensa", tipo: "market", unita: "mazzo", prezzo: 2.5, giacenza: 40, origine: "Campi salentini", venditore: "Sabetta ortofrutta", art: "basilico", attivo: true, sconto: 0, spedibile: true },
  { id: "m7", nome: "Sugo pronto al basilico", cat: "dispensa", tipo: "market", unita: "pezzo", prezzo: 4.9, giacenza: 28, origine: "Cotto in casa a Brindisi", venditore: "Sabetta ortofrutta", art: "conserva", attivo: true, sconto: 0, spedibile: true, nota: "Pomodori nostri e basilico dell'orto, niente altro." },
  { id: "m8", nome: "Taralli al vino bianco 400 g", cat: "dispensa", tipo: "market", unita: "pezzo", prezzo: 3.2, giacenza: 40, origine: "Forno di Mesagne (BR)", venditore: "Panificio Quarta", art: "taralli", attivo: true, sconto: 0, spedibile: true },
  { id: "m9", nome: "Melanzane sott'olio 280 g", cat: "dispensa", tipo: "market", unita: "pezzo", prezzo: 6.2, giacenza: 18, origine: "Torre Santa Susanna (BR)", venditore: "Masseria Le Stanzie", art: "sottolio", attivo: true, sconto: 0, spedibile: true },
  { id: "m10", nome: "Miele di fiori d'arancio 250 g", cat: "dispensa", tipo: "market", unita: "pezzo", prezzo: 6.5, giacenza: 20, origine: "Apicoltura di Ceglie (BR)", venditore: "Apicoltura Rubino", art: "miele", attivo: true, sconto: 0, spedibile: true },
  { id: "m11", nome: "Orecchiette di grano arso 500 g", cat: "dispensa", tipo: "market", unita: "pezzo", prezzo: 3.9, giacenza: 30, origine: "Pastificio di Latiano (BR)", venditore: "Pastificio Leone", art: "pasta", attivo: true, sconto: 0, spedibile: true },
  { id: "m12", nome: "Ceci di Zollino 500 g", cat: "dispensa", tipo: "market", unita: "pezzo", prezzo: 4.2, giacenza: 26, origine: "Presidio salentino", venditore: "Masseria Le Stanzie", art: "legumi", attivo: true, sconto: 0, spedibile: true },
];

/* ------------------------------- disegni --------------------------------- */
function Art({ k, size = 64 }) {
  const c = { width: size, height: size, viewBox: "0 0 64 64", "aria-hidden": "true", focusable: "false" };
  switch (k) {
    case "pomodoro": return (<svg {...c}><circle cx="32" cy="37" r="19" fill="#C6351E" /><circle cx="25" cy="31" r="5" fill="#E37458" opacity=".55" /><path d="M32 13v7" stroke="#2F6B34" strokeWidth="3" strokeLinecap="round" /><path d="M32 21c-7-5-13-3-13-3s3 7 13 7 13-7 13-7-6-2-13 3z" fill="#3E8A43" /></svg>);
    case "insalata": return (<svg {...c}><ellipse cx="32" cy="42" rx="20" ry="14" fill="#5EA245" /><ellipse cx="32" cy="34" rx="17" ry="13" fill="#79BE55" /><ellipse cx="26" cy="31" rx="7" ry="6" fill="#98D172" /><ellipse cx="39" cy="33" rx="6" ry="5" fill="#98D172" opacity=".8" /></svg>);
    case "zucchina": return (<svg {...c}><rect x="10" y="30" width="44" height="17" rx="8.5" fill="#3F7A32" transform="rotate(-12 32 38)" /><ellipse cx="26" cy="34" rx="9" ry="3" fill="#6FA85C" opacity=".6" transform="rotate(-12 26 34)" /><path d="M14 27c-2-3-5-4-5-4" stroke="#2F6B34" strokeWidth="3" strokeLinecap="round" /></svg>);
    case "melanzana": return (<svg {...c}><ellipse cx="33" cy="40" rx="15" ry="18" fill="#5B3A78" /><ellipse cx="27" cy="34" rx="4" ry="7" fill="#7E5B9B" opacity=".6" /><path d="M33 22c-6-2-9-6-9-6s7-2 12 1 6 8 6 8-3 0-9-3z" fill="#3E8A43" /></svg>);
    case "patata": return (<svg {...c}><ellipse cx="32" cy="36" rx="20" ry="15" fill="#C79A5B" transform="rotate(-8 32 36)" /><circle cx="25" cy="32" r="1.8" fill="#8E6A38" /><circle cx="36" cy="40" r="1.6" fill="#8E6A38" /><circle cx="39" cy="30" r="1.4" fill="#8E6A38" /></svg>);
    case "cipolla": return (<svg {...c}><path d="M32 18c9 6 16 12 16 21 0 8-7 13-16 13s-16-5-16-13c0-9 7-15 16-21z" fill="#C98B45" /><path d="M32 20v32M24 24c-3 6-4 11-4 15M40 24c3 6 4 11 4 15" stroke="#A46B2E" strokeWidth="1.6" fill="none" /><path d="M32 18l-4-6M32 18l5-5" stroke="#7E8B49" strokeWidth="2.5" strokeLinecap="round" /></svg>);
    case "carota": return (<svg {...c}><path d="M32 54L20 26c6-4 18-4 24 0L32 54z" fill="#E07B24" /><path d="M26 34h12M24 28h16" stroke="#C05F12" strokeWidth="1.6" /><path d="M32 24V14M32 20l-8-6M32 20l8-6" stroke="#3E8A43" strokeWidth="3" strokeLinecap="round" /></svg>);
    case "peperone": return (<svg {...c}><path d="M22 26c-6 4-8 12-5 19 3 6 10 9 15 9s12-3 15-9c3-7 1-15-5-19-5-3-15-3-20 0z" fill="#C6231F" /><path d="M26 30c-2 6-2 12 1 17" stroke="#E0675C" strokeWidth="3" strokeLinecap="round" opacity=".5" /><path d="M32 24v-6" stroke="#2F6B34" strokeWidth="3.5" strokeLinecap="round" /><ellipse cx="32" cy="25" rx="8" ry="3.5" fill="#3E8A43" /></svg>);
    case "mela": return (<svg {...c}><path d="M32 22c7-5 18-2 18 11s-9 21-18 21-18-8-18-21S25 17 32 22z" fill="#C8362C" /><path d="M24 28c-2 3-3 7-2 11" stroke="#E8776A" strokeWidth="3" strokeLinecap="round" opacity=".55" /><path d="M32 22v-7" stroke="#7A4A22" strokeWidth="3" strokeLinecap="round" /><path d="M33 16c4-6 11-5 11-5s-1 8-8 8c-2 0-3-1-3-3z" fill="#3E8A43" /></svg>);
    case "banana": return (<svg {...c}><path d="M14 20c2 18 12 28 30 29 4 0 6-3 4-6-14-4-22-12-26-25-1-3-8-2-8 2z" fill="#E7B725" /><path d="M18 22c3 15 12 23 26 25" stroke="#F3D774" strokeWidth="3" fill="none" strokeLinecap="round" /><path d="M46 43c3 1 5 2 5 4" stroke="#8A6B12" strokeWidth="3" strokeLinecap="round" /></svg>);
    case "arancia": return (<svg {...c}><circle cx="32" cy="36" r="19" fill="#E8862A" /><circle cx="25" cy="30" r="5" fill="#F4B266" opacity=".6" /><path d="M32 17v-3" stroke="#6B5A2A" strokeWidth="3" strokeLinecap="round" /><path d="M33 16c4-5 10-4 10-4s-1 7-7 7c-2 0-3-1-3-3z" fill="#3E8A43" /></svg>);
    case "pera": return (<svg {...c}><path d="M32 20c6 0 8 5 7 9-1 5 7 8 7 16 0 8-7 12-14 12s-14-4-14-12c0-8 8-11 7-16-1-4 1-9 7-9z" fill="#B5C33A" /><path d="M26 38c-2 3-3 7-2 10" stroke="#D6E06B" strokeWidth="3" strokeLinecap="round" opacity=".6" /><path d="M32 20v-6" stroke="#7A4A22" strokeWidth="3" strokeLinecap="round" /></svg>);
    case "fragola": return (<svg {...c}><path d="M32 54c-9-4-15-12-15-20 0-5 7-8 15-8s15 3 15 8c0 8-6 16-15 20z" fill="#CC2E3E" /><circle cx="27" cy="34" r="1.5" fill="#F7D8AE" /><circle cx="36" cy="36" r="1.5" fill="#F7D8AE" /><circle cx="31" cy="43" r="1.5" fill="#F7D8AE" /><path d="M32 26c-7 0-12-2-12-2s3-5 12-5 12 5 12 5-5 2-12 2z" fill="#3E8A43" /><path d="M32 19v-5" stroke="#3E8A43" strokeWidth="3" strokeLinecap="round" /></svg>);
    case "uva": return (<svg {...c}><g fill="#9BB13E"><circle cx="32" cy="28" r="6" /><circle cx="24" cy="34" r="6" /><circle cx="40" cy="34" r="6" /><circle cx="32" cy="40" r="6" /><circle cx="24" cy="46" r="6" /><circle cx="40" cy="46" r="6" /><circle cx="32" cy="52" r="6" /></g><path d="M32 22v-6" stroke="#7A4A22" strokeWidth="3" strokeLinecap="round" /><path d="M33 17c5-5 12-3 12-3s-4 7-10 6c-2 0-2-2-2-3z" fill="#3E8A43" /></svg>);
    case "limone": return (<svg {...c}><ellipse cx="32" cy="36" rx="20" ry="14" fill="#E9C321" transform="rotate(-12 32 36)" /><path d="M50 30l4-3M14 42l-4 3" stroke="#C9A310" strokeWidth="3" strokeLinecap="round" /><ellipse cx="25" cy="31" rx="6" ry="4" fill="#F3DC77" opacity=".7" transform="rotate(-12 25 31)" /></svg>);
    case "basilico": return (<svg {...c}><path d="M32 54V26" stroke="#4A7A2B" strokeWidth="3" strokeLinecap="round" /><path d="M32 32c-10 0-16-6-16-6s6-6 16-6" fill="#5EA245" /><path d="M32 42c10 0 16-6 16-6s-6-6-16-6" fill="#79BE55" /><path d="M32 22c-6-2-9-8-9-8s8-1 11 4" fill="#5EA245" /></svg>);
    case "aglio": return (<svg {...c}><path d="M32 20c8 5 14 12 14 20 0 8-6 12-14 12s-14-4-14-12c0-8 6-15 14-20z" fill="#EFE7DA" /><path d="M32 22v30M23 28c-2 6-3 11-2 16M41 28c2 6 3 11 2 16" stroke="#CDBFA9" strokeWidth="1.8" fill="none" /><path d="M32 20c0-4 2-7 2-7s2 4 1 7" fill="#9BA86A" /></svg>);
    case "misto": return (<svg {...c}><rect x="10" y="32" width="44" height="22" rx="4" fill="#C79A5B" /><path d="M10 40h44M22 32v22M42 32v22" stroke="#A97F45" strokeWidth="2" /><circle cx="22" cy="28" r="7" fill="#C6351E" /><circle cx="34" cy="26" r="8" fill="#5EA245" /><circle cx="45" cy="29" r="6" fill="#E8862A" /></svg>);
    case "busta": return (<svg {...c}><path d="M18 22h28l4 32H14l4-32z" fill="#EAF1E4" stroke="#B9C9AE" strokeWidth="2" /><circle cx="28" cy="38" r="7" fill="#79BE55" /><circle cx="39" cy="42" r="6" fill="#5EA245" /><path d="M24 22c0-5 3-8 8-8s8 3 8 8" stroke="#B9C9AE" strokeWidth="2" fill="none" /></svg>);
    case "tagliata": return (<svg {...c}><path d="M16 28h32l-3 26H19l-3-26z" fill="#F2EDE2" stroke="#D6CCBA" strokeWidth="2" /><circle cx="26" cy="38" r="6" fill="#E8862A" /><circle cx="37" cy="36" r="5" fill="#CC2E3E" /><circle cx="32" cy="46" r="5" fill="#9BB13E" /><rect x="14" y="24" width="36" height="5" rx="2.5" fill="#D6CCBA" /></svg>);
    case "broccolo": return (<svg {...c}><path d="M32 54V34" stroke="#7A9E52" strokeWidth="5" strokeLinecap="round" /><circle cx="24" cy="26" r="8" fill="#4E8B3F" /><circle cx="40" cy="26" r="8" fill="#4E8B3F" /><circle cx="32" cy="20" r="9" fill="#5EA245" /><circle cx="32" cy="30" r="9" fill="#5EA245" /></svg>);
    case "cavolfiore": return (<svg {...c}><path d="M32 54V36" stroke="#7A9E52" strokeWidth="5" strokeLinecap="round" /><path d="M14 34c0-4 3-6 5-7 0-6 5-9 9-8 3-4 8-4 11 0 5-1 9 3 9 8 3 2 5 4 5 7 0 5-6 8-16 8s-16-3-16-8z" fill="#F2EFE0" /><path d="M18 33c2-2 6-3 14-3s12 1 14 3" stroke="#D9D4BF" strokeWidth="1.6" fill="none" /></svg>);
    case "finocchio": return (<svg {...c}><path d="M32 22c-8 0-13 5-13 12 0 8 5 14 13 14s13-6 13-14c0-7-5-12-13-12z" fill="#EFF2E4" /><path d="M32 22v26M25 25c-2 6-2 14 0 20M39 25c2 6 2 14 0 20" stroke="#CFD8BC" strokeWidth="1.6" fill="none" /><path d="M26 22c-2-6-4-9-4-9M32 22V10M38 22c2-6 4-9 4-9" stroke="#5EA245" strokeWidth="2.6" strokeLinecap="round" /></svg>);
    case "sedano": return (<svg {...c}><path d="M22 20c0 14 2 24 4 34h6c-2-10-4-20-4-34z" fill="#9BC46A" /><path d="M32 18c0 14 0 24 0 36h6c0-12 0-22 2-36z" fill="#86B356" /><path d="M22 20c-3-6-3-10-3-10s5 2 8 7M40 18c3-6 3-10 3-10s-5 2-8 7" fill="#4E8B3F" /></svg>);
    case "cetriolo": return (<svg {...c}><rect x="10" y="28" width="44" height="18" rx="9" fill="#4E8B3F" transform="rotate(-18 32 37)" /><path d="M20 40c-1-5 0-9 2-12" stroke="#7FC96A" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity=".7" /><circle cx="28" cy="34" r="1.4" fill="#2F6B34" /><circle cx="36" cy="39" r="1.4" fill="#2F6B34" /></svg>);
    case "zucca": return (<svg {...c}><ellipse cx="32" cy="38" rx="20" ry="16" fill="#E0761F" /><ellipse cx="24" cy="38" rx="8" ry="16" fill="#EC8B36" opacity=".8" /><ellipse cx="40" cy="38" rx="8" ry="16" fill="#EC8B36" opacity=".8" /><path d="M32 22v-6" stroke="#5E7A2A" strokeWidth="4" strokeLinecap="round" /><path d="M33 17c4-3 8-2 8-2s-2 5-6 5" fill="#5EA245" /></svg>);
    case "funghi": return (<svg {...c}><path d="M14 32c0-9 8-15 18-15s18 6 18 15c0 3-8 4-18 4s-18-1-18-4z" fill="#9B6B45" /><path d="M27 36h10v12a5 5 0 0 1-10 0z" fill="#F0E4D2" /><circle cx="24" cy="26" r="2.6" fill="#C89A72" /><circle cx="39" cy="24" r="2.2" fill="#C89A72" /></svg>);
    case "spinaci": return (<svg {...c}><path d="M32 52c-12-2-20-10-20-20 8-4 16-2 20 4 4-6 12-8 20-4 0 10-8 18-20 20z" fill="#3E8A43" /><path d="M32 52V32" stroke="#2C6B32" strokeWidth="2" strokeLinecap="round" /><path d="M32 40l-8-5M32 44l8-5" stroke="#2C6B32" strokeWidth="1.6" strokeLinecap="round" /></svg>);
    case "peperoncino": return (<svg {...c}><path d="M40 20c6 6 6 18-2 26-6 6-14 8-20 6 6-2 12-6 16-12 4-6 5-14 6-20z" fill="#C6231F" /><path d="M40 20c0-6 2-8 2-8s3 3 2 8c-1 3-3 3-4 0z" fill="#3E8A43" /></svg>);
    case "fagiolini": return (<svg {...c}><path d="M14 44c8-16 20-24 34-26" stroke="#5EA245" strokeWidth="6" strokeLinecap="round" fill="none" /><path d="M16 50c8-16 20-24 34-26" stroke="#7FC96A" strokeWidth="6" strokeLinecap="round" fill="none" /><circle cx="26" cy="38" r="1.6" fill="#3E8A43" /><circle cx="34" cy="32" r="1.6" fill="#3E8A43" /></svg>);
    case "pesca": return (<svg {...c}><circle cx="32" cy="36" r="18" fill="#F09055" /><path d="M32 18v36" stroke="#D9713A" strokeWidth="1.6" opacity=".6" /><circle cx="25" cy="30" r="5" fill="#F7B48A" opacity=".7" /><path d="M33 18c3-5 9-5 9-5s-2 6-7 6z" fill="#5EA245" /></svg>);
    case "ciliegie": return (<svg {...c}><path d="M32 14c-6 6-12 10-14 18M32 14c4 7 8 11 12 16" stroke="#5E7A2A" strokeWidth="2.4" fill="none" strokeLinecap="round" /><circle cx="18" cy="40" r="9" fill="#C0203A" /><circle cx="44" cy="38" r="9" fill="#D62C46" /><path d="M32 14c4-4 9-4 9-4s-2 5-6 5" fill="#5EA245" /></svg>);
    case "anguria": return (<svg {...c}><path d="M10 26h44c0 15-10 26-22 26S10 41 10 26z" fill="#C6231F" /><path d="M10 26h44" stroke="#F2EFE0" strokeWidth="4" /><path d="M8 26h48" stroke="#3E8A43" strokeWidth="3" /><circle cx="26" cy="36" r="1.8" fill="#2A2119" /><circle cx="36" cy="40" r="1.8" fill="#2A2119" /><circle cx="32" cy="31" r="1.8" fill="#2A2119" /></svg>);
    case "melone": return (<svg {...c}><circle cx="32" cy="36" r="19" fill="#D8C87A" /><path d="M16 28c8 3 24 3 32 0M15 36c8 3 26 3 34 0M17 44c8 2 22 2 30 0" stroke="#BFAE60" strokeWidth="1.6" fill="none" /><path d="M32 17v-4" stroke="#7A8B49" strokeWidth="3" strokeLinecap="round" /></svg>);
    case "kiwi": return (<svg {...c}><circle cx="32" cy="36" r="19" fill="#8A6B3A" /><circle cx="32" cy="36" r="15" fill="#9BC46A" /><circle cx="32" cy="36" r="5" fill="#F2EFE0" /><g fill="#2A2119"><circle cx="32" cy="26" r="1.1" /><circle cx="40" cy="31" r="1.1" /><circle cx="38" cy="42" r="1.1" /><circle cx="26" cy="42" r="1.1" /><circle cx="24" cy="31" r="1.1" /></g></svg>);
    case "ananas": return (<svg {...c}><path d="M32 22c-8 0-13 6-13 15s5 17 13 17 13-8 13-17-5-15-13-15z" fill="#E0A82A" /><path d="M22 30l20 10M42 30L22 40M24 24l16 22M40 24L24 46" stroke="#B9851A" strokeWidth="1.4" /><path d="M32 22V8M32 14l-7-5M32 14l7-5M32 18l-9-2M32 18l9-2" stroke="#3E8A43" strokeWidth="3" strokeLinecap="round" /></svg>);
    case "mandarino": return (<svg {...c}><ellipse cx="32" cy="38" rx="18" ry="15" fill="#EE8021" /><path d="M32 23v-3" stroke="#6B5A2A" strokeWidth="3" strokeLinecap="round" /><path d="M33 21c4-4 9-3 9-3s-2 6-7 6z" fill="#3E8A43" /><ellipse cx="25" cy="33" rx="5" ry="4" fill="#F6AC66" opacity=".6" /></svg>);
    case "fico": return (<svg {...c}><path d="M32 20c9 0 16 8 16 17 0 9-7 15-16 15s-16-6-16-15c0-9 7-17 16-17z" fill="#6A4A7A" /><path d="M32 20c0-4-3-7-3-7s6-1 8 3" fill="#5EA245" /><path d="M24 38c3-3 8-4 12-2" stroke="#8E6B9E" strokeWidth="2" strokeLinecap="round" fill="none" /></svg>);
    case "miele": return (<svg {...c}><path d="M22 24h20v24a6 6 0 0 1-6 6h-8a6 6 0 0 1-6-6z" fill="#E0A82A" /><rect x="20" y="17" width="24" height="8" rx="3" fill="#8A6B3A" /><rect x="24" y="33" width="16" height="12" rx="2" fill="#F5EFE0" /><path d="M28 39h8" stroke="#B9851A" strokeWidth="2" strokeLinecap="round" /></svg>);
    case "marmellata": return (<svg {...c}><path d="M22 26h20v22a6 6 0 0 1-6 6h-8a6 6 0 0 1-6-6z" fill="#A8243F" /><path d="M20 20h24l-2 6H22z" fill="#D8CDB4" /><rect x="25" y="34" width="14" height="11" rx="2" fill="#F5EFE0" /><circle cx="32" cy="39" r="3" fill="#A8243F" /></svg>);
    case "pasta": return (<svg {...c}><path d="M18 52c0-20 4-34 6-40h4c-2 8-5 20-5 40zM27 52c0-20 3-34 5-40h4c-2 8-4 20-4 40zM36 52c0-20 3-34 5-40h4c-2 8-4 20-4 40z" fill="#E4C878" /><rect x="14" y="48" width="36" height="8" rx="3" fill="#9B6B45" /></svg>);
    case "vino": return (<svg {...c}><path d="M27 10h10v14c0 3 5 6 5 12v20a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4V36c0-6 5-9 5-12z" fill="#5C2233" /><rect x="26" y="7" width="12" height="5" rx="2" fill="#3A1420" /><rect x="23" y="38" width="18" height="13" rx="2" fill="#F0E4D2" /><path d="M27 44h10" stroke="#5C2233" strokeWidth="2" strokeLinecap="round" /></svg>);
    case "legumi": return (<svg {...c}><path d="M16 34h32l-3 20H19z" fill="#D8CDB4" /><circle cx="24" cy="28" r="5" fill="#B98A45" /><circle cx="34" cy="26" r="5" fill="#8A6B3A" /><circle cx="42" cy="30" r="4.5" fill="#C4A05C" /><circle cx="29" cy="32" r="4" fill="#A8824A" /></svg>);
    case "sottolio": return (<svg {...c}><path d="M21 24h22v24a6 6 0 0 1-6 6h-10a6 6 0 0 1-6-6z" fill="#8FA83E" /><rect x="19" y="16" width="26" height="9" rx="3" fill="#6E8430" /><circle cx="28" cy="36" r="3.4" fill="#C6351E" /><circle cx="36" cy="42" r="3.4" fill="#C6351E" /><circle cx="35" cy="33" r="3" fill="#E0761F" /></svg>);
    case "cassa": return (<svg {...c}><path d="M8 26h48l-4 26H12z" fill="#C79A5B" /><path d="M8 34h48M22 26v26M42 26v26" stroke="#A97F45" strokeWidth="2" /><circle cx="22" cy="20" r="7" fill="#C6351E" /><circle cx="34" cy="18" r="8" fill="#5EA245" /><circle cx="45" cy="21" r="6" fill="#E8862A" /></svg>);
    case "conserva": return (<svg {...c}><path d="M20 22h24v28a6 6 0 0 1-6 6H26a6 6 0 0 1-6-6z" fill="#C6351E" /><rect x="18" y="14" width="28" height="9" rx="3" fill="#8E9A86" /><rect x="22" y="32" width="20" height="12" rx="2" fill="#F4EFE2" opacity=".9" /><path d="M26 38h12" stroke="#C6351E" strokeWidth="2" strokeLinecap="round" /></svg>);
    case "olio": return (<svg {...c}><path d="M27 14h10v6c0 2 7 6 7 14v18a6 6 0 0 1-6 6H26a6 6 0 0 1-6-6V34c0-8 7-12 7-14z" fill="#8FA83E" /><rect x="26" y="10" width="12" height="6" rx="2" fill="#5C6E28" /><rect x="24" y="36" width="16" height="12" rx="2" fill="#F4EFE2" opacity=".9" /><circle cx="32" cy="42" r="3" fill="#5C6E28" /></svg>);
    case "taralli": return (<svg {...c}><circle cx="24" cy="36" r="11" fill="none" stroke="#D2A45E" strokeWidth="6" /><circle cx="40" cy="30" r="9" fill="none" stroke="#C4934A" strokeWidth="6" /><circle cx="38" cy="44" r="7" fill="none" stroke="#D2A45E" strokeWidth="5" /></svg>);
    case "frisella": return (<svg {...c}><circle cx="32" cy="34" r="19" fill="#D6AD6B" /><circle cx="32" cy="34" r="6" fill="#F5F2EA" /><circle cx="22" cy="28" r="2" fill="#B98A45" /><circle cx="42" cy="30" r="2" fill="#B98A45" /><circle cx="36" cy="46" r="2" fill="#B98A45" /><circle cx="24" cy="42" r="2" fill="#B98A45" /></svg>);
    case "carciofo": return (<svg {...c}><path d="M32 54c-8 0-14-6-14-14 0-9 6-16 14-16s14 7 14 16c0 8-6 14-14 14z" fill="#6E8C4A" /><path d="M32 26c-4 4-6 9-6 14s2 8 6 10c4-2 6-5 6-10s-2-10-6-14z" fill="#8CA863" /><path d="M24 30c-2 4-3 8-3 12M40 30c2 4 3 8 3 12" stroke="#55703A" strokeWidth="1.8" strokeLinecap="round" fill="none" /><path d="M32 24v-8" stroke="#55703A" strokeWidth="3" strokeLinecap="round" /></svg>);
    default: return (<svg {...c}><circle cx="32" cy="36" r="18" fill="#79BE55" /><path d="M32 18v-5" stroke="#7A4A22" strokeWidth="3" strokeLinecap="round" /></svg>);
  }
}

function Betta({ size = 40, fluttua = true }) {
  return (
    <span className="bettavatar" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 64 64" width={size} height={size}>
        {/* spalle: camicia panna e grembiule verde del banco */}
        <path d="M32 46c-9.8 0-17.6 6.2-19.4 18h38.8C49.6 52.2 41.8 46 32 46z" fill="#F4EFE2" />
        <path d="M25 49h14c4.4 3.2 7 8.4 7.6 15H17.4c.6-6.6 3.2-11.8 7.6-15z" fill="#1F6B45" />
        <path d="M25.8 49.2L32 54l6.2-4.8" stroke="#3B8C61" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M23.8 59.4h16.4" stroke="#FFFFFF" strokeOpacity=".26" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="32" cy="56.6" r="1.5" fill="#E9A81E" />

        <g className={`bettatesta ${fluttua ? "fluttua" : ""}`}>
          {/* collo */}
          <path d="M28.4 40h7.2v6.4c0 2-1.6 3.6-3.6 3.6s-3.6-1.6-3.6-3.6z" fill="#E0AE8B" />

          {/* picciolo e foglioline del pomodoro */}
          <path d="M32 9.6c-.4-3.2.5-5.9 2.6-8.2 1 2.9.7 5.6-1 8.1z" fill="#4E7A2B" />
          <path d="M32 11.8c-4.2-2.6-8-2.9-11.6-1 1.4 3.6 4.3 5.5 8.7 5.8z" fill="#3E8A43" />
          <path d="M32 11.8c4.2-2.6 8-2.9 11.6-1-1.4 3.6-4.3 5.5-8.7 5.8z" fill="#3E8A43" />
          <path d="M32 11.4c-2.6-3-5.4-4.6-8.4-4.8.5 3.6 2.4 6.1 5.8 7.6z" fill="#4E9B4C" />
          <path d="M32 11.4c2.6-3 5.4-4.6 8.4-4.8-.5 3.6-2.4 6.1-5.8 7.6z" fill="#4E9B4C" />

          {/* corpo del pomodoro: i capelli */}
          <path d="M32 10.4c11.5 0 19.4 8.2 19.4 19.6 0 6.7-2.6 12.4-7 16.1.9-3.1 1.1-6.5.5-10.2-1.3-8.1-6-12.3-12.9-12.3s-11.6 4.2-12.9 12.3c-.6 3.7-.4 7.1.5 10.2-4.4-3.7-7-9.4-7-16.1 0-11.4 7.9-19.6 19.4-19.6z" fill="#D2381F" />
          <path d="M20.6 20.8c-2.2 3.4-3.4 7.4-3.4 11.8" stroke="#A82A15" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity=".55" />
          <path d="M43.4 20.8c2.2 3.4 3.4 7.4 3.4 11.8" stroke="#A82A15" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity=".55" />
          <path d="M22.4 18.2c2.6-2.6 5.7-4.2 9.2-4.7" stroke="#EC7256" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".6" />

          {/* viso */}
          <path d="M32 17.6c6.5 0 11.1 4.5 11.1 11.1v3.2c0 6.9-5 11.9-11.1 11.9s-11.1-5-11.1-11.9v-3.2c0-6.6 4.6-11.1 11.1-11.1z" fill="#F1C49E" />
          <circle cx="20.9" cy="30.6" r="2.2" fill="#E0AE8B" />
          <circle cx="43.1" cy="30.6" r="2.2" fill="#E0AE8B" />

          {/* frangia */}
          <path d="M20.9 28.6c0-6.6 4.6-11.1 11.1-11.1s11.1 4.5 11.1 11.1c-3.4-.6-5.9-2.5-7.6-5.6-2.3 3.8-7.4 5.8-14.6 5.6z" fill="#D2381F" />
          <path d="M24.4 23.4c1.6-2 3.6-3.4 6-4.2" stroke="#EC7256" strokeWidth="1.7" strokeLinecap="round" fill="none" opacity=".7" />

          {/* occhi, sopracciglia, guance, bocca */}
          <path d="M23.6 26.4c1.5-1.1 3.2-1.2 4.8-.2" stroke="#8C2A15" strokeWidth="1.3" strokeLinecap="round" fill="none" />
          <path d="M35.6 26.2c1.6-1 3.3-.9 4.8.2" stroke="#8C2A15" strokeWidth="1.3" strokeLinecap="round" fill="none" />
          <ellipse cx="27" cy="31.2" rx="2.4" ry="3" fill="#2A2119" />
          <ellipse cx="37" cy="31.2" rx="2.4" ry="3" fill="#2A2119" />
          <circle cx="27.9" cy="30.1" r=".85" fill="#FFFFFF" />
          <circle cx="37.9" cy="30.1" r=".85" fill="#FFFFFF" />
          <circle cx="23.2" cy="35.4" r="2.3" fill="#E07A62" opacity=".45" />
          <circle cx="40.8" cy="35.4" r="2.3" fill="#E07A62" opacity=".45" />
          <path d="M29.7 36.8c1.5 1.9 3.1 1.9 4.6 0" stroke="#8A4A38" strokeWidth="1.3" strokeLinecap="round" fill="none" />
        </g>
      </svg>
    </span>
  );
}

/* --------------------------------- icone --------------------------------- */
const I = {
  banco: (p) => <svg {...ico(p)}><path d="M4 10h16v10H4zM3 10l1.5-5h15L21 10M9 20v-5h6v5" /></svg>,
  carrello: (p) => <svg {...ico(p)}><circle cx="9.5" cy="19.5" r="1.4" /><circle cx="17.5" cy="19.5" r="1.4" /><path d="M3 4h2.2l2.4 11.2a1.8 1.8 0 0 0 1.8 1.4h7.4a1.8 1.8 0 0 0 1.8-1.4L20 8H6" /></svg>,
  ordini: (p) => <svg {...ico(p)}><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></svg>,
  chat: (p) => <svg {...ico(p)}><path d="M20 15a3 3 0 0 1-3 3H9l-4 3v-4a3 3 0 0 1-2-3V6a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3z" /></svg>,
  utente: (p) => <svg {...ico(p)}><circle cx="12" cy="8" r="4" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>,
  cerca: (p) => <svg {...ico(p)}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></svg>,
  chevron: (p) => <svg {...ico(p)}><path d="M15 5l-7 7 7 7" /></svg>,
  freccia: (p) => <svg {...ico(p)}><path d="M20 12H4M10 6l-6 6 6 6" /></svg>,
  avanti: (p) => <svg {...ico(p)}><path d="M9 5l7 7-7 7" /></svg>,
  tel: (p) => <svg {...ico(p)}><path d="M5 3h4l2 5-2.5 1.5a12 12 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2.2 2C10.7 20.3 3.7 13.3 3 5.2A2 2 0 0 1 5 3z" /></svg>,
  ok: (p) => <svg {...ico(p)}><path d="M4 12.5l5.5 5.5L20 6.5" /></svg>,
  piu: (p) => <svg {...ico(p)}><path d="M12 5v14M5 12h14" /></svg>,
  meno: (p) => <svg {...ico(p)}><path d="M5 12h14" /></svg>,
  cestino: (p) => <svg {...ico(p)}><path d="M4 7h16M10 7V5h4v2M6 7l1 13h10l1-13" /></svg>,
  orologio: (p) => <svg {...ico(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5.5l3.5 2" /></svg>,
  stella: (p) => <svg {...ico(p)} fill={p && p.on ? "currentColor" : "none"}><path d="M12 3.5l2.7 5.6 6.1.8-4.5 4.2 1.2 6L12 17.3 6.5 20.1l1.2-6L3.2 9.9l6.1-.8z" /></svg>,
  neve: (p) => <svg {...ico(p)}><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M12 7l-2.5-2.5M12 7l2.5-2.5M12 17l-2.5 2.5M12 17l2.5 2.5" /></svg>,
  scatola: (p) => <svg {...ico(p)}><path d="M3 8l9-4 9 4v8l-9 4-9-4z" /><path d="M3 8l9 4 9-4M12 12v8" /></svg>,
  grafico: (p) => <svg {...ico(p)}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  invia: (p) => <svg {...ico(p)}><path d="M4 12l16-8-6 16-2.5-6z" /></svg>,
  x: (p) => <svg {...ico(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  info: (p) => <svg {...ico(p)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>,
  bilancia: (p) => <svg {...ico(p)}><path d="M12 4v16M6 20h12M4 10l4-6 4 6a4 4 0 0 1-8 0zM12 10l4-6 4 6a4 4 0 0 1-8 0z" /></svg>,
  matita: (p) => <svg {...ico(p)}><path d="M4 20h4l10-10-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>,
  buono: (p) => <svg {...ico(p)}><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V5a2 2 0 0 1 2-2h7a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6z" /><path d="M7.6 7.6h.01" /></svg>,
  meno2: (p) => <svg {...ico(p)}><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></svg>,
};
function ico(p) {
  const s = (p && p.s) || 22;
  return { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: (p && p.w) || 1.9, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" };
}

/* ============================ contesto applicazione ======================= */
const Ctx = createContext(null);
const useApp = () => useContext(Ctx);

/* =================================== ROOT ================================= */
export default function SabettaApp() {
  const [piatt, setPiatt] = useState("ios");
  const [pronto, setPronto] = useState(false);

  /* dati */
  const [catalogo, setCatalogo] = useState([...CATALOGO, ...BOTTEGA]);
  const [bozza, setBozza] = useState(null);          // copia in lavorazione durante il freeze
  const [freeze, setFreeze] = useState({ attivo: false, riapre: "", motivo: "Stiamo caricando la merce di oggi" });
  const [carrello, setCarrello] = useState({});
  const [ordini, setOrdini] = useState([]);
  const [preferiti, setPreferiti] = useState([]);
  const [cliente, setCliente] = useState({ nome: "", tel: "", via: "", civico: "", citta: CITTA_ZONA, cap: "", citofono: "", note: "" });
  const [seq, setSeq] = useState(1041);
  const [bancoAperto, setBancoAperto] = useState(true);
  const [bloccate, setBloccate] = useState([]);
  const [giorniChiusi, setGiorniChiusi] = useState([]);
  const [coupons, setCoupons] = useState(COUPON_INIZIALI);
  const [coupon, setCoupon] = useState("");
  const [grande, setGrande] = useState(false);
  const [chat, setChat] = useState([]);
  const [bollaVista, setBollaVista] = useState(false);
  const [utenti, setUtenti] = useState([]);
  const [utenteId, setUtenteId] = useState(null);
  const [operatori, setOperatori] = useState(OPERATORI_INIZIALI);
  const [operatore, setOperatore] = useState(null);
  const [pacchi, setPacchi] = useState(PACCHI_INIZIALI);
  const [puntiUsati, setPuntiUsati] = useState(0);
  const [solita, setSolita] = useState(null);
  const [posts, setPosts] = useState(() => POST_INIZIALI.map((x, i) => ({ ...x, creato: new Date(Date.now() - i * 86400000).toISOString() })));
  const [cuori, setCuori] = useState([]);

  /* navigazione */
  const [modo, setModo] = useState("cliente");
  const [tab, setTab] = useState("home");
  const [stack, setStack] = useState([]);
  const [tabA, setTabA] = useState("ordini");
  const [stackA, setStackA] = useState([]);
  const [sbloccato, setSbloccato] = useState(false);

  const [avviso, setAvviso] = useState(null);
  const tAvviso = useRef(null);
  const tSalva = useRef(null);

  /* font */
  useEffect(() => {
    const id = "sab-font";
    if (typeof document !== "undefined" && !document.getElementById(id)) {
      const l = document.createElement("link");
      l.id = id; l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..125,400..800&display=swap";
      document.head.appendChild(l);
    }
    if (typeof navigator !== "undefined" && /android/i.test(navigator.userAgent || "")) setPiatt("android");
  }, []);

  /* caricamento e salvataggio */
  useEffect(() => {
    let vivo = true;
    leggi().then((s) => {
      if (!vivo) return;
      if (s) {
        if (s.catalogo) {
          const base = normalizzaCatalogo(s.catalogo);
          const mancanti = BOTTEGA.filter((b) => !base.find((x) => x.id === b.id));
          setCatalogo([...base, ...mancanti]);
        }
        if (s.carrello) setCarrello(s.carrello);
        if (s.ordini) setOrdini(s.ordini);
        if (s.preferiti) setPreferiti(s.preferiti);
        if (s.cliente) setCliente({ citta: CITTA_ZONA, cap: "", ...s.cliente });
        if (s.seq) setSeq(s.seq);
        if (s.freeze) setFreeze(s.freeze);
        if (s.bozza) setBozza(normalizzaCatalogo(s.bozza));
        if (s.coupons) setCoupons(s.coupons);
        if (s.utenti) setUtenti(s.utenti);
        if (s.utenteId) setUtenteId(s.utenteId);
        if (s.operatori) setOperatori(s.operatori);
        if (s.pacchi) setPacchi(s.pacchi);
        if (s.solita) setSolita(s.solita);
        if (s.posts) setPosts(s.posts);
        if (s.cuori) setCuori(s.cuori);
        if (s.giorniChiusi) setGiorniChiusi(s.giorniChiusi);
        if (typeof s.bancoAperto === "boolean") setBancoAperto(s.bancoAperto);
        if (s.bloccate) setBloccate(s.bloccate);
        if (typeof s.grande === "boolean") setGrande(s.grande);
      }
      setPronto(true);
    });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!pronto) return;
    clearTimeout(tSalva.current);
    tSalva.current = setTimeout(() => {
      scrivi(alleggerisci({ catalogo, carrello, ordini, preferiti, cliente, seq, freeze, bozza, bancoAperto, bloccate, giorniChiusi, coupons, grande, utenti, utenteId, operatori, pacchi, solita, posts, cuori }));
    }, 450);
    return () => clearTimeout(tSalva.current);
  }, [catalogo, carrello, ordini, preferiti, cliente, seq, freeze, bozza, bancoAperto, bloccate, giorniChiusi, coupons, grande, utenti, utenteId, operatori, pacchi, solita, posts, cuori, pronto]);

  /* azioni comuni */
  function dimmi(t) {
    setAvviso(t);
    clearTimeout(tAvviso.current);
    tAvviso.current = setTimeout(() => setAvviso(null), 2600);
  }
  const push = (s, p) => setStack((x) => [...x, { s, p }]);
  const pop = () => setStack((x) => x.slice(0, -1));
  const vaiTab = (t) => { setStack([]); setTab(t); };
  const pushA = (s, p) => setStackA((x) => [...x, { s, p }]);
  const popA = () => setStackA((x) => x.slice(0, -1));

  function aggiungi(p, delta) {
    setCarrello((c) => {
      const ora = c[p.id] ? c[p.id].qta : 0;
      const q = Math.round((ora + delta) * 10) / 10;
      const copia = { ...c };
      if (q <= 0) { delete copia[p.id]; return copia; }
      copia[p.id] = { qta: Math.min(q, p.giacenza), pref: c[p.id] ? c[p.id].pref : MATURAZIONE[0] };
      return copia;
    });
  }
  const togli = (id) => setCarrello((c) => { const k = { ...c }; delete k[id]; return k; });
  const setPref = (id, pref) => setCarrello((c) => (c[id] ? { ...c, [id]: { ...c[id], pref } } : c));
  const toggleFav = (id) => setPreferiti((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  const righe = useMemo(() => Object.keys(carrello).map((id) => {
    const p = catalogo.find((x) => x.id === id);
    if (!p) return null;
    const q = carrello[id].qta;
    return { p, qta: q, pref: carrello[id].pref, unitario: prezzoDi(p), totale: arr2(prezzoDi(p) * q) };
  }).filter(Boolean), [carrello, catalogo]);

  const parziale = useMemo(() => Math.round(righe.reduce((s, r) => s + r.totale, 0) * 100) / 100, [righe]);
  const pezzi = righe.length;
  const mancano = Math.max(0, arr2(MIN_ORDINE - parziale));
  const okMinimo = parziale >= MIN_ORDINE;
  const esitoCoupon = useMemo(() => (coupon ? verificaCoupon(coupon, coupons, parziale) : null), [coupon, coupons, parziale]);
  const couponAttivo = esitoCoupon && esitoCoupon.ok ? esitoCoupon.c : null;
  const giorni = useMemo(() => giorniUtili(7).map((g) => ({ ...g, chiuso: g.chiuso || giorniChiusi.includes(g.key) })), [giorniChiusi]);

  function fasce(giorno, ritiro) {
    const ora = new Date();
    const oggi = giorno === dkey(ora);
    const adesso = ora.getHours() + ora.getMinutes() / 60;
    const out = [];
    for (let h = APERTURA; h < CHIUSURA; h++) {
      const chiave = `${giorno}|${h}`;
      const usate = ordini.filter((o) => o.giorno === giorno && o.fascia === h && o.stato !== "annullato").length;
      let motivo = null;
      if (giorniChiusi.includes(giorno)) motivo = "Giornata chiusa";
      else if (bloccate.includes(chiave)) motivo = "Non disponibile";
      else if (!ritiro && usate >= CAPIENZA_FASCIA) motivo = "Al completo";
      else if (oggi && h < adesso + ANTICIPO) motivo = "Passata";
      else if (oggi && !bancoAperto) motivo = "Banco chiuso";
      out.push({ h, t: fasciaTxt(h), ok: !motivo, motivo, posti: Math.max(0, CAPIENZA_FASCIA - usate) });
    }
    return out;
  }

  /* ------------------------ clienti, accesso, punti ---------------------- */
  const utente = utenti.find((u) => u.id === utenteId) || null;
  const punti = utente ? utente.punti || 0 : 0;
  const livello = livelloDi(punti);
  const buoniDisponibili = Math.floor(punti / PUNTI_BUONO);

  function salvaUtente(u) {
    setUtenti((v) => (v.find((x) => x.id === u.id) ? v.map((x) => (x.id === u.id ? { ...x, ...u } : x)) : [{ ...u }, ...v]));
  }

  function registra(dati) {
    const tel = solaCifre(dati.tel);
    if (utenti.find((u) => solaCifre(u.tel) === tel && !u.ospite)) return { ok: false, msg: "Questo numero è già registrato. Prova ad accedere." };
    const u = {
      id: `u${Date.now()}`, nome: dati.nome.trim(), tel: dati.tel.trim(), email: (dati.email || "").trim(),
      via: dati.via || "", civico: dati.civico || "", citta: dati.citta || CITTA_ZONA, cap: dati.cap || "", citofono: dati.citofono || "",
      pin: dati.pin, punti: 0, speso: 0, ordini: 0, creato: new Date().toISOString(),
      consensoEmail: !!dati.consensoEmail, consensoSms: !!dati.consensoSms, ospite: false, note: "",
    };
    const vecchio = utenti.find((x) => solaCifre(x.tel) === tel && x.ospite);
    if (vecchio) { u.punti = vecchio.punti || 0; u.speso = vecchio.speso || 0; u.ordini = vecchio.ordini || 0; setUtenti((v) => v.filter((x) => x.id !== vecchio.id)); }
    salvaUtente(u);
    setUtenteId(u.id);
    setCliente((c) => ({ ...c, nome: u.nome, tel: u.tel, email: u.email, via: u.via, civico: u.civico, citta: u.citta, cap: u.cap, citofono: u.citofono }));
    return { ok: true, u };
  }

  function accedi(tel, pin) {
    const u = utenti.find((x) => solaCifre(x.tel) === solaCifre(tel) && x.pin === pin && !x.ospite);
    if (!u) return { ok: false, msg: "Numero o codice non corretti." };
    setUtenteId(u.id);
    setCliente((c) => ({ ...c, nome: u.nome, tel: u.tel, email: u.email || "", via: u.via, civico: u.civico, citta: u.citta, cap: u.cap, citofono: u.citofono }));
    return { ok: true, u };
  }

  const esci = () => { setUtenteId(null); setPuntiUsati(0); };

  function agganciaCliente(o) {
    const tel = solaCifre(o.cliente.tel);
    const esistente = utenti.find((u) => solaCifre(u.tel) === tel);
    if (esistente) return esistente.id;
    const u = {
      id: `u${Date.now()}`, nome: o.cliente.nome, tel: o.cliente.tel, email: o.cliente.email || "",
      via: o.cliente.via, civico: o.cliente.civico, citta: o.cliente.citta, cap: o.cliente.cap, citofono: o.cliente.citofono,
      pin: "", punti: 0, speso: 0, ordini: 0, creato: new Date().toISOString(),
      consensoEmail: !!o.cliente.consensoEmail, consensoSms: !!o.cliente.consensoSms, ospite: true, note: "",
    };
    salvaUtente(u);
    return u.id;
  }

  function creaOrdine(d) {
    const n = seq + 1;
    const cc = couponAttivo;
    const base = calcola(parziale, d.ritiro, cc);
    const consegna = d.consegna !== undefined ? d.consegna : base.consegna;
    const sconto = base.sconto;
    const totale = arr2(parziale - sconto + consegna);
    const o = {
      id: `SP-${n}`, creato: new Date().toISOString(),
      righe: righe.map((r) => ({ id: r.p.id, nome: r.p.nome, qta: r.qta, unita: r.p.unita, prezzo: r.unitario, listino: r.p.prezzo, sconto: r.p.sconto || 0, totale: r.totale, pref: r.p.maturazione ? r.pref : null, art: r.p.art })),
      parziale, consegna, sconto, coupon: cc ? { codice: cc.codice, tipo: cc.tipo, valore: cc.valore } : null,
      puntiUsati: d.puntiUsati || 0, scontoPunti: arr2((d.puntiUsati || 0) / PUNTI_BUONO * VALORE_BUONO),
      totale: Math.max(0, arr2(totale - (d.puntiUsati || 0) / PUNTI_BUONO * VALORE_BUONO)),
      puntiMaturati: 0, tipo: "spesa",
      giorno: d.giorno, fascia: d.subito ? null : d.fascia, subito: d.subito,
      ritiro: d.ritiro, sostituzione: d.sostituzione, settimanale: d.settimanale,
      pagamento: d.pagamento, cliente: { ...cliente }, stato: "nuovo", pesato: false,
      storia: [{ stato: "nuovo", ora: new Date().toISOString() }],
    };
    o.puntiMaturati = puntiOrdine(o);
    o.utenteId = utenteId || agganciaCliente(o);
    if (d.puntiUsati) {
      setUtenti((v) => v.map((u) => (u.id === o.utenteId ? { ...u, punti: Math.max(0, (u.punti || 0) - d.puntiUsati) } : u)));
      setPuntiUsati(0);
    }
    setSeq(n);
    if (cc) setCoupons((v) => v.map((x) => (x.codice === cc.codice ? { ...x, usi: (x.usi || 0) + 1 } : x)));
    setCoupon("");
    setOrdini((v) => [o, ...v]);
    setCatalogo((c) => c.map((p) => {
      const r = righe.find((x) => x.p.id === p.id);
      return r ? { ...p, giacenza: Math.max(0, Math.round((p.giacenza - r.qta) * 10) / 10) } : p;
    }));
    setCarrello({});
    return o;
  }

  function creaSpedizione(d) {
    const n = seq + 1;
    const o = {
      id: `PK-${n}`, creato: new Date().toISOString(), tipo: "pacco", spedizione: true,
      righe: d.righe, parziale: d.parziale, consegna: d.costoSpedizione, sconto: 0, coupon: null,
      puntiUsati: 0, scontoPunti: 0, totale: d.totale, pagamento: d.pagamento,
      cliente: { ...cliente, nome: d.mittente.nome, tel: d.mittente.tel, email: d.mittente.email },
      destinatario: { ...d.destinatario }, messaggio: d.messaggio, zona: d.zona, tracking: "",
      giorno: dkey(new Date()), fascia: null, subito: false, ritiro: false,
      sostituzione: "simile", settimanale: false, stato: "nuovo", pesato: false,
      storia: [{ stato: "nuovo", ora: new Date().toISOString() }],
    };
    o.puntiMaturati = puntiOrdine(o);
    o.utenteId = utenteId || agganciaCliente(o);
    setSeq(n);
    setOrdini((v) => [o, ...v]);
    return o;
  }

  function statoOrdine(id, stato) {
    const o = ordini.find((x) => x.id === id);
    setOrdini((v) => v.map((x) => (x.id === id ? { ...x, stato, storia: [...(x.storia || []), { stato, ora: new Date().toISOString() }] } : x)));
    if (!o || !o.utenteId) return;
    if (stato === "consegnato" && o.stato !== "consegnato") {
      setUtenti((v) => v.map((u) => (u.id === o.utenteId
        ? { ...u, punti: (u.punti || 0) + (o.puntiMaturati || 0), speso: arr2((u.speso || 0) + o.totale), ordini: (u.ordini || 0) + 1, ultimo: new Date().toISOString() }
        : u)));
    }
    if (stato === "annullato" && o.puntiUsati) {
      setUtenti((v) => v.map((u) => (u.id === o.utenteId ? { ...u, punti: (u.punti || 0) + o.puntiUsati } : u)));
    }
  }

  function pesa(id, pesi) {
    setOrdini((v) => v.map((o) => {
      if (o.id !== id) return o;
      const righeN = o.righe.map((r) => {
        const q = pesi[r.id];
        if (q === undefined || q === null || q === "" || r.unita !== "kg") return r;
        const nq = Math.max(0, Number(String(q).replace(",", ".")) || 0);
        return { ...r, qta: nq, totale: Math.round(r.prezzo * nq * 100) / 100 };
      });
      const parz = arr2(righeN.reduce((s, r) => s + r.totale, 0));
      const t = calcola(parz, o.ritiro, o.coupon);
      return { ...o, righe: righeN, parziale: parz, consegna: t.consegna, sconto: t.sconto, totale: t.totale, pesato: true };
    }));
  }

  function salvaSolita(nome) {
    const r = righe.map((x) => ({ id: x.p.id, qta: x.qta, pref: x.pref }));
    if (!r.length) { dimmi("Il carrello è vuoto."); return; }
    setSolita({ nome: nome || "La mia solita spesa", righe: r, creata: new Date().toISOString() });
    dimmi("Salvata. La ritrovi in cima al banco.");
  }

  function caricaSolita(lista, vaiA) {
    const nuovo = {};
    let fuori = 0;
    (lista || []).forEach((r) => {
      const p = catalogo.find((x) => x.id === r.id);
      if (p && p.attivo && p.giacenza > 0) nuovo[r.id] = { qta: Math.min(r.qta, p.giacenza), pref: r.pref || MATURAZIONE[0] };
      else fuori += 1;
    });
    if (!Object.keys(nuovo).length) { dimmi("Oggi non abbiamo nessuno di quei prodotti."); return false; }
    setCarrello(nuovo);
    if (vaiA === "cassa") { setTab("carrello"); setStack([{ s: "cassa" }]); }
    else vaiTab("carrello");
    dimmi(fuori ? `Pronta. ${fuori} prodotto non c'è oggi.` : "Spesa pronta nel carrello.");
    return true;
  }

  function ripeti(o) {
    const nuovo = {};
    let fuori = 0;
    o.righe.forEach((r) => {
      const p = catalogo.find((x) => x.id === r.id);
      if (p && p.attivo && p.giacenza > 0) nuovo[r.id] = { qta: Math.min(r.qta, p.giacenza), pref: r.pref || MATURAZIONE[0] };
      else fuori++;
    });
    setCarrello(nuovo);
    vaiTab("carrello");
    dimmi(fuori ? `Rimesso nel carrello. ${fuori} prodotto non è al banco oggi.` : "Rimesso tutto nel carrello.");
  }

  /* --- modalità aggiornamento merce (freeze) --- */
  function apriFreeze() {
    const d = new Date(Date.now() + 45 * 60000);
    setBozza(catalogo.map((p) => ({ ...p })));
    setFreeze({ attivo: true, riapre: oraTxt(d), motivo: "Stiamo caricando la merce di oggi" });
    dimmi("Modalità aggiornamento attiva: i clienti non possono ordinare.");
  }
  function pubblicaBanco() {
    if (bozza) setCatalogo(bozza);
    setBozza(null);
    setFreeze({ attivo: false, riapre: "", motivo: "" });
    dimmi("Banco pubblicato: il negozio è di nuovo aperto agli ordini.");
  }
  function annullaBozza() {
    setBozza(null);
    setFreeze({ attivo: false, riapre: "", motivo: "" });
    dimmi("Modifiche annullate.");
  }

  const vale = {
    piatt, setPiatt, grande, setGrande, dimmi, avviso,
    catalogo, setCatalogo, bozza, setBozza, freeze, setFreeze, apriFreeze, pubblicaBanco, annullaBozza,
    carrello, aggiungi, togli, setPref, righe, parziale, pezzi, mancano, okMinimo,
    preferiti, toggleFav, ordini, setOrdini, creaOrdine, statoOrdine, pesa, ripeti,
    cliente, setCliente, fasce, bancoAperto, setBancoAperto, bloccate, setBloccate,
    giorniChiusi, setGiorniChiusi, giorni, coupons, setCoupons, coupon, setCoupon, couponAttivo, esitoCoupon,
    modo, setModo, tab, vaiTab, stack, push, pop, tabA, setTabA, stackA, setStackA, pushA, popA,
    sbloccato, setSbloccato, chat, setChat, bollaVista, setBollaVista,
    utenti, setUtenti, utente, utenteId, setUtenteId, registra, accedi, esci, salvaUtente, agganciaCliente,
    solita, setSolita, salvaSolita, caricaSolita, posts, setPosts, cuori, setCuori,
    punti, livello, buoniDisponibili, puntiUsati, setPuntiUsati,
    operatori, setOperatori, operatore, setOperatore, pacchi, setPacchi, setOrdini, setSeq, seq, creaSpedizione,
  };

  return (
    <Ctx.Provider value={vale}>
      <Telaio>{modo === "cliente" ? <AppCliente /> : <AppNegozio />}</Telaio>
    </Ctx.Provider>
  );
}

/* =============================== telaio device ============================ */
function Telaio({ children }) {
  const { piatt, setPiatt, grande, avviso } = useApp();
  const [ora, setOra] = useState(oraTxt(new Date()));
  useEffect(() => {
    const t = setInterval(() => setOra(oraTxt(new Date())), 20000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className={`sab ${piatt} ${grande ? "grande" : ""}`}>
      <style>{CSS}</style>
      <div className="tela">
        <div className="selettore">
          <button className={`sceltab ${piatt === "ios" ? "on" : ""}`} onClick={() => setPiatt("ios")}>iPhone</button>
          <button className={`sceltab ${piatt === "android" ? "on" : ""}`} onClick={() => setPiatt("android")}>Android</button>
        </div>

        <div className="telefono">
          <div className="stato">
            <span>{ora}</span>
            <span className="tacca" />
            <span className="segnali">
              <svg width="17" height="11" viewBox="0 0 17 11" aria-hidden="true"><rect x="0" y="7" width="3" height="4" rx="1" fill="currentColor" /><rect x="4.5" y="5" width="3" height="6" rx="1" fill="currentColor" /><rect x="9" y="2.5" width="3" height="8.5" rx="1" fill="currentColor" /><rect x="13.5" y="0" width="3" height="11" rx="1" fill="currentColor" /></svg>
              <svg width="25" height="12" viewBox="0 0 25 12" aria-hidden="true"><rect x="0.6" y="0.6" width="20" height="10.8" rx="3" stroke="currentColor" fill="none" opacity=".5" /><rect x="2.2" y="2.2" width="15" height="7.6" rx="1.8" fill="currentColor" /><path d="M22.4 4v4c1-.4 1.6-1 1.6-2s-.6-1.6-1.6-2z" fill="currentColor" opacity=".5" /></svg>
            </span>
          </div>
          <div className="vetro">{children}</div>
        </div>
      </div>
      {avviso && <div className="avviso" role="status">{avviso}</div>}
    </div>
  );
}

/* ============================== pezzi riusabili =========================== */
function Testata({ titolo, sotto, indietro, destra, verde = true }) {
  const { piatt } = useApp();
  return (
    <header className={`testata ${verde ? "" : "chiara"}`}>
      <div className="testariga">
        {indietro && (
          <button className="tondino" onClick={indietro} aria-label="Indietro">
            {piatt === "ios" ? <I.chevron s={24} /> : <I.freccia s={22} />}
          </button>
        )}
        <div className={`testatitolo ${indietro ? "conindietro" : ""}`}>
          <b>{titolo}</b>
          {sotto && <span>{sotto}</span>}
        </div>
        {destra}
      </div>
    </header>
  );
}

function Scroll({ children, pad = true, onScroll }) {
  return <div className={`scroll ${pad ? "pad" : ""}`} onScroll={onScroll}>{children}</div>;
}

function Foglio({ aperto, chiudi, titolo, children }) {
  if (!aperto) return null;
  return (
    <div className="velo" onClick={chiudi}>
      <div className="foglio" onClick={(e) => e.stopPropagation()}>
        <div className="maniglia" />
        <div className="foglitesta">
          <b>{titolo}</b>
          <button className="tondino scuro" onClick={chiudi} aria-label="Chiudi"><I.x s={20} /></button>
        </div>
        <div className="foglicorpo">{children}</div>
      </div>
    </div>
  );
}

function Campo({ etichetta, aiuto, errore, children }) {
  return (
    <label className={`campo ${errore ? "male" : ""}`}>
      <span className="etichetta">{etichetta}</span>
      {children}
      {aiuto && !errore && <small>{aiuto}</small>}
      {errore && <small className="rosso">{errore}</small>}
    </label>
  );
}

function Interruttore({ on, onChange, etichetta }) {
  return (
    <button className={`switch ${on ? "on" : ""}`} onClick={() => onChange(!on)} role="switch" aria-checked={on} aria-label={etichetta}>
      <i />
    </button>
  );
}

function Cartellino({ p, vecchio = true }) {
  const off = inOfferta(p);
  return (
    <span className="prezzoblocco">
      <span className={`cartellino ${off ? "off" : ""}`}>
        {eur(prezzoDi(p))}<small>/{un(p.unita).br}</small>
      </span>
      {off && vecchio && <s className="listino">{eur(p.prezzo)}</s>}
    </span>
  );
}

function Pomodorino({ liv, size = 22 }) {
  const l = liv || LIVELLI[0];
  return (
    <span className="pomodorino" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={size} height={size}>
        <circle cx="12" cy="14.5" r="8.2" fill={l.v} />
        <path d="M7.6 10.6c.9-1.4 2.2-2.4 3.7-2.9" stroke="#FFFFFF" strokeOpacity=".45" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        <path d="M12 6.6V4.2" stroke={l.v2} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M12 7.2c-2.6-1.8-5-1.4-5-1.4s.8 2.6 4 3.1zM12 7.2c2.6-1.8 5-1.4 5-1.4s-.8 2.6-4 3.1z" fill="#3E8A43" />
      </svg>
    </span>
  );
}

function Logo({ mis = "m", scuro = false, soloEmblema = false }) {
  return (
    <div className={`logo ${mis} ${scuro ? "scuro" : ""}`}>
      <span className="emblema">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M44.5 15.5c4.6-6.2 11.4-8.8 17.5-8.6-1 6.4-5.6 12-12.2 14.2-2.4.8-4.4.4-5.3-1.4-.9-1.6-.7-3 0-4.2z" fill="#1E8A3C" />
          <path d="M43.2 18.4c-1.4-6.6.6-12.4 4.4-16.4 3 4.6 3.6 11 1.2 16.6-.9 2.1-2.4 3-3.8 2.6-1.2-.3-1.7-1.4-1.8-2.8z" fill="#146B2E" />
          <path d="M44.6 20.6c-4.8-1.2-9.6-.4-13.4 2 2.8 3.4 7.8 4.8 12.4 3.4 1.8-.6 2.6-1.8 2.3-3-.2-1-.7-1.6-1.3-2.4z" fill="#1E8A3C" />
          <circle cx="29" cy="37" r="24" fill="#E3231E" />
          <ellipse cx="29" cy="21.6" rx="4.1" ry="5" fill="#FFFFFF" />
          <path d="M13.4 22.2c5.6 3.6 9.6 8.6 12 15 2.2 6 2.4 12.2.6 18.6-2.6-.5-5-1.4-7.2-2.8 1.8-5.4 1.8-10.6.2-15.6-1.7-5.2-4.9-9.6-9.4-13.2 1.1-.7 2.3-1.4 3.8-2z" fill="#FFFFFF" />
          <path d="M44.6 22.2c-5.6 3.6-9.6 8.6-12 15-2.2 6-2.4 12.2-.6 18.6 2.6-.5 5-1.4 7.2-2.8-1.8-5.4-1.8-10.6-.2-15.6 1.7-5.2 4.9-9.6 9.4-13.2-1.1-.7-2.3-1.4-3.8-2z" fill="#FFFFFF" />
        </svg>
      </span>
      {!soloEmblema && (
        <span className="parola">
          <b>SABETTA</b>
          <i>ortofrutta</i>
        </span>
      )}
    </div>
  );
}

function Stepper({ p, qta, aggiungi, pieno }) {
  const st = passo(p);
  if (!qta) {
    return <button className={`btn verde ${pieno ? "largo" : "mini"}`} onClick={() => aggiungi(p, st)}>Aggiungi</button>;
  }
  return (
    <div className={`stepper ${pieno ? "largo" : ""}`}>
      <button onClick={() => aggiungi(p, -st)} aria-label="Togli"><I.meno s={20} /></button>
      <span>{qtaTxt(p.unita, qta)}</span>
      <button onClick={() => aggiungi(p, st)} disabled={qta >= p.giacenza} aria-label="Aggiungi"><I.piu s={20} /></button>
    </div>
  );
}

function Etichetta({ stato }) {
  const s = STATI.find((x) => x.id === stato);
  return <span className={`pillola st-${stato}`}>{stato === "annullato" ? "Annullato" : s ? s.t : stato}</span>;
}

/* ================================ CLIENTE ================================= */
function AppCliente() {
  const { tab, vaiTab, stack, pezzi, ordini } = useApp();
  const cima = stack[stack.length - 1];
  const inCorso = ordini.filter((o) => o.stato === "nuovo" || o.stato === "preparazione" || o.stato === "consegna").length;
  const nascondiTab = cima && (cima.s === "cassa" || cima.s === "esito" || cima.s === "pacco" || cima.s === "accesso");

  return (
    <div className="app">
      <div className="pagine">
        {!cima && tab === "home" && <Home key="home" />}
        {!cima && tab === "carrello" && <SchermoCarrello key="carrello" />}
        {!cima && tab === "pacco" && <SchermoMarket key="pacco" />}

        {!cima && tab === "ordini" && <SchermoOrdini key="ordini" />}
        {!cima && tab === "betta" && <SchermoBetta key="betta" />}
        {!cima && tab === "profilo" && <SchermoProfilo key="profilo" />}
        {cima && <div className="spinta" key={stack.length}>{renderSpinta(cima)}</div>}
      </div>

      {!nascondiTab && (
        <nav className="tabbar">
          <Tab id="home" t="Banco" icona={I.banco} attivo={tab} vai={vaiTab} />
          <Tab id="pacco" t="Pacco" icona={I.scatola} attivo={tab} vai={vaiTab} />
          <Tab id="carrello" t="Carrello" icona={I.carrello} attivo={tab} vai={vaiTab} badge={pezzi} />
          <Tab id="ordini" t="Ordini" icona={I.ordini} attivo={tab} vai={vaiTab} badge={inCorso} />
          <Tab id="profilo" t="Profilo" icona={I.utente} attivo={tab} vai={vaiTab} />
        </nav>
      )}
    </div>
  );
}

function renderSpinta(c) {
  switch (c.s) {
    case "prodotto": return <SchermoProdotto id={c.p} />;
    case "broccolo": return (<svg {...c}><path d="M32 54V34" stroke="#7A9E52" strokeWidth="5" strokeLinecap="round" /><circle cx="24" cy="26" r="8" fill="#4E8B3F" /><circle cx="40" cy="26" r="8" fill="#4E8B3F" /><circle cx="32" cy="20" r="9" fill="#5EA245" /><circle cx="32" cy="30" r="9" fill="#5EA245" /></svg>);
    case "cavolfiore": return (<svg {...c}><path d="M32 54V36" stroke="#7A9E52" strokeWidth="5" strokeLinecap="round" /><path d="M14 34c0-4 3-6 5-7 0-6 5-9 9-8 3-4 8-4 11 0 5-1 9 3 9 8 3 2 5 4 5 7 0 5-6 8-16 8s-16-3-16-8z" fill="#F2EFE0" /><path d="M18 33c2-2 6-3 14-3s12 1 14 3" stroke="#D9D4BF" strokeWidth="1.6" fill="none" /></svg>);
    case "finocchio": return (<svg {...c}><path d="M32 22c-8 0-13 5-13 12 0 8 5 14 13 14s13-6 13-14c0-7-5-12-13-12z" fill="#EFF2E4" /><path d="M32 22v26M25 25c-2 6-2 14 0 20M39 25c2 6 2 14 0 20" stroke="#CFD8BC" strokeWidth="1.6" fill="none" /><path d="M26 22c-2-6-4-9-4-9M32 22V10M38 22c2-6 4-9 4-9" stroke="#5EA245" strokeWidth="2.6" strokeLinecap="round" /></svg>);
    case "sedano": return (<svg {...c}><path d="M22 20c0 14 2 24 4 34h6c-2-10-4-20-4-34z" fill="#9BC46A" /><path d="M32 18c0 14 0 24 0 36h6c0-12 0-22 2-36z" fill="#86B356" /><path d="M22 20c-3-6-3-10-3-10s5 2 8 7M40 18c3-6 3-10 3-10s-5 2-8 7" fill="#4E8B3F" /></svg>);
    case "cetriolo": return (<svg {...c}><rect x="10" y="28" width="44" height="18" rx="9" fill="#4E8B3F" transform="rotate(-18 32 37)" /><path d="M20 40c-1-5 0-9 2-12" stroke="#7FC96A" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity=".7" /><circle cx="28" cy="34" r="1.4" fill="#2F6B34" /><circle cx="36" cy="39" r="1.4" fill="#2F6B34" /></svg>);
    case "zucca": return (<svg {...c}><ellipse cx="32" cy="38" rx="20" ry="16" fill="#E0761F" /><ellipse cx="24" cy="38" rx="8" ry="16" fill="#EC8B36" opacity=".8" /><ellipse cx="40" cy="38" rx="8" ry="16" fill="#EC8B36" opacity=".8" /><path d="M32 22v-6" stroke="#5E7A2A" strokeWidth="4" strokeLinecap="round" /><path d="M33 17c4-3 8-2 8-2s-2 5-6 5" fill="#5EA245" /></svg>);
    case "funghi": return (<svg {...c}><path d="M14 32c0-9 8-15 18-15s18 6 18 15c0 3-8 4-18 4s-18-1-18-4z" fill="#9B6B45" /><path d="M27 36h10v12a5 5 0 0 1-10 0z" fill="#F0E4D2" /><circle cx="24" cy="26" r="2.6" fill="#C89A72" /><circle cx="39" cy="24" r="2.2" fill="#C89A72" /></svg>);
    case "spinaci": return (<svg {...c}><path d="M32 52c-12-2-20-10-20-20 8-4 16-2 20 4 4-6 12-8 20-4 0 10-8 18-20 20z" fill="#3E8A43" /><path d="M32 52V32" stroke="#2C6B32" strokeWidth="2" strokeLinecap="round" /><path d="M32 40l-8-5M32 44l8-5" stroke="#2C6B32" strokeWidth="1.6" strokeLinecap="round" /></svg>);
    case "peperoncino": return (<svg {...c}><path d="M40 20c6 6 6 18-2 26-6 6-14 8-20 6 6-2 12-6 16-12 4-6 5-14 6-20z" fill="#C6231F" /><path d="M40 20c0-6 2-8 2-8s3 3 2 8c-1 3-3 3-4 0z" fill="#3E8A43" /></svg>);
    case "fagiolini": return (<svg {...c}><path d="M14 44c8-16 20-24 34-26" stroke="#5EA245" strokeWidth="6" strokeLinecap="round" fill="none" /><path d="M16 50c8-16 20-24 34-26" stroke="#7FC96A" strokeWidth="6" strokeLinecap="round" fill="none" /><circle cx="26" cy="38" r="1.6" fill="#3E8A43" /><circle cx="34" cy="32" r="1.6" fill="#3E8A43" /></svg>);
    case "pesca": return (<svg {...c}><circle cx="32" cy="36" r="18" fill="#F09055" /><path d="M32 18v36" stroke="#D9713A" strokeWidth="1.6" opacity=".6" /><circle cx="25" cy="30" r="5" fill="#F7B48A" opacity=".7" /><path d="M33 18c3-5 9-5 9-5s-2 6-7 6z" fill="#5EA245" /></svg>);
    case "ciliegie": return (<svg {...c}><path d="M32 14c-6 6-12 10-14 18M32 14c4 7 8 11 12 16" stroke="#5E7A2A" strokeWidth="2.4" fill="none" strokeLinecap="round" /><circle cx="18" cy="40" r="9" fill="#C0203A" /><circle cx="44" cy="38" r="9" fill="#D62C46" /><path d="M32 14c4-4 9-4 9-4s-2 5-6 5" fill="#5EA245" /></svg>);
    case "anguria": return (<svg {...c}><path d="M10 26h44c0 15-10 26-22 26S10 41 10 26z" fill="#C6231F" /><path d="M10 26h44" stroke="#F2EFE0" strokeWidth="4" /><path d="M8 26h48" stroke="#3E8A43" strokeWidth="3" /><circle cx="26" cy="36" r="1.8" fill="#2A2119" /><circle cx="36" cy="40" r="1.8" fill="#2A2119" /><circle cx="32" cy="31" r="1.8" fill="#2A2119" /></svg>);
    case "melone": return (<svg {...c}><circle cx="32" cy="36" r="19" fill="#D8C87A" /><path d="M16 28c8 3 24 3 32 0M15 36c8 3 26 3 34 0M17 44c8 2 22 2 30 0" stroke="#BFAE60" strokeWidth="1.6" fill="none" /><path d="M32 17v-4" stroke="#7A8B49" strokeWidth="3" strokeLinecap="round" /></svg>);
    case "kiwi": return (<svg {...c}><circle cx="32" cy="36" r="19" fill="#8A6B3A" /><circle cx="32" cy="36" r="15" fill="#9BC46A" /><circle cx="32" cy="36" r="5" fill="#F2EFE0" /><g fill="#2A2119"><circle cx="32" cy="26" r="1.1" /><circle cx="40" cy="31" r="1.1" /><circle cx="38" cy="42" r="1.1" /><circle cx="26" cy="42" r="1.1" /><circle cx="24" cy="31" r="1.1" /></g></svg>);
    case "ananas": return (<svg {...c}><path d="M32 22c-8 0-13 6-13 15s5 17 13 17 13-8 13-17-5-15-13-15z" fill="#E0A82A" /><path d="M22 30l20 10M42 30L22 40M24 24l16 22M40 24L24 46" stroke="#B9851A" strokeWidth="1.4" /><path d="M32 22V8M32 14l-7-5M32 14l7-5M32 18l-9-2M32 18l9-2" stroke="#3E8A43" strokeWidth="3" strokeLinecap="round" /></svg>);
    case "mandarino": return (<svg {...c}><ellipse cx="32" cy="38" rx="18" ry="15" fill="#EE8021" /><path d="M32 23v-3" stroke="#6B5A2A" strokeWidth="3" strokeLinecap="round" /><path d="M33 21c4-4 9-3 9-3s-2 6-7 6z" fill="#3E8A43" /><ellipse cx="25" cy="33" rx="5" ry="4" fill="#F6AC66" opacity=".6" /></svg>);
    case "fico": return (<svg {...c}><path d="M32 20c9 0 16 8 16 17 0 9-7 15-16 15s-16-6-16-15c0-9 7-17 16-17z" fill="#6A4A7A" /><path d="M32 20c0-4-3-7-3-7s6-1 8 3" fill="#5EA245" /><path d="M24 38c3-3 8-4 12-2" stroke="#8E6B9E" strokeWidth="2" strokeLinecap="round" fill="none" /></svg>);
    case "miele": return (<svg {...c}><path d="M22 24h20v24a6 6 0 0 1-6 6h-8a6 6 0 0 1-6-6z" fill="#E0A82A" /><rect x="20" y="17" width="24" height="8" rx="3" fill="#8A6B3A" /><rect x="24" y="33" width="16" height="12" rx="2" fill="#F5EFE0" /><path d="M28 39h8" stroke="#B9851A" strokeWidth="2" strokeLinecap="round" /></svg>);
    case "marmellata": return (<svg {...c}><path d="M22 26h20v22a6 6 0 0 1-6 6h-8a6 6 0 0 1-6-6z" fill="#A8243F" /><path d="M20 20h24l-2 6H22z" fill="#D8CDB4" /><rect x="25" y="34" width="14" height="11" rx="2" fill="#F5EFE0" /><circle cx="32" cy="39" r="3" fill="#A8243F" /></svg>);
    case "pasta": return (<svg {...c}><path d="M18 52c0-20 4-34 6-40h4c-2 8-5 20-5 40zM27 52c0-20 3-34 5-40h4c-2 8-4 20-4 40zM36 52c0-20 3-34 5-40h4c-2 8-4 20-4 40z" fill="#E4C878" /><rect x="14" y="48" width="36" height="8" rx="3" fill="#9B6B45" /></svg>);
    case "vino": return (<svg {...c}><path d="M27 10h10v14c0 3 5 6 5 12v20a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4V36c0-6 5-9 5-12z" fill="#5C2233" /><rect x="26" y="7" width="12" height="5" rx="2" fill="#3A1420" /><rect x="23" y="38" width="18" height="13" rx="2" fill="#F0E4D2" /><path d="M27 44h10" stroke="#5C2233" strokeWidth="2" strokeLinecap="round" /></svg>);
    case "legumi": return (<svg {...c}><path d="M16 34h32l-3 20H19z" fill="#D8CDB4" /><circle cx="24" cy="28" r="5" fill="#B98A45" /><circle cx="34" cy="26" r="5" fill="#8A6B3A" /><circle cx="42" cy="30" r="4.5" fill="#C4A05C" /><circle cx="29" cy="32" r="4" fill="#A8824A" /></svg>);
    case "sottolio": return (<svg {...c}><path d="M21 24h22v24a6 6 0 0 1-6 6h-10a6 6 0 0 1-6-6z" fill="#8FA83E" /><rect x="19" y="16" width="26" height="9" rx="3" fill="#6E8430" /><circle cx="28" cy="36" r="3.4" fill="#C6351E" /><circle cx="36" cy="42" r="3.4" fill="#C6351E" /><circle cx="35" cy="33" r="3" fill="#E0761F" /></svg>);
    case "cassa": return <SchermoCassa />;
    case "esito": return <SchermoEsito id={c.p} />;
    case "ordine": return <SchermoOrdine id={c.p} />;
    case "aiuto": return <SchermoAiuto />;
    case "indirizzo": return <SchermoIndirizzo />;
    case "pin": return <SchermoPin />;
    case "accesso": return <SchermoAccesso />;
    case "piazza": return <SchermoCommunity />;
    case "pacco": return <SchermoPacco id={c.p} />;
    case "punti": return <SchermoPunti />;
    default: return null;
  }
}

function Tab({ id, t, icona: Icona, attivo, vai, badge }) {
  const on = attivo === id;
  return (
    <button className={`tab ${on ? "on" : ""}`} onClick={() => vai(id)} aria-current={on ? "page" : undefined}>
      <span className="tabico">
        <Icona s={23} w={on ? 2.3 : 1.8} />
        {badge > 0 && <i className="badge">{badge}</i>}
      </span>
      <span className="tabtxt">{t}</span>
    </button>
  );
}

/* --------------------------------- HOME ---------------------------------- */
function Home() {
  const { catalogo, carrello, aggiungi, preferiti, toggleFav, push, vaiTab, freeze, cliente, ordini, pezzi, parziale, okMinimo, mancano, ripeti, bancoAperto, bollaVista, setBollaVista, chat, solita, caricaSolita, pacchi, posts } = useApp();
  const [rep, setRep] = useState("tutto");
  const [q, setQ] = useState("");
  const [bolla, setBolla] = useState(false);
  const [scorre, setScorre] = useState(false);
  const tScorre = useRef(null);
  const chiudiBolla = () => { setBolla(false); setBollaVista(true); };

  function scorrendo() {
    setScorre(true);
    clearTimeout(tScorre.current);
    tScorre.current = setTimeout(() => setScorre(false), 700);
  }
  useEffect(() => () => clearTimeout(tScorre.current), []);

  useEffect(() => {
    if (bollaVista || chat.length > 0) return;
    const t1 = setTimeout(() => setBolla(true), 2400);
    const t2 = setTimeout(() => { setBolla(false); setBollaVista(true); }, 11000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [bollaVista, chat.length, setBollaVista]);

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return catalogo.filter((p) => {
      if (!p.attivo) return false;
      if (rep === "preferiti") return preferiti.includes(p.id);
      if (rep !== "tutto" && p.cat !== rep) return false;
      if (!t) return true;
      return p.nome.toLowerCase().includes(t) || p.origine.toLowerCase().includes(t);
    });
  }, [catalogo, rep, q, preferiti]);

  const offerte = catalogo.filter((p) => p.attivo && inOfferta(p) && p.delGiorno !== false && p.giacenza > 0);
  const fuoriZona = indirizzoFuoriZona(cliente);
  const attivo = ordini.find((o) => o.stato === "nuovo" || o.stato === "preparazione" || o.stato === "consegna");
  const ultimo = ordini.find((o) => o.stato !== "annullato");
  const reparti = [...REPARTI, { id: "preferiti", nome: "Preferiti" }];

  return (
    <div className="schermo">
      <header className="testata home chiara">
        <Logo />
        <a className="commercianti" href={TEL_URL}>
          <span>Forniture e richieste su misura</span>
          <b><I.tel s={15} w={2.2} /> Chiamaci!</b>
        </a>
      </header>

      <button className="consegnaa" onClick={() => push("indirizzo")}>
        <I.scatola s={20} />
        <span>
          <small>Consegniamo a</small>
          <b>{cliente.via ? `${cliente.via} ${cliente.civico}${cliente.cap ? `, ${cliente.cap}` : ""}` : "Imposta il tuo indirizzo"}</b>
        </span>
        <I.avanti s={18} />
      </button>

      <Scroll onScroll={scorrendo}>
        {fuoriZona && (
          <div className="banda rossa">
            <I.scatola s={24} />
            <div>
              <b>Fuori zona di consegna</b>
              <span>Per ora portiamo la spesa a casa solo a {CITTA_ZONA} ({CAP_ZONA}). Puoi comunque ordinare e ritirare in negozio.</span>
              <button className="link" onClick={() => push("indirizzo")}>Cambia indirizzo</button>
            </div>
          </div>
        )}
        {freeze.attivo && (
          <div className="banda gelo">
            <I.neve s={24} />
            <div>
              <b>Banco in aggiornamento</b>
              <span>{freeze.motivo}. {freeze.riapre ? `Riapriamo alle ${freeze.riapre}.` : ""} Puoi guardare e preparare la spesa, gli ordini riaprono a breve.</span>
            </div>
          </div>
        )}
        {!freeze.attivo && !bancoAperto && (
          <div className="banda gialla">
            <I.orologio s={24} />
            <div><b>Oggi il banco è chiuso</b><span>Puoi comunque prenotare la consegna per i prossimi giorni.</span></div>
          </div>
        )}

        {attivo && (
          <button className="cardordine" onClick={() => push("ordine", attivo.id)}>
            <div className="riga">
              <b>Ordine {attivo.id}</b>
              <Etichetta stato={attivo.stato} />
            </div>
            <div className="tracciato">
              {STATI.map((s, i) => {
                const idx = STATI.findIndex((x) => x.id === attivo.stato);
                return <i key={s.id} className={i <= idx ? "on" : ""} />;
              })}
            </div>
            <span className="fine">{(STATI.find((s) => s.id === attivo.stato) || {}).c} Tocca per seguirlo.</span>
          </button>
        )}

        {(solita || ultimo) && (
          <div className="solita">
            <div className="solitatesta">
              <span className="solitaico"><I.carrello s={22} /></span>
              <div>
                <b>{solita ? solita.nome : "Ripeti l'ultima spesa"}</b>
                <small>
                  {solita
                    ? `${solita.righe.length} prodotti che prendi sempre`
                    : `Ordine ${ultimo.id} · ${ultimo.righe.length} prodotti · ${eur(ultimo.totale)}`}
                </small>
              </div>
            </div>
            <div className="solitaazioni">
              <button className="btn verde mini" onClick={() => caricaSolita(solita ? solita.righe : ultimo.righe, "cassa")}>Ordina subito</button>
              <button className="btn chiaro mini" onClick={() => caricaSolita(solita ? solita.righe : ultimo.righe)}>Nel carrello</button>
            </div>
          </div>
        )}

        {posts.length > 0 && (
          <section className="piazzastriscia">
            <div className="sezriga">
              <h2>La piazza</h2>
              <button className="link" onClick={() => push("piazza")}>Tutte le novità</button>
            </div>
            <div className="scorri">
              {posts.slice().sort((a, b) => (b.fissato ? 1 : 0) - (a.fissato ? 1 : 0) || new Date(b.creato) - new Date(a.creato)).slice(0, 5).map((po) => {
                const tp = TIPI_POST.find((x) => x.id === po.tipo) || TIPI_POST[0];
                return (
                  <button key={po.id} className="novita" onClick={() => push("piazza")}>
                    <span className="novitacover">
                      {(() => {
                        const m = (po.media || []).find((x) => x.poster || x.src);
                        if (m) return <img src={m.poster || m.src} alt="" onError={(e) => { e.target.style.display = "none"; }} />;
                        if (po.link && !/youtu|vimeo|\.mp4|tiktok|instagram/i.test(po.link)) return <img src={po.link} alt="" onError={(e) => { e.target.style.display = "none"; }} />;
                        return <Art k={po.art} size={46} />;
                      })()}
                    </span>
                    <span className="posttipo piccolo" style={{ background: tp.c }}>{tp.t}</span>
                    <b>{po.titolo}</b>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <div className="cerca">
          <I.cerca s={20} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca: pomodori, mele, basilico…" aria-label="Cerca un prodotto" />
          {q && <button className="tondino piccolo" onClick={() => setQ("")} aria-label="Cancella"><I.x s={16} /></button>}
        </div>

        <div className="fila">
          {reparti.map((r) => (
            <button key={r.id} className={`chip ${rep === r.id ? "on" : ""}`} onClick={() => setRep(r.id)}>{r.nome}</button>
          ))}
        </div>

        {ultimo && rep === "tutto" && !q && (
          <section className="sezione">
            <div className="sezriga">
              <h2>Ricompra veloce</h2>
              <button className="link" onClick={() => ripeti(ultimo)}>Tutto l'ordine</button>
            </div>
            <div className="scorri">
              {ultimo.righe.slice(0, 6).map((r) => {
                const p = catalogo.find((x) => x.id === r.id);
                if (!p || !p.attivo) return null;
                return (
                  <button key={r.id} className="veloce" onClick={() => aggiungi(p, passo(p))}>
                    <Art k={p.art} size={34} />
                    <span>{p.nome.split(" ")[0]}</span>
                    <i><I.piu s={16} /></i>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {offerte.length > 0 && rep === "tutto" && !q && (
          <section className="sezione">
            <div className="sezriga"><h2>Prezzo del giorno</h2></div>
            <div className="scorri">
              {offerte.map((p) => (
                <button key={p.id} className="offerta" onClick={() => push("prodotto", p.id)}>
                  <span className="sconto">−{p.sconto}%</span>
                  <Art k={p.art} size={62} />
                  <b>{p.nome}</b>
                  <Cartellino p={p} />
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="sezione">
          <div className="sezriga">
            <h2>{rep === "preferiti" ? "I tuoi preferiti" : q ? "Risultati" : "Il banco di oggi"}</h2>
            <span className="conta">{lista.length} prodotti</span>
          </div>

          {lista.length === 0 ? (
            <div className="vuoto">
              <Art k="misto" size={72} />
              <b>{rep === "preferiti" ? "Nessun preferito" : "Nessun prodotto trovato"}</b>
              <span>{rep === "preferiti" ? "Tocca la stellina su un prodotto per ritrovarlo qui." : "Prova con una parola più corta, per esempio «pomo»."}</span>
              <button className="btn chiaro" onClick={() => { setRep("tutto"); setQ(""); }}>Vedi tutto il banco</button>
            </div>
          ) : (
            <div className="griglia">
              {lista.map((p) => (
                <div key={p.id} className={`prod ${carrello[p.id] ? "dentro" : ""}`}>
                  <button className="prodtocca" onClick={() => push("prodotto", p.id)} aria-label={`Apri ${p.nome}`}>
                    <div className="prodfig">
                      <Art k={p.art} size={74} />
                      {inOfferta(p) && <span className="bollino">−{p.sconto}%</span>}
                      {p.giacenza <= 3 && p.giacenza > 0 && <span className="pochi">Ultimi {num(p.giacenza)}</span>}
                    </div>
                    <b>{p.nome}</b>
                    <span className="orig">{p.origine}</span>
                    <Cartellino p={p} />
                  </button>
                  <button className={`stellina ${preferiti.includes(p.id) ? "on" : ""}`} onClick={() => toggleFav(p.id)} aria-label="Preferito">
                    <I.stella s={18} on={preferiti.includes(p.id)} />
                  </button>
                  <div className="prodazione">
                    {p.giacenza <= 0
                      ? <span className="finito">Finito per oggi</span>
                      : <Stepper p={p} qta={carrello[p.id] ? carrello[p.id].qta : 0} aggiungi={aggiungi} pieno />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="sezione">
          <div className="sezriga">
            <h2>Pacco da giù</h2>
            <button className="link" onClick={() => vaiTab("pacco")}>Vedi tutti</button>
          </div>
          <p className="guida">Spediamo i sapori di casa in tutta Italia, a chi sta lontano.</p>
          <div className="scorri">
            {pacchi.filter((k) => k.attivo).map((k) => (
              <button key={k.id} className="offerta" onClick={() => push("pacco", k.id)}>
                <Art k={k.art} size={62} />
                <b>{k.nome}</b>
                <span className="cartellino">{eur(k.prezzo)}<small>/{k.peso}</small></span>
              </button>
            ))}
          </div>
        </section>
      </Scroll>

      <div className={`bettadock ${scorre && !bolla ? "via" : ""} ${bolla ? "dentro" : ""} ${pezzi > 0 ? "alto" : ""}`}>
        {bolla && (
          <div className="fumetto" role="status">
            <button className="fumettotesto" onClick={() => { chiudiBolla(); vaiTab("betta"); }}>
              Hai bisogno? Chiedi a Betta!
            </button>
            <button className="fumettox" onClick={chiudiBolla} aria-label="Chiudi il messaggio"><I.x s={13} /></button>
          </div>
        )}
        <button className="bettatocca" onClick={() => { chiudiBolla(); vaiTab("betta"); }} aria-label="Chiedi a Betta">
          <Betta size={92} />
        </button>
      </div>

      {pezzi > 0 && (
        <div className="barrafondo" onClick={() => vaiTab("carrello")} role="button">
          <div>
            <b>{pezzi} {pezzi === 1 ? "prodotto" : "prodotti"}</b>
            <small>{okMinimo ? "Ordine minimo raggiunto" : `Mancano ${eur(mancano)} al minimo`}</small>
          </div>
          <span className="btn giallo mini">Carrello · {eur(parziale)}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- PRODOTTO -------------------------------- */
function SchermoProdotto({ id }) {
  const { catalogo, carrello, aggiungi, pop, preferiti, toggleFav, setPref, vaiTab, setChat, freeze } = useApp();
  const p = catalogo.find((x) => x.id === id);
  if (!p) return <div className="schermo"><Testata titolo="Prodotto" indietro={pop} /><Scroll><p>Prodotto non disponibile.</p></Scroll></div>;
  const riga = carrello[p.id];

  function chiediBetta() {
    setChat((c) => [...c, { chi: "io", t: `Com'è oggi ${p.nome}?` }]);
    vaiTab("betta");
  }

  return (
    <div className="schermo">
      <Testata titolo={p.nome} indietro={pop} destra={
        <button className={`tondino ${preferiti.includes(p.id) ? "giallo" : ""}`} onClick={() => toggleFav(p.id)} aria-label="Preferito">
          <I.stella s={20} on={preferiti.includes(p.id)} />
        </button>} />
      <Scroll>
        <div className="prodgrande">
          <Art k={p.art} size={150} />
        </div>
        <h1 className="titolone">{p.nome}</h1>
        <p className="sottotitolo">{p.origine}</p>
        <div className="rigaprezzo">
          <Cartellino p={p} />
          {inOfferta(p) && <span className="bollino grande">Offerta −{p.sconto}%</span>}
          <span className={`giacenza ${p.giacenza <= 3 ? "bassa" : ""}`}>
            {p.giacenza > 0 ? `Disponibili ${qtaTxt(p.unita, p.giacenza)}` : "Finito per oggi"}
          </span>
        </div>
        {p.nota && <div className="cartella">{p.nota}</div>}

        {p.maturazione && riga && (
          <div className="blocco">
            <h3>Come la vuoi?</h3>
            <div className="scelte">
              {MATURAZIONE.map((m) => (
                <button key={m} className={`scelta ${riga.pref === m ? "on" : ""}`} onClick={() => setPref(p.id, m)}>
                  <span className="radio">{riga.pref === m && <I.ok s={13} w={3} />}</span>{m}
                </button>
              ))}
            </div>
          </div>
        )}

        <button className="bettabanner piatto" onClick={chiediBetta}>
          <Betta size={38} fluttua={false} />
          <span><b>Chiedi a Betta</b><small>Com'è la qualità oggi? Quanto ne serve per due persone?</small></span>
          <I.avanti s={18} />
        </button>
      </Scroll>

      <div className="fondoazione">
        {freeze.attivo && <p className="notagelo">Il banco è in aggiornamento: puoi preparare il carrello, l'ordine si invia a riapertura.</p>}
        {p.giacenza <= 0
          ? <button className="btn grigio largo" disabled>Finito per oggi</button>
          : <Stepper p={p} qta={riga ? riga.qta : 0} aggiungi={aggiungi} pieno />}
        {riga && <button className="btn verde largo" onClick={() => vaiTab("carrello")}>Vai al carrello · {eur(prezzoDi(p) * riga.qta)}</button>}
      </div>
    </div>
  );
}

/* ------------------------------- CARRELLO -------------------------------- */
function SchermoCarrello() {
  const { righe, parziale, aggiungi, togli, setPref, okMinimo, mancano, push, vaiTab, freeze, couponAttivo, salvaSolita } = useApp();
  const { consegna, sconto, totale } = calcola(parziale, false, couponAttivo);

  if (righe.length === 0) {
    return (
      <div className="schermo">
        <Testata titolo="Carrello" />
        <Scroll>
          <div className="vuoto alto">
            <Art k="misto" size={96} />
            <b>La cassetta è vuota</b>
            <span>Aggiungi frutta e verdura dal banco. Bastano {eur(MIN_ORDINE)} per ordinare.</span>
            <button className="btn verde" onClick={() => vaiTab("home")}>Vai al banco</button>
          </div>
        </Scroll>
      </div>
    );
  }

  return (
    <div className="schermo">
      <Testata titolo="Carrello" sotto={`${righe.length} prodotti`} />
      <Scroll>
        {righe.map((r) => (
          <div className="rigacarrello" key={r.p.id}>
            <div className="minifig"><Art k={r.p.art} size={44} /></div>
            <div className="rigacorpo">
              <b>{r.p.nome}</b>
              <span className="orig">
                {eur(r.unitario)} al {un(r.p.unita).et}
                {inOfferta(r.p) && <s className="listino"> {eur(r.p.prezzo)}</s>}
              </span>
              {r.p.maturazione && (
                <div className="scelteline">
                  {MATURAZIONE.map((m) => (
                    <button key={m} className={`chip piccolo ${r.pref === m ? "on" : ""}`} onClick={() => setPref(r.p.id, m)}>{m}</button>
                  ))}
                </div>
              )}
              <div className="rigafondo">
                <Stepper p={r.p} qta={r.qta} aggiungi={aggiungi} />
                <b className="tot">{eur(r.totale)}</b>
                <button className="tondino rosso" onClick={() => togli(r.p.id)} aria-label={`Togli ${r.p.nome}`}><I.cestino s={18} /></button>
              </div>
            </div>
          </div>
        ))}

        <div className="conti">
          <div className="conto"><span>Spesa</span><b>{eur(parziale)}</b></div>
          {couponAttivo && (
            <div className="conto verde"><span>Codice {couponAttivo.codice}</span><b>{couponAttivo.tipo === "consegna" ? "Consegna gratis" : `−${eur(sconto)}`}</b></div>
          )}
          <div className="conto"><span>Consegna a casa</span><b>{consegna === 0 ? "Gratis" : eur(consegna)}</b></div>
          {consegna > 0 && <div className="cartella verde">Con {eur(CONSEGNA_GRATIS_DA - parziale)} in più la consegna è gratis. Con il ritiro in negozio non paghi nulla.</div>}
          <div className="conto grosso"><span>Totale</span><span>{eur(totale)}</span></div>
        </div>

        {!okMinimo && (
          <div className="banda rossa colonna">
            <div><b>Ordine minimo {eur(MIN_ORDINE)}</b><span>Ti mancano {eur(mancano)}: aggiungi ancora qualcosa.</span></div>
            <div className="barretta"><i style={{ width: `${Math.min(100, (parziale / MIN_ORDINE) * 100)}%` }} /></div>
          </div>
        )}
        {freeze.attivo && <div className="banda gelo"><I.neve s={22} /><div><b>Ordini sospesi per pochi minuti</b><span>Stiamo aggiornando la merce. Il carrello resta salvato.</span></div></div>}

        <button className="btn chiaro largo" onClick={() => salvaSolita()}>Salva come «la mia solita spesa»</button>
        <p className="minuta">La ritrovi in cima al banco e la riordini con un tocco.</p>
      </Scroll>

      <div className="fondoazione">
        <button className="btn verde largo" disabled={!okMinimo || freeze.attivo} onClick={() => push("cassa")}>
          {freeze.attivo ? "Ordini sospesi, riprova tra poco" : okMinimo ? `Scegli giorno e ora · ${eur(totale)}` : `Mancano ${eur(mancano)} al minimo`}
        </button>
      </div>
    </div>
  );
}

/* --------------------------------- CASSA --------------------------------- */
function SchermoCassa() {
  const { righe, parziale, cliente, setCliente, fasce, pop, push, creaOrdine, dimmi, bancoAperto, freeze,
    giorni, coupon, setCoupon, couponAttivo, esitoCoupon, coupons, utente, punti, buoniDisponibili, livello } = useApp();
  const primo = giorni.find((g) => !g.chiuso) || giorni[0];
  const [ritiro, setRitiro] = useState(false);
  const [giorno, setGiorno] = useState(primo.key);
  const [fascia, setFascia] = useState(null);
  const [subito, setSubito] = useState(false);
  const [sost, setSost] = useState("simile");
  const [pagamento, setPagamento] = useState("contanti");
  const [carta, setCarta] = useState({ n: "", sc: "", cvv: "" });
  const [settimanale, setSettimanale] = useState(false);
  const [codice, setCodice] = useState("");
  const [buoni, setBuoni] = useState(0);
  const [err, setErr] = useState({});
  const [invio, setInvio] = useState(false);
  const rifDati = useRef(null);
  const rifQuando = useRef(null);

  const oggi = dkey(new Date());
  const adesso = new Date().getHours() + new Date().getMinutes() / 60;
  const elenco = fasce(giorno, ritiro);
  const subitoOk = bancoAperto && !freeze.attivo && giorno === oggi && adesso < CHIUSURA - 1.5;
  const base = calcola(parziale, ritiro, couponAttivo);
  const consegna = !ritiro && livello.id !== "bronzo" && (livello.id === "gold" || parziale >= 15) ? 0 : base.consegna;
  const sconto = base.sconto;
  const puntiSpesi = buoni * PUNTI_BUONO;
  const scontoPunti = arr2(buoni * VALORE_BUONO);
  const totale = Math.max(0, arr2(parziale - sconto - scontoPunti + consegna));
  const maxBuoni = Math.min(buoniDisponibili, Math.floor(Math.max(0, parziale - sconto) / VALORE_BUONO));
  const fuoriZona = indirizzoFuoriZona(cliente);
  const bloccaConsegna = !ritiro && fuoriZona;
  const set = (k, v) => setCliente({ ...cliente, [k]: v });

  function applicaCoupon() {
    const v = verificaCoupon(codice, coupons, parziale);
    if (!v.ok) { dimmi(v.msg); return; }
    setCoupon(v.c.codice);
    setCodice("");
    dimmi(`Codice ${v.c.codice} applicato.`);
  }

  function valida() {
    const e = {};
    if (!cliente.nome || cliente.nome.trim().length < 2) e.nome = "Scrivi nome e cognome.";
    if (!/^[0-9+\s]{8,}$/.test((cliente.tel || "").trim())) e.tel = "Serve un telefono valido.";
    if ((cliente.email || "").trim() && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(cliente.email.trim())) e.email = "Controlla l'indirizzo email, oppure lascialo vuoto.";
    if (!ritiro) {
      if (!cliente.via || cliente.via.trim().length < 3) e.via = "Scrivi la via o la piazza.";
      if (!cliente.civico || !cliente.civico.trim()) e.civico = "Manca il civico.";
      if ((cliente.cap || "").trim() !== CAP_ZONA) e.cap = `Consegniamo solo nel ${CAP_ZONA}.`;
      if (!zonaOk(cliente)) e.citta = `Consegniamo solo a ${CITTA_ZONA}.`;
    }
    if (!subito && fascia === null) e.fascia = "Scegli una fascia oraria.";
    if (pagamento === "carta") {
      if ((carta.n || "").replace(/\s/g, "").length < 15) e.n = "Controlla il numero della carta.";
      if (!/^\d{2}\/\d{2}$/.test(carta.sc || "")) e.sc = "Scadenza come MM/AA.";
      if (!/^\d{3,4}$/.test(carta.cvv || "")) e.cvv = "Codice di 3 cifre.";
    }
    setErr(e);
    const chiavi = Object.keys(e);
    if (chiavi.length) {
      const dove = (e.nome || e.tel || e.via || e.civico || e.cap || e.citta) ? rifDati : e.fascia ? rifQuando : null;
      if (dove && dove.current && dove.current.scrollIntoView) {
        try { dove.current.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (x) {}
      }
      dimmi("Controlla i campi segnati in rosso.");
    }
    return chiavi.length === 0;
  }

  function conferma() {
    if (freeze.attivo) { dimmi("Il banco è in aggiornamento, riprova tra poco."); return; }
    if (!ritiro && !zonaOk(cliente)) { dimmi(`La consegna a casa copre solo ${CITTA_ZONA} ${CAP_ZONA}.`); }
    if (!valida()) return;
    setInvio(true);
    setTimeout(() => {
      const o = creaOrdine({ giorno, fascia, subito, ritiro, sostituzione: sost, pagamento, settimanale, puntiUsati: puntiSpesi, consegna });
      setInvio(false);
      push("esito", o.id);
    }, pagamento === "carta" ? 1300 : 600);
  }

  return (
    <div className="schermo">
      <Testata titolo="Completa l'ordine" indietro={pop} />
      <Scroll>
        <div ref={rifDati} />
        <div className="blocco">
          <h3>Come vuoi ricevere la spesa?</h3>
          <div className="duebottoni">
            <button className={`grossa ${!ritiro ? "on" : ""}`} onClick={() => setRitiro(false)}>
              <I.scatola s={22} /><b>Consegna a casa</b><small>{parziale >= CONSEGNA_GRATIS_DA ? "Gratis" : eur(COSTO_CONSEGNA)}</small>
            </button>
            <button className={`grossa ${ritiro ? "on" : ""}`} onClick={() => setRitiro(true)}>
              <I.banco s={22} /><b>Ritiro in negozio</b><small>Senza costi</small>
            </button>
          </div>
        </div>

        <div className="blocco">
          <h3>{ritiro ? "Chi ritira" : "Dove consegniamo"}</h3>
          <Campo etichetta="Nome e cognome" errore={err.nome}>
            <input value={cliente.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Maria Rossi" autoComplete="name" />
          </Campo>
          <Campo etichetta="Telefono" aiuto="Ti chiamiamo solo se serve." errore={err.tel}>
            <input value={cliente.tel} onChange={(e) => set("tel", e.target.value)} placeholder="333 123 4567" inputMode="tel" />
          </Campo>
          <Campo etichetta="Email (facoltativa)" aiuto="Serve solo per il riepilogo e le offerte. Puoi lasciarla vuota." errore={err.email}>
            <input value={cliente.email || ""} onChange={(e) => set("email", e.target.value)} placeholder="maria@email.it" inputMode="email" />
          </Campo>
          {(cliente.email || "").trim() !== "" && (
            <label className="riga interruttore">
              <span><b>Mandatemi le offerte</b><small>Poche email, solo quando c'è qualcosa di buono al banco.</small></span>
              <Interruttore on={!!cliente.consensoEmail} onChange={(v) => set("consensoEmail", v)} etichetta="Offerte via email" />
            </label>
          )}
          {!ritiro && (
            <>
              <div className="due">
                <Campo etichetta="Via o piazza" errore={err.via}>
                  <input value={cliente.via} onChange={(e) => set("via", e.target.value)} placeholder="Via Roma" />
                </Campo>
                <Campo etichetta="Civico" errore={err.civico}>
                  <input value={cliente.civico} onChange={(e) => set("civico", e.target.value)} placeholder="24" />
                </Campo>
              </div>
              <div className="due">
                <Campo etichetta="Città" errore={err.citta}>
                  <input value={cliente.citta} onChange={(e) => set("citta", e.target.value)} placeholder={CITTA_ZONA} />
                </Campo>
                <Campo etichetta="CAP" errore={err.cap}>
                  <input value={cliente.cap} inputMode="numeric" onChange={(e) => set("cap", e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder={CAP_ZONA} />
                </Campo>
              </div>
              <Campo etichetta="Citofono, scala o piano" aiuto="Facoltativo, ma ci aiuta a trovarti.">
                <input value={cliente.citofono} onChange={(e) => set("citofono", e.target.value)} placeholder="Citofono Rossi, scala B" />
              </Campo>
              {bloccaConsegna && (
                <div className="banda rossa">
                  <I.scatola s={22} />
                  <div>
                    <b>Qui non arriviamo ancora</b>
                    <span>La consegna a domicilio copre solo {CITTA_ZONA} ({CAP_ZONA}). Puoi ritirare in negozio in {NEGOZIO}.</span>
                    <button className="link" onClick={() => setRitiro(true)}>Passa al ritiro in negozio</button>
                  </div>
                </div>
              )}
            </>
          )}
          <Campo etichetta="Vuoi dirci qualcosa?">
            <textarea rows={2} value={cliente.note} onChange={(e) => set("note", e.target.value)} placeholder="Suonare due volte, banane poco mature…" />
          </Campo>
        </div>

        <div ref={rifQuando} />
        <div className="blocco">
          <h3>Quando</h3>
          <p className="aiutoblocco">Tutti i giorni dalle 8:00 alle 20:00. Puoi prenotare fino a una settimana.</p>
          <div className="scorri">
            {giorni.map((g) => (
              <button key={g.key} className={`giorno ${giorno === g.key ? "on" : ""}`} disabled={g.chiuso}
                onClick={() => { setGiorno(g.key); setFascia(null); setSubito(false); }}>
                <b>{g.titolo}</b><span>{g.chiuso ? "chiuso" : g.sotto}</span>
              </button>
            ))}
          </div>

          {subitoOk && (
            <button className={`subito ${subito ? "on" : ""}`} onClick={() => { setSubito(true); setFascia(null); }}>
              <I.orologio s={22} />
              <span><b>Il prima possibile</b><small>Entro due ore, se il banco è aperto</small></span>
              <span className="radio">{subito && <I.ok s={13} w={3} />}</span>
            </button>
          )}

          <div className="fasce">
            {elenco.map((f) => (
              <button key={f.h} className={`fascia ${!subito && fascia === f.h ? "on" : ""}`} disabled={!f.ok}
                onClick={() => { setFascia(f.h); setSubito(false); }}>
                <b>{f.t}</b><span>{f.ok ? (f.posti <= 2 ? `Ultimi ${f.posti}` : "Libera") : f.motivo}</span>
              </button>
            ))}
          </div>
          {err.fascia && <p className="rosso piccolo">{err.fascia}</p>}

          <label className="riga interruttore">
            <span><b>Ripeti ogni settimana</b><small>Stessa spesa, stesso giorno e stessa ora. Puoi annullarla quando vuoi.</small></span>
            <Interruttore on={settimanale} onChange={setSettimanale} etichetta="Ripeti ogni settimana" />
          </label>
        </div>

        <div className="blocco">
          <h3>Se manca un prodotto</h3>
          <div className="scelte">
            {SOSTITUZIONI.map((s) => (
              <button key={s.id} className={`scelta ${sost === s.id ? "on" : ""}`} onClick={() => setSost(s.id)}>
                <span className="radio">{sost === s.id && <I.ok s={13} w={3} />}</span>
                <span><b>{s.t}</b><small>{s.s}</small></span>
              </button>
            ))}
          </div>
        </div>

        <div className="blocco">
          <h3>Pagamento</h3>
          <div className="scelte">
            {[
              { id: "contanti", t: "Contanti alla consegna", s: "Paghi quando arriva la spesa." },
              { id: "pos", t: "Bancomat o carta alla consegna", s: "Il fattorino porta il POS." },
              { id: "carta", t: "Paga adesso con carta", s: "Non devi preparare i contanti." },
            ].map((o) => (
              <button key={o.id} className={`scelta ${pagamento === o.id ? "on" : ""}`} onClick={() => setPagamento(o.id)}>
                <span className="radio">{pagamento === o.id && <I.ok s={13} w={3} />}</span>
                <span><b>{o.t}</b><small>{o.s}</small></span>
              </button>
            ))}
          </div>
          {pagamento === "carta" && (
            <div className="cartaform">
              <Campo etichetta="Numero della carta" errore={err.n}>
                <input value={carta.n} inputMode="numeric" placeholder="0000 0000 0000 0000"
                  onChange={(e) => setCarta({ ...carta, n: e.target.value.replace(/[^\d\s]/g, "").slice(0, 19) })} />
              </Campo>
              <div className="due">
                <Campo etichetta="Scadenza" errore={err.sc}>
                  <input value={carta.sc} placeholder="MM/AA" onChange={(e) => setCarta({ ...carta, sc: e.target.value.slice(0, 5) })} />
                </Campo>
                <Campo etichetta="Codice" errore={err.cvv}>
                  <input value={carta.cvv} inputMode="numeric" placeholder="123" onChange={(e) => setCarta({ ...carta, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
                </Campo>
              </div>
            </div>
          )}
        </div>

        {utente ? (
          <div className="blocco">
            <h3>I tuoi punti</h3>
            <div className="puntiriga">
              <Pomodorino liv={livello} size={26} />
              <div><b>{punti} punti · {livello.t}</b><small>{PUNTI_BUONO} punti = {eur(VALORE_BUONO)} di sconto</small></div>
            </div>
            {maxBuoni > 0 ? (
              <>
                <div className="scelteline">
                  {Array.from({ length: maxBuoni + 1 }, (_, i) => i).map((i) => (
                    <button key={i} className={`chip piccolo ${buoni === i ? "on" : ""}`} onClick={() => setBuoni(i)}>
                      {i === 0 ? "Non usarli" : `−${eur(i * VALORE_BUONO)}`}
                    </button>
                  ))}
                </div>
                {buoni > 0 && <div className="cartella verde">Usi {puntiSpesi} punti e paghi {eur(scontoPunti)} in meno. Te ne restano {punti - puntiSpesi}.</div>}
              </>
            ) : (
              <p className="aiutoblocco">Ti servono almeno {PUNTI_BUONO} punti per il primo buono. Con questo ordine ne guadagni circa {Math.floor(parziale) + PUNTI_PER_ORDINE}.</p>
            )}
          </div>
        ) : (
          <button className="invito" onClick={() => push("accesso")}>
            <Art k="pomodoro" size={40} />
            <span><b>Hai la tessera di Sabetta?</b><small>Entra e usa i punti su questo ordine. Con questa spesa ne guadagni {Math.floor(parziale) + PUNTI_PER_ORDINE}.</small></span>
            <I.avanti s={18} />
          </button>
        )}

        <div className="blocco">
          <h3>Codice sconto</h3>
          {couponAttivo ? (
            <div className="couponok">
              <div>
                <b>{couponAttivo.codice}</b>
                <small>{couponTxt(couponAttivo)}{couponAttivo.minimo ? ` · da ${eur(couponAttivo.minimo)} di spesa` : ""}</small>
              </div>
              <button className="btn chiaro mini" onClick={() => { setCoupon(""); dimmi("Codice rimosso."); }}>Togli</button>
            </div>
          ) : (
            <>
              <div className="couponriga">
                <input value={codice} onChange={(e) => setCodice(e.target.value.toUpperCase().replace(/\s/g, ""))}
                  placeholder="Scrivi il codice" aria-label="Codice sconto"
                  onKeyDown={(e) => { if (e.key === "Enter") applicaCoupon(); }} />
                <button className="btn verde mini" onClick={applicaCoupon}>Applica</button>
              </div>
              {coupon && esitoCoupon && !esitoCoupon.ok && <p className="rosso piccolo">{esitoCoupon.msg}</p>}
              <p className="aiutoblocco">Hai un codice dal negozio o dal volantino? Scrivilo qui, lo sconto si vede subito nel totale.</p>
            </>
          )}
        </div>

        <div className="blocco">
          <h3>Riepilogo</h3>
          {righe.map((r) => (
            <div className="rigariep" key={r.p.id}>
              <span>{qtaTxt(r.p.unita, r.qta)} · {r.p.nome}</span>
              <b>{eur(r.totale)}</b>
            </div>
          ))}
          {couponAttivo && (
            <div className="conto verde"><span>Codice {couponAttivo.codice}</span><b>{couponAttivo.tipo === "consegna" ? "Consegna gratis" : `−${eur(sconto)}`}</b></div>
          )}
          {scontoPunti > 0 && <div className="conto verde"><span>{puntiSpesi} punti tessera</span><b>−{eur(scontoPunti)}</b></div>}
          <div className="conto"><span>{ritiro ? "Ritiro in negozio" : "Consegna"}</span><b>{consegna === 0 ? "Gratis" : eur(consegna)}</b></div>
          <div className="conto grosso"><span>Totale</span><span>{eur(totale)}</span></div>
          <div className="cartella">
            {ritiro ? `Ritiro in ${NEGOZIO}` : `Consegna in ${cliente.via || "…"} ${cliente.civico || ""}`}<br />
            {subito ? "Il prima possibile, entro due ore" : fascia !== null ? `${giornoTxt(giorno)}, ${fasciaTxt(fascia)}` : "Orario non ancora scelto"}
          </div>
        </div>
      </Scroll>

      <div className="fondoazione">
        {bloccaConsegna && <p className="notagelo rossa">Consegna a casa solo a {CITTA_ZONA} {CAP_ZONA}. Cambia indirizzo o scegli il ritiro.</p>}
        <button className="btn verde largo" onClick={conferma} disabled={invio || bloccaConsegna}>
          {invio ? "Stiamo registrando…" : `Conferma l'ordine · ${eur(totale)}`}
        </button>
      </div>
    </div>
  );
}

/* --------------------------------- ESITO --------------------------------- */
function SchermoEsito({ id }) {
  const { ordini, vaiTab, pop } = useApp();
  const o = ordini.find((x) => x.id === id);
  if (!o) { return <div className="schermo"><Testata titolo="Ordine" indietro={pop} /></div>; }
  const quando = quandoTxt(o, true);
  return (
    <div className="schermo">
      <Scroll>
        <div className="esito">
          <div className="spunta"><I.ok s={44} w={3} /></div>
          <h1>Ordine confermato</h1>
          <p>Grazie {o.cliente.nome.split(" ")[0]}, prepariamo la tua cassetta.</p>
          <div className="codice">{o.id}</div>

          <div className="cartella sinistra">
            <div><b>{o.ritiro ? "Ritiro" : "Consegna"}</b> {quando}</div>
            <div><b>{o.ritiro ? "Dove" : "Indirizzo"}</b> {o.ritiro ? NEGOZIO : `${o.cliente.via} ${o.cliente.civico}`}</div>
            {o.coupon && <div><b>Codice</b> {o.coupon.codice} applicato</div>}
            <div><b>Totale</b> {eur(o.totale)} · {o.pagamento === "carta" ? "già pagato" : "da pagare alla consegna"}</div>
            {o.settimanale && <div><b>Ripetizione</b> ogni settimana, puoi annullarla dal profilo</div>}
          </div>

          <button className="btn verde largo" onClick={() => { vaiTab("ordini"); }}>Segui l'ordine</button>
          <button className="btn chiaro largo" onClick={() => vaiTab("home")}>Torna al banco</button>
          <p className="minuta">Devi cambiare qualcosa? Chiama il negozio al {TELEFONO}.</p>
        </div>
      </Scroll>
    </div>
  );
}

/* --------------------------------- ORDINI -------------------------------- */
function SchermoOrdini() {
  const { ordini, push, vaiTab, caricaSolita } = useApp();
  const attivi = ordini.filter((o) => ["nuovo", "preparazione", "consegna"].includes(o.stato));
  const passati = ordini.filter((o) => !["nuovo", "preparazione", "consegna"].includes(o.stato));

  return (
    <div className="schermo">
      <Testata titolo="I miei ordini" />
      <Scroll>
        {ordini.length === 0 && (
          <div className="vuoto alto">
            <Art k="busta" size={84} />
            <b>Nessun ordine</b>
            <span>Quando farai il primo ordine lo troverai qui con lo stato della consegna.</span>
            <button className="btn verde" onClick={() => vaiTab("home")}>Vai al banco</button>
          </div>
        )}

        {attivi.length > 0 && <h3 className="titoletto">In corso</h3>}
        {attivi.map((o) => <CardOrdine key={o.id} o={o} apri={() => push("ordine", o.id)} riordina={() => caricaSolita(o.righe, "cassa")} />)}

        {passati.length > 0 && <h3 className="titoletto">Precedenti</h3>}
        {passati.map((o) => <CardOrdine key={o.id} o={o} apri={() => push("ordine", o.id)} riordina={() => caricaSolita(o.righe, "cassa")} />)}
      </Scroll>
    </div>
  );
}

function CardOrdine({ o, apri, riordina }) {
  const idx = STATI.findIndex((s) => s.id === o.stato);
  const quando = quandoTxt(o);
  return (
    <button className="cardordine piena" onClick={apri}>
      <div className="riga">
        <b>{o.id}</b>
        <Etichetta stato={o.stato} />
      </div>
      <span className="fine">{quando} · {o.righe.length} prodotti · {eur(o.totale)}</span>
      {o.stato !== "annullato" && (
        <div className="tracciato">{STATI.map((s, i) => <i key={s.id} className={i <= idx ? "on" : ""} />)}</div>
      )}
      {o.settimanale && <span className="pillola mini">Ogni settimana</span>}
      {riordina && !o.spedizione && (
        <span className="riordina" onClick={(e) => { e.stopPropagation(); riordina(); }} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); riordina(); } }}>
          Riordina questa spesa
        </span>
      )}
    </button>
  );
}

function SchermoOrdine({ id }) {
  const { ordini, pop, ripeti, vaiTab, setChat } = useApp();
  const o = ordini.find((x) => x.id === id);
  if (!o) return <div className="schermo"><Testata titolo="Ordine" indietro={pop} /></div>;
  const idx = STATI.findIndex((s) => s.id === o.stato);

  return (
    <div className="schermo">
      <Testata titolo={`Ordine ${o.id}`} sotto={quandoTxt(o)} indietro={pop} />
      <Scroll>
        {o.stato !== "annullato" ? (
          <div className="linea">
            {STATI.map((s, i) => (
              <div key={s.id} className={`tappa ${i <= idx ? "on" : ""}`}>
                <span className="punto">{i < idx ? <I.ok s={13} w={3} /> : null}</span>
                <div><b>{s.t}</b><small>{s.c}</small></div>
              </div>
            ))}
          </div>
        ) : <div className="banda rossa"><div><b>Ordine annullato</b><span>Per informazioni chiama il negozio.</span></div></div>}

        {o.spedizione && (
          <div className="blocco">
            <h3>Spedizione</h3>
            <div className="dett"><span>Destinatario</span><b>{o.destinatario.nome}</b></div>
            <div className="dett"><span>Indirizzo</span><b>{o.destinatario.via} {o.destinatario.civico}, {o.destinatario.citta} {o.destinatario.cap}</b></div>
            <div className="dett"><span>Codice spedizione</span><b>{o.tracking || "te lo mandiamo appena parte"}</b></div>
            {o.messaggio && <div className="cartella giallo">Biglietto: {o.messaggio}</div>}
          </div>
        )}

        {o.pesato && <div className="cartella verde">Abbiamo pesato la merce al banco: il totale è aggiornato al peso reale.</div>}

        <div className="blocco">
          <h3>Prodotti</h3>
          {o.righe.map((r) => (
            <div className="rigariep" key={r.id}>
              <span>{qtaTxt(r.unita, r.qta)} · {r.nome}{r.pref ? ` · ${r.pref}` : ""}</span>
              <b>{eur(r.totale)}</b>
            </div>
          ))}
          {(o.sconto > 0 || o.coupon) && (
            <div className="conto verde"><span>Codice {o.coupon ? o.coupon.codice : "sconto"}</span><b>{o.sconto > 0 ? `−${eur(o.sconto)}` : "Consegna gratis"}</b></div>
          )}
          <div className="conto"><span>{o.ritiro ? "Ritiro" : "Consegna"}</span><b>{o.consegna === 0 ? "Gratis" : eur(o.consegna)}</b></div>
          <div className="conto grosso"><span>Totale</span><span>{eur(o.totale)}</span></div>
        </div>

        <div className="blocco">
          <h3>Dettagli</h3>
          <div className="dett"><span>{o.spedizione ? "Arriva a" : o.ritiro ? "Ritiro" : "Indirizzo"}</span><b>{o.spedizione ? `${o.destinatario.nome}, ${o.destinatario.citta}` : o.ritiro ? NEGOZIO : `${o.cliente.via} ${o.cliente.civico}`}</b></div>
          <div className="dett"><span>Telefono</span><b>{o.cliente.tel}</b></div>
          <div className="dett"><span>Pagamento</span><b>{o.pagamento === "contanti" ? "Contanti" : o.pagamento === "pos" ? "POS alla consegna" : "Carta, già pagato"}</b></div>
          <div className="dett"><span>Se manca qualcosa</span><b>{(SOSTITUZIONI.find((s) => s.id === o.sostituzione) || {}).t}</b></div>
          {o.cliente.note && <div className="dett"><span>Nota</span><b>{o.cliente.note}</b></div>}
        </div>

        <button className="btn verde largo" onClick={() => ripeti(o)}>Ordina di nuovo</button>
        <a className="btn chiaro largo" href={TEL_URL}><I.tel s={18} /> Chiama il negozio</a>
        <button className="btn chiaro largo" onClick={() => { setChat((c) => [...c, { chi: "io", t: `Vorrei informazioni sull'ordine ${o.id}` }]); vaiTab("betta"); }}>
          Chiedi a Betta
        </button>
      </Scroll>
    </div>
  );
}

/* ================================== BETTA ================================= */
const FAQ = [
  { k: ["consegna", "spedizione", "costo", "quanto costa portare", "gratis"], r: () => `La consegna costa ${eur(COSTO_CONSEGNA)} ed è gratis sopra ${eur(CONSEGNA_GRATIS_DA)} di spesa. Se preferisci, puoi ritirare in negozio senza costi.` },
  { k: ["minimo", "spesa minima"], r: () => `L'ordine minimo è ${eur(MIN_ORDINE)}. Sotto questa cifra il carrello non si può confermare.` },
  { k: ["orario", "orari", "che ora", "fino a che ora", "aperto", "chiuso", "domenica"], r: () => `Consegniamo tutti i giorni dalle 8:00 alle 20:00, con fasce di un'ora. La domenica siamo chiusi.` },
  { k: ["prenot", "domani", "settimana", "in anticipo", "programm"], r: () => `Puoi prenotare fino a sette giorni prima: scegli il giorno e la fascia oraria alla cassa. Puoi anche far ripetere lo stesso ordine ogni settimana.` },
  { k: ["pagare", "pagamento", "carta", "contanti", "bancomat", "pos"], r: () => `Puoi pagare in contanti alla consegna, con bancomat o carta al fattorino, oppure subito in app con la carta.` },
  { k: ["ritiro", "venire a prendere", "passo io", "negozio"], r: () => `Certo: scegli "Ritiro in negozio" alla cassa. Ci trovi in ${NEGOZIO}, senza costi aggiuntivi.` },
  { k: ["fresco", "qualità", "provenienza", "dove prendete", "biologico"], r: () => `Scegliamo la merce ogni mattina al mercato e lavoriamo soprattutto con produttori della zona. Sulla scheda di ogni prodotto trovi la provenienza.` },
  { k: ["sostituzione", "manca", "esaurito", "finito"], r: () => `Alla cassa dici cosa fare se un prodotto manca: sostituirlo con uno simile, chiamarti prima, oppure toglierlo e non pagarlo.` },
  { k: ["peso", "pesata", "chili", "quanto pesa"], r: () => `La frutta e la verdura a peso si pagano sul peso reale: pesiamo al banco e il totale si aggiorna prima della consegna.` },
  { k: ["annullare", "disdire", "cambiare ordine", "modificare"], r: () => `Per cambiare o annullare un ordine già confermato serve una persona del negozio: chiama il ${TELEFONO}.`, azione: "chiama" },
  { k: ["reclamo", "rotto", "marcio", "non va bene", "rimborso"], r: () => `Mi dispiace. Per i rimborsi decide il negozio: chiama il ${TELEFONO} e risolvono subito, di solito con un rimborso o una sostituzione.`, azione: "chiama" },
  { k: ["persona", "umano", "parlare", "telefono", "chiamare", "operatore"], r: () => `Ti passo al negozio: il numero è ${TELEFONO}, rispondono negli orari di apertura.`, azione: "chiama" },
  { k: ["zona", "consegnate a", "arrivate", "fuori citt", "provincia", "cap"], r: () => `La consegna a casa copre ${CITTA_ZONA} nel ${CAP_ZONA}. Fuori zona puoi sempre ordinare e ritirare in negozio, in ${NEGOZIO}.` },
];

function rispostaLocale(testo, app) {
  const t = (testo || "").toLowerCase();
  const attivo = app.ordini.find((o) => ["nuovo", "preparazione", "consegna"].includes(o.stato));

  if (/(ordine|consegna mia|dov|arriv|trac|quando arriva)/.test(t) && attivo) {
    const s = STATI.find((x) => x.id === attivo.stato);
    const quando = quandoTxt(attivo, true).toLowerCase();
    return { risposta: `Il tuo ordine ${attivo.id} è nello stato "${s.t}". La consegna è prevista ${quando}. Se ti serve prima, chiama il negozio.`, azione: "ordini" };
  }
  if (app.freeze.attivo && /(ordin|perché|non posso|bloccat)/.test(t)) {
    return { risposta: `In questo momento il banco è in aggiornamento: stiamo caricando la merce del giorno.${app.freeze.riapre ? ` Riapriamo alle ${app.freeze.riapre}.` : ""} Puoi già riempire il carrello e confermare appena riapriamo.`, azione: "nessuna" };
  }
  if (/(codice|coupon|sconto|buono|promo|offert)/.test(t)) {
    const attivi = (app.coupons || []).filter((c) => c.attivo && !(c.scadenza && dkey(new Date()) > c.scadenza));
    const off = app.catalogo.filter((x) => x.attivo && inOfferta(x)).slice(0, 3);
    const pezzi = [];
    if (attivi.length) pezzi.push(`Codici attivi: ${attivi.map((c) => `${c.codice} (${couponTxt(c)}${c.minimo ? ` da ${eur(c.minimo)}` : ""})`).join(", ")}. Si scrivono alla cassa, nel riquadro «Codice sconto».`);
    if (off.length) pezzi.push(`In offerta oggi: ${off.map((x) => `${x.nome} a ${eur(prezzoDi(x))}`).join(", ")}.`);
    if (pezzi.length) return { risposta: pezzi.join(" "), azione: "nessuna" };
  }
  for (const f of FAQ) {
    if (f.k.some((k) => t.includes(k))) return { risposta: f.r(), azione: f.azione || "nessuna" };
  }
  const trovati = app.catalogo.filter((p) => p.attivo && t.includes(p.nome.split(" ")[0].toLowerCase()));
  if (trovati.length) {
    const p = trovati[0];
    return { risposta: `Oggi ${p.nome.toLowerCase()} ${eur(p.prezzo)} al ${p.unita}, da ${p.origine}. ${p.giacenza > 0 ? `Ne abbiamo ancora ${qtaTxt(p.unita, p.giacenza)}.` : "Purtroppo è finito per oggi."}`, azione: p.giacenza > 0 ? "aggiungi" : "nessuna", prodotti: [p.id] };
  }
  return { risposta: `Su questo non ho una risposta sicura e non voglio dirti una cosa sbagliata. Chiama il negozio al ${TELEFONO}: ti rispondono subito.`, azione: "chiama" };
}

function sistemaBetta(app) {
  const listino = app.catalogo.filter((p) => p.attivo).slice(0, 24).map((p) => `${p.id}=${p.nome} ${eur(prezzoDi(p))}/${un(p.unita).br}${inOfferta(p) ? ` (offerta -${p.sconto}%)` : ""}${p.giacenza <= 0 ? " (finito)" : ""}`).join("; ");
  const attivo = app.ordini.find((o) => ["nuovo", "preparazione", "consegna"].includes(o.stato));
  const ordine = attivo ? `Ordine in corso: ${attivo.id}, stato ${attivo.stato}, consegna ${quandoTxt(attivo)}, totale ${eur(attivo.totale)}.` : "Il cliente non ha ordini in corso.";
  return [
    "Sei Betta, l'assistente del negozio di frutta e verdura Sabetta in piazza.",
    "Parli italiano semplice, con frasi corte, tono gentile da negoziante di quartiere. Niente elenchi lunghi, niente termini tecnici: molti clienti hanno più di 35 anni e usano poco le app.",
    "Rispondi solo su: prodotti, prezzi, consegne, orari, prenotazioni, pagamenti, stato degli ordini, uso dell'app.",
    "Se non sei sicura, se il cliente vuole annullare o modificare un ordine, se c'è un reclamo o un rimborso, invitalo a chiamare il negozio e usa azione \"chiama\".",
    `Zona di consegna: solo ${CITTA_ZONA}, CAP ${CAP_ZONA}. Fuori zona resta possibile il ritiro in negozio.`,
    `Codici sconto attivi: ${(app.coupons || []).filter((c) => c.attivo).map((c) => `${c.codice} ${couponTxt(c)}${c.minimo ? ` da ${eur(c.minimo)}` : ""}`).join("; ") || "nessuno"}. Si inseriscono alla cassa.`,
    `Dati del negozio: indirizzo ${NEGOZIO}; telefono ${TELEFONO}; consegne tutti i giorni 8:00-20:00 a fasce di un'ora; domenica chiuso; ordine minimo ${eur(MIN_ORDINE)}; consegna ${eur(COSTO_CONSEGNA)}, gratis da ${eur(CONSEGNA_GRATIS_DA)}; ritiro in negozio gratuito; prenotazione fino a 7 giorni; pagamento in contanti, POS alla consegna o carta in app.`,
    app.freeze.attivo ? `Attenzione: adesso il banco è in aggiornamento merce${app.freeze.riapre ? `, riapre alle ${app.freeze.riapre}` : ""}, quindi non si possono confermare ordini.` : "Il negozio accetta ordini normalmente.",
    `Listino di oggi: ${listino}.`,
    ordine,
    "Rispondi SOLO con un oggetto JSON, senza testo prima o dopo e senza blocchi di codice:",
    '{"risposta":"massimo 3 frasi","azione":"nessuna|chiama|ordini|aggiungi","prodotti":["id del listino"]}',
  ].join("\n");
}

function SchermoBetta() {
  const app = useApp();
  const { chat, setChat, catalogo, aggiungi, vaiTab, dimmi } = app;
  const [testo, setTesto] = useState("");
  const [scrive, setScrive] = useState(false);
  const fondo = useRef(null);

  const rapide = ["Quanto costa la consegna?", "Fino a che ora consegnate?", "Dov'è il mio ordine?", "Voglio parlare con una persona"];

  useEffect(() => {
    if (fondo.current && fondo.current.scrollIntoView) {
      try { fondo.current.scrollIntoView({ behavior: "smooth", block: "end" }); } catch (e) {}
    }
  }, [chat, scrive]);

  useEffect(() => {
    const ultimo = chat[chat.length - 1];
    if (ultimo && ultimo.chi === "io" && !scrive) rispondi(ultimo.t, chat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.length]);

  async function rispondi(domanda, storia) {
    setScrive(true);
    let esito = null;
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 20000);
      const messaggi = storia.slice(-8).map((m) => ({ role: m.chi === "io" ? "user" : "assistant", content: m.t }));
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, system: sistemaBetta(app), messages: messaggi }),
      });
      clearTimeout(timeout);
      const dati = await res.json();
      const grezzo = (dati.content || []).map((b) => (b.type === "text" ? b.text : "")).join("").trim();
      const pulito = grezzo.replace(/```json|```/g, "").trim();
      try { esito = JSON.parse(pulito); } catch (e) { if (pulito) esito = { risposta: pulito, azione: "nessuna" }; }
    } catch (e) {
      esito = null;
    }
    if (!esito || !esito.risposta) esito = rispostaLocale(domanda, app);
    setScrive(false);
    setChat((c) => [...c, { chi: "betta", t: esito.risposta, azione: esito.azione || "nessuna", prodotti: esito.prodotti || [] }]);
  }

  function invia(t) {
    const v = (t || testo).trim();
    if (!v || scrive) return;
    setTesto("");
    setChat((c) => [...c, { chi: "io", t: v }]);
  }

  return (
    <div className="schermo">
      <header className="testata betta">
        <button className="tondino" onClick={() => vaiTab("home")} aria-label="Torna al banco"><I.chevron s={22} /></button>
        <Betta size={40} fluttua={scrive} />
        <div className="testatitolo sx">
          <b>Betta</b>
          <span>{scrive ? "sta scrivendo…" : "assistente di Sabetta in piazza"}</span>
        </div>
        <a className="tondino" href={TEL_URL} aria-label="Chiama il negozio"><I.tel s={20} /></a>
      </header>

      <div className="chat">
        <div className="bolla betta">
          <p>Ciao, sono Betta. Ti aiuto con prezzi, consegne, prenotazioni e ordini. Se serve una persona del negozio ti passo il numero.</p>
        </div>
        {chat.map((m, i) => (
          <div key={i} className={`bolla ${m.chi === "io" ? "io" : "betta"}`}>
            <p>{m.t}</p>
            {m.chi === "betta" && m.azione === "chiama" && (
              <a className="btn giallo mini" href={TEL_URL}><I.tel s={16} /> Chiama {TELEFONO}</a>
            )}
            {m.chi === "betta" && m.azione === "ordini" && (
              <button className="btn giallo mini" onClick={() => vaiTab("ordini")}>Vedi i miei ordini</button>
            )}
            {m.chi === "betta" && m.azione === "aggiungi" && (m.prodotti || []).map((id) => {
              const p = catalogo.find((x) => x.id === id);
              if (!p || p.giacenza <= 0) return null;
              return (
                <button key={id} className="btn giallo mini" onClick={() => { aggiungi(p, passo(p)); dimmi(`${p.nome} nel carrello.`); }}>
                  <I.piu s={16} /> Aggiungi {p.nome.toLowerCase()}
                </button>
              );
            })}
          </div>
        ))}
        {scrive && <div className="bolla betta"><span className="punti"><i /><i /><i /></span></div>}
        <div ref={fondo} />
      </div>

      {chat.length < 2 && (
        <div className="rapide">
          {rapide.map((r) => <button key={r} className="chip" onClick={() => invia(r)}>{r}</button>)}
        </div>
      )}

      <div className="barrachat">
        <input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Scrivi la tua domanda…"
          onKeyDown={(e) => { if (e.key === "Enter") invia(); }} aria-label="Scrivi a Betta" />
        <button className="invia" onClick={() => invia()} disabled={!testo.trim() || scrive} aria-label="Invia"><I.invia s={20} /></button>
      </div>
    </div>
  );
}

/* ------------------------- BOTTEGA E PACCO DA GIÙ ------------------------ */
function SchermoMarket() {
  const { catalogo, carrello, aggiungi, push, pacchi, vaiTab, pezzi, parziale } = useApp();
  const [sez, setSez] = useState("pacco");
  const bottega = catalogo.filter((p) => p.tipo === "market" && p.attivo);
  const attivi = pacchi.filter((k) => k.attivo);

  return (
    <div className="schermo">
      <header className="testata">
        <div className="testariga">
          <div className="testatitolo sx">
            <b>Pacco da giù</b>
            <span>I sapori di casa, spediti dove vuoi</span>
          </div>
        </div>
        <div className="segmenti">
          <button className={sez === "pacco" ? "on" : ""} onClick={() => setSez("pacco")}>I pacchi</button>
          <button className={sez === "bottega" ? "on" : ""} onClick={() => setSez("bottega")}>Dispensa</button>
        </div>
      </header>

      <Scroll>
        {sez === "pacco" ? (
          <>
            <div className="pacchetto">
              <div className="pacchetesta">
                <Art k="cassa" size={54} />
                <div>
                  <b>Il pacco da giù</b>
                  <small>Spediamo in tutta Italia con corriere. Tu scegli il pacco, noi lo prepariamo la mattina e lo mandiamo a chi vuoi tu.</small>
                </div>
              </div>
              <div className="pacchefatti">
                <span><I.scatola s={16} /> Consegna in 1-3 giorni</span>
                <span><I.ok s={16} /> Spedizione gratis da {eur(SPEDIZIONE_GRATIS_DA)}</span>
                <span><I.tel s={16} /> Biglietto con dedica incluso</span>
              </div>
            </div>

            {attivi.map((k) => (
              <button className="pacco" key={k.id} onClick={() => push("pacco", k.id)}>
                <div className="paccofig"><Art k={k.art} size={58} /></div>
                <div className="paccocorpo">
                  <b>{k.nome}</b>
                  <small>{k.nota}</small>
                  <div className="paccodentro">{k.dentro.slice(0, 3).join(" · ")}{k.dentro.length > 3 ? ` · +${k.dentro.length - 3}` : ""}</div>
                  <div className="paccofondo">
                    <span className="cartellino">{eur(k.prezzo)}<small>/{k.peso}</small></span>
                    <span className="link">Vedi e spedisci</span>
                  </div>
                </div>
              </button>
            ))}
            <p className="minuta">Le spedizioni non hanno limite di zona: arriviamo dove abita chi ami.</p>
          </>
        ) : (
          <>
            <p className="aiutoblocco">Prodotti che durano, dai produttori della zona. Li consegniamo a {CITTA_ZONA} insieme alla spesa, oppure li mettiamo nel pacco da spedire.</p>
            <div className="griglia">
              {bottega.map((p) => (
                <div key={p.id} className={`prod ${carrello[p.id] ? "dentro" : ""}`}>
                  <button className="prodtocca" onClick={() => push("prodotto", p.id)} aria-label={`Apri ${p.nome}`}>
                    <div className="prodfig">
                      <Art k={p.art} size={74} />
                      {inOfferta(p) && <span className="bollino">−{p.sconto}%</span>}
                    </div>
                    <b>{p.nome}</b>
                    <span className="orig">{p.venditore}</span>
                    <Cartellino p={p} />
                  </button>
                  <div className="prodazione">
                    {p.giacenza <= 0
                      ? <span className="finito">Finito</span>
                      : <Stepper p={p} qta={carrello[p.id] ? carrello[p.id].qta : 0} aggiungi={aggiungi} pieno />}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Scroll>

      {pezzi > 0 && (
        <div className="barrafondo" onClick={() => vaiTab("carrello")} role="button">
          <div><b>{pezzi} {pezzi === 1 ? "prodotto" : "prodotti"}</b><small>nel carrello della spesa</small></div>
          <span className="btn giallo mini">Carrello · {eur(parziale)}</span>
        </div>
      )}
    </div>
  );
}

function SchermoPacco({ id }) {
  const { pacchi, catalogo, pop, creaSpedizione, dimmi, cliente, utente, push } = useApp();
  const k = pacchi.find((x) => x.id === id);
  const extra = catalogo.filter((p) => p.tipo === "market" && p.attivo && p.spedibile !== false);
  const [agg, setAgg] = useState({});
  const [passo, setPasso] = useState(1);
  const [mitt, setMitt] = useState({ nome: utente ? utente.nome : cliente.nome || "", tel: utente ? utente.tel : cliente.tel || "", email: utente ? utente.email || "" : cliente.email || "" });
  const [dest, setDest] = useState({ nome: "", tel: "", via: "", civico: "", citta: "", cap: "", provincia: "", note: "" });
  const [messaggio, setMessaggio] = useState("");
  const [pagamento, setPagamento] = useState("carta");
  const [err, setErr] = useState({});
  const [invio, setInvio] = useState(false);

  if (!k) return <div className="schermo"><Testata titolo="Pacco" indietro={pop} /></div>;

  const righeExtra = Object.keys(agg).filter((x) => agg[x] > 0).map((x) => {
    const p = extra.find((y) => y.id === x);
    return { id: p.id, nome: p.nome, qta: agg[x], unita: p.unita, prezzo: prezzoDi(p), totale: arr2(prezzoDi(p) * agg[x]), art: p.art };
  });
  const parziale = arr2(k.prezzo + righeExtra.reduce((a, r) => a + r.totale, 0));
  const zona = zonaSpedizione(dest.cap);
  const costoSpedizione = parziale >= SPEDIZIONE_GRATIS_DA ? 0 : zona ? zona.costo : 0;
  const totale = arr2(parziale + costoSpedizione);

  function valida() {
    const e = {};
    if (!mitt.nome.trim()) e.mnome = "Scrivi il tuo nome.";
    if (!/^[0-9+\s]{8,}$/.test(mitt.tel.trim())) e.mtel = "Serve il tuo telefono.";
    if (!dest.nome.trim()) e.nome = "Scrivi chi riceve il pacco.";
    if (!/^[0-9+\s]{8,}$/.test(dest.tel.trim())) e.tel = "Il corriere ha bisogno del telefono di chi riceve.";
    if (dest.via.trim().length < 3) e.via = "Scrivi la via.";
    if (!dest.civico.trim()) e.civico = "Manca il civico.";
    if (!dest.citta.trim()) e.citta = "Scrivi la città.";
    if (solaCifre(dest.cap).length !== 5) e.cap = "Il CAP ha 5 cifre.";
    setErr(e);
    if (Object.keys(e).length) dimmi("Controlla i campi in rosso.");
    return Object.keys(e).length === 0;
  }

  function conferma() {
    if (!valida()) return;
    setInvio(true);
    setTimeout(() => {
      const righe = [{ id: k.id, nome: k.nome, qta: 1, unita: "pezzo", prezzo: k.prezzo, totale: k.prezzo, art: k.art }, ...righeExtra];
      const o = creaSpedizione({ righe, parziale, costoSpedizione, totale, mittente: mitt, destinatario: dest, messaggio, zona: zona ? zona.id : "", pagamento });
      setInvio(false);
      push("esito", o.id);
    }, 900);
  }

  return (
    <div className="schermo">
      <Testata titolo={k.nome} sotto={`${k.peso} · spedizione in tutta Italia`} indietro={pop} />
      <Scroll>
        {passo === 1 && (
          <>
            <div className="paccogrande"><Art k={k.art} size={130} /></div>
            <h1 className="titolone">{k.nome}</h1>
            <p className="sottotitolo">{k.nota}</p>
            <div className="rigaprezzo">
              <span className="cartellino">{eur(k.prezzo)}<small>/{k.peso}</small></span>
              <span className="giacenza">Spedizione {parziale >= SPEDIZIONE_GRATIS_DA ? "gratis" : "da " + eur(7.9)}</span>
            </div>

            <div className="blocco">
              <h3>Cosa c'è dentro</h3>
              {k.dentro.map((x) => (
                <div className="dentroriga" key={x}><I.ok s={16} /><span>{x}</span></div>
              ))}
              <p className="aiutoblocco">La frutta e la verdura cambiano con la stagione: scegliamo il meglio del banco la mattina della partenza.</p>
            </div>

            <div className="blocco">
              <h3>Vuoi aggiungere qualcosa?</h3>
              <p className="aiutoblocco">Prodotti della bottega che viaggiano bene.</p>
              {extra.map((p) => (
                <div className="extrariga" key={p.id}>
                  <div className="minifig"><Art k={p.art} size={34} /></div>
                  <div><b>{p.nome}</b><small>{eur(prezzoDi(p))}</small></div>
                  <div className="stepper piccolo">
                    <button onClick={() => setAgg({ ...agg, [p.id]: Math.max(0, (agg[p.id] || 0) - 1) })} aria-label="Togli"><I.meno s={18} /></button>
                    <span>{agg[p.id] || 0}</span>
                    <button onClick={() => setAgg({ ...agg, [p.id]: (agg[p.id] || 0) + 1 })} aria-label="Aggiungi"><I.piu s={18} /></button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {passo === 2 && (
          <>
            <div className="blocco">
              <h3>Chi manda il pacco</h3>
              <Campo etichetta="Il tuo nome" errore={err.mnome}><input value={mitt.nome} onChange={(e) => setMitt({ ...mitt, nome: e.target.value })} placeholder="Maria Rossi" /></Campo>
              <Campo etichetta="Il tuo telefono" errore={err.mtel}><input value={mitt.tel} inputMode="tel" onChange={(e) => setMitt({ ...mitt, tel: e.target.value })} placeholder="333 123 4567" /></Campo>
              <Campo etichetta="Email (facoltativa)" aiuto="Ti mandiamo il codice di spedizione."><input value={mitt.email} inputMode="email" onChange={(e) => setMitt({ ...mitt, email: e.target.value })} placeholder="maria@email.it" /></Campo>
            </div>

            <div className="blocco">
              <h3>Chi riceve</h3>
              <Campo etichetta="Nome e cognome" errore={err.nome}><input value={dest.nome} onChange={(e) => setDest({ ...dest, nome: e.target.value })} placeholder="Giuseppe Rossi" /></Campo>
              <Campo etichetta="Telefono" aiuto="Il corriere lo chiama prima di consegnare." errore={err.tel}><input value={dest.tel} inputMode="tel" onChange={(e) => setDest({ ...dest, tel: e.target.value })} placeholder="347 765 4321" /></Campo>
              <div className="due">
                <Campo etichetta="Via" errore={err.via}><input value={dest.via} onChange={(e) => setDest({ ...dest, via: e.target.value })} placeholder="Via Torino" /></Campo>
                <Campo etichetta="Civico" errore={err.civico}><input value={dest.civico} onChange={(e) => setDest({ ...dest, civico: e.target.value })} placeholder="12" /></Campo>
              </div>
              <div className="due">
                <Campo etichetta="Città" errore={err.citta}><input value={dest.citta} onChange={(e) => setDest({ ...dest, citta: e.target.value })} placeholder="Milano" /></Campo>
                <Campo etichetta="CAP" errore={err.cap}><input value={dest.cap} inputMode="numeric" onChange={(e) => setDest({ ...dest, cap: e.target.value.replace(/\D/g, "").slice(0, 5) })} placeholder="20100" /></Campo>
              </div>
              <Campo etichetta="Indicazioni per il corriere"><input value={dest.note} onChange={(e) => setDest({ ...dest, note: e.target.value })} placeholder="Citofono Rossi, lasciare al vicino" /></Campo>
              {zona && <div className="cartella verde">Zona {zona.t}: consegna in {zona.giorni}, spedizione {costoSpedizione === 0 ? "gratis" : eur(zona.costo)}.</div>}
            </div>

            <div className="blocco">
              <h3>Biglietto con dedica</h3>
              <p className="aiutoblocco">Lo scriviamo a mano e lo mettiamo dentro al pacco.</p>
              <Campo etichetta="Il tuo messaggio">
                <textarea rows={3} maxLength={180} value={messaggio} onChange={(e) => setMessaggio(e.target.value)} placeholder="Buon compleanno papà, ti mando un pezzo di casa." />
              </Campo>
            </div>

            <div className="blocco">
              <h3>Pagamento</h3>
              <div className="scelte">
                {[{ id: "carta", t: "Carta", s: "Paghi adesso, il pacco parte domani." }, { id: "bonifico", t: "Bonifico", s: "Ti mandiamo l'IBAN, spediamo alla ricezione." }].map((o) => (
                  <button key={o.id} className={`scelta ${pagamento === o.id ? "on" : ""}`} onClick={() => setPagamento(o.id)}>
                    <span className="radio">{pagamento === o.id && <I.ok s={13} w={3} />}</span>
                    <span><b>{o.t}</b><small>{o.s}</small></span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="blocco">
          <h3>Totale</h3>
          <div className="rigariep"><span>{k.nome}</span><b>{eur(k.prezzo)}</b></div>
          {righeExtra.map((r) => <div className="rigariep" key={r.id}><span>{r.qta} × {r.nome}</span><b>{eur(r.totale)}</b></div>)}
          <div className="conto"><span>Spedizione{zona ? ` · ${zona.t}` : ""}</span><b>{costoSpedizione === 0 ? "Gratis" : eur(costoSpedizione)}</b></div>
          {parziale < SPEDIZIONE_GRATIS_DA && <div className="cartella">Con {eur(SPEDIZIONE_GRATIS_DA - parziale)} in più la spedizione è gratis.</div>}
          <div className="conto grosso"><span>Da pagare</span><span>{eur(totale)}</span></div>
        </div>
      </Scroll>

      <div className="fondoazione">
        {passo === 1
          ? <button className="btn verde largo" onClick={() => setPasso(2)}>Continua · {eur(totale)}</button>
          : (
            <>
              <button className="btn verde largo" onClick={conferma} disabled={invio}>{invio ? "Stiamo registrando…" : `Spedisci il pacco · ${eur(totale)}`}</button>
              <button className="btn chiaro largo" onClick={() => setPasso(1)}>Torna al contenuto</button>
            </>
          )}
      </div>
    </div>
  );
}

/* ------------------------------- COMMUNITY -------------------------------- */
function quandoPost(iso) {
  const g = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (g <= 0) return "oggi";
  if (g === 1) return "ieri";
  if (g < 7) return `${g} giorni fa`;
  const d = new Date(iso);
  return `${d.getDate()} ${MM[d.getMonth()]}`;
}

function CopertinaPost({ p, alta }) {
  const media = (p.media || []).filter((m) => m.src || m.poster);
  const [indice, setIndice] = useState(0);

  if (media.length) {
    const m = media[Math.min(indice, media.length - 1)];
    return (
      <div className="galleria">
        <div className={`copertina ${alta ? "alta" : ""}`}>
          {m.tipo === "video" ? (
            m.src
              ? <video src={m.src} poster={m.poster || undefined} controls playsInline preload="metadata" />
              : (
                <div className="videoscaduto">
                  {m.poster ? <img src={m.poster} alt="" /> : <Art k={p.art} size={70} />}
                  <span>Video non più disponibile{p.link ? ": guardalo dal link qui sotto" : ""}</span>
                </div>
              )
          ) : (
            <img src={m.src} alt="" onError={(e) => { e.target.style.display = "none"; }} />
          )}
        </div>
        {media.length > 1 && (
          <div className="miniature">
            {media.map((x, i) => (
              <button key={i} className={i === indice ? "on" : ""} onClick={() => setIndice(i)} aria-label={`Immagine ${i + 1}`}>
                <img src={x.poster || x.src} alt="" />
                {x.tipo === "video" && <span className="minivideo" />}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (p.link) {
    const video = /youtu|vimeo|\.mp4|tiktok|instagram/i.test(p.link);
    return (
      <div className={`copertina ${alta ? "alta" : ""}`}>
        {video ? (
          <a className="video" href={p.link} target="_blank" rel="noreferrer">
            <span className="play"><svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M8 5l12 7-12 7z" /></svg></span>
            <span>Guarda il video</span>
          </a>
        ) : (
          <img src={p.link} alt="" onError={(e) => { e.target.style.display = "none"; }} />
        )}
      </div>
    );
  }

  return <div className={`copertina disegno ${alta ? "alta" : ""}`}><Art k={p.art} size={alta ? 108 : 84} /></div>;
}

function SchermoCommunity() {
  const { posts, cuori, setCuori, catalogo, pop, aggiungi, dimmi, vaiTab } = useApp();
  const [filtro, setFiltro] = useState("tutto");
  const lista = posts
    .filter((p) => filtro === "tutto" || p.tipo === filtro)
    .slice()
    .sort((a, b) => (b.fissato ? 1 : 0) - (a.fissato ? 1 : 0) || new Date(b.creato) - new Date(a.creato));

  function cuore(id) {
    setCuori((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  }

  return (
    <div className="schermo">
      <header className="testata">
        <div className="testariga">
          <button className="tondino" onClick={pop} aria-label="Indietro"><I.chevron s={22} /></button>
          <div className="testatitolo sx">
            <b>La piazza</b>
            <span>Novità, avvisi e ricette dal banco</span>
          </div>
        </div>
        <div className="filtripost">
          <button className={filtro === "tutto" ? "on" : ""} onClick={() => setFiltro("tutto")}>Tutto</button>
          {TIPI_POST.map((t) => (
            <button key={t.id} className={filtro === t.id ? "on" : ""} onClick={() => setFiltro(t.id)}>{t.t}</button>
          ))}
        </div>
      </header>

      <Scroll>
        {lista.length === 0 && (
          <div className="vuoto alto"><Art k="misto" size={70} /><b>Ancora niente</b><span>Qui mettiamo le foto della merce appena arrivata, gli avvisi e le ricette di casa.</span></div>
        )}

        {lista.map((p) => {
          const tp = TIPI_POST.find((x) => x.id === p.tipo) || TIPI_POST[0];
          const prod = catalogo.find((x) => x.id === p.prodotto && x.attivo);
          const piace = cuori.includes(p.id);
          return (
            <article className="post" key={p.id}>
              <div className="posttesta">
                <span className="postavatar"><Logo mis="solo" soloEmblema /></span>
                <div>
                  <b>Sabetta ortofrutta</b>
                  <small>{quandoPost(p.creato)}{p.fissato ? " · in evidenza" : ""}</small>
                </div>
                <span className="posttipo" style={{ background: tp.c }}>{tp.t}</span>
              </div>

              <CopertinaPost p={p} alta />

              <h3 className="posttitolo">{p.titolo}</h3>
              <p className="posttesto">{p.testo}</p>

              {prod && (
                <div className="postprodotto">
                  <div className="minifig"><Art k={prod.art} size={34} /></div>
                  <div><b>{prod.nome}</b><small>{eur(prezzoDi(prod))} al {un(prod.unita).br}</small></div>
                  <button className="btn verde mini" onClick={() => { aggiungi(prod, passo(prod)); dimmi(`${prod.nome} nel carrello.`); }}>Aggiungi</button>
                </div>
              )}

              {p.link && (
                <a className="postlink" href={p.link} target="_blank" rel="noreferrer">
                  <I.avanti s={16} /> Apri il link
                </a>
              )}

              <div className="postfondo">
                <button className={`cuore ${piace ? "on" : ""}`} onClick={() => cuore(p.id)} aria-pressed={piace}>
                  <svg viewBox="0 0 24 24" width="19" height="19" fill={piace ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M12 20s-7-4.6-7-9.4C5 7.5 7.2 6 9.2 6c1.6 0 2.4.8 2.8 1.4.4-.6 1.2-1.4 2.8-1.4 2 0 4.2 1.5 4.2 4.6C19 15.4 12 20 12 20z" />
                  </svg>
                  {(p.cuori || 0) + (piace ? 1 : 0)}
                </button>
                <a className="chiedi" href={TEL_URL}>Chiedi al negozio</a>
              </div>
            </article>
          );
        })}

        <button className="bettabanner" onClick={() => vaiTab("home")}>
          <Art k="cassa" size={40} />
          <span><b>Vai al banco</b><small>Quello che vedi qui lo trovi tra i prodotti di oggi.</small></span>
          <I.avanti s={18} />
        </button>
      </Scroll>
    </div>
  );
}

/* ----------------------------- ACCESSO CLIENTE --------------------------- */
function SchermoAccesso() {
  const { pop, accedi, registra, dimmi, cliente } = useApp();
  const [modo, setModo] = useState(null);
  const [tel, setTel] = useState(cliente.tel || "");
  const [pin, setPin] = useState("");
  const [d, setD] = useState({ nome: cliente.nome || "", tel: cliente.tel || "", email: "", pin: "", consensoEmail: true, consensoSms: false });
  const [err, setErr] = useState({});

  function entra() {
    const r = accedi(tel, pin);
    if (!r.ok) { dimmi(r.msg); return; }
    dimmi(`Bentornato, ${r.u.nome.split(" ")[0]}.`);
    pop();
  }

  function crea() {
    const e = {};
    if (d.nome.trim().length < 2) e.nome = "Scrivi il tuo nome.";
    if (!/^[0-9+\s]{8,}$/.test(d.tel.trim())) e.tel = "Serve un numero di telefono.";
    if (d.email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(d.email.trim())) e.email = "Controlla l'email, oppure lasciala vuota.";
    if (d.pin.length !== 4) e.pin = "Scegli quattro numeri.";
    setErr(e);
    if (Object.keys(e).length) { dimmi("Manca qualcosa, guarda in rosso."); return; }
    const r = registra({ ...d, citta: CITTA_ZONA });
    if (!r.ok) { dimmi(r.msg); return; }
    dimmi(`Benvenuto ${r.u.nome.split(" ")[0]}, la tessera è attiva.`);
    pop();
  }

  return (
    <div className="schermo">
      <Testata titolo="La tessera di Sabetta" indietro={pop} />
      <Scroll>
        <div className="accessotesta">
          <Logo mis="grande" />
          <p>La tessera è gratis e serve solo per accumulare punti e ricevere le offerte. <b>Per ordinare non è obbligatoria.</b></p>
        </div>

        {modo === null && (
          <>
            <button className="sceltagrande" onClick={() => setModo("entra")}>
              <span className="sceltaico"><I.utente s={26} /></span>
              <span><b>Ho già la tessera</b><small>Entro con il mio numero di telefono</small></span>
              <I.avanti s={20} />
            </button>
            <button className="sceltagrande verde" onClick={() => setModo("nuovo")}>
              <span className="sceltaico"><I.piu s={26} w={2.4} /></span>
              <span><b>Voglio la tessera</b><small>Bastano nome, telefono e quattro numeri</small></span>
              <I.avanti s={20} />
            </button>
            <button className="sceltagrande piatta" onClick={pop}>
              <span className="sceltaico"><I.carrello s={24} /></span>
              <span><b>Continua senza tessera</b><small>Fai la spesa lo stesso, paghi e basta</small></span>
              <I.avanti s={20} />
            </button>
            <p className="minuta">Se hai già ordinato lasciando il tuo numero, il negozio ti riconosce lo stesso: la tessera serve solo a farti guadagnare punti.</p>
          </>
        )}

        {modo === "entra" && (
          <div className="blocco">
            <h3>Entra con il tuo numero</h3>
            <Campo etichetta="Numero di telefono"><input value={tel} inputMode="tel" onChange={(e) => setTel(e.target.value)} placeholder="333 123 4567" /></Campo>
            <Campo etichetta="I tuoi quattro numeri" aiuto="Quelli che hai scelto quando hai fatto la tessera.">
              <input value={pin} inputMode="numeric" type="password" onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" />
            </Campo>
            <button className="btn verde largo" onClick={entra}>Entra</button>
            <button className="btn chiaro largo" onClick={() => setModo(null)}>Torna indietro</button>
            <p className="minuta">Non li ricordi? Chiama il {TELEFONO}, te li reimposta il negozio in un minuto.</p>
          </div>
        )}

        {modo === "nuovo" && (
          <div className="blocco">
            <h3>Tre cose e hai finito</h3>
            <Campo etichetta="Come ti chiami" errore={err.nome}><input value={d.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} placeholder="Maria Rossi" /></Campo>
            <Campo etichetta="Il tuo telefono" aiuto="È anche il nome utente: non devi ricordare altro." errore={err.tel}>
              <input value={d.tel} inputMode="tel" onChange={(e) => setD({ ...d, tel: e.target.value })} placeholder="333 123 4567" />
            </Campo>
            <Campo etichetta="Scegli quattro numeri" aiuto="Ti servono per rientrare. Scegline quattro facili da ricordare." errore={err.pin}>
              <input value={d.pin} inputMode="numeric" type="password" onChange={(e) => setD({ ...d, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="••••" />
            </Campo>
            <Campo etichetta="Email (se vuoi)" aiuto="Solo per ricevere le offerte. Puoi lasciarla vuota." errore={err.email}>
              <input value={d.email} inputMode="email" onChange={(e) => setD({ ...d, email: e.target.value })} placeholder="maria@email.it" />
            </Campo>
            <label className="riga interruttore">
              <span><b>Mandatemi le offerte</b><small>Poche, solo quando c'è qualcosa di buono.</small></span>
              <Interruttore on={d.consensoEmail} onChange={(v) => setD({ ...d, consensoEmail: v })} etichetta="Offerte" />
            </label>
            <button className="btn verde largo" onClick={crea}>Attiva la tessera</button>
            <button className="btn chiaro largo" onClick={() => setModo(null)}>Torna indietro</button>
            <p className="minuta">L'indirizzo non serve adesso: te lo chiediamo al primo ordine. I dati restano nel gestionale del negozio.</p>
          </div>
        )}
      </Scroll>
    </div>
  );
}

/* ------------------------------ PUNTI FEDELTÀ ---------------------------- */
function SchermoPunti() {
  const { pop, utente, punti, livello, buoniDisponibili, ordini, vaiTab } = useApp();
  if (!utente) return <div className="schermo"><Testata titolo="Punti" indietro={pop} /></div>;
  const prossimo = LIVELLI.find((l) => l.da > punti);
  const inArrivo = ordini.filter((o) => o.utenteId === utente.id && o.stato !== "consegnato" && o.stato !== "annullato").reduce((a, o) => a + (o.puntiMaturati || 0), 0);

  return (
    <div className="schermo">
      <Testata titolo="La mia tessera" indietro={pop} />
      <Scroll>
        <div className="tessera" style={{ borderColor: livello.v }}>
          <div className="tesseratesta">
            <Logo mis="s" />
            <span className="livello" style={{ background: livello.v }}>{livello.corto}</span>
          </div>
          <b className="puntigrandi">{punti}</b>
          <span className="puntiet">punti disponibili</span>
          {inArrivo > 0 && <span className="puntiarrivo">+{inArrivo} in arrivo con gli ordini in corso</span>}
          <div className="tesserafondo">{utente.nome}</div>
        </div>

        <div className="blocco">
          <h3>Come si usano</h3>
          <p className="aiutoblocco">Ogni {PUNTI_BUONO} punti diventano {eur(VALORE_BUONO)} di sconto, da usare alla cassa.</p>
          <div className="conto"><span>Buoni pronti</span><b>{buoniDisponibili} × {eur(VALORE_BUONO)}</b></div>
          {prossimo && (
            <>
              <div className="conto"><span>Mancano a {prossimo.t}</span><b>{prossimo.da - punti} punti</b></div>
              <div className="barretta"><i style={{ width: `${Math.min(100, (punti / prossimo.da) * 100)}%`, background: livello.v }} /></div>
            </>
          )}
          <button className="btn verde largo" onClick={() => vaiTab("home")}>Fai la spesa</button>
        </div>

        <div className="blocco">
          <h3>I livelli</h3>
          {LIVELLI.map((l) => (
            <div className={`livelloriga ${l.id === livello.id ? "on" : ""}`} key={l.id}>
              <Pomodorino liv={l} size={24} />
              <div><b>{l.t}</b><small>{l.b}</small></div>
              <em>{l.da} punti</em>
            </div>
          ))}
        </div>

        <div className="blocco">
          <h3>Come si guadagnano</h3>
          <div className="conto"><span>Ogni euro di spesa</span><b>{PUNTI_PER_EURO} punto</b></div>
          <div className="conto"><span>Ogni ordine consegnato</span><b>+{PUNTI_PER_ORDINE} punti</b></div>
          <p className="aiutoblocco">I punti arrivano quando l'ordine è consegnato.</p>
        </div>
      </Scroll>
    </div>
  );
}

/* -------------------------------- PROFILO -------------------------------- */
function SchermoProfilo() {
  const { cliente, grande, setGrande, push, ordini, setOrdini, dimmi, preferiti, utente, punti, livello, esci, salvaUtente } = useApp();
  const ricorrenti = ordini.filter((o) => o.settimanale && o.stato !== "annullato");

  return (
    <div className="schermo">
      <Testata titolo="Profilo" />
      <Scroll>
        <div className="profilotesta">
          <div className="iniziale" style={utente ? { background: livello.v } : null}>{(utente ? utente.nome : cliente.nome || "?").trim().charAt(0).toUpperCase()}</div>
          <div>
            <b>{utente ? utente.nome : cliente.nome || "Ospite"}</b>
            <span>{utente ? `${livello.t} · ${punti} punti` : cliente.tel || "Nessuna tessera"}</span>
          </div>
        </div>

        {utente ? (
          <button className="voce fedelta" onClick={() => push("punti")}>
            <Pomodorino liv={livello} size={28} />
            <span><b>La mia tessera</b><small>{punti} punti · {Math.floor(punti / PUNTI_BUONO)} buoni da {eur(VALORE_BUONO)} pronti</small></span>
            <I.avanti s={18} />
          </button>
        ) : (
          <button className="invito" onClick={() => push("accesso")}>
            <Art k="pomodoro" size={44} />
            <span>
              <b>Attiva la tessera, è gratis</b>
              <small>Accumuli punti su ogni spesa e ricevi le offerte del negozio. Se ce l'hai già, entra da qui.</small>
            </span>
            <I.avanti s={18} />
          </button>
        )}

        <button className="voce" onClick={() => push("piazza")}>
          <I.chat s={20} /><span><b>La piazza</b><small>Novità, avvisi e ricette dal banco</small></span><I.avanti s={18} />
        </button>

        <button className="voce" onClick={() => push("indirizzo")}>
          <I.scatola s={20} /><span><b>Dati di consegna</b><small>{cliente.via ? `${cliente.via} ${cliente.civico}` : "Non ancora impostati"}</small></span><I.avanti s={18} />
        </button>

        <label className="voce">
          <I.matita s={20} />
          <span><b>Testo grande</b><small>Aumenta la dimensione delle scritte in tutta l'app</small></span>
          <Interruttore on={grande} onChange={setGrande} etichetta="Testo grande" />
        </label>

        <div className="blocco">
          <h3>Consegne che si ripetono</h3>
          {ricorrenti.length === 0
            ? <p className="aiutoblocco">Nessuna. Puoi attivarla alla cassa con «Ripeti ogni settimana».</p>
            : ricorrenti.map((o) => (
              <div className="dett" key={o.id}>
                <span>{o.id} · {o.subito ? "il prima possibile" : `ogni ${GG[new Date(`${o.giorno}T12:00:00`).getDay()]} ${o.fascia !== null ? fasciaTxt(o.fascia) : ""}`}</span>
                <button className="link rosso" onClick={() => { setOrdini((v) => v.map((x) => (x.id === o.id ? { ...x, settimanale: false } : x))); dimmi("Ripetizione annullata."); }}>Annulla</button>
              </div>
            ))}
        </div>

        <div className="blocco">
          <h3>Il negozio</h3>
          <div className="dett"><span>Indirizzo</span><b>{NEGOZIO}</b></div>
          <div className="dett"><span>Orari</span><b>Lunedì–sabato 8:00–20:00</b></div>
          <div className="dett"><span>Preferiti salvati</span><b>{preferiti.length}</b></div>
          <a className="btn chiaro largo" href={TEL_URL}><I.tel s={18} /> Chiama {TELEFONO}</a>
          <button className="btn chiaro largo" onClick={() => push("aiuto")}>Domande frequenti</button>
        </div>

        {utente && (
          <div className="blocco">
            <h3>Offerte e contatti</h3>
            <div className="dett"><span>Email</span><b>{utente.email || "non indicata"}</b></div>
            <label className="riga interruttore">
              <span><b>Offerte via email</b><small>{utente.email ? "Te le mandiamo a " + utente.email : "Aggiungi l'email alla cassa per riceverle"}</small></span>
              <Interruttore on={!!utente.consensoEmail} onChange={(v) => { salvaUtente({ id: utente.id, consensoEmail: v }); dimmi(v ? "Riceverai le offerte via email." : "Niente più email."); }} etichetta="Offerte via email" />
            </label>
            <label className="riga interruttore">
              <span><b>Offerte sul telefono</b><small>Un messaggio quando c'è il prezzo del giorno</small></span>
              <Interruttore on={!!utente.consensoSms} onChange={(v) => { salvaUtente({ id: utente.id, consensoSms: v }); dimmi(v ? "Riceverai i messaggi." : "Niente più messaggi."); }} etichetta="Offerte via SMS" />
            </label>
            <button className="btn chiaro largo" onClick={() => { esci(); dimmi("Sei uscito dalla tessera."); }}>Esci dalla tessera</button>
          </div>
        )}

        <button className="voce personale" onClick={() => push("pin")}>
          <I.banco s={20} /><span><b>Sono del negozio</b><small>Accesso per titolare, magazzino e consegne</small></span><I.avanti s={18} />
        </button>
        <p className="minuta">Sabetta in piazza · versione dimostrativa 2.0</p>
      </Scroll>
    </div>
  );
}

function SchermoIndirizzo() {
  const { cliente, setCliente, pop, dimmi } = useApp();
  const [d, setD] = useState(cliente);
  const set = (k, v) => setD({ ...d, [k]: v });
  return (
    <div className="schermo">
      <Testata titolo="Dati di consegna" indietro={pop} />
      <Scroll>
        <div className="blocco">
          <Campo etichetta="Nome e cognome"><input value={d.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Maria Rossi" /></Campo>
          <Campo etichetta="Telefono"><input value={d.tel} onChange={(e) => set("tel", e.target.value)} inputMode="tel" placeholder="333 123 4567" /></Campo>
          <div className="due">
            <Campo etichetta="Via o piazza"><input value={d.via} onChange={(e) => set("via", e.target.value)} placeholder="Via Ferrante Fornari" /></Campo>
            <Campo etichetta="Civico"><input value={d.civico} onChange={(e) => set("civico", e.target.value)} placeholder="24" /></Campo>
          </div>
          <div className="due">
            <Campo etichetta="Città"><input value={d.citta} onChange={(e) => set("citta", e.target.value)} placeholder={CITTA_ZONA} /></Campo>
            <Campo etichetta="CAP" aiuto={`Consegniamo nel ${CAP_ZONA}`}>
              <input value={d.cap} inputMode="numeric" onChange={(e) => set("cap", e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder={CAP_ZONA} />
            </Campo>
          </div>
          <Campo etichetta="Citofono, scala o piano"><input value={d.citofono} onChange={(e) => set("citofono", e.target.value)} placeholder="Citofono Rossi" /></Campo>
        </div>

        {(d.cap || d.citta) && !zonaOk(d) && (
          <div className="banda rossa">
            <I.scatola s={22} />
            <div>
              <b>Indirizzo fuori zona</b>
              <span>La consegna a domicilio copre solo {CITTA_ZONA} ({CAP_ZONA}). Puoi salvare lo stesso i dati e ritirare la spesa in negozio.</span>
            </div>
          </div>
        )}
        {zonaOk(d) && <div className="cartella verde">Indirizzo dentro la zona di consegna. Perfetto.</div>}
      </Scroll>
      <div className="fondoazione">
        <button className="btn verde largo" onClick={() => { setCliente(d); dimmi("Dati salvati."); pop(); }}>Salva i dati</button>
      </div>
    </div>
  );
}

function SchermoAiuto() {
  const { pop, vaiTab } = useApp();
  const voci = [
    ["Quanto costa la consegna?", `${eur(COSTO_CONSEGNA)}, gratis sopra ${eur(CONSEGNA_GRATIS_DA)}. Il ritiro in negozio non costa nulla.`],
    ["C'è un ordine minimo?", `Sì, ${eur(MIN_ORDINE)} di spesa.`],
    ["Fino a che ora consegnate?", "Tutti i giorni fino alle 20:00, a fasce di un'ora. Domenica chiuso."],
    ["Posso prenotare per un altro giorno?", "Sì, fino a sette giorni prima. Puoi anche ripetere lo stesso ordine ogni settimana."],
    ["Come pago?", "Contanti alla consegna, bancomat o carta al fattorino, oppure carta in app."],
    ["E se un prodotto è finito?", "Scegli tu alla cassa: sostituzione, telefonata prima, oppure lo togliamo e non lo paghi."],
    ["Come funziona il peso?", "Pesiamo al banco e il totale si aggiorna sul peso reale prima della consegna."],
  ];
  return (
    <div className="schermo">
      <Testata titolo="Domande frequenti" indietro={pop} />
      <Scroll>
        {voci.map(([d, r]) => (
          <div className="faq" key={d}><b>{d}</b><p>{r}</p></div>
        ))}
        <button className="bettabanner" onClick={() => vaiTab("betta")}>
          <Betta size={42} fluttua={false} /><span><b>Non hai trovato la risposta?</b><small>Chiedi a Betta, oppure chiama il negozio.</small></span><I.avanti s={18} />
        </button>
        <a className="btn verde largo" href={TEL_URL}><I.tel s={18} /> Chiama {TELEFONO}</a>
      </Scroll>
    </div>
  );
}

/* ================================= NEGOZIO ================================ */
function SchermoPin() {
  const { pop, setModo, setSbloccato, dimmi, operatori, setOperatore, setTabA } = useApp();
  const [pin, setPin] = useState("");
  const [male, setMale] = useState(false);

  function digita(n) {
    if (pin.length >= 4) return;
    const nuovo = pin + n;
    setPin(nuovo);
    if (nuovo.length === 4) {
      setTimeout(() => {
        const op = operatori.find((o) => o.pin === nuovo && o.attivo);
        if (op) {
          setOperatore(op);
          setSbloccato(true);
          setTabA(RUOLI[op.ruolo].tabs[0]);
          setModo("negozio");
          pop();
          dimmi(`Ciao ${op.nome} · ${RUOLI[op.ruolo].t}`);
        } else {
          setMale(true); setPin(""); setTimeout(() => setMale(false), 600); dimmi("Codice non riconosciuto.");
        }
      }, 180);
    }
  }

  return (
    <div className="schermo scuro">
      <Testata titolo="Area negozio" indietro={pop} />
      <div className="pinbox">
        <Logo mis="grande" scuro />
        <b>Accesso del personale</b>
        <span className="minuta chiara">Solo per chi lavora al banco. Se sei un cliente, torna indietro: per ordinare non serve nessun codice.</span>
        <div className={`pallini ${male ? "male" : ""}`}>
          {[0, 1, 2, 3].map((i) => <i key={i} className={pin.length > i ? "on" : ""} />)}
        </div>
        <span className="minuta chiara">Dimostrazione · Sabetta 1234 · Magazzino 2222 · Consegne 3333</span>
        <div className="tastiera">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <button key={n} onClick={() => digita(String(n))}>{n}</button>)}
          <span />
          <button onClick={() => digita("0")}>0</button>
          <button className="canc" onClick={() => setPin(pin.slice(0, -1))} aria-label="Cancella">←</button>
        </div>
      </div>
    </div>
  );
}

const TAB_NEGOZIO = {
  giro: { t: "Giro", icona: "consegna" },
  ordini: { t: "Ordini", icona: "ordini" },
  merce: { t: "Merce", icona: "scatola" },
  clienti: { t: "Clienti", icona: "utente" },
  sconti: { t: "Sconti", icona: "buono" },
  altro: { t: "Altro", icona: "menu" },
};

function AppNegozio() {
  const { tabA, setTabA, stackA, setStackA, ordini, operatore } = useApp();
  const cima = stackA[stackA.length - 1];
  const ruolo = RUOLI[operatore ? operatore.ruolo : "admin"];
  const daFare = ordini.filter((o) => o.stato === "nuovo").length;
  const daPortare = ordini.filter((o) => o.stato === "consegna" || o.stato === "preparazione").length;
  const vai = (t) => { setStackA([]); setTabA(t); };
  const attiva = ruolo.tabs.includes(tabA) ? tabA : ruolo.tabs[0];

  const icone = { consegna: I.carrello, ordini: I.ordini, scatola: I.scatola, utente: I.utente, buono: I.buono, menu: I.grafico };

  return (
    <div className="app negozio">
      <div className="pagine">
        {!cima && attiva === "giro" && <NegGiro />}
        {!cima && attiva === "ordini" && <NegOrdini />}
        {!cima && attiva === "merce" && <NegMerce />}
        {!cima && attiva === "clienti" && <NegClienti />}
        {!cima && attiva === "sconti" && <NegSconti />}
        {!cima && attiva === "altro" && <NegAltro />}
        {cima && (
          <div className="spinta" key={stackA.length}>
            {cima.s === "ordine" && <NegOrdine id={cima.p} />}
            {cima.s === "consegne" && <NegConsegne />}
            {cima.s === "conti" && <NegConti />}
            {cima.s === "squadra" && <NegSquadra />}
            {cima.s === "cliente" && <NegCliente id={cima.p} />}
            {cima.s === "community" && <NegCommunity />}
          </div>
        )}
      </div>
      <nav className="tabbar">
        {ruolo.tabs.map((t) => (
          <Tab key={t} id={t} t={TAB_NEGOZIO[t].t} icona={icone[TAB_NEGOZIO[t].icona]} attivo={attiva} vai={vai}
            badge={t === "ordini" ? daFare : t === "giro" ? daPortare : 0} />
        ))}
      </nav>
    </div>
  );
}

function TestataNegozio({ titolo, sotto, azione, indietro }) {
  const { setModo, freeze } = useApp();
  return (
    <header className="testata negozio">
      <div className="testariga">
        {indietro && <button className="tondino" onClick={indietro} aria-label="Indietro"><I.chevron s={22} /></button>}
        <div className="testatitolo sx">
          <b>{titolo}</b>
          <span>{sotto}</span>
        </div>
        {azione}
        <button className="tondino" onClick={() => setModo("cliente")} aria-label="Torna alla vista cliente"><I.utente s={20} /></button>
      </div>
      {freeze.attivo && <div className="strisciagelo"><I.neve s={16} /> Banco in aggiornamento — i clienti non possono ordinare</div>}
    </header>
  );
}

function NegOrdini() {
  const { ordini, pushA, statoOrdine } = useApp();
  const [f, setF] = useState("nuovo");
  const oggi = dkey(new Date());
  const filtri = [
    { id: "nuovo", t: "Nuovi" }, { id: "preparazione", t: "In preparazione" },
    { id: "consegna", t: "In consegna" }, { id: "pacchi", t: "Pacchi" }, { id: "oggi", t: "Oggi" }, { id: "tutti", t: "Tutti" },
  ];
  const lista = ordini.filter((o) => {
    if (f === "tutti") return true;
    if (f === "pacchi") return !!o.spedizione;
    if (f === "oggi") return o.giorno === oggi;
    return o.stato === f;
  });
  const incasso = ordini.filter((o) => o.giorno === oggi && o.stato !== "annullato").reduce((s, o) => s + o.totale, 0);

  return (
    <div className="schermo">
      <TestataNegozio titolo="Coda ordini" sotto={`${ordini.filter((o) => o.giorno === oggi && o.stato !== "annullato").length} oggi · ${eur(incasso)}`} />
      <div className="filtri">
        {filtri.map((x) => <button key={x.id} className={`chip ${f === x.id ? "on" : ""}`} onClick={() => setF(x.id)}>{x.t}</button>)}
      </div>
      <Scroll>
        {lista.length === 0 && (
          <div className="vuoto alto"><Art k="misto" size={72} /><b>Nessun ordine in questa lista</b><span>Gli ordini dei clienti compaiono qui appena arrivano.</span></div>
        )}
        {lista.map((o) => (
          <div className="ordcard" key={o.id}>
            <button className="ordtesta" onClick={() => pushA("ordine", o.id)}>
              <div>
                <b>{o.id} · {o.spedizione ? o.destinatario.nome : o.cliente.nome}</b>
                <span>
                  {o.spedizione
                    ? `Pacco da giù · ${o.destinatario.citta} ${o.destinatario.cap}`
                    : `${quandoTxt(o)} · ${o.ritiro ? "ritiro" : "consegna"}`}
                </span>
              </div>
              <Etichetta stato={o.stato} />
            </button>
            <div className="ordriep">
              {o.righe.slice(0, 3).map((r) => <span key={r.id}>{qtaTxt(r.unita, r.qta)} {r.nome}</span>)}
              {o.righe.length > 3 && <span>+{o.righe.length - 3} altri</span>}
            </div>
            <div className="ordfondo">
              <b>{eur(o.totale)}</b>
              <div className="azioni">
                {o.stato === "nuovo" && <button className="btn verde mini" onClick={() => statoOrdine(o.id, "preparazione")}>Prepara</button>}
                {o.stato === "preparazione" && <button className="btn verde mini" onClick={() => statoOrdine(o.id, "consegna")}>In consegna</button>}
                {o.stato === "consegna" && <button className="btn verde mini" onClick={() => statoOrdine(o.id, "consegnato")}>Consegnato</button>}
                <button className="btn chiaro mini" onClick={() => pushA("ordine", o.id)}>Apri</button>
              </div>
            </div>
          </div>
        ))}
      </Scroll>
    </div>
  );
}

function NegOrdine({ id }) {
  const { ordini, setOrdini, popA, statoOrdine, pesa, dimmi, operatore } = useApp();
  const o = ordini.find((x) => x.id === id);
  const ruolo = RUOLI[operatore ? operatore.ruolo : "admin"];
  const [pesi, setPesi] = useState({});
  const [foglio, setFoglio] = useState(false);
  const [trk, setTrk] = useState(o && o.tracking ? o.tracking : "");
  if (!o) return <div className="schermo"><Testata titolo="Ordine" indietro={popA} /></div>;
  const kg = o.righe.filter((r) => r.unita === "kg");

  return (
    <div className="schermo">
      <Testata titolo={o.id} sotto={o.cliente.nome} indietro={popA} destra={<a className="tondino" href={`tel:${solaCifre(o.spedizione ? o.destinatario.tel : o.cliente.tel)}`} aria-label="Chiama il cliente"><I.tel s={20} /></a>} />
      <Scroll>
        {o.spedizione && (
          <div className="blocco">
            <h3>Pacco da spedire</h3>
            <div className="dett"><span>Destinatario</span><b>{o.destinatario.nome}</b></div>
            <div className="dett"><span>Indirizzo</span><b>{o.destinatario.via} {o.destinatario.civico}, {o.destinatario.citta} {o.destinatario.cap}</b></div>
            <div className="dett"><span>Telefono</span><b>{o.destinatario.tel}</b></div>
            <div className="dett"><span>Zona</span><b>{(ZONE_SPEDIZIONE.find((z) => z.id === o.zona) || {}).t || "-"}</b></div>
            {o.destinatario.note && <div className="cartella">{o.destinatario.note}</div>}
            {o.messaggio && <div className="cartella giallo">Biglietto: {o.messaggio}</div>}
            <Campo etichetta="Codice di spedizione" aiuto="Lo vede il cliente nell'app.">
              <input value={trk} onChange={(e) => setTrk(e.target.value)} placeholder="Es. BRT123456789" />
            </Campo>
            <button className="btn verde largo" onClick={() => { setOrdini((v) => v.map((x) => (x.id === o.id ? { ...x, tracking: trk } : x))); dimmi("Codice di spedizione salvato."); }}>
              Salva il codice
            </button>
          </div>
        )}

        <div className="blocco">
          <div className="dett"><span>Quando</span><b>{quandoTxt(o)}</b></div>
          {ruolo.clienti || ruolo.soldi ? (
            <>
              <div className="dett"><span>{o.ritiro ? "Ritiro" : "Indirizzo"}</span><b>{o.ritiro ? "In negozio" : `${o.cliente.via} ${o.cliente.civico}${o.cliente.citofono ? `, ${o.cliente.citofono}` : ""}`}</b></div>
              <div className="dett"><span>Telefono</span><b>{o.cliente.tel}</b></div>
            </>
          ) : (
            <div className="dett"><span>Cliente</span><b>{o.cliente.nome}</b></div>
          )}
          <div className="dett"><span>Pagamento</span><b>{o.pagamento === "contanti" ? "Contanti" : o.pagamento === "pos" ? "POS" : "Già pagato"}</b></div>
          <div className="dett"><span>Se manca</span><b>{(SOSTITUZIONI.find((s) => s.id === o.sostituzione) || {}).t}</b></div>
          {o.settimanale && <div className="dett"><span>Ripetizione</span><b>Ogni settimana</b></div>}
          {o.cliente.note && <div className="cartella giallo">Nota del cliente: {o.cliente.note}</div>}
        </div>

        <div className="blocco">
          <h3>Merce da preparare</h3>
          {o.righe.map((r) => (
            <div className="rigariep" key={r.id}>
              <span>{qtaTxt(r.unita, r.qta)} · {r.nome}{r.pref ? ` · ${r.pref}` : ""}{r.sconto ? ` · offerta −${r.sconto}%` : ""}</span>
              <b>{eur(r.totale)}</b>
            </div>
          ))}
          {(o.sconto > 0 || o.coupon) && (
            <div className="conto verde"><span>Codice {o.coupon ? o.coupon.codice : "sconto"}</span><b>{o.sconto > 0 ? `−${eur(o.sconto)}` : "Consegna gratis"}</b></div>
          )}
          <div className="conto"><span>{o.ritiro ? "Ritiro" : "Consegna"}</span><b>{o.consegna === 0 ? "Gratis" : eur(o.consegna)}</b></div>
          <div className="conto grosso"><span>Totale</span><span>{eur(o.totale)}</span></div>
        </div>

        {kg.length > 0 && ruolo.merce && (
          <div className="blocco">
            <h3><I.bilancia s={18} /> Pesata al banco</h3>
            <p className="aiutoblocco">Scrivi il peso reale: il totale si aggiorna e il cliente lo vede nell'app.</p>
            {kg.map((r) => (
              <div className="pesariga" key={r.id}>
                <span>{r.nome}<small>chiesti {num(r.qta)} kg</small></span>
                <input inputMode="decimal" placeholder={num(r.qta)} value={pesi[r.id] === undefined ? "" : pesi[r.id]}
                  onChange={(e) => setPesi({ ...pesi, [r.id]: e.target.value.replace(/[^\d,.]/g, "") })} />
                <em>kg</em>
              </div>
            ))}
            <button className="btn giallo largo" onClick={() => { pesa(o.id, pesi); setPesi({}); dimmi("Totale aggiornato al peso reale."); }}>
              Conferma la pesata
            </button>
          </div>
        )}

        <div className="blocco">
          <h3>Avanzamento</h3>
          <div className="azionifila">
            {o.stato === "nuovo" && <button className="btn verde largo" onClick={() => statoOrdine(o.id, "preparazione")}>Inizia a preparare</button>}
            {o.stato === "preparazione" && <button className="btn verde largo" onClick={() => statoOrdine(o.id, "consegna")}>Parte per la consegna</button>}
            {o.stato === "consegna" && <button className="btn verde largo" onClick={() => statoOrdine(o.id, "consegnato")}>Segna come consegnato</button>}
            {o.stato === "consegnato" && <div className="cartella verde">Ordine consegnato. Niente altro da fare.</div>}
            <button className="btn chiaro largo" onClick={() => setFoglio(true)}>Foglio di consegna</button>
            {o.stato !== "consegnato" && o.stato !== "annullato" && (
              <button className="btn rossoP largo" onClick={() => { statoOrdine(o.id, "annullato"); dimmi("Ordine annullato."); }}>Annulla ordine</button>
            )}
          </div>
        </div>
      </Scroll>

      <Foglio aperto={foglio} chiudi={() => setFoglio(false)} titolo="Foglio di consegna">
        <div className="scontrino">
          <b>Sabetta in piazza</b>
          <span>{o.id} · {quandoTxt(o)}</span>
          <hr />
          <b>{o.cliente.nome}</b>
          <span>{o.ritiro ? "Ritiro in negozio" : `${o.cliente.via} ${o.cliente.civico}`}</span>
          <span>{o.cliente.citofono}</span>
          <span>{o.cliente.tel}</span>
          <hr />
          {o.righe.map((r) => (
            <div className="sriga" key={r.id}><span>{qtaTxt(r.unita, r.qta)} {r.nome}</span><span>{eur(r.totale)}</span></div>
          ))}
          <hr />
          {o.sconto > 0 && <div className="sriga"><span>Codice {o.coupon ? o.coupon.codice : "sconto"}</span><span>−{eur(o.sconto)}</span></div>}
          <div className="sriga"><span>{o.ritiro ? "Ritiro" : "Consegna"}</span><span>{o.consegna === 0 ? "gratis" : eur(o.consegna)}</span></div>
          <div className="sriga grande"><span>Da incassare</span><span>{o.pagamento === "carta" ? "già pagato" : eur(o.totale)}</span></div>
          {o.cliente.note && <div className="cartella giallo">{o.cliente.note}</div>}
        </div>
      </Foglio>
    </div>
  );
}

/* ------------------------------- GIRO CONSEGNE --------------------------- */
function NegGiro() {
  const { ordini, statoOrdine, pushA, dimmi } = useApp();
  const oggi = dkey(new Date());
  const [giorno, setGiorno] = useState(oggi);
  const giorni = giorniUtili(3);
  const miei = ordini.filter((o) => o.giorno === giorno && !o.spedizione && !o.ritiro && ["preparazione", "consegna", "consegnato"].includes(o.stato));
  const perFascia = {};
  miei.forEach((o) => { const k = o.subito ? "subito" : String(o.fascia); (perFascia[k] = perFascia[k] || []).push(o); });
  const chiavi = Object.keys(perFascia).sort((a, b) => (a === "subito" ? -1 : Number(a) - Number(b)));
  const daPortare = miei.filter((o) => o.stato !== "consegnato");
  const incasso = daPortare.filter((o) => o.pagamento !== "carta").reduce((a, o) => a + o.totale, 0);

  return (
    <div className="schermo">
      <TestataNegozio titolo="Il giro di oggi" sotto={`${daPortare.length} consegne · ${eur(incasso)} da incassare`} />
      <div className="filtri">
        {giorni.map((g) => (
          <button key={g.key} className={`chip ${giorno === g.key ? "on" : ""}`} onClick={() => setGiorno(g.key)}>{g.titolo} {g.sotto}</button>
        ))}
      </div>
      <Scroll>
        {miei.length === 0 && <div className="vuoto alto"><Art k="cassa" size={70} /><b>Nessuna consegna</b><span>Per questo giorno non ci sono ordini da portare.</span></div>}
        {chiavi.map((k) => (
          <div key={k}>
            <h3 className="titoletto">{k === "subito" ? "Il prima possibile" : fasciaTxt(Number(k))}</h3>
            {perFascia[k].map((o) => (
              <div className={`tappa2 ${o.stato === "consegnato" ? "fatta" : ""}`} key={o.id}>
                <div className="tappatesta">
                  <div>
                    <b>{o.cliente.nome}</b>
                    <small>{o.cliente.via} {o.cliente.civico}{o.cliente.citofono ? ` · ${o.cliente.citofono}` : ""}</small>
                  </div>
                  <Etichetta stato={o.stato} />
                </div>
                <div className="tapparighe">{o.righe.length} colli · {o.pagamento === "carta" ? "già pagato" : `${eur(o.totale)} da incassare`}</div>
                {o.cliente.note && <div className="cartella giallo">{o.cliente.note}</div>}
                <div className="azioni">
                  <a className="btn chiaro mini" href={`tel:${solaCifre(o.cliente.tel)}`}><I.tel s={16} /> Chiama</a>
                  <a className="btn chiaro mini" href={`https://maps.google.com/?q=${encodeURIComponent(`${o.cliente.via} ${o.cliente.civico} ${o.cliente.citta || CITTA_ZONA}`)}`} target="_blank" rel="noreferrer">Naviga</a>
                  <button className="btn chiaro mini" onClick={() => pushA("ordine", o.id)}>Dettagli</button>
                  {o.stato !== "consegnato" && (
                    <button className="btn verde mini" onClick={() => { statoOrdine(o.id, "consegnato"); dimmi(`${o.id} consegnato.`); }}>Consegnato</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </Scroll>
    </div>
  );
}

/* --------------------------------- CLIENTI ------------------------------- */
const SEGMENTI = [
  { id: "tutti", t: "Tutti" },
  { id: "fedeli", t: "Fedelissimi" },
  { id: "nuovi", t: "Nuovi" },
  { id: "dormienti", t: "Da riattivare" },
  { id: "alto", t: "Scontrino alto" },
  { id: "email", t: "Con email" },
];

function segmentoDi(u, ordiniU) {
  const gg = u.ultimo ? (Date.now() - new Date(u.ultimo).getTime()) / 86400000 : 999;
  const medio = ordiniU.length ? u.speso / ordiniU.length : 0;
  return {
    fedeli: (u.ordini || 0) >= 3,
    nuovi: (u.ordini || 0) <= 1,
    dormienti: gg > 21 && (u.ordini || 0) > 0,
    alto: medio >= 25,
    email: !!u.email,
    medio,
    gg,
  };
}

function NegClienti() {
  const { utenti, ordini, pushA, coupons, setCoupons, dimmi } = useApp();
  const [seg, setSeg] = useState("tutti");
  const [q, setQ] = useState("");

  const arricchiti = utenti.map((u) => {
    const suoi = ordini.filter((o) => o.utenteId === u.id && o.stato !== "annullato");
    return { u, suoi, seg: segmentoDi(u, suoi) };
  });
  const lista = arricchiti.filter((x) => {
    if (q && !(`${x.u.nome} ${x.u.tel} ${x.u.email}`.toLowerCase().includes(q.toLowerCase()))) return false;
    if (seg === "tutti") return true;
    return x.seg[seg];
  });
  const conEmail = lista.filter((x) => x.u.email && x.u.consensoEmail);

  function campagna() {
    if (!conEmail.length) { dimmi("In questo gruppo nessuno ha email e consenso."); return; }
    const cod = `${seg.toUpperCase()}${new Date().getDate()}`;
    if (!coupons.find((c) => c.codice === cod)) {
      setCoupons((v) => [{ codice: cod, tipo: "percento", valore: 10, minimo: 10, scadenza: "", maxUsi: conEmail.length * 2, usi: 0, attivo: true, nota: `Campagna ${seg}` }, ...v]);
    }
    const bcc = conEmail.map((x) => x.u.email).join(",");
    const sog = encodeURIComponent("Le offerte di Sabetta ortofrutta");
    const corpo = encodeURIComponent(`Buongiorno,\n\nquesta settimana al banco abbiamo frutta e verdura appena arrivata dal mercato.\nPer lei un codice sconto del 10% da usare in app: ${cod}\n\nOrdine minimo 10 euro. Consegniamo a ${CITTA_ZONA} tutti i giorni fino alle 20.\n\nSabetta ortofrutta\n${NEGOZIO}\n${TELEFONO}`);
    if (typeof window !== "undefined") window.location.href = `mailto:?bcc=${bcc}&subject=${sog}&body=${corpo}`;
    dimmi(`Codice ${cod} creato per ${conEmail.length} clienti.`);
  }

  return (
    <div className="schermo">
      <TestataNegozio titolo="Clienti" sotto={`${utenti.length} schede · ${utenti.filter((u) => u.email).length} con email`} />
      <div className="filtri">
        {SEGMENTI.map((x) => <button key={x.id} className={`chip ${seg === x.id ? "on" : ""}`} onClick={() => setSeg(x.id)}>{x.t}</button>)}
      </div>
      <Scroll>
        <div className="cerca scuro">
          <I.cerca s={20} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per nome o telefono" aria-label="Cerca cliente" />
          {q && <button className="tondino piccolo" onClick={() => setQ("")} aria-label="Cancella"><I.x s={16} /></button>}
        </div>

        {seg !== "tutti" && (
          <button className="aggiungimerce" onClick={campagna}>
            <span className="piutondo"><I.buono s={20} /></span>
            <span>
              <b>Manda l'offerta a questo gruppo</b>
              <small>{conEmail.length} clienti con email e consenso · creiamo un codice dedicato</small>
            </span>
            <I.avanti s={18} />
          </button>
        )}

        {lista.length === 0 && <div className="vuoto alto"><b>Nessun cliente</b><span>Le schede si creano da sole con il primo ordine, anche senza registrazione.</span></div>}

        {lista.map(({ u, suoi, seg: sg }) => {
          const liv = livelloDi(u.punti);
          return (
            <button className="clientecard" key={u.id} onClick={() => pushA("cliente", u.id)}>
              <span className="clienteiniz" style={{ background: liv.v }}>{u.nome.charAt(0).toUpperCase()}</span>
              <span className="clientecorpo">
                <b>{u.nome}</b>
                <small>{u.tel}{u.email ? ` · ${u.email}` : ""}</small>
                <span className="clientefatti">
                  <em>{suoi.length} ordini</em>
                  <em>{eur(u.speso || 0)}</em>
                  <em>{u.punti || 0} punti</em>
                  {sg.dormienti && <em className="rossa">da riattivare</em>}
                  {u.ospite && <em>senza tessera</em>}
                </span>
              </span>
              <I.avanti s={18} />
            </button>
          );
        })}
      </Scroll>
    </div>
  );
}

function NegCliente({ id }) {
  const { utenti, ordini, popA, salvaUtente, coupons, setCoupons, dimmi } = useApp();
  const u = utenti.find((x) => x.id === id);
  const [nota, setNota] = useState(u ? u.note || "" : "");
  if (!u) return <div className="schermo"><Testata titolo="Cliente" indietro={popA} /></div>;
  const suoi = ordini.filter((o) => o.utenteId === u.id && o.stato !== "annullato");
  const liv = livelloDi(u.punti);
  const medio = suoi.length ? u.speso / suoi.length : 0;
  const preferiti = {};
  suoi.forEach((o) => o.righe.forEach((r) => { preferiti[r.nome] = (preferiti[r.nome] || 0) + r.qta; }));
  const top = Object.keys(preferiti).sort((a, b) => preferiti[b] - preferiti[a]).slice(0, 3);

  function codicePersonale() {
    const base = u.nome.split(" ")[0].toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8) || "CLIENTE";
    let cod = base;
    let i = 1;
    while (coupons.find((c) => c.codice === cod)) { cod = `${base}${i}`; i += 1; }
    setCoupons((v) => [{ codice: cod, tipo: "percento", valore: 10, minimo: 10, scadenza: "", maxUsi: 1, usi: 0, attivo: true, nota: `Personale di ${u.nome}` }, ...v]);
    dimmi(`Codice ${cod} creato per ${u.nome}.`);
    return cod;
  }

  function scriviEmail() {
    if (!u.email) { dimmi("Questo cliente non ha lasciato l'email."); return; }
    const cod = codicePersonale();
    const sog = encodeURIComponent("Un pensiero da Sabetta ortofrutta");
    const corpo = encodeURIComponent(`Gentile ${u.nome},\n\ngrazie per gli ordini di questo periodo.\nLe lasciamo un codice del 10% solo per lei: ${cod}\n\nA presto,\nSabetta ortofrutta\n${TELEFONO}`);
    if (typeof window !== "undefined") window.location.href = `mailto:${u.email}?subject=${sog}&body=${corpo}`;
  }

  function scriviSms() {
    const cod = codicePersonale();
    const testo = encodeURIComponent(`Sabetta ortofrutta: ${u.nome.split(" ")[0]}, per lei il codice ${cod} con il 10% di sconto in app. A presto!`);
    if (typeof window !== "undefined") window.location.href = `sms:${solaCifre(u.tel)}?&body=${testo}`;
  }

  return (
    <div className="schermo">
      <Testata titolo={u.nome} sotto={`Tessera ${liv.t}`} indietro={popA}
        destra={<a className="tondino" href={`tel:${solaCifre(u.tel)}`} aria-label="Chiama"><I.tel s={20} /></a>} />
      <Scroll>
        <div className="kpi">
          <div><span>Ordini</span><b>{suoi.length}</b></div>
          <div><span>Speso</span><b>{eur(u.speso || 0)}</b></div>
          <div><span>Scontrino medio</span><b>{eur(medio)}</b></div>
          <div><span>Punti</span><b>{u.punti || 0}</b></div>
        </div>

        <div className="blocco">
          <h3>Contatti e consensi</h3>
          <div className="dett"><span>Telefono</span><b>{u.tel}</b></div>
          <div className="dett"><span>Email</span><b>{u.email || "non indicata"}</b></div>
          <div className="dett"><span>Indirizzo</span><b>{u.via ? `${u.via} ${u.civico}, ${u.citta} ${u.cap}` : "non indicato"}</b></div>
          <div className="dett"><span>Offerte email</span><b>{u.consensoEmail ? "sì" : "no"}</b></div>
          <div className="dett"><span>Offerte SMS</span><b>{u.consensoSms ? "sì" : "no"}</b></div>
          <div className="dett"><span>Tessera</span><b>{u.ospite ? "solo scheda negozio" : "registrato in app"}</b></div>
        </div>

        <div className="blocco">
          <h3>Manda un'offerta</h3>
          <p className="aiutoblocco">Creiamo un codice usabile una sola volta, intestato a questo cliente.</p>
          <div className="azionifila">
            <button className="btn giallo largo" onClick={scriviEmail} disabled={!u.email || !u.consensoEmail}>Email con codice personale</button>
            <button className="btn chiaro largo" onClick={scriviSms} disabled={!u.consensoSms}>Messaggio con codice personale</button>
            <a className="btn chiaro largo" href={`https://wa.me/39${solaCifre(u.tel)}`} target="_blank" rel="noreferrer">Scrivi su WhatsApp</a>
          </div>
          {!u.consensoEmail && <p className="minuta">Il cliente non ha dato il consenso alle email: usa il telefono.</p>}
        </div>

        {top.length > 0 && (
          <div className="blocco">
            <h3>Compra spesso</h3>
            {top.map((t) => <div className="dett" key={t}><span>{t}</span><b>{num(preferiti[t])}</b></div>)}
          </div>
        )}

        <div className="blocco">
          <h3>Nota del negozio</h3>
          <Campo etichetta="Promemoria" aiuto="La vede solo chi lavora al banco.">
            <textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Preferisce la frutta poco matura, cita sempre il nipote." />
          </Campo>
          <button className="btn verde largo" onClick={() => { salvaUtente({ id: u.id, note: nota }); dimmi("Nota salvata."); }}>Salva la nota</button>
        </div>

        <div className="blocco">
          <h3>Ultimi ordini</h3>
          {suoi.length === 0 ? <p className="aiutoblocco">Ancora nessun ordine.</p> : suoi.slice(0, 5).map((o) => (
            <div className="dett" key={o.id}><span>{o.id} · {giornoTxt(o.giorno)}</span><b>{eur(o.totale)}</b></div>
          ))}
        </div>
      </Scroll>
    </div>
  );
}

/* --------------------------- ALTRO E SQUADRA ----------------------------- */
function NegAltro() {
  const { operatore, setOperatore, setModo, setSbloccato, pushA, dimmi, bancoAperto, setBancoAperto } = useApp();
  const ruolo = RUOLI[operatore ? operatore.ruolo : "admin"];
  return (
    <div className="schermo">
      <TestataNegozio titolo="Altro" sotto={operatore ? `${operatore.nome} · ${ruolo.t}` : "Gestione"} />
      <Scroll>
        <div className="profilotesta">
          <div className="iniziale">{(operatore ? operatore.nome : "S").charAt(0)}</div>
          <div>
            <b>{operatore ? operatore.nome : "Sabetta"}</b>
            <span>{ruolo.t} · {ruolo.s}</span>
          </div>
        </div>

        <label className="voce">
          <I.banco s={20} />
          <span><b>Banco aperto oggi</b><small>{bancoAperto ? "Stiamo ricevendo ordini" : "Oggi solo prenotazioni"}</small></span>
          <Interruttore on={bancoAperto} onChange={(v) => { setBancoAperto(v); dimmi(v ? "Banco aperto." : "Banco chiuso."); }} etichetta="Banco aperto" />
        </label>

        <button className="voce" onClick={() => pushA("consegne")}>
          <I.orologio s={20} /><span><b>Fasce di consegna</b><small>Chiusure, capienza e giornate</small></span><I.avanti s={18} />
        </button>

        {ruolo.soldi && (
          <button className="voce" onClick={() => pushA("conti")}>
            <I.grafico s={20} /><span><b>Andamento</b><small>Incassi, più venduti, pagamenti</small></span><I.avanti s={18} />
          </button>
        )}

        {ruolo.clienti && (
          <button className="voce" onClick={() => pushA("community")}>
            <I.chat s={20} /><span><b>La piazza</b><small>Foto, novità e avvisi per i clienti</small></span><I.avanti s={18} />
          </button>
        )}

        {ruolo.squadra && (
          <button className="voce" onClick={() => pushA("squadra")}>
            <I.utente s={20} /><span><b>Squadra e ruoli</b><small>Chi entra nel gestionale e cosa può fare</small></span><I.avanti s={18} />
          </button>
        )}

        <button className="voce" onClick={() => { setModo("cliente"); }}>
          <I.carrello s={20} /><span><b>Vedi l'app dei clienti</b><small>Controlla come appare il banco</small></span><I.avanti s={18} />
        </button>

        <button className="voce scura" onClick={() => { setOperatore(null); setSbloccato(false); setModo("cliente"); dimmi("Sessione chiusa."); }}>
          <I.x s={20} /><span><b>Esci dal gestionale</b><small>Chiude la sessione di {operatore ? operatore.nome : "lavoro"}</small></span><I.avanti s={18} />
        </button>
        <p className="minuta">Sabetta ortofrutta · gestionale 3.0</p>
      </Scroll>
    </div>
  );
}

function NegSquadra() {
  const { operatori, setOperatori, popA, dimmi, operatore } = useApp();
  const [apri, setApri] = useState(false);
  const [n, setN] = useState({ nome: "", ruolo: "magazzino", pin: "" });

  function crea() {
    if (n.nome.trim().length < 2) { dimmi("Scrivi il nome."); return; }
    if (n.pin.length !== 4) { dimmi("Il codice deve avere 4 cifre."); return; }
    if (operatori.find((o) => o.pin === n.pin)) { dimmi("Questo codice è già usato da un altro."); return; }
    setOperatori((v) => [...v, { id: `op${Date.now()}`, nome: n.nome.trim(), ruolo: n.ruolo, pin: n.pin, attivo: true }]);
    setN({ nome: "", ruolo: "magazzino", pin: "" });
    setApri(false);
    dimmi(`${n.nome} può entrare nel gestionale.`);
  }

  return (
    <div className="schermo">
      <Testata titolo="Squadra e ruoli" indietro={popA}
        destra={<button className="tondino giallo" onClick={() => setApri(true)} aria-label="Aggiungi persona"><I.piu s={22} w={2.4} /></button>} />
      <Scroll>
        <p className="aiutoblocco">Ogni persona entra con il suo codice di 4 cifre e vede solo quello che le serve.</p>

        {Object.keys(RUOLI).map((k) => (
          <div className="blocco" key={k}>
            <h3>{RUOLI[k].t}</h3>
            <p className="aiutoblocco">{RUOLI[k].s}</p>
            {operatori.filter((o) => o.ruolo === k).map((o) => (
              <div className="personariga" key={o.id}>
                <span className="clienteiniz">{o.nome.charAt(0)}</span>
                <div>
                  <b>{o.nome}{operatore && operatore.id === o.id ? " · sei tu" : ""}</b>
                  <small>Codice {o.pin}</small>
                </div>
                <Interruttore on={o.attivo} onChange={(v) => setOperatori((l) => l.map((x) => (x.id === o.id ? { ...x, attivo: v } : x)))} etichetta={`Accesso di ${o.nome}`} />
                {o.ruolo !== "admin" && (
                  <button className="tondino rosso" onClick={() => { setOperatori((l) => l.filter((x) => x.id !== o.id)); dimmi(`${o.nome} rimosso.`); }} aria-label={`Elimina ${o.nome}`}>
                    <I.cestino s={18} />
                  </button>
                )}
              </div>
            ))}
            {operatori.filter((o) => o.ruolo === k).length === 0 && <p className="minuta">Nessuno con questo ruolo.</p>}
          </div>
        ))}
      </Scroll>

      <Foglio aperto={apri} chiudi={() => setApri(false)} titolo="Nuova persona">
        <Campo etichetta="Nome"><input value={n.nome} onChange={(e) => setN({ ...n, nome: e.target.value })} placeholder="Antonio" /></Campo>
        <h4 className="titoletto">Ruolo</h4>
        <div className="scelte">
          {Object.keys(RUOLI).map((k) => (
            <button key={k} className={`scelta ${n.ruolo === k ? "on" : ""}`} onClick={() => setN({ ...n, ruolo: k })}>
              <span className="radio">{n.ruolo === k && <I.ok s={13} w={3} />}</span>
              <span><b>{RUOLI[k].t}</b><small>{RUOLI[k].s}</small></span>
            </button>
          ))}
        </div>
        <Campo etichetta="Codice di 4 cifre" aiuto="Lo userà per entrare.">
          <input value={n.pin} inputMode="numeric" onChange={(e) => setN({ ...n, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="4444" />
        </Campo>
        <button className="btn verde largo" onClick={crea}>Aggiungi alla squadra</button>
      </Foglio>
    </div>
  );
}

function NegCommunity() {
  const { posts, setPosts, popA, dimmi, catalogo } = useApp();
  const [apri, setApri] = useState(false);
  const vuoto = { tipo: "novita", titolo: "", testo: "", art: "pomodoro", link: "", prodotto: "", media: [] };
  const [n, setN] = useState(vuoto);
  const [carico, setCarico] = useState("");
  const rFoto = useRef(null);
  const rScatta = useRef(null);
  const rVideo = useRef(null);

  async function prendiFoto(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setCarico("Sto sistemando le foto…");
    const nuovi = [];
    for (const f of files.slice(0, 4)) {
      try { nuovi.push({ tipo: "foto", src: await comprimiFoto(f) }); } catch (x) { /* salta */ }
    }
    setCarico("");
    if (!nuovi.length) { dimmi("Non sono riuscito a leggere le foto."); return; }
    setN((v) => ({ ...v, media: [...v.media, ...nuovi].slice(0, 4) }));
    dimmi(`${nuovi.length} ${nuovi.length === 1 ? "foto aggiunta" : "foto aggiunte"}.`);
  }

  async function prendiVideo(e) {
    const f = (e.target.files || [])[0];
    e.target.value = "";
    if (!f) return;
    setCarico("Sto preparando il video…");
    const grande = f.size > LIMITE_VIDEO;
    let src = "";
    try {
      src = grande && typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(f) : await leggiFile(f);
    } catch (x) { src = ""; }
    const poster = src ? await fotogrammaVideo(src) : "";
    setCarico("");
    if (!src) { dimmi("Non sono riuscito a leggere il video."); return; }
    setN((v) => ({ ...v, media: [{ tipo: "video", src, poster, temporaneo: grande }] }));
    dimmi(grande
      ? "Video pronto. È pesante: resta su questo telefono, per farlo vedere a tutti incolla anche il link."
      : "Video aggiunto.");
  }

  const togliMedia = (i) => setN((v) => ({ ...v, media: v.media.filter((_, k) => k !== i) }));

  function pubblica() {
    if (n.titolo.trim().length < 3) { dimmi("Serve un titolo."); return; }
    if (n.testo.trim().length < 5) { dimmi("Scrivi due righe di testo."); return; }
    setPosts((v) => [{
      ...n, id: `po${Date.now()}`, titolo: n.titolo.trim(), testo: n.testo.trim(),
      link: n.link.trim(), cuori: 0, fissato: false, creato: new Date().toISOString(),
    }, ...v]);
    setN(vuoto);
    setApri(false);
    dimmi("Pubblicato nella piazza.");
  }

  const videoTemp = n.media.some((m) => m.tipo === "video" && m.temporaneo);

  return (
    <div className="schermo">
      <Testata titolo="La piazza" sotto={`${posts.length} pubblicazioni`} indietro={popA}
        destra={<button className="tondino giallo" onClick={() => setApri(true)} aria-label="Nuovo post"><I.piu s={22} w={2.4} /></button>} />
      <Scroll>
        <button className="aggiungimerce" onClick={() => setApri(true)}>
          <span className="piutondo"><I.piu s={22} w={2.4} /></span>
          <span><b>Pubblica una novità</b><small>Foto e video dal telefono, avvisi, ricette, offerte</small></span>
          <I.avanti s={18} />
        </button>

        {posts.map((p) => {
          const tp = TIPI_POST.find((x) => x.id === p.tipo) || TIPI_POST[0];
          const m = (p.media || []).find((x) => x.poster || x.src);
          return (
            <div className="postadmin" key={p.id}>
              <div className="minifig">
                {m ? <img className="minifoto" src={m.poster || m.src} alt="" /> : <Art k={p.art} size={34} />}
              </div>
              <div className="postadmincorpo">
                <span className="posttipo piccolo" style={{ background: tp.c }}>{tp.t}</span>
                <b>{p.titolo}</b>
                <small>
                  {quandoPost(p.creato)} · {p.cuori || 0} cuori
                  {(p.media || []).length ? ` · ${p.media.length} ${p.media.length === 1 ? "file" : "file"}` : ""}
                  {p.fissato ? " · in evidenza" : ""}
                </small>
              </div>
              <div className="postadminazioni">
                <button className={`btn ${p.fissato ? "giallo" : "chiaro"} mini`} onClick={() => setPosts((v) => v.map((x) => (x.id === p.id ? { ...x, fissato: !x.fissato } : x)))}>
                  {p.fissato ? "Togli" : "Fissa"}
                </button>
                <button className="tondino rosso" onClick={() => { setPosts((v) => v.filter((x) => x.id !== p.id)); dimmi("Eliminato."); }} aria-label="Elimina">
                  <I.cestino s={18} />
                </button>
              </div>
            </div>
          );
        })}
      </Scroll>

      <Foglio aperto={apri} chiudi={() => setApri(false)} titolo="Nuova pubblicazione">
        <h4 className="titoletto">Foto e video</h4>
        <div className="caricatori">
          <button className="caricatore" onClick={() => rScatta.current && rScatta.current.click()}>
            <span className="caricaico"><I.banco s={22} /></span>
            Scatta una foto
          </button>
          <button className="caricatore" onClick={() => rFoto.current && rFoto.current.click()}>
            <span className="caricaico"><I.scatola s={22} /></span>
            Dal telefono
          </button>
          <button className="caricatore" onClick={() => rVideo.current && rVideo.current.click()}>
            <span className="caricaico"><I.chat s={22} /></span>
            Un video
          </button>
        </div>
        <input ref={rScatta} type="file" accept="image/*" capture="environment" onChange={prendiFoto} style={{ display: "none" }} />
        <input ref={rFoto} type="file" accept="image/*" multiple onChange={prendiFoto} style={{ display: "none" }} />
        <input ref={rVideo} type="file" accept="video/*" onChange={prendiVideo} style={{ display: "none" }} />

        {carico && <div className="cartella">{carico}</div>}

        {n.media.length > 0 && (
          <div className="scelti">
            {n.media.map((m, i) => (
              <div className="scelto" key={i}>
                {m.tipo === "video"
                  ? (m.poster ? <img src={m.poster} alt="" /> : <span className="scelticona"><I.chat s={22} /></span>)
                  : <img src={m.src} alt="" />}
                {m.tipo === "video" && <span className="tagvideo">video</span>}
                <button className="tondino rosso" onClick={() => togliMedia(i)} aria-label="Togli"><I.x s={14} /></button>
              </div>
            ))}
          </div>
        )}
        {n.media.length === 0 && <p className="aiutoblocco">Puoi anche non mettere niente: useremo un disegno.</p>}
        {videoTemp && <div className="cartella giallo">Il video è pesante: lo vedi finché l'app resta aperta. Per farlo vedere a tutti, caricalo su YouTube o Instagram e incolla il link qui sotto.</div>}

        <h4 className="titoletto">Di che si tratta</h4>
        <div className="scelteline">
          {TIPI_POST.map((t) => (
            <button key={t.id} className={`chip piccolo ${n.tipo === t.id ? "on" : ""}`} onClick={() => setN({ ...n, tipo: t.id })}>{t.t}</button>
          ))}
        </div>

        <div style={{ marginTop: 14 }}>
          <Campo etichetta="Titolo"><input value={n.titolo} onChange={(e) => setN({ ...n, titolo: e.target.value })} placeholder="Arrivate le prime fragole" /></Campo>
          <Campo etichetta="Testo" aiuto="Scrivi come parli al banco, due o tre righe.">
            <textarea rows={4} value={n.testo} onChange={(e) => setN({ ...n, testo: e.target.value })} placeholder="Stamattina al mercato abbiamo preso…" />
          </Campo>
          <Campo etichetta="Link (facoltativo)" aiuto="Un video su YouTube, un post Instagram, una pagina: si apre con un tocco.">
            <input value={n.link} onChange={(e) => setN({ ...n, link: e.target.value.trim() })} placeholder="https://…" />
          </Campo>
        </div>

        {n.media.length === 0 && !n.link && (
          <>
            <h4 className="titoletto">Scegli il disegno</h4>
            <div className="disegni">
              {DISEGNI.slice(0, 30).map((dd) => (
                <button key={dd} className={`disegno ${n.art === dd ? "on" : ""}`} onClick={() => setN({ ...n, art: dd })} aria-label={dd}>
                  <Art k={dd} size={32} />
                </button>
              ))}
            </div>
          </>
        )}

        <h4 className="titoletto">Collega un prodotto del banco</h4>
        <div className="scelteline">
          <button className={`chip piccolo ${!n.prodotto ? "on" : ""}`} onClick={() => setN({ ...n, prodotto: "" })}>Nessuno</button>
          {catalogo.filter((x) => x.attivo).slice(0, 12).map((x) => (
            <button key={x.id} className={`chip piccolo ${n.prodotto === x.id ? "on" : ""}`} onClick={() => setN({ ...n, prodotto: x.id })}>{x.nome.split(" ")[0]}</button>
          ))}
        </div>

        <button className="btn verde largo" onClick={pubblica} disabled={!!carico}>{carico ? "Un attimo…" : "Pubblica nella piazza"}</button>
      </Foglio>
    </div>
  );
}

/* --------------------------- MERCE E MODALITÀ FREEZE ---------------------- */
function NegMerce() {
  const { catalogo, setCatalogo, bozza, setBozza, freeze, setFreeze, apriFreeze, pubblicaBanco, annullaBozza, dimmi, togli } = useApp();
  const [nuovoAperto, setNuovoAperto] = useState(false);
  const [offerta, setOfferta] = useState(null);
  const [elimina, setElimina] = useState(null);
  const [rep, setRep] = useState("tutto");
  const [cerca, setCerca] = useState("");
  const [n, setN] = useState({ nome: "", cat: "verdura", unita: "kg", prezzo: "", giacenza: "", origine: "", art: "default" });
  const lavoro = freeze.attivo && bozza ? bozza : catalogo;
  const setLavoro = freeze.attivo && bozza ? setBozza : setCatalogo;

  const modifiche = useMemo(() => {
    if (!bozza) return [];
    const out = [];
    bozza.forEach((b) => {
      const o = catalogo.find((x) => x.id === b.id);
      if (!o) { out.push(`${b.nome}: nuovo prodotto`); return; }
      if (o.prezzo !== b.prezzo) out.push(`${b.nome}: ${eur(o.prezzo)} → ${eur(b.prezzo)}`);
      if ((o.sconto || 0) !== (b.sconto || 0)) out.push(`${b.nome}: sconto ${b.sconto ? `${b.sconto}%` : "tolto"}`);
      if (o.giacenza !== b.giacenza) out.push(`${b.nome}: ${num(o.giacenza)} → ${num(b.giacenza)}`);
      if (o.attivo !== b.attivo) out.push(`${b.nome}: ${b.attivo ? "rimesso al banco" : "tolto dal banco"}`);
    });
    catalogo.forEach((o) => { if (!bozza.find((b) => b.id === o.id)) out.push(`${o.nome}: eliminato`); });
    return out;
  }, [bozza, catalogo]);

  const t = cerca.trim().toLowerCase();
  const lista = lavoro.filter((p) => (rep === "tutto" || p.cat === rep) && (!t || p.nome.toLowerCase().includes(t)));
  const inOffertaN = lavoro.filter((p) => inOfferta(p)).length;

  function agg(id, campo, valore) {
    setLavoro((c) => c.map((p) => (p.id === id ? { ...p, [campo]: valore } : p)));
  }
  function eliminaProdotto(p) {
    setLavoro((c) => c.filter((x) => x.id !== p.id));
    togli(p.id);
    setElimina(null);
    dimmi(`${p.nome} eliminato${freeze.attivo ? " dalla bozza" : " dal banco"}.`);
  }
  function tuttoDisponibile() {
    setLavoro((c) => c.map((p) => ({ ...p, attivo: true, giacenza: p.giacenza > 0 ? p.giacenza : 20 })));
    dimmi("Tutti i prodotti segnati come disponibili.");
  }
  function ritocca(perc) {
    setLavoro((c) => c.map((p) => ({ ...p, prezzo: arr2(p.prezzo * (1 + perc / 100)) })));
    dimmi(`Prezzi ${perc > 0 ? "aumentati" : "ridotti"} del ${Math.abs(perc)}%.`);
  }
  function crea() {
    if (!n.nome.trim()) { dimmi("Scrivi il nome del prodotto."); return; }
    const prezzo = Number(String(n.prezzo).replace(",", ".")) || 0;
    if (prezzo <= 0) { dimmi("Scrivi il prezzo di vendita."); return; }
    const p = {
      id: `n${Date.now()}`, nome: n.nome.trim(), cat: n.cat, unita: n.unita,
      prezzo, giacenza: Number(String(n.giacenza).replace(",", ".")) || 10,
      origine: n.origine.trim() || "Selezione del banco", art: n.art || "default", attivo: true, sconto: 0,
    };
    setLavoro((c) => [p, ...c]);
    setRep(p.cat);
    setCerca("");
    setN({ nome: "", cat: n.cat, unita: "kg", prezzo: "", giacenza: "", origine: n.origine, art: "default" });
    setNuovoAperto(false);
    dimmi(freeze.attivo ? `${p.nome} aggiunto alla bozza: pubblica il banco per mostrarlo.` : `${p.nome} è sul banco.`);
  }

  return (
    <div className="schermo">
      <TestataNegozio titolo="Merce del giorno" sotto={`${lavoro.filter((p) => p.attivo).length} al banco · ${inOffertaN} in offerta`}
        azione={<button className="tondino giallo" onClick={() => setNuovoAperto(true)} aria-label="Aggiungi merce"><I.piu s={22} w={2.4} /></button>} />
      <Scroll>
        <div className={`gelocard ${freeze.attivo ? "acceso" : ""}`}>
          <div className="gelotesta">
            <I.neve s={26} />
            <div>
              <b>Modalità aggiornamento</b>
              <small>Congela il negozio mentre carichi la merce. I clienti vedono il banco ma non possono ordinare.</small>
            </div>
            <Interruttore on={freeze.attivo} onChange={(v) => (v ? apriFreeze() : pubblicaBanco())} etichetta="Modalità aggiornamento" />
          </div>

          {freeze.attivo && (
            <>
              <div className="due">
                <Campo etichetta="Riapriamo alle">
                  <input value={freeze.riapre} onChange={(e) => setFreeze({ ...freeze, riapre: e.target.value.slice(0, 5) })} placeholder="08:30" />
                </Campo>
                <Campo etichetta="Messaggio ai clienti">
                  <input value={freeze.motivo} onChange={(e) => setFreeze({ ...freeze, motivo: e.target.value })} placeholder="Stiamo caricando la merce" />
                </Campo>
              </div>
              <div className="azionifila">
                <button className="btn chiaro mini" onClick={tuttoDisponibile}>Tutto disponibile</button>
                <button className="btn chiaro mini" onClick={() => ritocca(5)}>Prezzi +5%</button>
                <button className="btn chiaro mini" onClick={() => ritocca(-5)}>Prezzi −5%</button>
              </div>
              <div className="diff">
                <b>{modifiche.length} modifiche in bozza</b>
                {modifiche.slice(0, 6).map((m, i) => <span key={i}>{m}</span>)}
                {modifiche.length > 6 && <span>e altre {modifiche.length - 6}…</span>}
                {modifiche.length === 0 && <span>Nessuna modifica ancora. Cambia prezzi, sconti e quantità qui sotto.</span>}
              </div>
              <div className="azionifila">
                <button className="btn giallo largo" onClick={pubblicaBanco}>Pubblica il banco e riapri</button>
                <button className="btn chiaro largo" onClick={annullaBozza}>Annulla le modifiche</button>
              </div>
            </>
          )}
        </div>

        <button className="aggiungimerce" onClick={() => setNuovoAperto(true)}>
          <span className="piutondo"><I.piu s={22} w={2.4} /></span>
          <span>
            <b>Aggiungi merce al banco</b>
            <small>Prodotto nuovo: nome, prezzo, quantità e come si vende</small>
          </span>
          <I.avanti s={18} />
        </button>

        <div className="cerca scuro">
          <I.cerca s={20} />
          <input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca un prodotto del banco" aria-label="Cerca nel banco" />
          {cerca && <button className="tondino piccolo" onClick={() => setCerca("")} aria-label="Cancella"><I.x s={16} /></button>}
        </div>

        <div className="filtri">
          {REPARTI.map((r) => (
            <button key={r.id} className={`chip ${rep === r.id ? "on" : ""}`} onClick={() => setRep(r.id)}>{r.nome}</button>
          ))}
        </div>

        {lista.length === 0 && (
          <div className="vuoto alto">
            <Art k="misto" size={70} />
            <b>Qui non c'è niente</b>
            <span>In questo reparto non hai ancora prodotti. Aggiungine uno e comparirà subito sul banco dei clienti.</span>
            <button className="btn giallo" onClick={() => setNuovoAperto(true)}>Aggiungi merce</button>
          </div>
        )}

        {lista.map((p) => (
          <div className={`merce ${p.attivo ? "" : "spenta"}`} key={p.id}>
            <div className="mercefig">
              <Art k={p.art} size={40} />
              {inOfferta(p) && <span className="bollino mini">−{p.sconto}%</span>}
            </div>
            <div className="mercecorpo">
              <div className="mercetesta">
                <div>
                  <b>{p.nome}</b>
                  <small>{p.origine} · al {un(p.unita).et}</small>
                </div>
                <Interruttore on={p.attivo} onChange={(v) => agg(p.id, "attivo", v)} etichetta={`${p.nome} al banco`} />
              </div>

              <div className="mercecampi">
                <label><span>Prezzo</span>
                  <input inputMode="decimal" value={p.prezzo}
                    onChange={(e) => agg(p.id, "prezzo", Number(String(e.target.value).replace(",", ".")) || 0)} />
                  <em>€</em>
                </label>
                <label><span>Quantità</span>
                  <input inputMode="decimal" value={p.giacenza}
                    onChange={(e) => agg(p.id, "giacenza", Number(String(e.target.value).replace(",", ".")) || 0)} />
                  <em>{un(p.unita).misura === "peso" ? "kg" : "pz"}</em>
                </label>
              </div>

              {inOfferta(p) && (
                <div className="strisciaofferta">
                  Offerta attiva: {eur(prezzoDi(p))} invece di {eur(p.prezzo)}{p.delGiorno ? " · in vetrina" : ""}
                </div>
              )}

              <div className="mercefondo">
                <button className="btn chiaro mini" onClick={() => agg(p.id, "giacenza", 0)}>Esaurito</button>
                <button className={`btn ${inOfferta(p) ? "giallo" : "chiaro"} mini`} onClick={() => setOfferta(p.id)}>
                  {inOfferta(p) ? "Modifica offerta" : "Fai un'offerta"}
                </button>
                <button className="tondino rosso" onClick={() => setElimina(p)} aria-label={`Elimina ${p.nome}`}><I.cestino s={18} /></button>
              </div>
            </div>
          </div>
        ))}
        {!freeze.attivo && <p className="minuta">Le modifiche fatte adesso sono subito visibili ai clienti. Per cambiare molte cose insieme, accendi la modalità aggiornamento.</p>}
      </Scroll>

      <FoglioOfferta id={offerta} chiudi={() => setOfferta(null)} lavoro={lavoro} agg={agg} dimmi={dimmi} />

      <Foglio aperto={!!elimina} chiudi={() => setElimina(null)} titolo="Eliminare il prodotto?">
        {elimina && (
          <>
            <div className="cartella">
              <b>{elimina.nome}</b><br />
              Sparisce dal banco e dalla ricerca dei clienti. Gli ordini già fatti restano come sono.
              {freeze.attivo ? " L'eliminazione diventa definitiva quando pubblichi il banco." : ""}
            </div>
            <button className="btn rossoP largo" onClick={() => eliminaProdotto(elimina)}>Sì, elimina {elimina.nome}</button>
            <button className="btn chiaro largo" onClick={() => setElimina(null)}>No, tienilo</button>
            <p className="minuta">Se ti serve solo per oggi, usa l'interruttore: lo togli dal banco senza cancellarlo.</p>
          </>
        )}
      </Foglio>

      <Foglio aperto={nuovoAperto} chiudi={() => setNuovoAperto(false)} titolo="Aggiungi merce al banco">
        <div className="anteprima">
          <Art k={n.art} size={52} />
          <div>
            <b>{n.nome.trim() || "Nuovo prodotto"}</b>
            <small>{n.prezzo ? `${eur(Number(String(n.prezzo).replace(",", ".")) || 0)} al ${un(n.unita).et}` : `Prezzo al ${un(n.unita).et} da scrivere`}</small>
          </div>
        </div>

        <Campo etichetta="Nome del prodotto"><input value={n.nome} onChange={(e) => setN({ ...n, nome: e.target.value })} placeholder="Finocchi" /></Campo>

        <h4 className="titoletto">Reparto</h4>
        <div className="scelteline">
          {REPARTI.filter((r) => r.id !== "tutto").map((r) => (
            <button key={r.id} className={`chip piccolo ${n.cat === r.id ? "on" : ""}`} onClick={() => setN({ ...n, cat: r.id })}>{r.nome}</button>
          ))}
        </div>

        <h4 className="titoletto">Come si vende</h4>
        <div className="scelteline">
          {UNITA_ELENCO.map((u) => (
            <button key={u} className={`chip piccolo ${n.unita === u ? "on" : ""}`} onClick={() => setN({ ...n, unita: u })}>{un(u).et}</button>
          ))}
        </div>

        <div className="due" style={{ marginTop: 14 }}>
          <Campo etichetta={`Prezzo per ${un(n.unita).br} (€)`}>
            <input inputMode="decimal" value={n.prezzo} onChange={(e) => setN({ ...n, prezzo: e.target.value })} placeholder="1,80" />
          </Campo>
          <Campo etichetta="Quantità disponibile" aiuto={un(n.unita).misura === "peso" ? "In chili" : "In pezzi"}>
            <input inputMode="decimal" value={n.giacenza} onChange={(e) => setN({ ...n, giacenza: e.target.value })} placeholder="20" />
          </Campo>
        </div>

        <Campo etichetta="Provenienza" aiuto="La leggono i clienti sotto il nome.">
          <input value={n.origine} onChange={(e) => setN({ ...n, origine: e.target.value })} placeholder="Orto di Tuturano (BR)" />
        </Campo>

        <h4 className="titoletto">Scegli il disegno</h4>
        <div className="disegni">
          {DISEGNI.map((d) => (
            <button key={d} className={`disegno ${n.art === d ? "on" : ""}`} onClick={() => setN({ ...n, art: d })} aria-label={`Disegno ${d}`}>
              <Art k={d} size={34} />
            </button>
          ))}
        </div>

        {freeze.attivo && <div className="cartella giallo">Il banco è in modalità aggiornamento: il prodotto entra in bozza e i clienti lo vedono quando pubblichi.</div>}

        <button className="btn verde largo" onClick={crea}>{freeze.attivo ? "Aggiungi alla bozza" : "Metti sul banco"}</button>
        <button className="btn chiaro largo" onClick={() => setNuovoAperto(false)}>Annulla</button>
      </Foglio>
    </div>
  );
}

function FoglioOfferta({ id, chiudi, lavoro, agg, dimmi }) {
  const p = lavoro.find((x) => x.id === id);
  const [perc, setPerc] = useState(0);
  const [vetrina, setVetrina] = useState(true);
  useEffect(() => {
    if (p) { setPerc(p.sconto || 15); setVetrina(p.delGiorno !== false); }
  }, [id]);
  if (!p) return null;
  const finale = arr2(p.prezzo * (1 - perc / 100));

  function salva() {
    agg(p.id, "sconto", Math.max(0, Math.min(90, Math.round(perc))));
    agg(p.id, "delGiorno", vetrina);
    chiudi();
    dimmi(perc > 0 ? `${p.nome}: offerta al ${perc}%.` : "Offerta tolta.");
  }
  function leva() {
    agg(p.id, "sconto", 0);
    agg(p.id, "delGiorno", false);
    chiudi();
    dimmi("Offerta tolta.");
  }

  return (
    <Foglio aperto chiudi={chiudi} titolo="Offerta del giorno">
      <div className="anteprima">
        <Art k={p.art} size={54} />
        <div>
          <b>{p.nome}</b>
          <small>Prezzo di listino {eur(p.prezzo)} al {un(p.unita).et}</small>
        </div>
      </div>

      <h4 className="titoletto">Quanto sconto</h4>
      <div className="scelteline">
        {[0, 5, 10, 15, 20, 25, 30, 40, 50].map((v) => (
          <button key={v} className={`chip piccolo ${perc === v ? "on" : ""}`} onClick={() => setPerc(v)}>{v === 0 ? "Nessuno" : `−${v}%`}</button>
        ))}
      </div>
      <div className="due" style={{ marginTop: 12 }}>
        <Campo etichetta="Sconto personalizzato (%)">
          <input inputMode="numeric" value={perc} onChange={(e) => setPerc(Math.max(0, Math.min(90, Number(e.target.value.replace(/\D/g, "")) || 0)))} />
        </Campo>
        <Campo etichetta="Oppure prezzo finale (€)">
          <input inputMode="decimal" value={String(finale).replace(".", ",")}
            onChange={(e) => {
              const v = Number(String(e.target.value).replace(",", ".")) || 0;
              setPerc(v > 0 && v < p.prezzo ? Math.round((1 - v / p.prezzo) * 100) : 0);
            }} />
        </Campo>
      </div>

      <div className="anteprimaprezzo">
        <span>Il cliente paga</span>
        <b>{eur(finale)}</b>
        {perc > 0 && <s>{eur(p.prezzo)}</s>}
        <em>al {un(p.unita).br}</em>
      </div>

      <label className="voce">
        <I.stella s={20} />
        <span><b>Mettila in vetrina</b><small>Compare in «Prezzo del giorno», in cima alla home dei clienti.</small></span>
        <Interruttore on={vetrina} onChange={setVetrina} etichetta="In vetrina" />
      </label>

      <button className="btn verde largo" onClick={salva}>Salva l'offerta</button>
      {inOfferta(p) && <button className="btn chiaro largo" onClick={leva}>Togli l'offerta</button>}
    </Foglio>
  );
}

/* ------------------------------- CONSEGNE -------------------------------- */
function NegConsegne() {
  const { ordini, bloccate, setBloccate, giorniChiusi, setGiorniChiusi, giorni, bancoAperto, setBancoAperto, dimmi, popA } = useApp();
  const [sel, setSel] = useState(dkey(new Date()));
  const [gg, setGg] = useState([]);
  const [oo, setOo] = useState([]);
  const ORE = Array.from({ length: CHIUSURA - APERTURA }, (_, i) => APERTURA + i);

  const togliMetti = (v, x) => (v.includes(x) ? v.filter((y) => y !== x) : [...v, x]);
  const tuttiGiorni = gg.length === giorni.filter((g) => !g.chiuso).length;

  function applica(chiudi) {
    if (!gg.length || !oo.length) { dimmi("Scegli almeno un giorno e una fascia."); return; }
    const chiavi = [];
    gg.forEach((g) => oo.forEach((h) => chiavi.push(`${g}|${h}`)));
    setBloccate((b) => (chiudi ? Array.from(new Set([...b, ...chiavi])) : b.filter((x) => !chiavi.includes(x))));
    dimmi(`${chiavi.length} fasce ${chiudi ? "chiuse" : "riaperte"}.`);
  }

  function giornataIntera(key, chiudi) {
    setGiorniChiusi((v) => (chiudi ? Array.from(new Set([...v, key])) : v.filter((x) => x !== key)));
    if (chiudi) setBloccate((b) => b.filter((x) => !x.startsWith(`${key}|`)));
    dimmi(chiudi ? `${giornoTxt(key)}: giornata chiusa.` : `${giornoTxt(key)}: giornata riaperta.`);
  }

  const chiusure = giorni.map((g) => ({
    ...g,
    ore: bloccate.filter((x) => x.startsWith(`${g.key}|`)).map((x) => Number(x.split("|")[1])).sort((a, b) => a - b),
  })).filter((g) => g.ore.length || giorniChiusi.includes(g.key));

  const selChiuso = giorniChiusi.includes(sel);

  return (
    <div className="schermo">
      <TestataNegozio titolo="Fasce di consegna" sotto={`${CAPIENZA_FASCIA} ordini per fascia · 8:00–20:00`} indietro={popA} />
      <Scroll>
        <label className="voce">
          <I.banco s={20} />
          <span><b>Banco aperto oggi</b><small>{bancoAperto ? "Accettiamo consegne per la giornata di oggi" : "Oggi niente consegne: restano solo le prenotazioni"}</small></span>
          <Interruttore on={bancoAperto} onChange={(v) => { setBancoAperto(v); dimmi(v ? "Banco aperto." : "Banco chiuso per oggi."); }} etichetta="Banco aperto" />
        </label>

        <div className="blocco">
          <h3>Chiusura rapida</h3>
          <p className="aiutoblocco">Scegli i giorni e le fasce, poi chiudi tutto in una volta. Serve per la pausa, per il mercato o quando il furgone è fermo.</p>

          <h4 className="titoletto">1 · Giorni</h4>
          <div className="scelteline">
            <button className={`chip piccolo ${tuttiGiorni ? "on" : ""}`}
              onClick={() => setGg(tuttiGiorni ? [] : giorni.filter((g) => !g.chiuso).map((g) => g.key))}>
              Tutta la settimana
            </button>
            {giorni.map((g) => (
              <button key={g.key} className={`chip piccolo ${gg.includes(g.key) ? "on" : ""}`} disabled={g.chiuso}
                onClick={() => setGg((v) => togliMetti(v, g.key))}>
                {g.titolo} {g.chiuso ? "· chiuso" : g.sotto}
              </button>
            ))}
          </div>

          <h4 className="titoletto">2 · Fasce</h4>
          <div className="scelteline">
            {PRESET_ORE.map((x) => {
              const dentro = x.ore.every((h) => oo.includes(h));
              return (
                <button key={x.id} className={`chip piccolo ${dentro ? "on" : ""}`}
                  onClick={() => setOo((v) => (dentro ? v.filter((h) => !x.ore.includes(h)) : Array.from(new Set([...v, ...x.ore]))))}>
                  {x.t}
                </button>
              );
            })}
            <button className={`chip piccolo ${oo.length === ORE.length ? "on" : ""}`}
              onClick={() => setOo(oo.length === ORE.length ? [] : [...ORE])}>Tutta la giornata</button>
          </div>
          <div className="grigliaore">
            {ORE.map((h) => (
              <button key={h} className={`ora ${oo.includes(h) ? "on" : ""}`} onClick={() => setOo((v) => togliMetti(v, h))}>
                {pad(h)}–{pad(h + 1)}
              </button>
            ))}
          </div>

          <div className="riepilogosel">
            {gg.length && oo.length
              ? `${gg.length} ${gg.length === 1 ? "giorno" : "giorni"} × ${comprimiOre(oo)} = ${gg.length * oo.length} fasce`
              : "Nessuna selezione: tocca i giorni e le fasce qui sopra."}
          </div>
          <div className="azionifila">
            <button className="btn giallo largo" onClick={() => applica(true)}>Chiudi le fasce scelte</button>
            <button className="btn chiaro largo" onClick={() => applica(false)}>Riaprile</button>
            {(gg.length > 0 || oo.length > 0) && <button className="btn chiaro mini" onClick={() => { setGg([]); setOo([]); }}>Pulisci selezione</button>}
          </div>
        </div>

        {chiusure.length > 0 && (
          <div className="blocco">
            <h3>Chiusure attive</h3>
            {chiusure.map((g) => (
              <div className="dett" key={g.key}>
                <span>{g.titolo} {g.sotto}</span>
                <b>
                  {giorniChiusi.includes(g.key) ? "Giornata chiusa" : comprimiOre(g.ore)}
                  <button className="link" onClick={() => {
                    if (giorniChiusi.includes(g.key)) giornataIntera(g.key, false);
                    else { setBloccate((v) => v.filter((x) => !x.startsWith(`${g.key}|`))); dimmi(`${g.titolo}: fasce riaperte.`); }
                  }}>Riapri</button>
                </b>
              </div>
            ))}
          </div>
        )}

        <div className="blocco">
          <h3>Giorno per giorno</h3>
          <div className="scelteline">
            {giorni.map((g) => (
              <button key={g.key} className={`chip piccolo ${sel === g.key ? "on" : ""}`} onClick={() => setSel(g.key)}>
                {g.titolo} {g.sotto}{giorniChiusi.includes(g.key) ? " · chiuso" : ""}
              </button>
            ))}
          </div>

          <label className="voce" style={{ marginTop: 12 }}>
            <I.x s={20} />
            <span><b>Chiudi tutta la giornata</b><small>{giornoTxt(sel)}: nessuna consegna e nessun ritiro.</small></span>
            <Interruttore on={selChiuso} onChange={(v) => giornataIntera(sel, v)} etichetta="Chiudi la giornata" />
          </label>

          {selChiuso ? (
            <div className="cartella giallo">Giornata chiusa ai clienti. Riapri l'interruttore per tornare a ricevere ordini.</div>
          ) : ORE.map((h) => {
            const chiave = `${sel}|${h}`;
            const usate = ordini.filter((o) => o.giorno === sel && o.fascia === h && o.stato !== "annullato");
            const bloc = bloccate.includes(chiave);
            const pieno = usate.length >= CAPIENZA_FASCIA;
            return (
              <div className={`slot ${bloc ? "bloc" : pieno ? "pieno" : ""}`} key={h}>
                <div>
                  <b>{fasciaTxt(h)}</b>
                  <small>{bloc ? "Chiusa ai clienti" : `${usate.length} ordini su ${CAPIENZA_FASCIA}`}</small>
                  <div className="pallini fila">
                    {Array.from({ length: CAPIENZA_FASCIA }, (_, i) => <i key={i} className={i < usate.length ? "on" : ""} />)}
                  </div>
                </div>
                <button className={`btn ${bloc ? "giallo" : "chiaro"} mini`}
                  onClick={() => setBloccate((f) => (f.includes(chiave) ? f.filter((x) => x !== chiave) : [...f, chiave]))}>
                  {bloc ? "Riapri" : "Chiudi"}
                </button>
              </div>
            );
          })}
        </div>
      </Scroll>
    </div>
  );
}

/* --------------------------------- SCONTI -------------------------------- */
function NegSconti() {
  const { coupons, setCoupons, ordini, dimmi } = useApp();
  const [apri, setApri] = useState(false);
  const [c, setC] = useState({ codice: "", tipo: "percento", valore: "10", minimo: "10", scadenza: "", maxUsi: "", nota: "" });

  const usati = {};
  ordini.filter((o) => o.coupon && o.stato !== "annullato").forEach((o) => {
    usati[o.coupon.codice] = (usati[o.coupon.codice] || 0) + 1;
  });
  const risparmio = ordini.filter((o) => o.stato !== "annullato").reduce((s, o) => s + (o.sconto || 0), 0);

  function crea() {
    const cod = c.codice.trim().toUpperCase().replace(/\s/g, "");
    if (cod.length < 3) { dimmi("Il codice deve avere almeno 3 lettere."); return; }
    if (coupons.find((x) => x.codice === cod)) { dimmi("Esiste già un codice con questo nome."); return; }
    const val = Number(String(c.valore).replace(",", ".")) || 0;
    if (c.tipo !== "consegna" && val <= 0) { dimmi("Scrivi di quanto è lo sconto."); return; }
    if (c.tipo === "percento" && val > 90) { dimmi("Lo sconto massimo è 90%."); return; }
    setCoupons((v) => [{
      codice: cod, tipo: c.tipo, valore: val,
      minimo: Number(String(c.minimo).replace(",", ".")) || 0,
      scadenza: c.scadenza || "", maxUsi: Number(c.maxUsi) || 0, usi: 0, attivo: true, nota: c.nota.trim(),
    }, ...v]);
    setC({ codice: "", tipo: "percento", valore: "10", minimo: "10", scadenza: "", maxUsi: "", nota: "" });
    setApri(false);
    dimmi(`Codice ${cod} creato.`);
  }

  return (
    <div className="schermo">
      <TestataNegozio titolo="Codici sconto" sotto={`${coupons.filter((x) => x.attivo).length} attivi · ${eur(risparmio)} scontati`} />
      <Scroll>
        <button className="btn giallo largo" style={{ marginTop: 0 }} onClick={() => setApri(true)}>+ Crea un codice sconto</button>
        <p className="minuta">I clienti scrivono il codice alla cassa e lo sconto si applica da solo, se rispettano le condizioni.</p>

        {coupons.length === 0 && (
          <div className="vuoto alto"><I.buono s={40} /><b>Nessun codice</b><span>Crea il primo codice: per esempio 10% sopra i 15 € per far provare l'app.</span></div>
        )}

        {coupons.map((x) => {
          const scaduto = x.scadenza && dkey(new Date()) > x.scadenza;
          const finiti = x.maxUsi > 0 && x.usi >= x.maxUsi;
          return (
            <div className={`coupon ${x.attivo && !scaduto && !finiti ? "" : "spento"}`} key={x.codice}>
              <div className="coupontesta">
                <div>
                  <b>{x.codice}</b>
                  <small>{couponTxt(x)}{x.minimo ? ` · da ${eur(x.minimo)} di spesa` : " · senza minimo"}</small>
                </div>
                <Interruttore on={x.attivo} onChange={(v) => setCoupons((l) => l.map((y) => (y.codice === x.codice ? { ...y, attivo: v } : y)))} etichetta={`Codice ${x.codice}`} />
              </div>
              <div className="couponfatti">
                <span>Usato {usati[x.codice] || x.usi || 0} {x.maxUsi > 0 ? `su ${x.maxUsi}` : "volte"}</span>
                <span>{x.scadenza ? `Scade il ${x.scadenza}` : "Senza scadenza"}</span>
                {scaduto && <span className="rosso">Scaduto</span>}
                {finiti && <span className="rosso">Utilizzi finiti</span>}
              </div>
              {x.nota && <div className="cartella">{x.nota}</div>}
              <div className="mercefondo">
                <button className="btn chiaro mini" onClick={() => setCoupons((l) => l.map((y) => (y.codice === x.codice ? { ...y, usi: 0 } : y)))}>Azzera utilizzi</button>
                <button className="tondino rosso" onClick={() => { setCoupons((l) => l.filter((y) => y.codice !== x.codice)); dimmi(`Codice ${x.codice} eliminato.`); }} aria-label={`Elimina ${x.codice}`}>
                  <I.cestino s={18} />
                </button>
              </div>
            </div>
          );
        })}
      </Scroll>

      <Foglio aperto={apri} chiudi={() => setApri(false)} titolo="Nuovo codice sconto">
        <Campo etichetta="Nome del codice" aiuto="È quello che il cliente scrive alla cassa.">
          <input value={c.codice} onChange={(e) => setC({ ...c, codice: e.target.value.toUpperCase().replace(/\s/g, "") })} placeholder="PRIMAVERA15" />
        </Campo>

        <h4 className="titoletto">Che sconto fa</h4>
        <div className="scelte">
          {TIPI_COUPON.map((t) => (
            <button key={t.id} className={`scelta ${c.tipo === t.id ? "on" : ""}`} onClick={() => setC({ ...c, tipo: t.id })}>
              <span className="radio">{c.tipo === t.id && <I.ok s={13} w={3} />}</span>
              <span><b>{t.t}</b><small>{t.s}</small></span>
            </button>
          ))}
        </div>

        <div className="due" style={{ marginTop: 12 }}>
          {c.tipo !== "consegna" && (
            <Campo etichetta={c.tipo === "percento" ? "Percentuale (%)" : "Sconto (€)"}>
              <input inputMode="decimal" value={c.valore} onChange={(e) => setC({ ...c, valore: e.target.value })} placeholder={c.tipo === "percento" ? "10" : "3" } />
            </Campo>
          )}
          <Campo etichetta="Spesa minima (€)" aiuto="0 per nessun minimo.">
            <input inputMode="decimal" value={c.minimo} onChange={(e) => setC({ ...c, minimo: e.target.value })} placeholder="10" />
          </Campo>
        </div>
        <div className="due">
          <Campo etichetta="Scade il" aiuto="Lascia vuoto se non scade.">
            <input type="date" value={c.scadenza} onChange={(e) => setC({ ...c, scadenza: e.target.value })} />
          </Campo>
          <Campo etichetta="Quante volte" aiuto="Vuoto o 0 = senza limite.">
            <input inputMode="numeric" value={c.maxUsi} onChange={(e) => setC({ ...c, maxUsi: e.target.value.replace(/\D/g, "") })} placeholder="50" />
          </Campo>
        </div>
        <Campo etichetta="Nota per te" aiuto="Non la vede il cliente.">
          <input value={c.nota} onChange={(e) => setC({ ...c, nota: e.target.value })} placeholder="Volantino di aprile" />
        </Campo>

        <div className="anteprimaprezzo">
          <span>Il cliente vedrà</span>
          <b>{c.codice || "CODICE"}</b>
          <em>{c.tipo === "percento" ? `−${c.valore || 0}%` : c.tipo === "euro" ? `−${eur(Number(String(c.valore).replace(",", ".")) || 0)}` : "consegna gratis"}{Number(c.minimo) > 0 ? ` da ${eur(Number(String(c.minimo).replace(",", ".")) || 0)}` : ""}</em>
        </div>

        <button className="btn verde largo" onClick={crea}>Crea il codice</button>
      </Foglio>
    </div>
  );
}

/* ------------------------------- ANDAMENTO -------------------------------- */
function NegConti() {
  const { ordini, catalogo, popA } = useApp();
  const oggi = dkey(new Date());
  const validi = ordini.filter((o) => o.stato !== "annullato");
  const diOggi = validi.filter((o) => o.giorno === oggi);
  const incasso = diOggi.reduce((s, o) => s + o.totale, 0);
  const medio = diOggi.length ? incasso / diOggi.length : 0;
  const giorni = useMemo(() => giorniUtili(7), []);
  const max = Math.max(1, ...giorni.map((g) => validi.filter((o) => o.giorno === g.key).length));

  const venduti = {};
  validi.forEach((o) => o.righe.forEach((r) => { venduti[r.nome] = (venduti[r.nome] || 0) + r.qta; }));
  const top = Object.keys(venduti).map((k) => ({ nome: k, q: venduti[k] })).sort((a, b) => b.q - a.q).slice(0, 5);
  const paga = { contanti: 0, pos: 0, carta: 0 };
  validi.forEach((o) => { paga[o.pagamento] = (paga[o.pagamento] || 0) + 1; });
  const finiti = catalogo.filter((p) => p.attivo && p.giacenza <= 0);

  return (
    <div className="schermo">
      <TestataNegozio titolo="Andamento" sotto="Dati della dimostrazione" indietro={popA} />
      <Scroll>
        <div className="kpi">
          <div><span>Incasso oggi</span><b>{eur(incasso)}</b></div>
          <div><span>Ordini oggi</span><b>{diOggi.length}</b></div>
          <div><span>Scontrino medio</span><b>{eur(medio)}</b></div>
          <div><span>Prenotati</span><b>{validi.filter((o) => o.giorno > oggi).length}</b></div>
        </div>

        <div className="blocco">
          <h3>Ordini per giorno</h3>
          {giorni.map((g) => {
            const n = validi.filter((o) => o.giorno === g.key).length;
            const v = validi.filter((o) => o.giorno === g.key).reduce((s, o) => s + o.totale, 0);
            return (
              <div className="barra" key={g.key}>
                <span>{g.titolo}</span>
                <i><b style={{ width: `${(n / max) * 100}%` }} /></i>
                <em>{n} · {eur(v)}</em>
              </div>
            );
          })}
        </div>

        <div className="blocco">
          <h3>Più venduti</h3>
          {top.length === 0 ? <p className="aiutoblocco">Ancora nessun dato.</p> : top.map((t, i) => (
            <div className="dett" key={t.nome}><span>{i + 1}. {t.nome}</span><b>{num(t.q)}</b></div>
          ))}
        </div>

        <div className="blocco">
          <h3>Come pagano</h3>
          <div className="dett"><span>Contanti</span><b>{paga.contanti || 0}</b></div>
          <div className="dett"><span>POS alla consegna</span><b>{paga.pos || 0}</b></div>
          <div className="dett"><span>Carta in app</span><b>{paga.carta || 0}</b></div>
        </div>

        {finiti.length > 0 && (
          <div className="blocco">
            <h3>Da ricaricare</h3>
            {finiti.map((p) => <div className="dett" key={p.id}><span>{p.nome}</span><b className="rosso">finito</b></div>)}
          </div>
        )}
      </Scroll>
    </div>
  );
}

/* =================================== CSS ================================== */
const CSS = `
.sab *{box-sizing:border-box;margin:0;padding:0}
.sab{
  --verde:#1F6B45; --verde2:#12351F; --tenue:#E8F0E5;
  --carta:#F5F6F1; --bianco:#fff; --sole:#E9A81E; --inch:#4A3403;
  --rosso:#B8371F; --grigio:#67745F; --bordo:#E1E6DB;
  --fs:16px; --r:16px; --rb:14px;
  --f-ui:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;
  --f-dis:"Archivo",var(--f-ui);
  font-family:var(--f-ui); font-size:var(--fs); color:var(--verde2);
  -webkit-font-smoothing:antialiased; font-variant-numeric:tabular-nums;
  display:flex; justify-content:center; background:#DFE4DA; min-height:100%;
}
.sab.android{--f-ui:Roboto,"Segoe UI",system-ui,sans-serif;--r:20px;--rb:24px}
.sab.grande{--fs:18px}
.sab button,.sab input,.sab select,.sab textarea{font:inherit;color:inherit}
.sab button{border:0;background:none;cursor:pointer;text-align:left}
.sab a{color:inherit;text-decoration:none}
.sab :focus-visible{outline:3px solid var(--sole);outline-offset:1px}
.sab s{opacity:.55}

/* telaio */
.tela{padding:22px 14px 30px;display:flex;flex-direction:column;align-items:center;gap:14px;width:100%}
.selettore{display:flex;gap:6px;background:#fff;border-radius:999px;padding:4px;box-shadow:0 1px 3px rgba(0,0,0,.12)}
.sceltab{padding:8px 18px;border-radius:999px;font-size:14px;font-weight:600;color:var(--grigio)}
.sceltab.on{background:var(--verde2);color:#fff}
.telefono{width:392px;max-width:100%;height:812px;max-height:calc(100dvh - 90px);background:var(--carta);border-radius:44px;
  border:11px solid #14181A;box-shadow:0 22px 50px rgba(10,25,15,.32);position:relative;overflow:hidden;display:flex;flex-direction:column}
.sab.android .telefono{border-radius:30px;border-width:9px}
.stato{height:40px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 24px;background:var(--verde2);color:#fff;font-size:13px;font-weight:600;position:relative;z-index:5}
.tacca{position:absolute;left:50%;transform:translateX(-50%);top:7px;width:104px;height:26px;background:#14181A;border-radius:14px}
.sab.android .tacca{width:12px;height:12px;border-radius:50%;top:12px}
.segnali{display:flex;gap:6px;align-items:center}
.vetro{flex:1;min-height:0;display:flex;flex-direction:column;background:var(--carta);overflow:hidden}
.schermo{flex:1;min-height:0;display:flex;flex-direction:column;background:var(--carta);overflow:hidden;position:relative}
.sab.ios .telefono::after{content:"";position:absolute;bottom:7px;left:50%;transform:translateX(-50%);width:130px;height:5px;border-radius:3px;background:rgba(20,24,26,.32);z-index:20;pointer-events:none}

@media (max-width:820px){
  .tela{padding:0;gap:0}
  .selettore{position:fixed;bottom:calc(8px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);z-index:90;opacity:.92}
  .telefono{width:100%;height:100dvh;max-height:none;border:0;border-radius:0;box-shadow:none}
  .stato{display:none}
  .sab.ios .telefono::after{display:none}
}

/* struttura app */
.app{flex:1;min-height:0;display:flex;flex-direction:column;background:var(--carta)}
.pagine{flex:1;min-height:0;position:relative;display:flex}
.pagine>*{flex:1;min-width:0;display:flex;flex-direction:column}
.spinta{position:absolute;inset:0;background:var(--carta);animation:entra .22s ease-out}
.sab.android .spinta{animation:sfuma .18s ease-out}
@keyframes entra{from{transform:translateX(16%);opacity:.4}to{transform:translateX(0);opacity:1}}
@keyframes sfuma{from{transform:scale(.97);opacity:0}to{transform:scale(1);opacity:1}}
@media (prefers-reduced-motion:reduce){.spinta,.bettatesta.fluttua,.fumetto{animation:none}}

.scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch}
.scroll.pad{padding:14px 16px 24px}

/* testata */
.testata{flex:none;background:var(--verde2);color:#fff;padding:10px 10px 12px}
.testata.chiara{background:#fff;color:var(--verde2);border-bottom:1px solid var(--bordo)}
.testariga{display:flex;align-items:center;gap:8px;min-height:46px}
.testatitolo{flex:1;text-align:center;line-height:1.2;min-width:0;padding:0 2px}
.testatitolo.conindietro{margin-right:40px}
.sab.android .testatitolo.conindietro{margin-right:0}
.sab.android .testatitolo{text-align:left;padding-left:4px}
.testatitolo.sx{text-align:left}
.testatitolo b{display:block;font-family:var(--f-dis);font-size:calc(var(--fs)*1.12);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.testatitolo span{font-size:calc(var(--fs)*.8);opacity:.75}
.tondino{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.14);color:inherit;flex:none}
.testata.chiara .tondino{background:var(--tenue)}
.tondino.piccolo{width:28px;height:28px;background:var(--tenue);color:var(--grigio)}
.tondino.giallo{background:var(--sole);color:var(--inch)}
.tondino.rosso{background:#FBECE8;color:var(--rosso)}
.tondino.scuro{background:var(--tenue);color:var(--verde2)}

.testata.home{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px 13px;border-bottom:1px solid rgba(233,168,30,.28)}
.testata.betta{display:flex;align-items:center;gap:10px;padding:12px 14px}
.testata.negozio{background:#0E2A18}
.strisciagelo{display:flex;align-items:center;gap:8px;background:#9AD7F0;color:#06344A;border-radius:10px;padding:7px 10px;font-size:calc(var(--fs)*.8);font-weight:600;margin-top:8px}

.consegnaa{flex:none;display:flex;align-items:center;gap:10px;background:var(--verde);color:#fff;padding:9px 16px 11px}
.consegnaa span{flex:1;min-width:0}
.consegnaa small{display:block;font-size:calc(var(--fs)*.74);opacity:.8}
.consegnaa b{display:block;font-size:calc(var(--fs)*.92);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* tab bar */
.tabbar{flex:none;display:flex;background:#fff;border-top:1px solid var(--bordo);padding:6px 4px calc(6px + env(safe-area-inset-bottom))}
.tab{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 2px;color:var(--grigio);border-radius:12px}
.tab.on{color:var(--verde)}
.tabico{position:relative;display:flex;padding:3px 14px;border-radius:999px}
.sab.android .tab.on .tabico{background:var(--tenue)}
.tabtxt{font-size:calc(var(--fs)*.66);font-weight:600;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sab.android .tabtxt{font-size:calc(var(--fs)*.68)}
.badge{position:absolute;top:-2px;right:6px;background:var(--rosso);color:#fff;font-size:10px;font-weight:700;font-style:normal;min-width:17px;height:17px;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 4px}

/* bottoni */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:50px;padding:12px 18px;border-radius:var(--rb);font-weight:700;font-size:calc(var(--fs)*.98);transition:transform .07s ease}
.btn:active{transform:scale(.985)}
.btn.largo{width:100%;margin-top:10px}
.btn.mini{min-height:40px;padding:8px 14px;font-size:calc(var(--fs)*.86);border-radius:calc(var(--rb) - 2px)}
.btn.verde{background:var(--verde);color:#fff}
.btn.giallo{background:var(--sole);color:var(--inch)}
.btn.chiaro{background:#fff;color:var(--verde2);border:1.5px solid var(--bordo)}
.btn.rossoP{background:#FBECE8;color:var(--rosso)}
.btn.grigio{background:#E7EAE3;color:var(--grigio)}
.btn[disabled]{opacity:.5;pointer-events:none}
.link{color:var(--verde);font-weight:700;font-size:calc(var(--fs)*.86)}
.link.rosso{color:var(--rosso)}

/* elementi comuni */
.sezione{margin-top:20px}
.sezriga{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:10px}
.sezriga h2{font-family:var(--f-dis);font-size:calc(var(--fs)*1.12);font-weight:700}
.conta{color:var(--grigio);font-size:calc(var(--fs)*.8)}
.guida{color:var(--grigio);font-size:calc(var(--fs)*.84);margin:-4px 0 10px;line-height:1.35}
.titoletto{font-family:var(--f-dis);font-size:calc(var(--fs)*.94);color:var(--grigio);margin:14px 0 8px}
.blocco{background:#fff;border:1px solid var(--bordo);border-radius:var(--r);padding:14px;margin-top:12px}
.blocco h3{display:flex;align-items:center;gap:7px;font-family:var(--f-dis);font-size:calc(var(--fs)*1.02);font-weight:700;margin-bottom:8px}
.aiutoblocco{color:var(--grigio);font-size:calc(var(--fs)*.86);margin-bottom:8px}
.cartella{background:var(--tenue);border-radius:12px;padding:11px 13px;font-size:calc(var(--fs)*.87);line-height:1.45;margin-top:10px}
.cartella.verde{background:#E3F1E1}
.cartella.giallo{background:#FFF4DC}
.cartella.sinistra{text-align:left}
.cartella b{display:inline-block;min-width:88px}
.minuta{color:var(--grigio);font-size:calc(var(--fs)*.78);text-align:center;margin:14px 0 6px;line-height:1.4}
.minuta.chiara{color:#A9C3AC}
.rosso{color:var(--rosso)}
.piccolo{font-size:calc(var(--fs)*.82)}
.fine{color:var(--grigio);font-size:calc(var(--fs)*.82)}
.riga{display:flex;align-items:center;justify-content:space-between;gap:10px}

.banda{display:flex;gap:11px;align-items:flex-start;border-radius:var(--r);padding:13px;margin-bottom:12px}
.banda.gelo{background:#DCF1FA;color:#06344A}
.banda.gialla{background:#FFF1D6;color:#6A4A05}
.banda.rossa{background:#FBECE8;color:#7C2414}
.banda.colonna{flex-direction:column;gap:8px}
.banda b{display:block}
.banda span{font-size:calc(var(--fs)*.85);line-height:1.4}
.barretta{display:block;height:9px;border-radius:99px;background:rgba(0,0,0,.09);overflow:hidden;width:100%}
.barretta i{display:block;height:100%;background:var(--rosso);border-radius:99px}

/* ricerca e chip */
.cerca{display:flex;align-items:center;gap:9px;background:#fff;border:1.5px solid var(--bordo);border-radius:var(--rb);padding:0 12px;min-height:50px;margin-top:2px}
.cerca input{flex:1;min-width:0;border:0;outline:0;background:none}
.cerca svg{color:var(--grigio);flex:none}
.fila{display:flex;gap:8px;overflow-x:auto;padding:12px 0 2px;margin:0 -16px;padding-left:16px;padding-right:16px}
.fila::-webkit-scrollbar,.scorri::-webkit-scrollbar{display:none}
.chip{flex:none;padding:9px 15px;border-radius:999px;background:#fff;border:1.5px solid var(--bordo);font-weight:600;font-size:calc(var(--fs)*.88);min-height:40px}
.chip.on{background:var(--verde2);border-color:var(--verde2);color:#fff}
.chip.giallo{background:var(--sole);border-color:var(--sole);color:var(--inch)}
.chip.piccolo{min-height:33px;padding:5px 11px;font-size:calc(var(--fs)*.78)}
.filtri{flex:none;display:flex;gap:8px;overflow-x:auto;padding:10px 16px;background:var(--carta);border-bottom:1px solid var(--bordo)}
.filtri::-webkit-scrollbar{display:none}
.scroll .filtri{margin:12px -16px;border-top:1px solid var(--bordo)}

/* scorrimento orizzontale */
.scorri{display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;margin:0 -16px;padding-left:16px;padding-right:16px}
.veloce{flex:none;width:86px;background:#fff;border:1px solid var(--bordo);border-radius:var(--r);padding:10px 6px;display:flex;flex-direction:column;align-items:center;gap:4px;position:relative}
.veloce span{font-size:calc(var(--fs)*.76);font-weight:600;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.veloce i{position:absolute;top:-6px;right:-6px;width:26px;height:26px;border-radius:50%;background:var(--verde);color:#fff;display:flex;align-items:center;justify-content:center}
.offerta{flex:none;width:152px;background:#fff;border:1px solid var(--bordo);border-radius:var(--r);padding:12px;display:flex;flex-direction:column;gap:5px;align-items:flex-start;position:relative}
.offerta b{font-size:calc(var(--fs)*.9);line-height:1.25}
.offerta .prezzi{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.sconto{position:absolute;top:10px;right:10px;background:var(--rosso);color:#fff;font-size:calc(var(--fs)*.72);font-weight:700;padding:2px 7px;border-radius:8px}

/* cartellino prezzo */
.cartellino{display:inline-flex;align-items:center;gap:6px;background:var(--sole);color:var(--inch);border-radius:6px 11px 11px 6px;padding:4px 10px 4px 8px;font-family:var(--f-dis);font-weight:800;font-size:calc(var(--fs)*.95)}
.cartellino::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--carta);box-shadow:inset 0 0 0 1px rgba(0,0,0,.2)}
.cartellino small{font-weight:600;opacity:.75;font-size:.8em}

/* griglia prodotti */
.griglia{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.prod{background:#fff;border:1px solid var(--bordo);border-radius:var(--r);padding:10px;display:flex;flex-direction:column;position:relative}
.prod.dentro{border-color:var(--verde);box-shadow:0 0 0 1.5px rgba(31,107,69,.2)}
.prodtocca{display:flex;flex-direction:column;gap:3px;align-items:flex-start;width:100%}
.prodfig{width:100%;background:var(--tenue);border-radius:12px;display:flex;align-items:center;justify-content:center;padding:8px;position:relative}
.pochi{position:absolute;bottom:5px;left:5px;background:#fff;color:var(--rosso);font-size:calc(var(--fs)*.68);font-weight:700;padding:2px 7px;border-radius:7px}
.prod b{font-size:calc(var(--fs)*.9);line-height:1.25;margin-top:5px}
.orig{color:var(--grigio);font-size:calc(var(--fs)*.76);line-height:1.3}
.prod .cartellino{margin-top:5px}
.stellina{position:absolute;top:14px;right:14px;width:31px;height:31px;border-radius:50%;background:rgba(255,255,255,.92);display:flex;align-items:center;justify-content:center;color:var(--grigio)}
.stellina.on{color:var(--sole)}
.prodazione{margin-top:auto;padding-top:9px}
.finito{display:block;text-align:center;background:#F1EDEA;color:var(--rosso);border-radius:11px;padding:11px;font-size:calc(var(--fs)*.82);font-weight:600}

/* stepper */
.stepper{display:flex;align-items:center;justify-content:space-between;gap:6px;background:var(--tenue);border-radius:var(--rb);padding:4px}
.stepper.largo{width:100%}
.stepper button{width:40px;height:40px;border-radius:calc(var(--rb) - 4px);background:#fff;display:flex;align-items:center;justify-content:center;color:var(--verde);flex:none;border:1px solid var(--bordo)}
.stepper button[disabled]{opacity:.4}
.stepper span{flex:1;text-align:center;font-weight:700;font-size:calc(var(--fs)*.88)}

/* barra fondo */
.barrafondo{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--verde2);color:#fff;padding:10px 14px}
.barrafondo small{display:block;color:#BFD6BF;font-size:calc(var(--fs)*.76)}
.fondoazione{flex:none;background:#fff;border-top:1px solid var(--bordo);padding:11px 14px calc(11px + env(safe-area-inset-bottom))}
.fondoazione .btn.largo:first-child{margin-top:0}
.notagelo{background:#DCF1FA;color:#06344A;border-radius:11px;padding:9px 11px;font-size:calc(var(--fs)*.8);margin-bottom:9px}

/* prodotto */
.prodgrande{background:var(--tenue);border-radius:var(--r);display:flex;align-items:center;justify-content:center;padding:22px}
.titolone{font-family:var(--f-dis);font-size:calc(var(--fs)*1.4);font-weight:800;line-height:1.15;margin-top:14px}
.sottotitolo{color:var(--grigio);font-size:calc(var(--fs)*.88);margin-top:3px}
.rigaprezzo{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px}
.giacenza{background:#E3F1E1;color:#1C5B33;border-radius:9px;padding:4px 10px;font-size:calc(var(--fs)*.8);font-weight:600}
.giacenza.bassa{background:#FFF1D6;color:#6A4A05}

/* scelte radio */
.scelte{display:flex;flex-direction:column;gap:8px}
.scelta{display:flex;gap:11px;align-items:center;border:1.5px solid var(--bordo);border-radius:var(--rb);padding:12px;background:#fff;min-height:54px}
.scelta.on{border-color:var(--verde);background:#F1F8F0}
.scelta b{display:block;font-size:calc(var(--fs)*.92)}
.scelta small{color:var(--grigio);font-size:calc(var(--fs)*.8);line-height:1.35}
.radio{width:22px;height:22px;border-radius:50%;border:2px solid var(--bordo);flex:none;display:flex;align-items:center;justify-content:center;color:#fff}
.scelta.on .radio,.subito.on .radio{border-color:var(--verde);background:var(--verde)}
.scelteline{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}

/* carrello */
.rigacarrello{display:flex;gap:11px;background:#fff;border:1px solid var(--bordo);border-radius:var(--r);padding:11px;margin-bottom:10px}
.minifig{width:58px;height:58px;border-radius:12px;background:var(--tenue);display:flex;align-items:center;justify-content:center;flex:none}
.rigacorpo{flex:1;min-width:0}
.rigacorpo>b{font-size:calc(var(--fs)*.94);line-height:1.25}
.rigafondo{display:flex;align-items:center;gap:9px;margin-top:9px}
.rigafondo .stepper{flex:1}
.tot{font-size:calc(var(--fs)*1)}
.conti{background:#fff;border:1px solid var(--bordo);border-radius:var(--r);padding:14px;margin-top:6px}
.conto{display:flex;justify-content:space-between;gap:10px;padding:5px 0;font-size:calc(var(--fs)*.92)}
.conto.grosso{font-family:var(--f-dis);font-size:calc(var(--fs)*1.2);font-weight:800;border-top:1.5px dashed var(--bordo);margin-top:8px;padding-top:10px}
.rigariep{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--bordo);font-size:calc(var(--fs)*.88)}
.rigariep:last-of-type{border-bottom:0}

/* campi */
.campo{display:flex;flex-direction:column;gap:5px;margin-bottom:11px}
.etichetta{font-weight:700;font-size:calc(var(--fs)*.86)}
.campo input,.campo textarea,.campo select{border:1.5px solid var(--bordo);border-radius:12px;padding:12px;min-height:50px;background:#fff;width:100%;outline:0}
.campo input:focus,.campo textarea:focus{border-color:var(--verde)}
.campo small{color:var(--grigio);font-size:calc(var(--fs)*.76)}
.campo small.rosso{color:var(--rosso);font-weight:600}
.campo.male input,.campo.male textarea{border-color:var(--rosso);background:#FFF8F7}
.due{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cartaform{margin-top:12px;background:var(--tenue);border-radius:12px;padding:12px 12px 2px}

/* consegna */
.duebottoni{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.grossa{border:1.5px solid var(--bordo);border-radius:var(--rb);padding:13px;background:#fff;display:flex;flex-direction:column;gap:3px;min-height:92px}
.grossa.on{border-color:var(--verde);background:#F1F8F0}
.grossa b{font-size:calc(var(--fs)*.9)}
.grossa small{color:var(--grigio);font-size:calc(var(--fs)*.8)}
.giorno{flex:none;width:80px;border:1.5px solid var(--bordo);border-radius:var(--rb);background:#fff;padding:11px 6px;text-align:center}
.giorno b{display:block;font-size:calc(var(--fs)*.9)}
.giorno span{color:var(--grigio);font-size:calc(var(--fs)*.78)}
.giorno.on{background:var(--verde);border-color:var(--verde);color:#fff}
.giorno.on span{color:#DCEBDA}
.giorno[disabled]{opacity:.4}
.subito{display:flex;align-items:center;gap:11px;width:100%;border:1.5px solid var(--sole);background:#FFF7E4;border-radius:var(--rb);padding:13px;margin-top:12px;min-height:62px}
.subito span{flex:1}
.subito b{display:block;font-size:calc(var(--fs)*.94)}
.subito small{color:#6A4A05;font-size:calc(var(--fs)*.8)}
.subito.on{background:var(--sole)}
.subito .radio{flex:none;width:22px}
.fasce{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:12px}
.fascia{border:1.5px solid var(--bordo);border-radius:var(--rb);background:#fff;padding:11px;min-height:62px}
.fascia b{display:block;font-size:calc(var(--fs)*.9)}
.fascia span{color:var(--grigio);font-size:calc(var(--fs)*.76)}
.fascia.on{background:var(--verde);border-color:var(--verde);color:#fff}
.fascia.on span{color:#DCEBDA}
.fascia[disabled]{opacity:.45;background:#EFF1EC}
.interruttore{display:flex;align-items:center;gap:12px;margin-top:14px;padding-top:12px;border-top:1px solid var(--bordo)}
.interruttore span{flex:1}
.interruttore b{display:block;font-size:calc(var(--fs)*.9)}
.interruttore small{color:var(--grigio);font-size:calc(var(--fs)*.8);line-height:1.35}
.switch{width:52px;height:31px;border-radius:99px;background:#D4DACF;position:relative;flex:none;transition:background .18s}
.switch i{position:absolute;top:2.5px;left:3px;width:26px;height:26px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .18s}
.switch.on{background:var(--verde)}
.switch.on i{left:23px}
.sab.android .switch{width:50px;height:28px;background:#CFD6CC}
.sab.android .switch i{width:20px;height:20px;top:4px;left:5px;background:#8A968B}
.sab.android .switch.on i{left:25px;background:#fff}

/* esito */
.esito{text-align:center;padding:26px 6px}
.spunta{width:84px;height:84px;border-radius:50%;background:var(--verde);color:#fff;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
.esito h1{font-family:var(--f-dis);font-size:calc(var(--fs)*1.4);font-weight:800}
.esito p{color:var(--grigio);margin-top:6px;font-size:calc(var(--fs)*.92)}
.codice{display:inline-block;background:var(--tenue);border-radius:11px;padding:8px 18px;font-family:var(--f-dis);font-weight:800;letter-spacing:.05em;margin:14px 0}

/* ordini */
.cardordine{display:block;width:100%;background:#fff;border:1px solid var(--bordo);border-radius:var(--r);padding:13px;margin-bottom:11px}
.cardordine.piena{margin-bottom:10px}
.cardordine>.riga{margin-bottom:6px}
.cardordine b{font-family:var(--f-dis)}
.tracciato{display:flex;gap:4px;margin:9px 0 6px}
.tracciato i{flex:1;height:6px;border-radius:3px;background:#E4E8E0}
.tracciato i.on{background:var(--verde)}
.pillola{display:inline-block;border-radius:999px;padding:4px 11px;font-size:calc(var(--fs)*.76);font-weight:700}
.pillola.mini{margin-top:8px;background:var(--tenue);color:var(--verde)}
.st-nuovo{background:#FFF1D6;color:#7A5405}
.st-preparazione{background:#E1EEFB;color:#14497C}
.st-consegna{background:#E3F1E1;color:#1C5B33}
.st-consegnato{background:#EDEFEA;color:#4E5A4C}
.st-annullato{background:#FBECE8;color:#8A2A15}
.linea{background:#fff;border:1px solid var(--bordo);border-radius:var(--r);padding:14px}
.tappa{display:flex;gap:12px;align-items:flex-start;padding-bottom:14px;position:relative}
.tappa:last-child{padding-bottom:0}
.tappa::before{content:"";position:absolute;left:11px;top:22px;bottom:0;width:2px;background:#E4E8E0}
.tappa:last-child::before{display:none}
.tappa .punto{width:24px;height:24px;border-radius:50%;background:#E4E8E0;flex:none;display:flex;align-items:center;justify-content:center;color:#fff;z-index:1}
.tappa.on .punto{background:var(--verde)}
.tappa.on::before{background:var(--verde)}
.tappa b{display:block;font-size:calc(var(--fs)*.92)}
.tappa small{color:var(--grigio);font-size:calc(var(--fs)*.8)}
.dett{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--bordo);font-size:calc(var(--fs)*.88)}
.dett:last-child{border-bottom:0}
.dett span{color:var(--grigio);flex:none;max-width:45%}
.dett b{text-align:right}

/* vuoto */
.vuoto{text-align:center;background:#fff;border:1.5px dashed var(--bordo);border-radius:var(--r);padding:26px 18px;display:flex;flex-direction:column;align-items:center;gap:7px}
.vuoto.alto{margin-top:34px;border:0;background:none}
.vuoto b{font-family:var(--f-dis);font-size:calc(var(--fs)*1.06)}
.vuoto span{color:var(--grigio);font-size:calc(var(--fs)*.86);max-width:30ch;line-height:1.45}
.vuoto .btn{margin-top:8px}

/* betta */
.bettabanner{display:flex;align-items:center;gap:12px;background:var(--verde2);color:#fff;border-radius:var(--r);padding:13px;margin-top:18px;width:100%}
.bettabanner.piatto{background:#fff;color:var(--verde2);border:1px solid var(--bordo)}
.bettabanner span{flex:1;min-width:0}
.bettabanner b{display:block;font-size:calc(var(--fs)*.94)}
.bettabanner small{opacity:.8;font-size:calc(var(--fs)*.8);line-height:1.35;display:block}
.chat{flex:1;min-height:0;overflow-y:auto;padding:14px 14px 6px;display:flex;flex-direction:column;gap:9px}
.bolla{max-width:82%;padding:11px 13px;border-radius:18px;font-size:calc(var(--fs)*.92);line-height:1.45}
.bolla p{white-space:pre-wrap}
.bolla.betta{background:#fff;border:1px solid var(--bordo);border-bottom-left-radius:6px;align-self:flex-start}
.bolla.io{background:var(--verde);color:#fff;border-bottom-right-radius:6px;align-self:flex-end}
.bolla .btn{margin-top:9px}
.punti{display:flex;gap:4px;padding:3px 0}
.punti i{width:7px;height:7px;border-radius:50%;background:var(--grigio);animation:salta 1s infinite}
.punti i:nth-child(2){animation-delay:.15s}
.punti i:nth-child(3){animation-delay:.3s}
@keyframes salta{0%,60%,100%{opacity:.3}30%{opacity:1}}
.rapide{flex:none;display:flex;gap:8px;overflow-x:auto;padding:8px 14px}
.barrachat{flex:none;display:flex;gap:8px;align-items:center;background:#fff;border-top:1px solid var(--bordo);padding:9px 12px calc(9px + env(safe-area-inset-bottom))}
.barrachat input{flex:1;min-width:0;border:1.5px solid var(--bordo);border-radius:999px;padding:11px 15px;min-height:46px;outline:0}
.barrachat input:focus{border-color:var(--verde)}
.invia{width:46px;height:46px;border-radius:50%;background:var(--verde);color:#fff;display:flex;align-items:center;justify-content:center;flex:none}
.invia[disabled]{opacity:.4}

/* profilo */
.profilotesta{display:flex;align-items:center;gap:13px;background:#fff;border:1px solid var(--bordo);border-radius:var(--r);padding:14px;margin-bottom:12px}
.iniziale{width:52px;height:52px;border-radius:50%;background:var(--verde);color:#fff;display:flex;align-items:center;justify-content:center;font-family:var(--f-dis);font-size:22px;font-weight:800}
.profilotesta b{display:block;font-size:calc(var(--fs)*1.02)}
.profilotesta span{color:var(--grigio);font-size:calc(var(--fs)*.85)}
.voce{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--bordo);border-radius:var(--r);padding:13px;margin-bottom:10px;width:100%;color:var(--verde2)}
.voce span{flex:1;min-width:0}
.voce b{display:block;font-size:calc(var(--fs)*.92)}
.voce small{color:var(--grigio);font-size:calc(var(--fs)*.8);display:block;line-height:1.35}
.voce.scura{background:var(--verde2);color:#fff;border-color:var(--verde2)}
.voce.scura small{color:#BFD6BF}
.faq{background:#fff;border:1px solid var(--bordo);border-radius:var(--r);padding:13px;margin-bottom:10px}
.faq b{display:block;font-size:calc(var(--fs)*.94);margin-bottom:5px}
.faq p{color:var(--grigio);font-size:calc(var(--fs)*.87);line-height:1.45}

/* pin */
.schermo.scuro{background:#0E2A18;color:#fff}
.schermo.scuro .testata{background:#0E2A18}
.pinbox{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px 26px calc(24px + env(safe-area-inset-bottom));color:#fff}
.pinbox>b{font-size:calc(var(--fs)*1.02)}
.pallini{display:flex;gap:13px;margin:6px 0}
.pallini i{width:14px;height:14px;border-radius:50%;border:2px solid #4E7A5C}
.pallini i.on{background:#fff;border-color:#fff}
.pallini.male{animation:trema .4s}
.pallini.fila i{width:9px;height:9px;border-color:#C6CFC2;margin-top:6px}
.pallini.fila i.on{background:var(--verde);border-color:var(--verde)}
@keyframes trema{25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}
.tastiera{display:grid;grid-template-columns:repeat(3,76px);gap:14px;margin-top:14px}
.tastiera button{height:68px;border-radius:50%;background:rgba(255,255,255,.1);color:#fff;font-size:26px;font-weight:600;display:flex;align-items:center;justify-content:center}
.tastiera button:active{background:rgba(255,255,255,.22)}
.tastiera .canc{font-size:22px;background:none}

/* negozio */
.negozio{background:#F0F2ED}
.kpi{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.kpi>div{background:#fff;border:1px solid var(--bordo);border-radius:var(--r);padding:13px}
.kpi span{color:var(--grigio);font-size:calc(var(--fs)*.8)}
.kpi b{display:block;font-family:var(--f-dis);font-size:calc(var(--fs)*1.35);font-weight:800;margin-top:3px}
.ordcard{background:#fff;border:1px solid var(--bordo);border-radius:var(--r);padding:13px;margin-bottom:11px}
.ordtesta{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;width:100%}
.ordtesta b{display:block;font-family:var(--f-dis);font-size:calc(var(--fs)*.98)}
.ordtesta span{color:var(--grigio);font-size:calc(var(--fs)*.8)}
.ordriep{display:flex;flex-direction:column;gap:2px;margin:9px 0;color:var(--grigio);font-size:calc(var(--fs)*.84)}
.ordfondo{display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid var(--bordo);padding-top:10px}
.ordfondo b{font-family:var(--f-dis);font-size:calc(var(--fs)*1.06)}
.azioni{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}
.azionifila{display:flex;flex-direction:column;gap:9px}
.azionifila .btn.largo{margin-top:0}
.azionifila>.btn.mini{width:auto}
.pesariga{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--bordo)}
.pesariga span{flex:1;font-size:calc(var(--fs)*.88)}
.pesariga small{display:block;color:var(--grigio);font-size:calc(var(--fs)*.76)}
.pesariga input{width:82px;border:1.5px solid var(--bordo);border-radius:10px;padding:9px;text-align:right;min-height:44px}
.pesariga em{font-style:normal;color:var(--grigio);font-size:calc(var(--fs)*.82);width:22px}

.gelocard{background:#fff;border:1.5px solid var(--bordo);border-radius:var(--r);padding:14px;margin-bottom:12px}
.gelocard.acceso{border-color:#5FB8DC;background:#F2FAFD}
.gelotesta{display:flex;align-items:center;gap:12px}
.gelotesta div{flex:1}
.gelotesta b{display:block;font-size:calc(var(--fs)*.98)}
.gelotesta small{color:var(--grigio);font-size:calc(var(--fs)*.8);line-height:1.35;display:block}
.gelocard .due{margin-top:14px}
.gelocard .azionifila{margin-top:10px;flex-direction:row;flex-wrap:wrap}
.diff{background:#fff;border:1px solid #C9E6F2;border-radius:12px;padding:11px;margin-top:12px;display:flex;flex-direction:column;gap:3px}
.diff b{font-size:calc(var(--fs)*.88)}
.diff span{color:var(--grigio);font-size:calc(var(--fs)*.8)}

.merce{display:flex;gap:11px;background:#fff;border:1px solid var(--bordo);border-radius:var(--r);padding:11px;margin-bottom:10px}
.merce.spenta{opacity:.55}
.mercefig{width:52px;height:52px;border-radius:12px;background:var(--tenue);display:flex;align-items:center;justify-content:center;flex:none}
.mercecorpo{flex:1;min-width:0}
.mercecorpo>b{font-size:calc(var(--fs)*.92)}
.mercecorpo>small{display:block;color:var(--grigio);font-size:calc(var(--fs)*.78)}
.mercecampi{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:9px}
.mercecampi label{display:flex;align-items:center;gap:5px;background:var(--carta);border-radius:10px;padding:5px 8px}
.mercecampi span{font-size:calc(var(--fs)*.72);color:var(--grigio);flex:none}
.mercecampi input{width:100%;min-width:0;border:0;background:none;text-align:right;font-weight:700;outline:0;min-height:34px}
.mercecampi em{font-style:normal;font-size:calc(var(--fs)*.72);color:var(--grigio);flex:none}
.mercefondo{display:flex;align-items:center;gap:7px;margin-top:9px;flex-wrap:wrap}
.mercefondo .switch{margin-left:auto}

.slot{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#fff;border:1px solid var(--bordo);border-radius:var(--r);padding:12px;margin-bottom:9px}
.slot b{display:block;font-size:calc(var(--fs)*.94)}
.slot small{color:var(--grigio);font-size:calc(var(--fs)*.8)}
.slot.pieno{background:#FFF7E4}
.slot.bloc{background:#F1EDEA;opacity:.85}
.barra{display:flex;align-items:center;gap:9px;padding:6px 0}
.barra span{width:58px;font-size:calc(var(--fs)*.84);color:var(--grigio)}
.barra i{flex:1;height:11px;border-radius:99px;background:#EBEEE8;overflow:hidden;display:block}
.barra i b{display:block;height:100%;background:var(--sole);border-radius:99px}
.barra em{font-style:normal;font-size:calc(var(--fs)*.8);width:86px;text-align:right}

/* foglio modale */
.velo{position:absolute;inset:0;background:rgba(10,25,15,.5);z-index:60;display:flex;align-items:flex-end}
.foglio{background:var(--carta);width:100%;max-height:88%;border-radius:22px 22px 0 0;display:flex;flex-direction:column;animation:sale .22s ease-out}
@keyframes sale{from{transform:translateY(20%)}to{transform:translateY(0)}}
.maniglia{width:38px;height:4px;border-radius:2px;background:#C9D0C5;margin:9px auto 4px;flex:none}
.foglitesta{display:flex;align-items:center;justify-content:space-between;padding:6px 16px 10px;flex:none}
.foglitesta b{font-family:var(--f-dis);font-size:calc(var(--fs)*1.08)}
.foglicorpo{overflow-y:auto;padding:0 16px calc(20px + env(safe-area-inset-bottom))}
.scontrino{background:#fff;border-radius:12px;padding:16px;font-size:calc(var(--fs)*.88)}
.scontrino b{font-family:var(--f-dis)}
.scontrino span{display:block;color:var(--grigio)}
.scontrino hr{border:0;border-top:1.5px dashed var(--bordo);margin:11px 0}
.sriga{display:flex;justify-content:space-between;gap:10px;padding:3px 0}
.sriga span{color:inherit}
.sriga.grande{font-family:var(--f-dis);font-size:calc(var(--fs)*1.14);font-weight:800;margin-top:5px}

/* avviso */

/* ---------------- logo ---------------- */
.logo{display:flex;align-items:center;gap:11px}
.logo .emblema{width:40px;height:40px;flex:none;line-height:0}
.logo .emblema svg{display:block;width:100%;height:100%}
.logo .parola{display:flex;flex-direction:column;line-height:1}
.logo .parola b{font-family:var(--f-dis);font-size:calc(var(--fs)*1.24);font-weight:800;letter-spacing:.01em;color:#D81E18}
.logo .parola i{font-style:normal;font-size:calc(var(--fs)*.78);color:#1E8A3C;margin-top:3px;letter-spacing:.02em}
.logo.scuro .parola b{color:#FFFFFF}
.logo.scuro .parola i{color:#9BD7A6}
.logo.s .emblema{width:32px;height:32px}
.logo.s .parola b{font-size:calc(var(--fs)*1.02)}
.logo.s .parola i{font-size:calc(var(--fs)*.7)}
.logo.grande{flex-direction:column;gap:8px;text-align:center}
.logo.grande .emblema{width:76px;height:76px}
.logo.grande .parola{align-items:center}
.logo.grande .parola b{font-size:calc(var(--fs)*1.6)}
.testata.home.chiara{background:#fff;color:var(--verde2);border-bottom:1px solid var(--bordo);align-items:center;gap:10px;padding:10px 14px 11px}
.testata.home.chiara .logo{flex:0 1 auto;min-width:0}
.testata.home.chiara .tondino{background:var(--tenue);color:var(--verde)}

/* ---------------- prezzi e offerte ---------------- */
.prezzoblocco{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap}
.cartellino.off{background:var(--rosso);color:#fff}
.cartellino.off::before{background:var(--carta);box-shadow:inset 0 0 0 1px rgba(0,0,0,.25)}
.listino{color:var(--grigio);font-size:calc(var(--fs)*.82);text-decoration:line-through}
.bollino{position:absolute;top:6px;left:6px;background:var(--rosso);color:#fff;font-size:calc(var(--fs)*.7);font-weight:800;padding:3px 8px;border-radius:8px;letter-spacing:.01em}
.bollino.grande{position:static;font-size:calc(var(--fs)*.78);padding:5px 11px;border-radius:9px}
.bollino.mini{top:-4px;left:-4px;font-size:calc(var(--fs)*.64);padding:2px 6px}
.offerta .prezzoblocco{margin-top:2px}


/* ---------------- Betta: avatar e testa che galleggia ---------------- */
.bettavatar{display:inline-block;line-height:0;flex:none}
.bettavatar svg{display:block;overflow:visible}
.bettatesta{transform-box:fill-box;transform-origin:50% 88%;will-change:transform}
.bettatesta.fluttua{animation:galleggia 3.8s ease-in-out infinite}
@keyframes galleggia{
  0%{transform:translateY(0) rotate(0deg)}
  35%{transform:translateY(-1.6px) rotate(-1.4deg)}
  70%{transform:translateY(-.5px) rotate(1deg)}
  100%{transform:translateY(0) rotate(0deg)}
}

/* ---------------- Betta in basso a destra ---------------- */
.bettadock{position:absolute;right:6px;bottom:2px;z-index:30;display:flex;flex-direction:column;align-items:flex-end;gap:4px;
  transform:translate(10px,6px);transition:transform .32s ease,opacity .32s ease,bottom .22s ease}
.bettadock.dentro{transform:translate(0,0)}
.bettadock.via{transform:translate(46px,14px);opacity:.35}
.bettadock.alto{bottom:74px}
.bettatocca{width:92px;height:92px;padding:0;background:none;display:flex;align-items:flex-end;justify-content:center;flex:none;
  filter:drop-shadow(0 6px 10px rgba(20,40,25,.22))}
.bettatocca:active{transform:scale(.96)}
.fumetto{display:flex;align-items:flex-start;gap:2px;background:#fff;border:1.5px solid var(--bordo);border-radius:16px;
  padding:9px 6px 9px 13px;max-width:196px;margin-right:12px;box-shadow:0 5px 14px rgba(18,40,26,.14);position:relative;animation:fumettoentra .28s ease-out}
.fumetto::after{content:"";position:absolute;right:20px;bottom:-6.5px;width:11px;height:11px;background:#fff;border-right:1.5px solid var(--bordo);
  border-bottom:1.5px solid var(--bordo);transform:rotate(45deg);border-bottom-right-radius:3px}
.fumettotesto{font-size:calc(var(--fs)*.82);font-weight:600;line-height:1.3;color:var(--verde2);padding:0}
.fumettox{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--grigio);flex:none;margin-top:-2px}
@keyframes fumettoentra{from{opacity:0;transform:translateY(6px) scale(.96)}to{opacity:1;transform:none}}

/* ---------------- coupon lato cliente ---------------- */
.conto.verde b,.conto.verde span{color:#1C5B33}
.couponriga{display:flex;gap:9px;align-items:center}
.couponriga input{flex:1;min-width:0;border:1.5px dashed var(--bordo);border-radius:12px;padding:12px;min-height:50px;background:#fff;outline:0;
  font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.couponriga input:focus{border-color:var(--verde);border-style:solid}
.couponok{display:flex;align-items:center;gap:10px;justify-content:space-between;background:#E3F1E1;border:1.5px dashed #8FBE93;border-radius:12px;padding:12px}
.couponok b{display:block;font-family:var(--f-dis);letter-spacing:.06em}
.couponok small{color:#2A6B3E;font-size:calc(var(--fs)*.8)}
.notagelo.rossa{background:#FBECE8;color:#7C2414}
.banda .link{margin-top:7px;display:inline-block}

/* ---------------- merce lato negozio ---------------- */
.cerca.scuro{background:#fff;margin-bottom:10px}
.mercetesta{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.mercetesta b{display:block;font-size:calc(var(--fs)*.94);line-height:1.25}
.mercetesta small{color:var(--grigio);font-size:calc(var(--fs)*.78);display:block}
.mercefig{position:relative}
.strisciaofferta{background:#FBECE8;color:#7C2414;border-radius:9px;padding:6px 9px;font-size:calc(var(--fs)*.78);font-weight:600;margin-top:8px}
.aggiungimerce{display:flex;align-items:center;gap:12px;width:100%;background:var(--sole);color:var(--inch);border-radius:var(--r);
  padding:13px;margin-bottom:12px;box-shadow:0 2px 0 #C4890F}
.aggiungimerce b{display:block;font-size:calc(var(--fs)*.98)}
.aggiungimerce small{display:block;font-size:calc(var(--fs)*.8);opacity:.8;line-height:1.3}
.aggiungimerce span:nth-child(2){flex:1;min-width:0}
.aggiungimerce:active{transform:translateY(1px);box-shadow:none}
.piutondo{width:38px;height:38px;border-radius:50%;background:rgba(0,0,0,.14);display:flex;align-items:center;justify-content:center;flex:none}
.disegni{display:grid;grid-template-columns:repeat(6,1fr);gap:7px;margin-top:4px}
.disegno{aspect-ratio:1;border:1.5px solid var(--bordo);border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;padding:2px}
.disegno.on{border-color:var(--verde);background:var(--tenue);box-shadow:0 0 0 1.5px rgba(31,107,69,.25)}
.anteprima{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--bordo);border-radius:var(--r);padding:12px;margin-bottom:12px}
.anteprima b{display:block}
.anteprima small{color:var(--grigio);font-size:calc(var(--fs)*.8)}
.anteprimaprezzo{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;background:var(--tenue);border-radius:12px;padding:12px;margin:12px 0}
.anteprimaprezzo span{color:var(--grigio);font-size:calc(var(--fs)*.82)}
.anteprimaprezzo b{font-family:var(--f-dis);font-size:calc(var(--fs)*1.5);font-weight:800}
.anteprimaprezzo s{color:var(--grigio)}
.anteprimaprezzo em{font-style:normal;color:var(--grigio);font-size:calc(var(--fs)*.8)}

/* ---------------- fasce: selezione multipla ---------------- */
.grigliaore{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
.ora{border:1.5px solid var(--bordo);background:#fff;border-radius:12px;padding:11px 4px;text-align:center;font-weight:600;font-size:calc(var(--fs)*.84);min-height:46px}
.ora.on{background:var(--verde);border-color:var(--verde);color:#fff}
.riepilogosel{background:var(--tenue);border-radius:11px;padding:11px;margin-top:12px;font-size:calc(var(--fs)*.86);font-weight:600}
.dett b .link{margin-left:10px}

/* ---------------- codici sconto ---------------- */
.coupon{background:#fff;border:1px solid var(--bordo);border-radius:var(--r);padding:13px;margin-bottom:11px;position:relative;overflow:hidden}
.coupon::before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--sole)}
.coupon.spento{opacity:.55}
.coupon.spento::before{background:var(--grigio)}
.coupontesta{display:flex;align-items:center;justify-content:space-between;gap:10px}
.coupontesta b{display:block;font-family:var(--f-dis);font-size:calc(var(--fs)*1.08);letter-spacing:.07em}
.coupontesta small{color:var(--grigio);font-size:calc(var(--fs)*.82);display:block}
.couponfatti{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;color:var(--grigio);font-size:calc(var(--fs)*.8)}
.coupon .mercefondo{margin-top:10px;border-top:1px solid var(--bordo);padding-top:10px}

/* ---------------- foto e video ---------------- */
.caricatori{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
.caricatore{display:flex;flex-direction:column;align-items:center;gap:7px;background:#fff;border:1.5px solid var(--bordo);border-radius:14px;
  padding:12px 6px;font-size:calc(var(--fs)*.76);font-weight:600;text-align:center;min-height:86px;justify-content:center;line-height:1.2}
.caricatore:active{background:var(--tenue)}
.caricaico{width:38px;height:38px;border-radius:12px;background:var(--tenue);color:var(--verde);display:flex;align-items:center;justify-content:center}
.scelti{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
.scelto{position:relative;width:74px;height:74px;border-radius:12px;overflow:hidden;background:var(--tenue);display:flex;align-items:center;justify-content:center}
.scelto img{width:100%;height:100%;object-fit:cover}
.scelticona{color:var(--verde)}
.scelto .tondino{position:absolute;top:2px;right:2px;width:24px;height:24px;background:#fff;color:var(--rosso);box-shadow:0 1px 4px rgba(0,0,0,.25)}
.tagvideo{position:absolute;left:4px;bottom:4px;background:rgba(0,0,0,.6);color:#fff;font-size:10px;border-radius:6px;padding:1px 6px}
.galleria{display:flex;flex-direction:column;gap:8px}
.copertina video{width:100%;display:block;max-height:280px;background:#000}
.videoscaduto{display:flex;flex-direction:column;align-items:center;gap:8px;padding:18px;text-align:center;color:var(--grigio);font-size:calc(var(--fs)*.82)}
.videoscaduto img{width:100%;border-radius:10px;max-height:170px;object-fit:cover}
.miniature{display:flex;gap:7px;overflow-x:auto}
.miniature::-webkit-scrollbar{display:none}
.miniature button{position:relative;width:54px;height:54px;border-radius:10px;overflow:hidden;flex:none;border:2px solid transparent;background:var(--tenue)}
.miniature button.on{border-color:var(--verde)}
.miniature img{width:100%;height:100%;object-fit:cover}
.minivideo{position:absolute;inset:0;background:rgba(0,0,0,.28)}
.minifoto{width:100%;height:100%;object-fit:cover;border-radius:12px}
.postlink{display:inline-flex;align-items:center;gap:7px;margin-top:10px;color:var(--verde);font-weight:700;font-size:calc(var(--fs)*.84)}

/* ---------------- community e accesso ---------------- */
.piazzastriscia{margin:14px 0 4px}
.novita{flex:none;width:146px;background:#fff;border:1px solid var(--bordo);border-radius:var(--r);padding:9px;display:flex;flex-direction:column;gap:6px;align-items:flex-start;text-align:left}
.novitacover{width:100%;height:76px;border-radius:11px;background:var(--tenue);display:flex;align-items:center;justify-content:center;overflow:hidden}
.novitacover img{width:100%;height:100%;object-fit:cover}
.novita b{font-size:calc(var(--fs)*.82);line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.filtripost{display:flex;gap:6px;overflow-x:auto;margin-top:10px;padding-bottom:2px}
.filtripost::-webkit-scrollbar{display:none}
.filtripost button{flex:none;padding:7px 14px;border-radius:999px;background:rgba(255,255,255,.14);color:inherit;font-size:calc(var(--fs)*.82);font-weight:600}
.filtripost button.on{background:#fff;color:var(--verde2)}
.post{background:#fff;border:1px solid var(--bordo);border-radius:var(--r);padding:14px;margin-bottom:13px}
.posttesta{display:flex;align-items:center;gap:10px;margin-bottom:11px}
.posttesta div{flex:1;min-width:0}
.posttesta b{display:block;font-size:calc(var(--fs)*.9)}
.posttesta small{color:var(--grigio);font-size:calc(var(--fs)*.78)}
.postavatar{width:34px;height:34px;flex:none;display:flex;align-items:center;justify-content:center}
.postavatar .logo .emblema{width:34px;height:34px}
.posttipo{color:#fff;border-radius:999px;padding:3px 10px;font-size:calc(var(--fs)*.72);font-weight:700;flex:none}
.posttipo.piccolo{display:inline-block;margin-bottom:4px;font-size:calc(var(--fs)*.68);padding:2px 8px}
.copertina{border-radius:14px;overflow:hidden;background:var(--tenue);display:flex;align-items:center;justify-content:center;min-height:120px}
.copertina.alta{min-height:150px}
.copertina img{width:100%;display:block;object-fit:cover;max-height:220px}
.copertina .video{display:flex;flex-direction:column;align-items:center;gap:8px;color:var(--verde2);font-weight:600;font-size:calc(var(--fs)*.84);padding:22px}
.copertina .play{width:52px;height:52px;border-radius:50%;background:#fff;color:var(--verde);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(18,40,26,.18)}
.posttitolo{font-family:var(--f-dis);font-size:calc(var(--fs)*1.08);font-weight:700;margin-top:12px;line-height:1.25}
.posttesto{color:var(--grigio);font-size:calc(var(--fs)*.9);line-height:1.5;margin-top:6px}
.postprodotto{display:flex;align-items:center;gap:10px;background:var(--carta);border-radius:12px;padding:9px;margin-top:11px}
.postprodotto div:nth-child(2){flex:1;min-width:0}
.postprodotto b{display:block;font-size:calc(var(--fs)*.86)}
.postprodotto small{color:var(--grigio);font-size:calc(var(--fs)*.78)}
.postfondo{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;border-top:1px solid var(--bordo);padding-top:11px}
.cuore{display:inline-flex;align-items:center;gap:7px;color:var(--grigio);font-weight:600;font-size:calc(var(--fs)*.86)}
.cuore.on{color:#C6351E}
.chiedi{color:var(--verde);font-weight:700;font-size:calc(var(--fs)*.84)}
.postadmin{display:flex;gap:11px;align-items:center;background:#fff;border:1px solid var(--bordo);border-radius:var(--r);padding:11px;margin-bottom:10px}
.postadmincorpo{flex:1;min-width:0}
.postadmincorpo b{display:block;font-size:calc(var(--fs)*.9);line-height:1.25}
.postadmincorpo small{color:var(--grigio);font-size:calc(var(--fs)*.78)}
.postadminazioni{display:flex;align-items:center;gap:7px;flex:none}

.sceltagrande{display:flex;align-items:center;gap:13px;width:100%;background:#fff;border:1.5px solid var(--bordo);border-radius:var(--r);padding:16px;margin-bottom:11px;min-height:80px}
.sceltagrande span:nth-child(2){flex:1;min-width:0}
.sceltagrande b{display:block;font-size:calc(var(--fs)*1.02)}
.sceltagrande small{display:block;color:var(--grigio);font-size:calc(var(--fs)*.84);line-height:1.35}
.sceltaico{width:48px;height:48px;border-radius:14px;background:var(--tenue);color:var(--verde);display:flex;align-items:center;justify-content:center;flex:none}
.sceltagrande.verde{border-color:var(--verde);background:#F3F8F2}
.sceltagrande.piatta{background:var(--carta);border-style:dashed}
.accessotesta p b{color:var(--verde2)}
.voce.personale{background:var(--verde2);color:#fff;border-color:var(--verde2)}
.voce.personale small{color:#BFD6BF}

/* ---------------- livelli, solita spesa, commercianti ---------------- */
.pomodorino{display:inline-block;flex:none;line-height:0}
.pomodorino svg{display:block}
.voce .pomodorino,.puntiriga .pomodorino,.livelloriga .pomodorino{flex:0 0 auto}
.livello{display:inline-flex;align-items:center;gap:6px}

.sab a.commercianti{display:flex;flex-direction:column;align-items:flex-end;gap:7px;text-align:right;flex:0 1 auto;max-width:190px;
  color:var(--grigio);font-size:calc(var(--fs)*.72);font-weight:600;line-height:1.25;letter-spacing:.005em}
.sab a.commercianti b{display:inline-flex;align-items:center;gap:6px;background:#E6F1E8;color:#1E8A3C;border-radius:999px;
  padding:6px 13px;font-size:calc(var(--fs)*.92);font-weight:800;white-space:nowrap;letter-spacing:.01em}
.sab a.commercianti:active b{background:#D3E7D7}
@media (max-width:359px){.sab a.commercianti{font-size:calc(var(--fs)*.68);max-width:150px}}

.solita{background:#fff;border:1.5px solid var(--verde);border-radius:var(--r);padding:13px;margin-bottom:12px;box-shadow:0 2px 0 rgba(31,107,69,.12)}
.solitatesta{display:flex;align-items:center;gap:11px}
.solitatesta div{flex:1;min-width:0}
.solitatesta b{display:block;font-family:var(--f-dis);font-size:calc(var(--fs)*1.02)}
.solitatesta small{display:block;color:var(--grigio);font-size:calc(var(--fs)*.82)}
.solitaico{width:40px;height:40px;border-radius:12px;background:var(--tenue);color:var(--verde);display:flex;align-items:center;justify-content:center;flex:none}
.solitaazioni{display:flex;gap:8px;margin-top:11px}
.solitaazioni .btn{flex:1}
.riordina{display:inline-block;margin-top:10px;background:var(--tenue);color:var(--verde);border-radius:10px;padding:8px 13px;font-weight:700;font-size:calc(var(--fs)*.84)}

/* ---------------- bottega, pacco, tessera, clienti ---------------- */
.segmenti{display:flex;gap:6px;background:rgba(255,255,255,.12);border-radius:12px;padding:4px;margin-top:10px}
.segmenti.pieni{background:var(--tenue);margin:12px 0}
.segmenti button{flex:1;padding:9px;border-radius:9px;font-weight:600;font-size:calc(var(--fs)*.86);color:inherit;text-align:center}
.segmenti button.on{background:#fff;color:var(--verde2)}
.segmenti.pieni button.on{background:var(--verde);color:#fff}

.pacchetto{background:#fff;border:1px solid var(--bordo);border-radius:var(--r);padding:14px;margin-bottom:12px}
.pacchetesta{display:flex;gap:12px;align-items:center}
.pacchetesta b{display:block;font-family:var(--f-dis);font-size:calc(var(--fs)*1.12)}
.pacchetesta small{color:var(--grigio);font-size:calc(var(--fs)*.84);line-height:1.35;display:block}
.pacchefatti{display:flex;flex-direction:column;gap:6px;margin-top:11px;border-top:1px solid var(--bordo);padding-top:11px}
.pacchefatti span{display:flex;align-items:center;gap:8px;font-size:calc(var(--fs)*.84);color:var(--grigio)}
.pacco{display:flex;gap:12px;width:100%;background:#fff;border:1px solid var(--bordo);border-radius:var(--r);padding:12px;margin-bottom:11px;text-align:left}
.paccofig{width:70px;height:70px;border-radius:14px;background:var(--tenue);display:flex;align-items:center;justify-content:center;flex:none}
.paccocorpo{flex:1;min-width:0}
.paccocorpo b{display:block;font-family:var(--f-dis);font-size:calc(var(--fs)*1.04)}
.paccocorpo small{display:block;color:var(--grigio);font-size:calc(var(--fs)*.82);line-height:1.35;margin-top:2px}
.paccodentro{font-size:calc(var(--fs)*.78);color:var(--verde);margin-top:6px}
.paccofondo{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:9px}
.paccogrande{background:var(--tenue);border-radius:var(--r);display:flex;align-items:center;justify-content:center;padding:18px}
.dentroriga{display:flex;align-items:center;gap:9px;padding:6px 0;border-bottom:1px solid var(--bordo);font-size:calc(var(--fs)*.88)}
.dentroriga:last-of-type{border-bottom:0}
.dentroriga svg{color:var(--verde);flex:none}
.extrariga{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--bordo)}
.extrariga div:nth-child(2){flex:1;min-width:0}
.extrariga b{display:block;font-size:calc(var(--fs)*.88)}
.extrariga small{color:var(--grigio);font-size:calc(var(--fs)*.8)}
.stepper.piccolo{padding:3px}
.stepper.piccolo button{width:34px;height:34px}
.stepper.piccolo span{font-size:calc(var(--fs)*.84)}

.invito{display:flex;align-items:center;gap:12px;width:100%;background:#FFF4DC;border:1.5px solid #EBD39A;border-radius:var(--r);padding:13px;margin:12px 0}
.invito span:nth-child(2){flex:1;min-width:0}
.invito b{display:block;font-size:calc(var(--fs)*.96)}
.invito small{display:block;color:#7A5405;font-size:calc(var(--fs)*.82);line-height:1.35}

.accessotesta{text-align:center;padding:16px 10px 4px;display:flex;flex-direction:column;align-items:center;gap:12px}
.accessotesta p{color:var(--grigio);font-size:calc(var(--fs)*.88);line-height:1.45;max-width:34ch}

.tessera{background:linear-gradient(140deg,#12351F,#1F6B45);color:#fff;border-radius:20px;padding:18px;border:2px solid;box-shadow:0 8px 20px rgba(18,53,31,.25)}
.tesseratesta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}
.tesseratesta .logo .parola b{color:#fff}
.tesseratesta .logo .parola i{color:#9BD7A6}
.livello{border-radius:999px;padding:4px 12px;font-size:calc(var(--fs)*.76);font-weight:800;color:#fff}
.puntigrandi{font-family:var(--f-dis);font-size:calc(var(--fs)*2.6);font-weight:800;line-height:1;display:block}
.puntiet{color:#BFD6BF;font-size:calc(var(--fs)*.84)}
.puntiarrivo{display:block;color:var(--sole);font-size:calc(var(--fs)*.82);margin-top:6px}
.tesserafondo{margin-top:16px;border-top:1px solid rgba(255,255,255,.2);padding-top:10px;font-size:calc(var(--fs)*.88);letter-spacing:.04em}
.livelloriga{display:flex;align-items:center;gap:11px;padding:9px 0;border-bottom:1px solid var(--bordo)}
.livelloriga:last-child{border-bottom:0}
.livelloriga.on{font-weight:600}
.livelloriga b{display:block;font-size:calc(var(--fs)*.92)}
.livelloriga small{color:var(--grigio);font-size:calc(var(--fs)*.8)}
.livelloriga em{font-style:normal;margin-left:auto;color:var(--grigio);font-size:calc(var(--fs)*.82)}
.voce.fedelta{border-color:var(--sole);background:#FFFBF2}
.puntiriga{display:flex;align-items:center;gap:11px;margin-bottom:10px}
.puntiriga b{display:block;font-size:calc(var(--fs)*.94)}
.puntiriga small{color:var(--grigio);font-size:calc(var(--fs)*.82)}

.clientecard{display:flex;align-items:center;gap:11px;width:100%;background:#fff;border:1px solid var(--bordo);border-radius:var(--r);padding:12px;margin-bottom:10px;text-align:left}
.clienteiniz{width:40px;height:40px;border-radius:50%;background:var(--verde);color:#fff;display:flex;align-items:center;justify-content:center;font-family:var(--f-dis);font-weight:800;flex:none}
.clientecorpo{flex:1;min-width:0}
.clientecorpo b{display:block;font-size:calc(var(--fs)*.94)}
.clientecorpo small{display:block;color:var(--grigio);font-size:calc(var(--fs)*.8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.clientefatti{display:flex;gap:8px;flex-wrap:wrap;margin-top:5px}
.clientefatti em{font-style:normal;background:var(--tenue);border-radius:7px;padding:2px 8px;font-size:calc(var(--fs)*.74);color:var(--verde)}
.clientefatti em.rossa{background:#FBECE8;color:var(--rosso)}
.personariga{display:flex;align-items:center;gap:11px;padding:9px 0;border-bottom:1px solid var(--bordo)}
.personariga:last-child{border-bottom:0}
.personariga div{flex:1;min-width:0}
.personariga b{display:block;font-size:calc(var(--fs)*.92)}
.personariga small{color:var(--grigio);font-size:calc(var(--fs)*.8)}
.tappa2{background:#fff;border:1px solid var(--bordo);border-radius:var(--r);padding:13px;margin-bottom:10px}
.tappa2.fatta{opacity:.6}
.tappatesta{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.tappatesta b{display:block;font-size:calc(var(--fs)*.96)}
.tappatesta small{color:var(--grigio);font-size:calc(var(--fs)*.82);display:block}
.tapparighe{color:var(--grigio);font-size:calc(var(--fs)*.84);margin:8px 0}
.tappa2 .azioni{justify-content:flex-start}

/* ---------------- avviso ---------------- */
.avviso{position:fixed;left:50%;transform:translateX(-50%);bottom:96px;z-index:120;background:#12351F;color:#fff;padding:12px 20px;border-radius:14px;font-size:14px;font-weight:600;box-shadow:0 8px 26px rgba(0,0,0,.3);max-width:88vw;text-align:center}
`;
