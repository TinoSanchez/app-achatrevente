import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  query, 
  where, 
  orderBy,
  onSnapshot 
} from 'firebase/firestore';
import { db } from './firebase';

/**
 * Récupère tous les produits d'un utilisateur depuis Firestore
 */
export const getUserProducts = async (userId) => {
  if (!userId || !db) return [];
  
  try {
    const q = query(
      collection(db, 'produits'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Erreur lors de la récupération des produits:', error);
    return [];
  }
};

/**
 * Écoute les changements en temps réel des produits d'un utilisateur
 */
export const onUserProductsChange = (userId, callback) => {
  if (!userId || !db) {
    callback([]);
    return () => {};
  }

  try {
    const q = query(
      collection(db, 'produits'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    
    return onSnapshot(q, (snapshot) => {
      const products = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      callback(products);
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des produits en temps réel:', error);
    callback([]);
    return () => {};
  }
};

/**
 * Ajoute un produit pour un utilisateur
 */
export const addProductForUser = async (userId, productData) => {
  if (!userId || !db) throw new Error('User not authenticated');
  
  try {
    const docRef = await addDoc(collection(db, 'produits'), {
      ...productData,
      userId,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return {
      id: docRef.id,
      ...productData,
      userId,
      createdAt: new Date()
    };
  } catch (error) {
    console.error('Erreur lors de l\'ajout du produit:', error);
    throw error;
  }
};

/**
 * Met à jour un produit
 */
export const updateProductForUser = async (userId, productId, updates) => {
  if (!userId || !db) throw new Error('User not authenticated');
  
  try {
    const docRef = doc(db, 'produits', productId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du produit:', error);
    throw error;
  }
};

/**
 * Supprime un produit
 */
export const deleteProductForUser = async (userId, productId) => {
  if (!userId || !db) throw new Error('User not authenticated');
  
  try {
    await deleteDoc(doc(db, 'produits', productId));
  } catch (error) {
    console.error('Erreur lors de la suppression du produit:', error);
    throw error;
  }
};

/**
 * Sauvegarde les données utilisateur (préférences, objectifs, etc.)
 */
export const saveUserPreferences = async (userId, preferences) => {
  if (!userId) return;
  
  if (!db) {
    // Fallback to localStorage for offline mode
    try {
      const prefs = localStorage.getItem(`user_prefs_${userId}`) || '{}';
      const current = JSON.parse(prefs);
      const updated = { ...current, ...preferences, updatedAt: new Date().toISOString() };
      localStorage.setItem(`user_prefs_${userId}`, JSON.stringify(updated));
    } catch (error) {
      console.warn('Could not save preferences to localStorage:', error);
    }
    return;
  }

  try {
    const docRef = doc(db, 'users', userId);
    await updateDoc(docRef, {
      ...preferences,
      updatedAt: new Date()
    }).catch(async (error) => {
      if (error.code === 'not-found') {
        // Document doesn't exist, create it
        const { setDoc } = await import('firebase/firestore');
        await setDoc(docRef, {
          userId,
          ...preferences,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      } else {
        throw error;
      }
    });
  } catch (error) {
    console.error('Erreur lors de la sauvegarde des préférences:', error);
  }
};

/**
 * Récupère les préférences utilisateur
 */
export const getUserPreferences = async (userId) => {
  if (!userId) return {};
  
  if (!db) {
    // Fallback to localStorage for offline mode
    try {
      const prefs = localStorage.getItem(`user_prefs_${userId}`) || '{}';
      return JSON.parse(prefs);
    } catch (error) {
      console.warn('Could not retrieve preferences from localStorage:', error);
      return {};
    }
  }

  try {
    const { getDoc } = await import('firebase/firestore');
    const docRef = doc(db, 'users', userId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : {};
  } catch (error) {
    console.error('Erreur lors de la récupération des préférences:', error);
    return {};
  }
};

/**
 * Importe des produits depuis un CSV
 */
export const importProductsFromCSV = async (userId, products) => {
  if (!userId || !db || !Array.isArray(products)) {
    throw new Error('Invalid input');
  }

  try {
    const results = [];
    for (const product of products) {
      const docRef = await addDoc(collection(db, 'produits'), {
        ...product,
        userId,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      results.push({
        id: docRef.id,
        ...product
      });
    }
    return results;
  } catch (error) {
    console.error('Erreur lors de l\'importation des produits:', error);
    throw error;
  }
};
