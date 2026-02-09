import React, { useState, useEffect } from 'react';
import { collection, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import './modern.css';

export default function Admin({ user, onBack }) {
  const [users, setUsers] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchUser, setSearchUser] = useState('');
  const [error, setError] = useState(null);
  const [theme, setTheme] = useState(() => document.body.classList.contains('theme-dark') ? 'dark' : 'light');

  useEffect(() => {
    loadAllUsers();
  }, []);

  const loadAllUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      // Récupérer tous les utilisateurs
      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);
      const usersList = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setUsers(usersList);
      // Récupérer tous les produits
      const allProds = [];
      for (const userData of usersList) {
        try {
          const productsRef = collection(db, 'users', userData.id, 'produits');
          const productsSnapshot = await getDocs(productsRef);
          const userProds = productsSnapshot.docs.map(doc => ({
            id: doc.id,
            userId: userData.id,
            userEmail: userData.email,
            ...doc.data()
          }));
          allProds.push(...userProds);
        } catch (err) {
          // Si une sous-collection est inaccessible, on continue
        }
      }
      setAllProducts(allProds);
    } catch (error) {
      setError('Impossible de charger les données Firestore. Vérifiez votre connexion ou vos droits.');
      setUsers([]);
      return (
        <div className="admin-container">
          <div className="admin-header">
            <h2>👨‍💼 Administration</h2>
            <button onClick={onBack} className="btn">Retour</button>
            <button onClick={()=>setTheme(theme==='dark'?'light':'dark')} style={{background:theme==='dark'?'#22223b':'#fff',color:theme==='dark'?'#fff':'#222',border:'1.5px solid var(--muted)',borderRadius:'8px',padding:'8px 18px',fontWeight:'bold',boxShadow:'0 2px 8px 0 rgba(0,0,0,0.08)',cursor:'pointer',marginLeft:'18px'}}>
              {theme==='dark'? '☀️ Thème clair' : '🌙 Thème sombre'}
            </button>
          </div>
          {loading ? (
            <div style={{textAlign:'center',margin:'48px 0',fontSize:'1.2rem'}}>Chargement...</div>
          ) : error ? (
            <div className="error" style={{margin:'48px 0',fontSize:'1.1rem'}}>{error}</div>
          ) : (
            <>
              <div style={{marginBottom:'40px',display:'flex',gap:'32px',alignItems:'center'}}>
                <input
                  type="text"
                  placeholder="Recherche utilisateur (email)"
                  value={searchUser}
                  onChange={e=>setSearchUser(e.target.value)}
                  style={{maxWidth:'340px',padding:'16px',borderRadius:'10px',fontSize:'1.08rem'}}
                />
                <button onClick={loadAllUsers} className="btn">🔄 Actualiser</button>
              </div>
              <div className="users-grid">
                {users.filter(u=>!searchUser||u.email.toLowerCase().includes(searchUser.toLowerCase())).map(u=>(
                  <div key={u.id} style={{background:'var(--card)',borderRadius:'18px',boxShadow:'var(--shadow)',padding:'36px 28px',marginBottom:'24px',display:'flex',flexDirection:'column',gap:'18px'}}>
                    <div style={{fontWeight:'bold',fontSize:'1.18rem',color:'var(--primary-dark)'}}>{u.email}</div>
                    <div style={{color:'var(--muted)',fontSize:'1.05rem'}}>Nom: {u.displayName||u.nom||'—'}</div>
                    <div style={{color:'var(--muted)',fontSize:'1.05rem'}}>Role: {u.role||'user'}</div>
                    <button onClick={()=>deleteUser(u.id)} style={{background:'var(--danger)',color:'#fff',border:'none',borderRadius:'10px',padding:'12px 22px',fontWeight:'bold',marginTop:'12px',fontSize:'1.05rem'}}>Supprimer utilisateur</button>
                  </div>
                ))}
              </div>
              <h3 style={{margin:'48px 0 24px 0'}}>Tous les produits</h3>
              <div className="products-list">
                {allProducts.map(p=>(
                  <div key={p.id} style={{background:'var(--card)',borderRadius:'18px',boxShadow:'var(--shadow)',padding:'32px 24px',marginBottom:'22px',display:'flex',flexDirection:'column',gap:'14px'}}>
                    <div style={{fontWeight:'bold',fontSize:'1.15rem',color:'var(--primary-dark)'}}>{p.nom}</div>
                    <div style={{color:'var(--muted)',fontSize:'1.05rem'}}>SKU: {p.sku||'—'} | Catégorie: {p.categorie||'—'} | Statut: {p.statut||'—'}</div>
                    <div style={{color:'var(--muted)',fontSize:'1.05rem'}}>Utilisateur: {p.userEmail||'—'}</div>
                    <button onClick={()=>deleteProduct(p.userId,p.id)} style={{background:'var(--danger)',color:'#fff',border:'none',borderRadius:'10px',padding:'12px 22px',fontWeight:'bold',marginTop:'12px',fontSize:'1.05rem'}}>Supprimer produit</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      );
      await loadAllUsers();
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const removeAdmin = async (userId) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        role: 'user'
      });
      alert('✅ Admin retiré');
      await loadAllUsers();
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchUser.toLowerCase())
  );


  if (loading) {
    return (
      <div style={{padding: '20px', textAlign: 'center'}}>
        <div>Chargement des données...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{padding: '30px', textAlign: 'center', color: 'red'}}>
        <h2>Erreur</h2>
        <p>{error}</p>
        <button onClick={loadAllUsers} style={{marginTop: '20px', padding: '10px 20px', borderRadius: '6px', background: 'var(--primary)', color: 'white', border: 'none', fontWeight: 'bold', cursor: 'pointer'}}>Réessayer</button>
        <button onClick={onBack} style={{marginTop: '20px', marginLeft: '10px', padding: '10px 20px', borderRadius: '6px', background: '#999', color: 'white', border: 'none', fontWeight: 'bold', cursor: 'pointer'}}>Retour</button>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>👨‍💼 Panneau d'Administration</h1>
        <button onClick={onBack} className="btn-back">← Retour</button>
      </div>

      <div className="admin-content">
        {/* Section Utilisateurs */}
        <div className="admin-section">
          <h2>👥 Gestion des Utilisateurs</h2>
          <p style={{color: 'var(--muted)', fontSize: '14px'}}>Total: {users.length} utilisateurs</p>
          
          <input 
            type="text" 
            placeholder="Rechercher un utilisateur..." 
            value={searchUser}
            onChange={e => setSearchUser(e.target.value)}
            style={{width: '100%', padding: '10px', marginBottom: '15px', borderRadius: '6px', border: '1px solid var(--muted)'}}
          />

          <div className="users-grid">
            {filteredUsers.map(u => (
              <div key={u.id} style={{backgroundColor: 'var(--card)', padding: '15px', borderRadius: '8px', borderLeft: '4px solid ' + (u.role === 'admin' ? '#ff9800' : '#0f62fe')}}>
                <div style={{marginBottom: '10px'}}>
                  <strong>{u.email}</strong>
                  {u.role === 'admin' && <span style={{marginLeft: '8px', backgroundColor: '#ff9800', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold'}}>ADMIN</span>}
                </div>
                <p style={{fontSize: '12px', color: 'var(--muted)', margin: '5px 0'}}>ID: {u.id}</p>
                <p style={{fontSize: '12px', color: 'var(--muted)', margin: '5px 0'}}>Produits: {allProducts.filter(p => p.userId === u.id).length}</p>
                
                <div style={{display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap'}}>
                  {u.role !== 'admin' ? (
                    <button 
                      onClick={() => makeAdmin(u.id)}
                      style={{flex: 1, padding: '8px', backgroundColor: '#ff9800', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'}}
                    >
                      Rendre Admin
                    </button>
                  ) : (
                    <button 
                      onClick={() => removeAdmin(u.id)}
                      style={{flex: 1, padding: '8px', backgroundColor: '#4caf50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'}}
                    >
                      Retirer Admin
                    </button>
                  )}
                  <button 
                    onClick={() => deleteUser(u.id)}
                    style={{flex: 1, padding: '8px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'}}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section Produits */}
        <div className="admin-section" style={{marginTop: '30px'}}>
          <h2>📦 Tous les Produits</h2>
          <p style={{color: 'var(--muted)', fontSize: '14px'}}>Total: {allProducts.length} produits</p>

          <div className="products-list">
            {allProducts.length === 0 ? (
              <p style={{textAlign: 'center', color: 'var(--muted)'}}>Aucun produit</p>
            ) : (
              allProducts.map(p => (
                <div key={`${p.userId}-${p.id}`} style={{backgroundColor: 'var(--card)', padding: '15px', borderRadius: '8px', marginBottom: '10px', display: 'grid', gridTemplateColumns: '1fr auto', gap: '15px', alignItems: 'center'}}>
                  <div>
                    <strong>{p.nom}</strong>
                    <p style={{fontSize: '12px', color: 'var(--muted)', margin: '5px 0'}}>De: {p.userEmail}</p>
                    <p style={{fontSize: '12px', margin: '5px 0'}}>Prix: €{p.prixVente} | Statut: {p.statut}</p>
                    {p.description && <p style={{fontSize: '12px', color: 'var(--muted)'}}>{p.description.substring(0, 50)}...</p>}
                  </div>
                  <button 
                    onClick={() => deleteProduct(p.userId, p.id)}
                    style={{padding: '8px 12px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap'}}
                  >
                    🗑️ Supprimer
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
