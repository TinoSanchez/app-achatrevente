#!/usr/bin/env node

/**
 * Script de démarrage pour l'app Electron
 * Gère le lancement coordonné du serveur React et de l'app Electron
 */

const { spawn } = require('child_process');
const path = require('path');
const isDev = process.env.NODE_ENV !== 'production';

console.log('🚀 Démarrage de l\'application...');
console.log(isDev ? '📱 Mode développement' : '🏢 Mode production');

// Démarrer le serveur React
console.log('📦 Démarrage du serveur React...');
const reactServer = spawn('npm', ['start'], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true
});

// Attendre que le serveur React soit prêt
setTimeout(() => {
  console.log('\n⏳ Lancement de l\'app Electron...');
  
  // Démarrer Electron
  const electron = spawn('electron', ['.'], {
    cwd: __dirname,
    stdio: 'inherit',
    shell: true
  });

  electron.on('close', (code) => {
    console.log(`\n❌ Electron fermé (code: ${code})`);
    reactServer.kill();
    process.exit(0);
  });
}, 12000);

// Gestion des erreurs
reactServer.on('error', (err) => {
  console.error('❌ Erreur serveur React:', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n⛔ Arrêt de l\'application...');
  reactServer.kill();
  process.exit(0);
});
