import React, { useState, useEffect, useRef } from 'react';
import './app.css';
import Login from './Login';
import { db, authAvailable, signInWithGoogle, signOutUser, onAuthChange, uploadImage } from './firebase';
import { collection, addDoc, setDoc, doc, deleteDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Line, Bar } from 'react-chartjs-2';
import { QRCodeSVG } from 'qrcode.react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend } from 'chart.js';
import { onUserProductsChange, addProductForUser, updateProductForUser, deleteProductForUser, saveUserPreferences, getUserPreferences } from './productService';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend);

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

function download(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function arrayToCSV(items, fields) {
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    return `"${s}"`;
  };
  const header = fields.map(escape).join(',');
  const rows = items.map(it => fields.map(f => escape(it[f] ?? '')).join(','));
  return [header, ...rows].join('\n');
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  return lines.slice(1).map(line => {
    const values = line.match(/("[^"]*(""[^"]*)*"|[^,]+)/g) || [];
    const obj = {};
    values.forEach((val, i) => {
      let v = val.replace(/^"|"$/g, '');
      v = v.replace(/""/g, '"');
      obj[headers[i]] = v;
    });
    return obj;
  });
}

const PAGE_SIZES = [5, 10, 20, 50];
const PRODUCT_STATUS = ['À nettoyer', 'En attente de photo', 'En ligne', 'Vendu', 'Expédié', 'Retour', 'Archivé'];
const STATUS_COLORS = {
  'À nettoyer': '#FFA500',
  'En attente de photo': '#9370DB',
  'En ligne': '#00CED1',
  'Vendu': '#32CD32',
  'Expédié': '#FF6347',
  'Retour': '#FFB6C1',
  'Archivé': '#A9A9A9'
};

const MOTIVATIONAL_QUOTES = [
  '💪 Chaque vente est une victoire!',
  '📈 Votre succès commence maintenant!',
  '🎯 Fixez vos objectifs et dépassez-les!',
  '⚡ Vous êtes sur le point de exploser!',
  '🚀 Plus de ventes = Plus de possibilités!',
  '💰 Le profit attend les audacieux!',
  '🏆 Soyez le meilleur vendeur!',
  '✨ Chaque jour apporte une nouvelle chance!',
  '🌟 Votre potentiel est illimité!'
];

function App() {
  // État d'authentification
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginError, setLoginError] = useState('');

  // États des produits
  const [produits, setProduits] = useState(() => {
    // Charger depuis localStorage si pas d'authentification
    if (!authAvailable) {
      return JSON.parse(localStorage.getItem('produits_v2')) || [];
    }
    return [];
  });

  // États des préférences utilisateur
  const [monthlyGoal, setMonthlyGoal] = useState(() => parseFloat(localStorage.getItem('monthly_goal')) || 500);
  const [expenses, setExpenses] = useState(() => JSON.parse(localStorage.getItem('expenses')) || []);
  const [activeTab, setActiveTab] = useState('products');
  const [showAdvancedFees, setShowAdvancedFees] = useState(false);
  const [fournisseurs, setFournisseurs] = useState(() => JSON.parse(localStorage.getItem('fournisseurs')) || []);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showQRModal, setShowQRModal] = useState(null);
  const [showProductDetail, setShowProductDetail] = useState(null);
  const [selectedThemeColor, setSelectedThemeColor] = useState(() => localStorage.getItem('theme_color') || '#0f62fe');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  
  const initialForm = {
    nom: '', sku: '', categorie: '', description: '', fournisseur: '', quantite: 1,
    prixAchat: '', prixVente: '', frais: '', dateAchat: '', dateVente: '', etat: '',
    emplacement: '', imageUrl: '', tags: '', notes: '',
    statut: 'En ligne', fraisPort: '', commissionPlateforme: '', fraisEmballage: '', fraisAnnexes: ''
  };
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('dateAchat');
  const [sortOrder, setSortOrder] = useState('desc');
  const [filterCategory, setFilterCategory] = useState('');
  const [skuPrefix, setSkuPrefix] = useState('P');
  const [skuCounter, setSkuCounter] = useState(1);
  const [errors, setErrors] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const fileInputRef = useRef(null);
  const [showAll, setShowAll] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('dark_mode') === '1');
  const [scannerActive, setScannerActive] = useState(false);
  const videoRef = useRef(null);
  const [scanMessage, setScanMessage] = useState('');

  // Gérer l'authentification Firebase
  useEffect(() => {
    if (!authAvailable) {
      // Si Firebase n'est pas configuré, charger le mode offline
      setAuthLoading(false);
      setUser(null);
      return;
    }

    const unsub = onAuthChange(firebaseUser => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || firebaseUser.email,
          photoURL: firebaseUser.photoURL,
          isAnonymous: firebaseUser.isAnonymous
        });
        
        // Charger les produits depuis Firestore
        const unsubProducts = onUserProductsChange(firebaseUser.uid, (products) => {
          setProduits(products);
        });
        
        // Charger les préférences utilisateur
        getUserPreferences(firebaseUser.uid).then(prefs => {
          if (prefs.monthlyGoal) setMonthlyGoal(prefs.monthlyGoal);
          if (prefs.expenses) setExpenses(prefs.expenses);
          if (prefs.fournisseurs) setFournisseurs(prefs.fournisseurs);
          if (prefs.darkMode !== undefined) setDarkMode(prefs.darkMode);
        });

        setAuthLoading(false);
        return unsubProducts;
      } else {
        // Utilisateur déconnecté
        setUser(null);
        setProduits([]);
        setAuthLoading(false);
      }
    });

    return () => unsub();
  }, []);

  // Sauvegarder les préférences utilisateur quand elles changent
  useEffect(() => {
    if (!user || !user.uid) return;
    
    const savePreferences = async () => {
      await saveUserPreferences(user.uid, {
        monthlyGoal,
        expenses,
        fournisseurs,
        darkMode,
        theme_color: selectedThemeColor
      });
    };

    const timer = setTimeout(savePreferences, 1000);
    return () => clearTimeout(timer);
  }, [monthlyGoal, expenses, fournisseurs, darkMode, selectedThemeColor, user]);

  // Gérer la déconnexion
  const handleLogout = async () => {
    if (!user) return;
    
    try {
      if (authAvailable && !user.isAnonymous) {
        await signOutUser();
      }
      setUser(null);
      setProduits([]);
      resetForm();
    } catch (error) {
      setLoginError('Erreur lors de la déconnexion');
      console.error('Logout error:', error);
    }
  };

  // Vérifier si un produit est demandé via URL (QR scanné)
  useEffect(() => {
    const hash = window.location.hash.substring(1);
    if (hash.startsWith('product=')) {
      const productId = hash.substring(8);
      const product = produits.find(p => p.id === productId);
      if (product) {
        setShowProductDetail(productId);
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  }, [produits]);

  // Subscribe to Firestore user products when authenticated
  useEffect(() => {
    if (!authAvailable || !user) return;
    try {
      const colRef = collection(db, 'users', user.uid, 'produits');
      const q = query(colRef, orderBy('nom', 'asc'));
      const unsub = onSnapshot(q, snapshot => {
        const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setProduits(items);
      }, err => {
        console.warn('Firestore snapshot error', err);
      });
      return () => unsub();
    } catch (e) { console.warn('Failed to subscribe to firestore', e); }
  }, [user]);

  // Load localStorage produits
  useEffect(() => {
    try {
      const raw = localStorage.getItem('produits_v2');
      if (raw) setProduits(JSON.parse(raw));
    } catch (e) { console.warn(e); }
  }, []);

  // SKU settings load
  useEffect(() => {
    try {
      const p = localStorage.getItem('sku_prefix');
      const c = localStorage.getItem('sku_counter');
      if (p) setSkuPrefix(p);
      if (c) setSkuCounter(Number(c));
    } catch (e) { console.warn(e); }
  }, []);

  useEffect(() => {
    localStorage.setItem('produits_v2', JSON.stringify(produits));
  }, [produits]);

  useEffect(() => {
    localStorage.setItem('dark_mode', darkMode ? '1' : '0');
    document.body.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => { localStorage.setItem('sku_prefix', skuPrefix); }, [skuPrefix]);
  useEffect(() => { localStorage.setItem('sku_counter', String(skuCounter)); }, [skuCounter]);

  useEffect(() => { setPage(1); }, [search, filterCategory, pageSize]);

  // Gérer la connexion réussie
  const handleLoginSuccess = async (firebaseUser) => {
    if (!firebaseUser) {
      // Mode offline/démo
      setUser({ uid: 'local', email: 'demo@local', displayName: 'Utilisateur local', isLocal: true });
      // Charger les données du localStorage
      try {
        const localProduits = JSON.parse(localStorage.getItem('produits_v2')) || [];
        setProduits(localProduits);
      } catch (e) {
        console.warn('Error loading local products:', e);
      }
    } else {
      setUser({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || firebaseUser.email,
        photoURL: firebaseUser.photoURL,
        isAnonymous: firebaseUser.isAnonymous
      });
    }
  };

  // Afficher la page de login si pas authentifié
  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div>Chargement...</div>
      </div>
    );
  }

  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Générer l'URL correcte pour les QR codes
  const getQRUrl = (productId) => {
    const host = window.location.hostname;
    const port = window.location.port;
    // Si on est sur localhost, utiliser 192.168.1.10 à la place
    const ipHost = host === 'localhost' ? '192.168.1.10' : host;
    return `http://${ipHost}:${port}#product=${productId}`;
  };

  const startScanner = async () => {
    setScanMessage('');
    if (!('BarcodeDetector' in window)) {
      // try to access camera and use placeholder
      setScanMessage('API BarcodeDetector non disponible sur ce navigateur. Essayez la recherche manuelle.');
      setScannerActive(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (e) { setScanMessage('Impossible d\'accéder à la caméra.'); }
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
      setScannerActive(true);
      // eslint-disable-next-line no-undef
      const detector = new BarcodeDetector({ formats: ['ean_13','ean_8','code_128','qr_code'] });
      const scanLoop = async () => {
        if (!scannerActive) return;
        try {
          const detections = await detector.detect(videoRef.current);
          if (detections && detections.length) {
            const code = detections[0].rawValue;
            setScanMessage(`Scanné: ${code}`);
            setForm(prev => ({ ...prev, sku: code }));
            // stop stream
            const tracks = videoRef.current.srcObject.getTracks();
            tracks.forEach(t => t.stop());
            setScannerActive(false);
            return;
          }
        } catch (e) {
          // ignore
        }
        requestAnimationFrame(scanLoop);
      };
      requestAnimationFrame(scanLoop);
    } catch (e) {
      setScanMessage('Impossible d\'accéder à la caméra.');
    }
  };

  const stopScanner = () => {
    setScannerActive(false);
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: null }));
  };

  const validate = () => {
    const err = {};
    if (!form.nom || form.nom.trim().length < 2) err.nom = 'Nom requis (min 2 caractères)';
    if (!form.prixAchat || isNaN(parseFloat(form.prixAchat))) err.prixAchat = 'Prix d\'achat invalide';
    if (!form.prixVente || isNaN(parseFloat(form.prixVente))) err.prixVente = 'Prix de vente invalide';
    if (form.quantite && (isNaN(parseInt(form.quantite)) || parseInt(form.quantite) < 1)) err.quantite = 'Quantité invalide';
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const resetForm = () => { setForm(initialForm); setEditingId(null); setErrors({}); };

  // Supplier management
  const addSupplier = (name) => {
    if (!name.trim()) return;
    const newSupp = { id: Date.now(), name: name.trim(), contact: '', adresse: '', phone: '' };
    const updated = [...fournisseurs, newSupp];
    setFournisseurs(updated);
    localStorage.setItem('fournisseurs', JSON.stringify(updated));
  };

  const deleteSupplier = (id) => {
    const updated = fournisseurs.filter(s => s.id !== id);
    setFournisseurs(updated);
    localStorage.setItem('fournisseurs', JSON.stringify(updated));
  };

  // Generate achievements/badges
  const generateBadges = () => {
    const totalSold = produits.filter(p => p.statut === 'Vendu').length;
    const totalProfit = produits.filter(p => p.statut === 'Vendu').reduce((a, p) => a + calculateProfit(p).netProfit, 0);
    const badges = [];
    if (totalSold >= 1) badges.push({ emoji: '🎯', name: 'Premier Vendeur', desc: '1 produit vendu' });
    if (totalSold >= 10) badges.push({ emoji: '⭐', name: 'Professionnel', desc: '10 produits vendus' });
    if (totalSold >= 50) badges.push({ emoji: '👑', name: 'Maître Vendeur', desc: '50 produits vendus' });
    if (totalSold >= 100) badges.push({ emoji: '💎', name: 'Légende', desc: '100 produits vendus' });
    if (totalProfit >= 100) badges.push({ emoji: '💰', name: 'Profit 100€', desc: 'Profit > 100€' });
    if (totalProfit >= 500) badges.push({ emoji: '🚀', name: 'Profit 500€', desc: 'Profit > 500€' });
    if (totalProfit >= 1000) badges.push({ emoji: '🏆', name: 'Magnate', desc: 'Profit > 1000€' });
    return badges;
  };

  // Chart data for revenue
  const getChartData = () => {
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7Days.push(d.toLocaleDateString('fr-FR', { weekday: 'short' }));
    }
    const revenueByDay = last7Days.map(day => {
      const dayProfit = produits
        .filter(p => p.statut === 'Vendu' && p.dateVente && p.dateVente.includes(day.slice(0, 3)))
        .reduce((a, p) => a + calculateProfit(p).netProfit, 0);
      return dayProfit;
    });
    return {
      labels: last7Days,
      datasets: [{
        label: 'Profit (€)',
        data: revenueByDay,
        borderColor: '#0f62fe',
        backgroundColor: 'rgba(15, 98, 254, 0.1)',
        tension: 0.4
      }]
    };
  };

  const getMonthlyChartData = () => {
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const revenueByMonth = months.map((_, idx) => {
      const monthNum = (idx + 1).toString().padStart(2, '0');
      const monthProfit = produits
        .filter(p => p.statut === 'Vendu' && p.dateVente && p.dateVente.includes(monthNum))
        .reduce((a, p) => a + calculateProfit(p).netProfit, 0);
      return monthProfit;
    });
    return {
      labels: months,
      datasets: [{
        label: 'Profit Mensuel (€)',
        data: revenueByMonth,
        backgroundColor: 'rgba(15, 98, 254, 0.6)',
        borderColor: '#0f62fe',
        borderWidth: 1
      }]
    };
  };

  // OpenLibrary API - Search books by ISBN/EAN
  const searchISBN = async (isbn) => {
    if (!isbn || isbn.length < 10) return null;
    try {
      const response = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jio=1&format=json`);
      const data = await response.json();
      const key = Object.keys(data)[0];
      if (!key || !data[key]) return null;
      
      const book = data[key];
      const result = {
        nom: book.details?.title || '',
        description: book.details?.description || '',
        prixAchat: '',
        imageUrl: book.cover?.medium || book.cover?.small || ''
      };
      return result;
    } catch (e) {
      console.warn('ISBN lookup error:', e);
      return null;
    }
  };

  // Notification helper
  const sendNotification = (title, body, icon = '📦') => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, { 
        body, 
        icon: '📱',
        tag: 'fkapp-notification',
        badge: '🏷️'
      });
    }
  };

  // Request notification permission
  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert('Notifications non supportées sur ce navigateur');
      return false;
    }
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      const perm = await Notification.requestPermission();
      return perm === 'granted';
    }
    return false;
  };

  // Calculate profit with all fees
  const calculateProfit = (p) => {
    const costPrice = parseFloat(p.prixAchat) || 0;
    const salePrice = parseFloat(p.prixVente) || 0;
    const qty = parseInt(p.quantite) || 1;
    const shipFee = parseFloat(p.fraisPort) || 0;
    const platformFee = parseFloat(p.commissionPlateforme) || 0;
    const packFee = parseFloat(p.fraisEmballage) || 0;
    const miscFee = parseFloat(p.fraisAnnexes) || 0;
    const totalCost = (costPrice * qty) + shipFee + platformFee + packFee + miscFee;
    const totalRevenue = salePrice * qty;
    const netProfit = totalRevenue - totalCost;
    const roiPercentage = totalCost > 0 ? ((netProfit / totalCost) * 100).toFixed(1) : 0;
    return { totalCost, totalRevenue, netProfit, profitPerUnit: netProfit / qty, roiPercentage };
  };

  const handleImage = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      if (authAvailable && user) {
        // Upload to Firebase Storage
        const url = await uploadImage(file, user.uid);
        setForm(prev => ({ ...prev, imageUrl: url }));
      } else {
        // Fallback to base64
        const b64 = await toBase64(file);
        setForm(prev => ({ ...prev, imageUrl: b64 }));
      }
    } catch (err) { 
      console.warn('Image upload error:', err);
      // Fallback to base64 if Firebase fails
      try {
        const b64 = await toBase64(file);
        setForm(prev => ({ ...prev, imageUrl: b64 }));
      } catch (e) { console.warn(e); }
    }
  };

  const pad = (n, width = 4) => String(n).padStart(width, '0');

  const generateSKU = () => {
    let counter = skuCounter || 1;
    const prefix = (skuPrefix || 'P').toString().toUpperCase();
    let candidate = `${prefix}-${pad(counter)}`;
    // ensure uniqueness
    const existing = new Set(produits.map(p => (p.sku || '').toString()));
    while (existing.has(candidate)) {
      counter += 1;
      candidate = `${prefix}-${pad(counter)}`;
    }
    // set next counter
    setSkuCounter(counter + 1);
    setForm(prev => ({ ...prev, sku: candidate }));
  };

  const resetSkuCounter = (val = 1) => {
    setSkuCounter(val);
  };

  const saveProduit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    const prixA = parseFloat(form.prixAchat) || 0;
    const prixV = parseFloat(form.prixVente) || 0;
    const frais = parseFloat(form.frais) || 0;
    const quantite = parseInt(form.quantite) || 1;
    const beneficeUnitaire = prixV - prixA - frais;

    const produit = {
      ...form,
      quantite,
      prixAchat: prixA,
      prixVente: prixV,
      frais,
      beneficeUnitaire: Number(beneficeUnitaire.toFixed(2)),
      beneficeTotal: Number((beneficeUnitaire * quantite).toFixed(2)),
    };

    (async () => {
      try {
        // Check if we're setting to "Vendu" and send notification
        const isNewlySold = !editingId && form.statut === 'Vendu';
        const becameSold = editingId && form.statut === 'Vendu' && produits.find(p => p.id === editingId)?.statut !== 'Vendu';
        
        if (isNewlySold || becameSold) {
          const prof = calculateProfit(produit);
          sendNotification(
            `✅ Vente effectuée!`,
            `${form.nom} vendu! Profit: €${prof.netProfit.toFixed(2)} (ROI: ${prof.roiPercentage}%)`
          );
        }

        if (authAvailable && user) {
          const colRef = collection(db, 'users', user.uid, 'produits');
          if (editingId) {
            await setDoc(doc(colRef, editingId), produit, { merge: true });
          } else {
            await addDoc(colRef, produit);
          }
        } else {
          const item = { ...produit, id: editingId || Date.now() };
          if (editingId) setProduits(prev => prev.map(p => p.id === editingId ? item : p));
          else setProduits(prev => [item, ...prev]);
        }
        resetForm();
      } catch (err) {
        console.error('Save failed', err);
        alert('Impossible d\'enregistrer le produit.');
      }
    })();
  };

  const editProduit = (id) => {
    const p = produits.find(x => x.id === id);
    if (!p) return;
    setForm({ ...p });
    setEditingId(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteProduit = (id) => {
    if (!window.confirm('Supprimer ce produit ?')) return;
    (async () => {
      try {
        if (authAvailable && user) {
          await deleteDoc(doc(db, 'users', user.uid, 'produits', id));
        } else {
          setProduits(prev => prev.filter(p => p.id !== id));
        }
        setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
      } catch (err) {
        console.error('Delete failed', err);
        alert('Impossible de supprimer le produit.');
      }
    })();
  };

  const toggleSelect = (id) => {
    setSelected(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  };

  const selectAllOnPage = (items) => {
    const ids = items.map(i => i.id);
    setSelected(prev => { const s = new Set(prev); let all = true; ids.forEach(id => { if (!s.has(id)) all = false; }); if (all) ids.forEach(id => s.delete(id)); else ids.forEach(id => s.add(id)); return s; });
  };

  const bulkDelete = () => {
    if (!selected.size) return alert('Aucun produit sélectionné');
    if (!window.confirm('Supprimer les produits sélectionnés ?')) return;
    (async () => {
      try {
        if (authAvailable && user) {
          const colRef = collection(db, 'users', user.uid, 'produits');
          const ops = Array.from(selected).map(id => deleteDoc(doc(colRef, id)));
          await Promise.all(ops);
        } else {
          setProduits(prev => prev.filter(p => !selected.has(p.id)));
        }
        setSelected(new Set());
      } catch (err) {
        console.error('Bulk delete failed', err);
        alert('Suppression groupée impossible.');
      }
    })();
  };

  const exportSelectedCSV = () => {
    const items = produits.filter(p => selected.has(p.id));
    if (!items.length) return alert('Aucun produit sélectionné');
    const fields = ['id','nom','sku','categorie','quantite','prixAchat','prixVente','frais','beneficeUnitaire','beneficeTotal','fournisseur','emplacement','tags','notes'];
    const csv = arrayToCSV(items, fields);
    download('export-produits.csv', csv, 'text/csv');
  };

  const exportAllJSON = () => {
    download('produits-backup.json', JSON.stringify(produits, null, 2), 'application/json');
  };

  const importJSON = (file) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const arr = JSON.parse(reader.result);
        if (!Array.isArray(arr)) return;
        if (authAvailable && user) {
          const colRef = collection(db, 'users', user.uid, 'produits');
          const ops = arr.map(it => addDoc(colRef, it));
          await Promise.all(ops);
        } else {
          setProduits(prev => [...arr, ...prev]);
        }
      } catch (e) { alert('JSON invalide'); }
    };
    reader.readAsText(file);
  };

  const importCSV = (file) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const arr = parseCSV(reader.result);
        const mapped = arr.map(a => ({
          nom: a.nom || a.Nom || '',
          sku: a.sku || a.SKU || '',
          categorie: a.categorie || a.Categorie || '',
          quantite: parseInt(a.quantite || 1) || 1,
          prixAchat: parseFloat(a.prixAchat || 0) || 0,
          prixVente: parseFloat(a.prixVente || 0) || 0,
          frais: parseFloat(a.frais || 0) || 0,
          beneficeUnitaire: Number(((parseFloat(a.prixVente||0) - parseFloat(a.prixAchat||0) - parseFloat(a.frais||0))||0).toFixed(2)),
          beneficeTotal: Number((((parseFloat(a.prixVente||0) - parseFloat(a.prixAchat||0) - parseFloat(a.frais||0))||0) * (parseInt(a.quantite||1)||1)).toFixed(2)),
          fournisseur: a.fournisseur || '', emplacement: a.emplacement || '', tags: a.tags || '', notes: a.notes || ''
        }));
        if (authAvailable && user) {
          const colRef = collection(db, 'users', user.uid, 'produits');
          const ops = mapped.map(it => addDoc(colRef, it));
          await Promise.all(ops);
        } else {
          setProduits(prev => [...mapped, ...prev]);
        }
      } catch (e) { alert('CSV invalide'); }
    };
    reader.readAsText(file);
  };

  const handleFileInput = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith('.json')) importJSON(file);
    else importCSV(file);
    e.target.value = '';
  };

  const clearAll = () => {
    if (!window.confirm('Vider tous les produits ?')) return;
    setProduits([]);
    setSelected(new Set());
  };

  const handleSignIn = async () => {
    if (!authAvailable) return alert('Firebase n\'est pas configuré.');
    try { await signInWithGoogle(); } catch (e) { alert('Connexion échouée'); console.warn(e); }
  };

  const handleSignOut = async () => {
    if (!authAvailable) {
      // clear local profile
      localStorage.removeItem('local_profile');
      setUser(null);
      return;
    }
    try { await signOutUser(); } catch (e) { console.warn(e); }
  };

  // Filtering, sorting
  const filtered = produits.filter(p => {
    // Category filter
    if (filterCategory && p.categorie && p.categorie.toLowerCase() !== filterCategory.toLowerCase()) return false;
    
    // Status filter (advanced)
    if (filterStatus && p.statut !== filterStatus) return false;
    
    // Supplier filter (advanced)
    if (filterSupplier && p.fournisseur !== filterSupplier) return false;
    
    // Search filter
    if (!search) return true;
    const q = search.toLowerCase();
    return (p.nom || '').toLowerCase().includes(q) || 
           (p.sku || '').toLowerCase().includes(q) || 
           (p.categorie || '').toLowerCase().includes(q) || 
           (p.tags || '').toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a,b) => {
    const af = a[sortField] ?? '';
    const bf = b[sortField] ?? '';
    if (typeof af === 'number' && typeof bf === 'number') return sortOrder === 'asc' ? af - bf : bf - af;
    return sortOrder === 'asc' ? String(af).localeCompare(String(bf)) : String(bf).localeCompare(String(af));
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((page-1)*pageSize, page*pageSize);

  const categories = Array.from(new Set(produits.map(p => p.categorie).filter(Boolean)));

  return (
    <div className="App">
      {/* Header with User Profile */}
      <div className="app-header">
        <div className="header-left">
          <h1>📦 App Achat Revente</h1>
        </div>
        <div className="header-right">
          {user && (
            <div className="user-profile">
              {user.photoURL && <img src={user.photoURL} alt="Avatar" className="user-avatar" />}
              <div className="user-info">
                <span className="user-name">{user.displayName || user.email}</span>
                {user.isLocal && <span className="mode-badge">Mode Offline</span>}
              </div>
              <button onClick={handleLogout} className="btn-logout">
                <span>🚪</span> Déconnexion
              </button>
            </div>
          )}
        </div>
      </div>

      <p style={{textAlign: 'center', color: 'var(--muted)', marginTop: '-15px', marginBottom: '20px', fontSize: '14px'}}>
        Gestion simple et intuitive de vos achats et reventes
      </p>

      <div className="tabs-nav">
        <button className={`tab-btn ${activeTab === 'products' ? 'active' : ''}`} onClick={() => setActiveTab('products')}>
          <span className="tab-icon">📦</span> Mes produits
        </button>
        <button className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
          <span className="tab-icon">📊</span> Vue d'ensemble
        </button>
        <button className={`tab-btn ${activeTab === 'sales' ? 'active' : ''}`} onClick={() => setActiveTab('sales')}>
          <span className="tab-icon">💰</span> Ventes
        </button>
        <button className={`tab-btn ${activeTab === 'expenses' ? 'active' : ''}`} onClick={() => setActiveTab('expenses')}>
          <span className="tab-icon">💳</span> Dépenses
        </button>
        <button className={`tab-btn ${activeTab === 'suppliers' ? 'active' : ''}`} onClick={() => setActiveTab('suppliers')}>
          <span className="tab-icon">🏭</span> Fournisseurs
        </button>
        <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
          <span className="tab-icon">⚙️</span> Paramètres
        </button>
      </div>

      {activeTab === 'products' && (
      <div className="tab-content">
      <form onSubmit={saveProduit} aria-label="Formulaire produit" className="simple-form">
        <div className="form-section">
          <h3>📋 Informations du produit</h3>
          
          {/* ISBN/EAN Lookup */}
          <div style={{marginBottom: '15px', padding: '10px', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: '6px'}}>
            <h4 style={{margin: '0 0 10px 0', fontSize: '14px'}}>📚 Rechercher par ISBN/EAN (OpenLibrary)</h4>
            <div style={{display: 'flex', gap: '8px'}}>
              <input id="isbnInput" type="text" placeholder="Entrez un ISBN (ex: 9782954567359)" style={{flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid var(--muted)'}} />
              <button type="button" onClick={async () => {
                const isbnInput = document.getElementById('isbnInput');
                const isbn = isbnInput.value.trim();
                if (!isbn) { alert('Entrez un ISBN'); return; }
                const result = await searchISBN(isbn);
                if (result) {
                  setForm(prev => ({
                    ...prev,
                    nom: result.nom || prev.nom,
                    description: result.description || prev.description,
                    imageUrl: result.imageUrl || prev.imageUrl
                  }));
                  isbnInput.value = '';
                  alert('✅ Livre trouvé! Les infos ont été remplies.');
                } else {
                  alert('❌ Aucun livre trouvé pour cet ISBN.');
                }
              }} style={{padding: '8px 15px', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'}}>
                🔍 Chercher
              </button>
            </div>
          </div>

          <input name="nom" value={form.nom} onChange={handleChange} placeholder="Nom du produit (ex: iPhone 13)" aria-label="Nom du produit" />
          {errors.nom && <div className="error">{errors.nom}</div>}

          <div className="sku-row">
            <input name="sku" value={form.sku} onChange={handleChange} placeholder="Référence/SKU (optionnel)" aria-label="SKU" />
            <button type="button" className="small" onClick={generateSKU} title="Générer une référence">Auto</button>
          </div>

          <input name="categorie" value={form.categorie} onChange={handleChange} placeholder="Catégorie (ex: Électronique)" aria-label="Catégorie" list="cats" />
          <datalist id="cats">{categories.map(c => <option key={c} value={c} />)}</datalist>

          <textarea name="description" value={form.description} onChange={handleChange} placeholder="Description courte du produit" rows={2} aria-label="Description" />
        </div>

        <div className="form-section">
          <h3>💰 Achat et vente</h3>
          <div className="form-row-2">
            <div>
              <label>Prix d'achat (€)</label>
              <input name="prixAchat" type="number" step="0.01" value={form.prixAchat} onChange={handleChange} placeholder="0.00" aria-label="Prix d'achat" />
              {errors.prixAchat && <div className="error">{errors.prixAchat}</div>}
            </div>
            <div>
              <label>Prix de vente (€)</label>
              <input name="prixVente" type="number" step="0.01" value={form.prixVente} onChange={handleChange} placeholder="0.00" aria-label="Prix de vente" />
              {errors.prixVente && <div className="error">{errors.prixVente}</div>}
            </div>
          </div>

          <div className="form-row-2">
            <div>
              <label>Quantité</label>
              <input name="quantite" type="number" value={form.quantite} onChange={handleChange} placeholder="1" aria-label="Quantité" />
              {errors.quantite && <div className="error">{errors.quantite}</div>}
            </div>
            <div>
              <label>Statut</label>
              <select name="statut" value={form.statut} onChange={handleChange} aria-label="Statut du produit">
                {PRODUCT_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row-2">
            <div>
              <label>Date d'achat</label>
              <input name="dateAchat" type="date" value={form.dateAchat} onChange={handleChange} aria-label="Date d'achat" />
            </div>
            <div>
              <label>Date de vente</label>
              <input name="dateVente" type="date" value={form.dateVente} onChange={handleChange} placeholder="Si vendu" aria-label="Date de vente" />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>📦 Détails supplémentaires</h3>
          <input name="fournisseur" value={form.fournisseur} onChange={handleChange} placeholder="Fournisseur (optionnel)" aria-label="Fournisseur" />
          <input name="etat" value={form.etat} onChange={handleChange} placeholder="État (neuf, bon état...)" aria-label="État" />
          <input name="emplacement" value={form.emplacement} onChange={handleChange} placeholder="Où c'est stocké (ex: étagère 2)" aria-label="Emplacement" />

          <div className="file-row">
            <input aria-label="Image produit" type="file" accept="image/*" onChange={handleImage} />
            <input name="imageUrl" value={form.imageUrl} onChange={handleChange} placeholder="Ou coller URL image" />
          </div>

          <input name="tags" value={form.tags} onChange={handleChange} placeholder="Tags (optionnel, séparés par virgules)" aria-label="Tags" />
          <textarea name="notes" value={form.notes} onChange={handleChange} placeholder="Notes personnelles" rows={2} aria-label="Notes" />
        </div>

        <div className="form-section collapsible">
          <button type="button" onClick={() => setShowAdvancedFees(!showAdvancedFees)} className="collapsible-btn">
            {showAdvancedFees ? '▼' : '▶'} Frais détaillés (optionnel)
          </button>
          {showAdvancedFees && (
            <div style={{marginTop: '10px'}}>
              <p style={{fontSize: '12px', color: 'var(--muted)', marginBottom: '10px'}}>
                Ajouter ici les frais supplémentaires pour calculer votre bénéfice réel
              </p>
              <div className="form-row-2">
                <div>
                  <label>Frais de port (€)</label>
                  <input name="fraisPort" type="number" step="0.01" value={form.fraisPort} onChange={handleChange} placeholder="0.00" />
                </div>
                <div>
                  <label>Commission plateforme (€)</label>
                  <input name="commissionPlateforme" type="number" step="0.01" value={form.commissionPlateforme} onChange={handleChange} placeholder="Vinted, eBay..." />
                </div>
              </div>
              <div className="form-row-2">
                <div>
                  <label>Frais emballage (€)</label>
                  <input name="fraisEmballage" type="number" step="0.01" value={form.fraisEmballage} onChange={handleChange} placeholder="0.00" />
                </div>
                <div>
                  <label>Autres frais (€)</label>
                  <input name="fraisAnnexes" type="number" step="0.01" value={form.fraisAnnexes} onChange={handleChange} placeholder="0.00" />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="form-actions">
          <button type="submit">{editingId ? '✔️ Enregistrer' : '➕ Ajouter le produit'}</button>
          <button type="button" className="alt" onClick={resetForm}>Réinitialiser</button>
        </div>
      </form>

      <div className="toolbar">
        <input className="search" aria-label="Recherche" placeholder="Recherche nom / SKU / catégorie / tags" value={search} onChange={e => setSearch(e.target.value)} />
        
        <button type="button" onClick={() => setAdvancedFiltersOpen(!advancedFiltersOpen)} style={{padding: '8px 12px', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', marginRight: '10px'}}>
          🔍 {advancedFiltersOpen ? 'Fermer filtres' : 'Filtres avancés'}
        </button>

        <div className="controls">
          <div className="profile">
            {user ? (
              <div className="profile-info">
                {user.photoURL ? <img src={user.photoURL} alt={user.name || user.email} className="thumb" style={{width:36,height:36,borderRadius:8}} /> : null}
                <span style={{marginLeft:8}}>{user.name || user.email}</span>
                <button className="small" onClick={handleSignOut} style={{marginLeft:8}}>Déconnexion</button>
              </div>
            ) : (
              <div>
                {authAvailable ? <button className="small" onClick={handleSignIn}>Se connecter (Google)</button> : (
                  <button className="small" onClick={() => {
                    const name = prompt('Nom du profil local (sera sauvegardé en local):');
                    if (!name) return; const p = { name }; localStorage.setItem('local_profile', JSON.stringify(p)); setUser(p);
                  }}>Créer profil local</button>
                )}
              </div>
            )}
          </div>
          <div className="sku-settings">
            <label>Préfixe SKU <input value={skuPrefix} onChange={e => setSkuPrefix(e.target.value.replace(/[^A-Za-z0-9]/g,'').toUpperCase())} style={{width:70}} /></label>
            <label>Compteur <input type="number" value={skuCounter} onChange={e => setSkuCounter(Number(e.target.value)||1)} style={{width:90}} /></label>
            <button type="button" className="small" onClick={() => { if(window.confirm('Réinitialiser le compteur SKU à 1 ?')) resetSkuCounter(1); }}>Reset SKU</button>
          </div>
          <select aria-label="Filtrer catégorie" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
            <option value="">Toutes catégories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select aria-label="Trier par" value={sortField} onChange={e => setSortField(e.target.value)}>
            <option value="dateAchat">Date achat</option>
            <option value="nom">Nom</option>
            <option value="prixAchat">Prix achat</option>
            <option value="prixVente">Prix vente</option>
            <option value="beneficeUnitaire">Bénéfice/unité</option>
          </select>

          <select aria-label="Ordre" value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>

          <select aria-label="Taille page" value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>
            {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / page</option>)}
          </select>

          <input ref={fileInputRef} aria-label="Importer CSV/JSON" type="file" accept=".csv,application/json" onChange={handleFileInput} />
          <button onClick={() => exportAllJSON()}>Sauvegarder JSON</button>
          <button onClick={() => exportSelectedCSV()}>Exporter sélection (CSV)</button>
          <button onClick={() => bulkDelete()} className="danger">Supprimer sélection</button>
          <button onClick={() => clearAll()} className="danger">Vider tout</button>
          <button className="small" onClick={() => startScanner()}>Scanner</button>
          <button className="small" onClick={() => setDarkMode(d => !d)}>{darkMode ? 'Mode clair' : 'Mode sombre'}</button>
          <button className="small" onClick={() => setShowAll(s => !s)}>{showAll ? 'Masquer liste complète' : 'Voir toute la liste'}</button>
        </div>
      </div>

      {/* Advanced Filters Section */}
      {advancedFiltersOpen && (
        <div style={{marginBottom: '20px', padding: '15px', backgroundColor: 'var(--card)', borderRadius: '8px', borderLeft: '4px solid var(--primary)'}}>
          <h3 style={{marginTop: 0}}>Filtres avancés</h3>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px'}}>
            {/* Filter by Status */}
            <div>
              <label style={{fontWeight: 'bold', display: 'block', marginBottom: '5px'}}>Statut</label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--muted)'}}>
                <option value="">Tous les statuts</option>
                {PRODUCT_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Filter by Supplier */}
            <div>
              <label style={{fontWeight: 'bold', display: 'block', marginBottom: '5px'}}>Fournisseur</label>
              <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)} style={{width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--muted)'}}>
                <option value="">Tous les fournisseurs</option>
                {[...new Set(produits.map(p => p.fournisseur).filter(Boolean))].map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            {/* Filter by Category */}
            <div>
              <label style={{fontWeight: 'bold', display: 'block', marginBottom: '5px'}}>Catégorie</label>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--muted)'}}>
                <option value="">Toutes les catégories</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Clear Filters */}
            <div style={{display: 'flex', alignItems: 'flex-end'}}>
              <button onClick={() => { setFilterStatus(''); setFilterSupplier(''); setFilterCategory(''); setSearch(''); }} style={{width: '100%', padding: '8px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'}}>
                🔄 Réinitialiser filtres
              </button>
            </div>
          </div>
        </div>
      )}

      {showAll ? (
        <div className="full-list">
          <h2>Liste complète des articles</h2>
          <div className="grid">
            {sorted.map(p => (
              <div key={p.id} className="produit-card large">
                <div className="card-header">
                  <div>
                    <strong>{p.nom}</strong>
                    <div className="meta">{p.sku} • {p.categorie} • <span style={{backgroundColor: STATUS_COLORS[p.statut] || '#ccc', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '12px'}}>{p.statut || 'Inconnu'}</span></div>
                  </div>
                  <div className="actions">
                    <button onClick={() => setShowProductDetail(p.id)}>👁️</button>
                    <button onClick={() => setShowQRModal(p.id)}>📱</button>
                    <button onClick={() => editProduit(p.id)}>✏️</button>
                    <button onClick={() => deleteProduit(p.id)}>🗑️</button>
                  </div>
                </div>
                {p.imageUrl ? <img src={p.imageUrl} alt={p.nom} className="thumb" /> : null}
                <p>{p.description}</p>
                {(() => {
                  const prof = calculateProfit(p);
                  return <p>Qty: {p.quantite} — Achat: €{p.prixAchat} — Vente: €{p.prixVente} — Profit: €{prof.netProfit.toFixed(2)} ({prof.roiPercentage}% ROI)</p>;
                })()}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="liste-produits">
          {scannerActive ? (
            <div className="scanner-modal">
              <div className="scanner-inner">
                <video ref={videoRef} autoPlay muted playsInline style={{width:'100%'}} />
                <div className="scanner-controls">
                  <div>{scanMessage}</div>
                  <button onClick={stopScanner} className="small">Fermer</button>
                </div>
              </div>
            </div>
          ) : null}

          {showQRModal ? (
            <div className="scanner-modal">
              <div className="scanner-inner" style={{maxWidth: '400px'}}>
                <h3 style={{textAlign: 'center', marginBottom: '20px'}}>Code QR</h3>
                {(() => {
                  const p = produits.find(pr => pr.id === showQRModal);
                  return p ? (
                    <div style={{textAlign: 'center'}}>
                      <QRCodeSVG value={getQRUrl(p.id)} size={256} level="H" includeMargin={true} />
                      <p style={{marginTop: '15px', fontSize: '14px'}}><strong>{p.nom}</strong></p>
                      <p style={{fontSize: '12px', color: 'var(--muted)'}}>SKU: {p.sku}</p>
                      <button onClick={() => setShowProductDetail(showQRModal)} style={{width: '100%', marginTop: '10px', padding: '10px', backgroundColor: '#4caf50', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'}}>
                        👁️ Voir détails
                      </button>
                    </div>
                  ) : null;
                })()}
                <button onClick={() => setShowQRModal(null)} style={{width: '100%', marginTop: '10px', padding: '10px', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer'}}>Fermer</button>
              </div>
            </div>
          ) : null}

          {/* Product Detail Modal */}
          {showProductDetail ? (
            <div className="scanner-modal" style={{backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000}}>
              <div className="scanner-inner" style={{maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', backgroundColor: 'var(--bg)'}}>
                {(() => {
                  const p = produits.find(pr => pr.id === showProductDetail);
                  if (!p) return null;
                  const prof = calculateProfit(p);
                  return (
                    <div>
                      {/* Image Grande */}
                      {p.imageUrl && (
                        <div style={{marginBottom: '20px'}}>
                          <img src={p.imageUrl} alt={p.nom} style={{width: '100%', maxHeight: '400px', objectFit: 'cover', borderRadius: '8px'}} />
                        </div>
                      )}
                      
                      {/* Titre et SKU */}
                      <h2 style={{margin: '0 0 10px 0', fontSize: '28px'}}>{p.nom}</h2>
                      <div style={{display: 'flex', gap: '10px', marginBottom: '15px', alignItems: 'center', flexWrap: 'wrap'}}>
                        <span style={{backgroundColor: STATUS_COLORS[p.statut] || '#ccc', color: 'white', padding: '5px 15px', borderRadius: '20px', fontWeight: 'bold', fontSize: '14px'}}>{p.statut}</span>
                        {p.sku && <span style={{backgroundColor: 'var(--card)', padding: '5px 15px', borderRadius: '6px', fontSize: '13px', color: 'var(--muted)'}}>SKU: {p.sku}</span>}
                      </div>

                      {/* Description */}
                      {p.description && (
                        <div style={{marginBottom: '15px', padding: '10px', backgroundColor: 'var(--card)', borderRadius: '6px', borderLeft: '4px solid var(--primary)'}}>
                          <p style={{margin: 0, fontSize: '14px'}}>{p.description}</p>
                        </div>
                      )}

                      {/* Grid d'infos */}
                      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px'}}>
                        <div style={{backgroundColor: 'var(--card)', padding: '15px', borderRadius: '8px'}}>
                          <div style={{fontSize: '12px', color: 'var(--muted)', marginBottom: '5px'}}>Prix d'achat</div>
                          <div style={{fontSize: '22px', fontWeight: 'bold', color: '#0f62fe'}}>€{(parseFloat(p.prixAchat) || 0).toFixed(2)}</div>
                        </div>
                        <div style={{backgroundColor: 'var(--card)', padding: '15px', borderRadius: '8px'}}>
                          <div style={{fontSize: '12px', color: 'var(--muted)', marginBottom: '5px'}}>Prix de vente</div>
                          <div style={{fontSize: '22px', fontWeight: 'bold', color: '#4caf50'}}>€{(parseFloat(p.prixVente) || 0).toFixed(2)}</div>
                        </div>
                        <div style={{backgroundColor: 'var(--card)', padding: '15px', borderRadius: '8px'}}>
                          <div style={{fontSize: '12px', color: 'var(--muted)', marginBottom: '5px'}}>Profit net</div>
                          <div style={{fontSize: '22px', fontWeight: 'bold', color: prof.netProfit >= 0 ? '#4caf50' : '#f44336'}}>€{prof.netProfit.toFixed(2)}</div>
                        </div>
                        <div style={{backgroundColor: 'var(--card)', padding: '15px', borderRadius: '8px'}}>
                          <div style={{fontSize: '12px', color: 'var(--muted)', marginBottom: '5px'}}>ROI</div>
                          <div style={{fontSize: '22px', fontWeight: 'bold', color: '#9c27b0'}}>{prof.roiPercentage}%</div>
                        </div>
                      </div>

                      {/* Infos supplémentaires */}
                      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px'}}>
                        {p.categorie && (
                          <div style={{backgroundColor: 'var(--card)', padding: '12px', borderRadius: '6px'}}>
                            <div style={{fontSize: '11px', color: 'var(--muted)'}}>Catégorie</div>
                            <div style={{fontWeight: 'bold'}}>{p.categorie}</div>
                          </div>
                        )}
                        {p.fournisseur && (
                          <div style={{backgroundColor: 'var(--card)', padding: '12px', borderRadius: '6px'}}>
                            <div style={{fontSize: '11px', color: 'var(--muted)'}}>Fournisseur</div>
                            <div style={{fontWeight: 'bold'}}>{p.fournisseur}</div>
                          </div>
                        )}
                        {p.quantite && (
                          <div style={{backgroundColor: 'var(--card)', padding: '12px', borderRadius: '6px'}}>
                            <div style={{fontSize: '11px', color: 'var(--muted)'}}>Quantité</div>
                            <div style={{fontWeight: 'bold'}}>{p.quantite}</div>
                          </div>
                        )}
                        {p.dateVente && (
                          <div style={{backgroundColor: 'var(--card)', padding: '12px', borderRadius: '6px'}}>
                            <div style={{fontSize: '11px', color: 'var(--muted)'}}>Date vente</div>
                            <div style={{fontWeight: 'bold'}}>{p.dateVente}</div>
                          </div>
                        )}
                      </div>

                      {/* Tags */}
                      {p.tags && (
                        <div style={{marginBottom: '20px'}}>
                          <div style={{fontSize: '12px', fontWeight: 'bold', color: 'var(--muted)', marginBottom: '8px'}}>Tags</div>
                          <div style={{display: 'flex', gap: '5px', flexWrap: 'wrap'}}>
                            {p.tags.split(',').map((tag, i) => (
                              <span key={i} style={{backgroundColor: 'var(--primary)', color: 'white', padding: '4px 10px', borderRadius: '15px', fontSize: '12px'}}>
                                {tag.trim()}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      {p.notes && (
                        <div style={{marginBottom: '20px', padding: '12px', backgroundColor: 'var(--card)', borderRadius: '6px', borderLeft: '4px solid #ff9800'}}>
                          <div style={{fontSize: '12px', fontWeight: 'bold', marginBottom: '5px'}}>📝 Notes</div>
                          <p style={{margin: 0, fontSize: '14px'}}>{p.notes}</p>
                        </div>
                      )}

                      {/* Boutons d'action */}
                      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px'}}>
                        <button onClick={() => editProduit(p.id)} style={{padding: '12px', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'}}>
                          ✏️ Éditer
                        </button>
                        <button onClick={() => { 
                          if (window.confirm('Supprimer ce produit?')) {
                            deleteProduit(p.id);
                            setShowProductDetail(null);
                          }
                        }} style={{padding: '12px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'}}>
                          🗑️ Supprimer
                        </button>
                      </div>

                      {/* QR Code */}
                      <div style={{marginBottom: '20px', padding: '15px', backgroundColor: 'var(--card)', borderRadius: '8px', textAlign: 'center'}}>
                        <h4 style={{margin: '0 0 10px 0', fontSize: '14px'}}>📱 Code QR</h4>
                        <QRCodeSVG value={getQRUrl(p.id)} size={200} level="H" includeMargin={true} />
                      </div>

                      {/* Fermer */}
                      <button onClick={() => setShowProductDetail(null)} style={{width: '100%', padding: '12px', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px'}}>
                        ✖️ Fermer
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : null}
        <div className="list-controls">
          <label><input type="checkbox" onChange={() => selectAllOnPage(paginated)} /> Sélectionner la page</label>
          <div className="pager">
            <button disabled={page<=1} onClick={() => setPage(p => Math.max(1,p-1))}>◀</button>
            <span>Page {page}/{totalPages}</span>
            <button disabled={page>=totalPages} onClick={() => setPage(p => Math.min(totalPages,p+1))}>▶</button>
          </div>
        </div>

        {paginated.map((p) => (
          <div key={p.id} className="produit-card">
            <div className="card-header">
              <div>
                <label className="select-checkbox"><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} aria-label={`Sélection ${p.nom}`} /> {p.nom} {p.sku ? `— ${p.sku}` : ''}</label>
                <div className="meta">{p.categorie} • {p.fournisseur} • <span style={{backgroundColor: STATUS_COLORS[p.statut] || '#ccc', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '12px'}}>{p.statut || 'Inconnu'}</span></div>
              </div>
              <div className="actions">
                <button onClick={() => setShowProductDetail(p.id)} aria-label={`Détails de ${p.nom}`}>👁️</button>
                <button onClick={() => setShowQRModal(p.id)} aria-label={`QR de ${p.nom}`}>📱</button>
                <button onClick={() => editProduit(p.id)} aria-label={`Éditer ${p.nom}`}>✏️</button>
                <button onClick={() => deleteProduit(p.id)} aria-label={`Supprimer ${p.nom}`}>🗑️</button>
              </div>
            </div>

            {p.imageUrl ? <img src={p.imageUrl} alt={p.nom} className="thumb" /> : null}

            {(() => {
              const prof = calculateProfit(p);
              return (
                <>
                  <p>Qty: {p.quantite} — Achat: €{p.prixAchat} — Vente: €{p.prixVente} — Frais: €{p.frais}</p>
                  <p className="benefice">Profit: €{prof.netProfit.toFixed(2)} ({prof.roiPercentage}% ROI)</p>
                </>
              );
            })()}
            {p.description ? <p className="description">{p.description}</p> : null}
            {p.notes ? <p className="notes">Notes: {p.notes}</p> : null}
          </div>
        ))}
      </div>
      )}
      </div>
      )}

      {/* SALES TAB */}
      {activeTab === 'sales' && (
      <div className="tab-content">
        <h2>📊 Historique des ventes</h2>
        {produits.filter(p => p.statut === 'Sold').length === 0 ? (
          <p style={{textAlign: 'center', color: 'var(--muted)'}}>Aucune vente enregistrée</p>
        ) : (
          <table style={{width: '100%'}}>
            <thead>
              <tr style={{borderBottom: '2px solid var(--primary)'}}>
                <th style={{textAlign: 'left', padding: '10px'}}>Produit</th>
                <th style={{textAlign: 'center', padding: '10px'}}>Date</th>
                <th style={{textAlign: 'right', padding: '10px'}}>Prix vente</th>
                <th style={{textAlign: 'right', padding: '10px'}}>Coûts</th>
                <th style={{textAlign: 'right', padding: '10px'}}>Bénéfice net</th>
              </tr>
            </thead>
            <tbody>
              {produits.filter(p => p.statut === 'Sold').map(p => {
                const prof = calculateProfit(p);
                return (
                  <tr key={p.id} style={{borderBottom: '1px solid var(--card)'}}>
                    <td style={{padding: '10px'}}><strong>{p.nom}</strong></td>
                    <td style={{textAlign: 'center', padding: '10px'}}>{p.dateVente || '—'}</td>
                    <td style={{textAlign: 'right', padding: '10px'}}>€{prof.totalRevenue.toFixed(2)}</td>
                    <td style={{textAlign: 'right', padding: '10px'}}>€{prof.totalCost.toFixed(2)}</td>
                    <td style={{textAlign: 'right', padding: '10px', color: prof.netProfit >= 0 ? '#4caf50' : '#f44336', fontWeight: 'bold'}}>€{prof.netProfit.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      )}

      {/* EXPENSES TAB */}
      {activeTab === 'expenses' && (
      <div className="tab-content">
        <h2>💳 Suivi des dépenses</h2>
        <div className="expense-form" style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '10px', marginBottom: '20px'}}>
          <input type="text" placeholder="Description" id="expDesc" />
          <input type="number" step="0.01" placeholder="Montant (€)" id="expAmount" />
          <input type="date" id="expDate" defaultValue={new Date().toISOString().split('T')[0]} />
          <button onClick={() => {
            const desc = document.getElementById('expDesc').value;
            const amt = parseFloat(document.getElementById('expAmount').value);
            const date = document.getElementById('expDate').value;
            if (!desc || !amt) return;
            const newExp = { id: Date.now(), desc, amount: amt, date };
            setExpenses(prev => { const updated = [...prev, newExp]; localStorage.setItem('expenses', JSON.stringify(updated)); return updated; });
            document.getElementById('expDesc').value = '';
            document.getElementById('expAmount').value = '';
          }}>Ajouter</button>
        </div>

        {expenses.length === 0 ? (
          <p style={{textAlign: 'center', color: 'var(--muted)'}}>Aucune dépense enregistrée</p>
        ) : (
          <>
            <table style={{width: '100%', marginBottom: '20px'}}>
              <thead>
                <tr style={{borderBottom: '2px solid var(--primary)'}}>
                  <th style={{textAlign: 'left', padding: '10px'}}>Description</th>
                  <th style={{textAlign: 'center', padding: '10px'}}>Date</th>
                  <th style={{textAlign: 'right', padding: '10px'}}>Montant</th>
                  <th style={{padding: '10px'}}></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map(e => (
                  <tr key={e.id} style={{borderBottom: '1px solid var(--card)'}}>
                    <td style={{padding: '10px'}}>{e.desc}</td>
                    <td style={{textAlign: 'center', padding: '10px'}}>{e.date}</td>
                    <td style={{textAlign: 'right', padding: '10px'}}>€{e.amount.toFixed(2)}</td>
                    <td style={{padding: '10px'}}><button onClick={() => setExpenses(prev => { const u = prev.filter(x => x.id !== e.id); localStorage.setItem('expenses', JSON.stringify(u)); return u; })} className="danger small">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{fontSize: '18px', fontWeight: 'bold', textAlign: 'right'}}>
              Total dépenses: €{expenses.reduce((a, e) => a + e.amount, 0).toFixed(2)}
            </div>
          </>
        )}
      </div>
      )}

      {/* DASHBOARD TAB */}
      {activeTab === 'dashboard' && (
      <div className="tab-content dashboard">
        <h2>📊 Vue d'ensemble PRO</h2>
        
        {/* Citation motivante aléatoire */}
        <div style={{backgroundColor: 'var(--primary)', color: 'white', padding: '15px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center', fontSize: '16px', fontWeight: 'bold'}}>
          {MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)]}
        </div>

        {/* Badges/Achievements */}
        {(() => {
          const badges = generateBadges();
          return badges.length > 0 ? (
            <div style={{marginBottom: '20px'}}>
              <h3>🏆 Vos Badges</h3>
              <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                {badges.map((b, i) => <div key={i} style={{backgroundColor: 'var(--card)', padding: '10px 15px', borderRadius: '6px', textAlign: 'center', flex: '1 1 120px'}}>
                  <div style={{fontSize: '24px'}}>{b.emoji}</div>
                  <div style={{fontSize: '12px', fontWeight: 'bold'}}>{b.name}</div>
                  <div style={{fontSize: '10px', color: 'var(--muted)'}}>{b.desc}</div>
                </div>)}
              </div>
            </div>
          ) : null;
        })()}
        
        {/* Monthly Goal Section */}
        <div className="goal-section">
          <h3>🎯 Votre objectif ce mois</h3>
          <div style={{display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px'}}>
            <input type="number" step="0.01" value={monthlyGoal} onChange={e => { const v = parseFloat(e.target.value); setMonthlyGoal(v); localStorage.setItem('monthly_goal', String(v)); }} placeholder="Montant" style={{flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid var(--muted)'}} />
            <span style={{fontSize: '16px', fontWeight: 'bold'}}>€</span>
          </div>
          
          {(() => {
            const soldThisMonth = produits.filter(p => p.statut === 'Vendu' && p.dateVente && p.dateVente.startsWith(new Date().toISOString().slice(0, 7)));
            const monthProfit = soldThisMonth.reduce((acc, p) => acc + calculateProfit(p).netProfit, 0);
            const progress = (monthProfit / monthlyGoal) * 100;
            return (
              <>
                <div style={{marginTop: '15px'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '15px'}}>
                    <span>Bénéfice réalisé:</span>
                    <span style={{fontWeight: 'bold', color: '#4caf50'}}>€{monthProfit.toFixed(2)}</span>
                  </div>
                  <div style={{width: '100%', height: '24px', backgroundColor: '#e0e0e0', borderRadius: '12px', overflow: 'hidden'}}>
                    <div style={{width: `${Math.min(progress, 100)}%`, height: '100%', backgroundColor: progress >= 100 ? '#4caf50' : 'var(--primary)', transition: 'width 0.3s'}}></div>
                  </div>
                  <div style={{textAlign: 'right', marginTop: '5px', fontSize: '13px', color: 'var(--muted)'}}>
                    {Math.round(progress)}% ({monthlyGoal > 0 ? (monthProfit / monthlyGoal * 100).toFixed(0) : 0}% atteint)
                  </div>
                </div>
              </>
            );
          })()}
        </div>

        {/* KPI Cards */}
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px'}}>
          {(() => {
            const totalStock = produits.filter(p => ['À nettoyer', 'En attente de photo', 'En ligne'].includes(p.statut) || !p.statut);
            const totalSold = produits.filter(p => p.statut === 'Vendu');
            const shipped = produits.filter(p => p.statut === 'Expédié');
            const stockValue = totalStock.reduce((a, p) => a + (parseFloat(p.prixAchat) || 0) * (parseInt(p.quantite) || 1), 0);
            const soldProfit = totalSold.reduce((a, p) => a + calculateProfit(p).netProfit, 0);
            const avgRoi = totalSold.length > 0 ? (totalSold.reduce((a, p) => a + parseFloat(calculateProfit(p).roiPercentage), 0) / totalSold.length).toFixed(1) : 0;
            
            return <>
              <div style={{backgroundColor: 'var(--card)', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #0f62fe'}}>
                <div style={{fontSize: '12px', color: 'var(--muted)', marginBottom: '5px'}}>En stock</div>
                <div style={{fontSize: '24px', fontWeight: 'bold'}}>{totalStock.length}</div>
              </div>
              <div style={{backgroundColor: 'var(--card)', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #4caf50'}}>
                <div style={{fontSize: '12px', color: 'var(--muted)', marginBottom: '5px'}}>Valeur stock</div>
                <div style={{fontSize: '24px', fontWeight: 'bold'}}>€{stockValue.toFixed(2)}</div>
              </div>
              <div style={{backgroundColor: 'var(--card)', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #ff9800'}}>
                <div style={{fontSize: '12px', color: 'var(--muted)', marginBottom: '5px'}}>Vendus</div>
                <div style={{fontSize: '24px', fontWeight: 'bold'}}>{totalSold.length}</div>
              </div>
              <div style={{backgroundColor: 'var(--card)', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #00bcd4'}}>
                <div style={{fontSize: '12px', color: 'var(--muted)', marginBottom: '5px'}}>Expédiés</div>
                <div style={{fontSize: '24px', fontWeight: 'bold'}}>{shipped.length}</div>
              </div>
              <div style={{backgroundColor: 'var(--card)', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #4caf50'}}>
                <div style={{fontSize: '12px', color: 'var(--muted)', marginBottom: '5px'}}>Bénéfice net</div>
                <div style={{fontSize: '24px', fontWeight: 'bold', color: soldProfit >= 0 ? '#4caf50' : '#f44336'}}>€{soldProfit.toFixed(2)}</div>
              </div>
              <div style={{backgroundColor: 'var(--card)', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #9c27b0'}}>
                <div style={{fontSize: '12px', color: 'var(--muted)', marginBottom: '5px'}}>ROI moyen</div>
                <div style={{fontSize: '24px', fontWeight: 'bold'}}>{avgRoi}%</div>
              </div>
            </>;
          })()}
        </div>

        {/* Charts */}
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', marginBottom: '20px'}}>
          <div style={{backgroundColor: 'var(--card)', padding: '15px', borderRadius: '8px'}}>
            <h3>📈 Profit 7 derniers jours</h3>
            <Line data={getChartData()} options={{responsive: true, maintainAspectRatio: true}} />
          </div>
          <div style={{backgroundColor: 'var(--card)', padding: '15px', borderRadius: '8px'}}>
            <h3>📊 Profit par mois</h3>
            <Bar data={getMonthlyChartData()} options={{responsive: true, maintainAspectRatio: true}} />
          </div>
        </div>

        <h3>🏆 Top 5 meilleures ventes</h3>
        {(() => {
          const sorted = produits.filter(p => p.statut === 'Vendu').sort((a, b) => calculateProfit(b).netProfit - calculateProfit(a).netProfit).slice(0, 5);
          return sorted.length === 0 ? <p style={{color: 'var(--muted)'}}>Aucune vente</p> : (
            <table style={{width: '100%'}}>
              <thead>
                <tr style={{borderBottom: '2px solid var(--primary)'}}>
                  <th style={{textAlign: 'left', padding: '10px'}}>Produit</th>
                  <th style={{textAlign: 'right', padding: '10px'}}>Profit</th>
                  <th style={{textAlign: 'right', padding: '10px'}}>ROI</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(p => {
                  const prof = calculateProfit(p);
                  return (<tr key={p.id} style={{borderBottom: '1px solid var(--muted)'}}>
                    <td style={{padding: '10px'}}><strong>{p.nom}</strong></td>
                    <td style={{textAlign: 'right', padding: '10px', fontWeight: 'bold', color: '#4caf50'}}>€{prof.netProfit.toFixed(2)}</td>
                    <td style={{textAlign: 'right', padding: '10px', fontWeight: 'bold', color: '#0f62fe'}}>{prof.roiPercentage}%</td>
                  </tr>);
                })}
              </tbody>
            </table>
          );
        })()}
      </div>
      )}

      {/* Suppliers Tab */}
      {activeTab === 'suppliers' && (
        <div className="tab-content">
          <h2>🏭 Gestion des Fournisseurs</h2>
          
          <div style={{marginBottom: '20px'}}>
            <button onClick={() => setShowSupplierForm(!showSupplierForm)} style={{padding: '10px 15px', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'}}>
              {showSupplierForm ? '✖️ Fermer' : '➕ Ajouter Fournisseur'}
            </button>
            
            {showSupplierForm && (
              <div style={{marginTop: '15px', padding: '15px', backgroundColor: 'var(--card)', borderRadius: '8px', borderLeft: '4px solid var(--primary)'}}>
                <input id="supplierName" type="text" placeholder="Nom du fournisseur" style={{width: '100%', marginBottom: '10px', padding: '10px', borderRadius: '6px', border: '1px solid var(--muted)'}} />
                <input type="text" placeholder="Contact/Personne" style={{width: '100%', marginBottom: '10px', padding: '10px', borderRadius: '6px', border: '1px solid var(--muted)'}} />
                <input type="tel" placeholder="Téléphone" style={{width: '100%', marginBottom: '10px', padding: '10px', borderRadius: '6px', border: '1px solid var(--muted)'}} />
                <input type="text" placeholder="Adresse" style={{width: '100%', marginBottom: '10px', padding: '10px', borderRadius: '6px', border: '1px solid var(--muted)'}} />
                <button onClick={() => { 
                  const inp = document.getElementById('supplierName'); 
                  if (inp.value.trim()) addSupplier(inp.value); 
                  inp.value = ''; 
                  setShowSupplierForm(false); 
                }} style={{backgroundColor: '#4caf50', color: 'white', padding: '10px 15px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'}}>
                  ✔️ Enregistrer
                </button>
              </div>
            )}
          </div>
          
          {fournisseurs.length === 0 ? (
            <p style={{color: 'var(--muted)'}}>Aucun fournisseur. Cliquez sur "Ajouter" pour en créer.</p>
          ) : (
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px'}}>
              {fournisseurs.map(s => (
                <div key={s.id} style={{backgroundColor: 'var(--card)', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #ff9800'}}>
                  <h3>{s.name}</h3>
                  <p style={{fontSize: '14px', margin: '5px 0'}}>📞 {s.phone || 'N/A'}</p>
                  <p style={{fontSize: '14px', margin: '5px 0'}}>📍 {s.adresse || 'N/A'}</p>
                  <p style={{fontSize: '14px', margin: '5px 0', color: 'var(--muted)'}}>👤 {s.contact || 'N/A'}</p>
                  <button onClick={() => deleteSupplier(s.id)} style={{marginTop: '10px', backgroundColor: '#f44336', color: 'white', padding: '8px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer'}}>
                    🗑️ Supprimer
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="tab-content">
          <h2>⚙️ Paramètres et Outils</h2>
          
          {/* Theme Colors */}
          <div style={{marginBottom: '20px', padding: '15px', backgroundColor: 'var(--card)', borderRadius: '8px'}}>
            <h3>🎨 Couleur du thème</h3>
            <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
              {['#0f62fe', '#ff6b6b', '#4ecdc4', '#ffe66d', '#95e1d3', '#c44569'].map(color => (
                <button key={color} onClick={() => { 
                  setSelectedThemeColor(color); 
                  localStorage.setItem('theme_color', color); 
                  document.documentElement.style.setProperty('--primary', color);
                }} style={{width: '50px', height: '50px', backgroundColor: color, border: selectedThemeColor === color ? '3px solid #000' : '1px solid #ccc', borderRadius: '6px', cursor: 'pointer'}} title={color} />
              ))}
            </div>
          </div>

          {/* Dark Mode */}
          <div style={{marginBottom: '20px', padding: '15px', backgroundColor: 'var(--card)', borderRadius: '8px'}}>
            <h3>🌙 Mode sombre</h3>
            <button onClick={() => { setDarkMode(!darkMode); localStorage.setItem('dark_mode', darkMode ? '0' : '1'); }} style={{padding: '10px 15px', backgroundColor: darkMode ? '#1a1a1a' : '#ffffff', color: darkMode ? '#ffffff' : '#000000', border: '1px solid var(--muted)', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'}}>
              {darkMode ? '☀️ Passer au clair' : '🌙 Passer au sombre'}
            </button>
          </div>

          {/* Notifications */}
          <div style={{marginBottom: '20px', padding: '15px', backgroundColor: 'var(--card)', borderRadius: '8px', borderLeft: '4px solid #ff9800'}}>
            <h3>🔔 Notifications</h3>
            <p style={{fontSize: '14px', color: 'var(--muted)', marginBottom: '10px'}}>Recevez des alertes quand un produit est vendu</p>
            <button onClick={async () => {
              const granted = await requestNotificationPermission();
              if (granted) {
                sendNotification('🎉 Notifications activées!', 'Vous recevrez des alertes sur vos ventes');
                localStorage.setItem('notifications_enabled', '1');
              }
            }} style={{padding: '10px 15px', backgroundColor: '#ff9800', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'}}>
              🔔 Activer notifications
            </button>
            <button onClick={() => {
              localStorage.removeItem('notifications_enabled');
              alert('Notifications désactivées');
            }} style={{padding: '10px 15px', backgroundColor: '#999', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', marginLeft: '10px'}}>
              🔕 Désactiver
            </button>
          </div>

          {/* Calculatrice */}
          <div style={{marginBottom: '20px', padding: '15px', backgroundColor: 'var(--card)', borderRadius: '8px'}}>
            <h3>🧮 Calculatrice rapide</h3>
            <button onClick={() => setShowCalculator(!showCalculator)} style={{padding: '10px 15px', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'}}>
              {showCalculator ? '✖️ Fermer' : '🧮 Ouvrir'}
            </button>
            
            {showCalculator && (
              <div style={{marginTop: '15px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '8px'}}>
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '10px'}}>
                  {[7, 8, 9, '/', 4, 5, 6, '*', 1, 2, 3, '-', 0, '.', '=', '+'].map(btn => (
                    <button key={btn} style={{padding: '15px', fontSize: '16px', fontWeight: 'bold', borderRadius: '6px', border: '1px solid #ccc', cursor: 'pointer', backgroundColor: ['+', '-', '*', '/', '='].includes(String(btn)) ? 'var(--primary)' : '#fff', color: ['+', '-', '*', '/', '='].includes(String(btn)) ? 'white' : 'black'}}>{btn}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* SKU Settings */}
          <div style={{marginBottom: '20px', padding: '15px', backgroundColor: 'var(--card)', borderRadius: '8px'}}>
            <h3>🏷️ Paramètres SKU</h3>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
              <div>
                <label>Préfixe SKU</label>
                <input type="text" value={skuPrefix} onChange={e => setSkuPrefix(e.target.value)} style={{width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--muted)', marginTop: '5px'}} />
              </div>
              <div>
                <label>Compteur SKU</label>
                <input type="number" value={skuCounter} onChange={e => setSkuCounter(parseInt(e.target.value))} style={{width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--muted)', marginTop: '5px'}} />
              </div>
            </div>
          </div>

          {/* Badges Info */}
          <div style={{marginBottom: '20px', padding: '15px', backgroundColor: 'var(--card)', borderRadius: '8px'}}>
            <h3>🏆 Vos Badges</h3>
            {(() => {
              const badges = generateBadges();
              return (
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px'}}>
                  {badges.length === 0 ? (
                    <p style={{color: 'var(--muted)', gridColumn: '1 / -1'}}>Aucun badge encore. Continuez à vendre!</p>
                  ) : (
                    badges.map((b, i) => (
                      <div key={i} style={{backgroundColor: '#fff3cd', padding: '10px', borderRadius: '6px', textAlign: 'center', border: '2px solid #ffc107'}}>
                        <div style={{fontSize: '24px'}}>{b.emoji}</div>
                        <div style={{fontSize: '12px', fontWeight: 'bold'}}>{b.name}</div>
                      </div>
                    ))
                  )}
                </div>
              );
            })()}
          </div>

          {/* Danger Zone */}
          <div style={{marginBottom: '20px', padding: '15px', backgroundColor: '#ffebee', borderRadius: '8px', border: '1px solid #f44336'}}>
            <h3>⚠️ Zone Danger</h3>
            <button onClick={() => {
              if (window.confirm('Êtes-vous sûr? Cela va supprimer TOUS les produits localement (pas les données cloud).')) {
                setProduits([]);
                localStorage.removeItem('produits_v2');
              }
            }} style={{padding: '10px 15px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'}}>
              🗑️ Vider les produits locaux
            </button>
          </div>
        </div>
      )}

      <div className="footer-stats">
        <div>Total produits: {produits.length}</div>
        <div>Stock value: € {produits.reduce((acc,p)=>acc + ((p.prixAchat||0)*(p.quantite||1)),0).toFixed(2)}</div>
        <div>Potential revenue: € {produits.reduce((acc,p)=>acc + ((p.prixVente||0)*(p.quantite||1)),0).toFixed(2)}</div>
        <div>Total profit: € {produits.filter(p => p.statut === 'Vendu').reduce((acc,p)=>acc + calculateProfit(p).netProfit,0).toFixed(2)}</div>
      </div>
    </div>
  );
}

export default App;