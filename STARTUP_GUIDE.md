# 🚀 Guide de Démarrage - App Achat Revente

## Problèmes Corrigés ✅

### 🔴 Problème Principal Résolu
**Erreur:** `darkMode is not defined` dans App.js ligne 179
- **Cause:** Variable utilisée avant sa déclaration
- **Solution:** Lecture directe de localStorage dans l'initializer de `theme`

## 📋 Commandes de Démarrage

### Option 1: Mode Développement Classique
```bash
npm run electron-dev
```
Lance le serveur React + Electron ensemble avec `concurrently`

### Option 2: Démarrage Rapide (Commandline)
```bash
npm run electron-dev-fast
```
Utilise un script Node.js personnalisé pour un meilleur contrôle

### Option 3: Démarrage Batch (Windows)
```bash
.\start-app.bat
```
Double-cliquez sur le fichier pour lancer automatiquement

### Option 4: Démarrage Manuel
Terminal 1:
```bash
npm start
```

Terminal 2 (après 15 secondes):
```bash
npm run electron
```

## 🔧 Dépendances Requises

Vérifiez que tout est installé:
```bash
npm install
```

Packages principaux:
- `react@^19.2.4`
- `electron@^40.2.1`
- `electron-is-dev@^3.0.1`
- `concurrently@^9.2.1` (pour electron-dev)

## 📝 Remarques

- Les avertissements de cache sur Windows sont normaux (erreurs d'accès aux dossiers système)
- Les DevTools s'ouvrent automatiquement en mode développement
- Le serveur React démarre sur http://localhost:3000
- L'app Electron charge depuis le serveur local

## ❌ Autres Corrections Effectuées

1. **Imports validés:** Admin.js, Login.js, firebase.js - tous présents
2. **CSS chargé:** modern.css et autres fichiers CSS sont disponibles
3. **Files publiques:** preload.js, sw.js, index.html - tous OK
4. **Variables:** Vérification des références non définies

## 🎯 Prochain Démarrage

Lancer simplement:
```bash
npm run electron-dev
```

Ou double-cliquer sur `start-app.bat`
