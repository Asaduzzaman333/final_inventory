/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

// Firebase SDKs
import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics'; // Added for Analytics
import { 
  getAuth, 
  onAuthStateChanged, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  setPersistence,
  browserLocalPersistence 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  getDocs, 
  getDoc,
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  onSnapshot,
  writeBatch,
  Timestamp
} from 'firebase/firestore';
import { 
  getStorage, 
  ref, 
  uploadString, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';

// Your web app's Firebase configuration - UPDATED
const firebaseConfig = {
  apiKey: "AIzaSyC4miS_z3ybRGkdjQKqFdNodO7W-yoClK8",
  authDomain: "inventoryapp-5e571.firebaseapp.com",
  projectId: "inventoryapp-5e571",
  storageBucket: "inventoryapp-5e571.firebasestorage.app", // Corrected as per your new config
  messagingSenderId: "532115144135",
  appId: "1:532115144135:web:7f59563a06857ea6e02de2",
  measurementId: "G-5SEQD7645G" // Added measurementId
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const analytics = getAnalytics(firebaseApp); // Initialize Analytics
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

// Set persistence to local (default, but explicit)
setPersistence(auth, browserLocalPersistence)
  .catch((error) => {
    console.error("Firebase Persistence Error:", error);
  });


const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"] as const;
type Size = typeof SIZES[number];

interface UserDocument { // For Firestore 'users' collection
  uid: string;
  email: string;
  username: string;
  createdAt: Timestamp;
}

interface CategoryDefinition {
  id: string; // Firestore document ID
  name: string;
  subcategories: string[];
}

interface InventoryItem {
  id: string; // Firestore document ID
  name: string;
  sku: string;
  category: string; // Category name
  subcategory: string; // Subcategory name
  sizes: Record<Size, number>;
  price: number;
  description?: string;
  imageUrl?: string; // Firebase Storage download URL
  imageStoragePath?: string; // Path in Firebase Storage
}

// --- INITIAL DATA (for seeding Firestore if empty) ---
const INITIAL_CATEGORIES_DATA_NO_ID: Omit<CategoryDefinition, 'id'>[] = [
  { name: "Men", subcategories: ["Men's Oxford", "Men's Cuban", "Formal Shirt", "Winter Collection", "Casual Wear", "Default"] },
  { name: "Women", subcategories: ["Formal Wear", "Casual Wear", "Default"] },
  { name: "Uncategorized", subcategories: ["Default"] }
];

const defaultSizesSeed = SIZES.reduce((acc, size) => { acc[size] = 0; return acc; }, {} as Record<Size, number>);
const INITIAL_ITEMS_DATA_NO_ID: Omit<InventoryItem, 'id' | 'imageUrl' | 'imageStoragePath'>[] = [
    { name: 'Classic T-Shirt', sku: 'TS-001', category: 'Men', subcategory: 'Casual Wear', sizes: { ...defaultSizesSeed, XS: 5, S: 10, M: 15, L: 20, XL: 15, XXL: 5, '3XL': 2 }, price: 25.00, description: 'Comfortable cotton t-shirt'},
    { name: 'Denim Jeans', sku: 'JN-002', category: 'Men', subcategory: 'Casual Wear', sizes: { ...defaultSizesSeed, XS: 2, S: 5, M: 10, L: 12, XL: 8, XXL: 3, '3XL': 1 }, price: 60.00, description: 'Slim-fit denim jeans'},
    { name: 'Hoodie Pro', sku: 'HD-003', category: 'Men', subcategory: 'Winter Collection', sizes: { ...defaultSizesSeed, XS: 3, S: 8, M: 12, L: 15, XL: 10, XXL: 6, '3XL': 3 }, price: 45.00, description: 'Warm fleece hoodie'},
    { name: 'Elegant Blouse', sku: 'BL-001', category: 'Women', subcategory: 'Formal Wear', sizes: { ...defaultSizesSeed, XS: 4, S: 10, M: 15, L: 10, XL: 5, XXL: 2, '3XL': 1 }, price: 35.00, description: 'Silk formal blouse'},
    { name: 'Summer Dress', sku: 'DR-002', category: 'Women', subcategory: 'Casual Wear', sizes: { ...defaultSizesSeed, XS: 6, S: 12, M: 18, L: 15, XL: 7, XXL: 4, '3XL': 2 }, price: 50.00, description: 'Light cotton summer dress'},
];
// -------------------------------------------------------------

const calculateTotalQuantity = (sizes: Record<Size, number>): number => {
  return SIZES.reduce((sum, size) => sum + (sizes[size] || 0), 0);
};

interface ProductStockViewProps {
  items: InventoryItem[];
  allCategories: CategoryDefinition[];
  selectedCategoryName: string | null;
  selectedSubcategoryName: string | null;
  onSelectCategory: (categoryName: string) => void;
  onSelectSubcategory: (categoryName: string, subcategoryName: string) => void;
  onNavigateBack: () => void;
  onSellItemSize: (itemId: string, size: Size) => void;
  getCategoryItemCount: (categoryName: string, subcategoryName: string) => number;
  currentUser: import('firebase/auth').User | null; // Added to conditionally show "Sell 1" button
}

const ProductStockView: React.FC<ProductStockViewProps> = ({
  items,
  allCategories,
  selectedCategoryName,
  selectedSubcategoryName,
  onSelectCategory,
  onSelectSubcategory,
  onNavigateBack,
  onSellItemSize,
  getCategoryItemCount,
  currentUser,
}) => {
  if (!selectedCategoryName) {
    return (
      <div className="category-selection-container">
        <h2>Shop by Category</h2>
        {allCategories.filter(cat => cat.name !== 'Uncategorized' || cat.subcategories.some(subcat => getCategoryItemCount(cat.name, subcat) > 0)).length === 0 && (
           <p className="empty-state-text">No categories with products available.</p>
        )}
        <div className="category-grid">
          {allCategories.map(category => {
             const totalItemsInCategory = category.subcategories.reduce((sum, subcat) => sum + getCategoryItemCount(category.name, subcat), 0);
             if (category.name === 'Uncategorized' && totalItemsInCategory === 0 && !category.subcategories.includes('Default')) { 
                 return null;
             }
             if (category.name === 'Uncategorized' && totalItemsInCategory === 0 && !(category.subcategories.length === 1 && category.subcategories[0] === 'Default')) {
                return null;
             }
            return (
              <button
                key={category.id}
                onClick={() => onSelectCategory(category.name)}
                className="category-card btn"
                aria-label={`View products in ${category.name}`}
              >
                {category.name}
                <span className="item-count-badge">{totalItemsInCategory} items</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (!selectedSubcategoryName) {
    const category = allCategories.find(cat => cat.name === selectedCategoryName);
    if (!category) return <p className="empty-state-text">Category not found.</p>;
    const visibleSubcategories = category.subcategories.filter(subcat => getCategoryItemCount(category.name, subcat) > 0 || subcat === 'Default');
    
    return (
      <div className="category-selection-container">
        <div className="navigation-header">
          <button onClick={onNavigateBack} className="btn btn-secondary btn-sm btn-back-nav">
            &larr; Back to Categories
          </button>
          <h2>{selectedCategoryName} &gt; Select Subcategory</h2>
        </div>
         {visibleSubcategories.length === 0 && (
           <p className="empty-state-text">No subcategories with products available in {category.name}.</p>
        )}
        <div className="category-grid">
          {category.subcategories.map(subcategory => { 
            const itemCount = getCategoryItemCount(category.name, subcategory);
            if (itemCount === 0 && subcategory !== 'Default') return null;
             if (category.name === 'Uncategorized' && subcategory === 'Default' && itemCount === 0 && category.subcategories.length > 1) {
              // Hide if Uncategorized/Default is empty but other Uncategorized subcats exist and have items
              const otherUncategorizedSubcatsHaveItems = category.subcategories.filter(s => s !== 'Default').some(s => getCategoryItemCount(category.name, s) > 0);
              if (otherUncategorizedSubcatsHaveItems) return null;
            }
            return (
              <button
                key={subcategory}
                onClick={() => onSelectSubcategory(category.name, subcategory)}
                className="category-card btn"
                aria-label={`View products in ${subcategory}`}
              >
                {subcategory}
                <span className="item-count-badge">{itemCount} items</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="product-stock-view-container">
      <div className="navigation-header full-width-header">
        <button onClick={onNavigateBack} className="btn btn-secondary btn-sm btn-back-nav">
          &larr; Back to Subcategories
        </button>
        <h2>{selectedCategoryName} &gt; {selectedSubcategoryName}</h2>
      </div>
      {items.length === 0 && (
        <div className="product-stock-view-container empty-state full-span-empty">
          <h2>No products found in this subcategory.</h2>
          <p>Admins can add products in the admin panel.</p>
        </div>
      )}
      {items.map(item => (
        <div key={item.id} className="product-stock-card">
          {item.imageUrl && (
            <div className="product-image-container">
              <img src={item.imageUrl} alt={item.name} className="product-image" />
            </div>
          )}
          <h3>{item.name}</h3>
          <p className="sku">SKU: {item.sku}</p>
           <p className="price">Price: ${item.price.toFixed(2)}</p>
          {item.description && <p className="description">{item.description}</p>}
          <div className="sizes-overview">
            <h4>Available Stock by Size:</h4>
            <ul>
              {SIZES.map(size => (
                <li key={size}>
                  <span className="size-label">{size}:</span>
                  <span className="size-quantity">{item.sizes[size] || 0}</span>
                  {currentUser && ( // Show "Sell 1" if user is logged in
                    <button
                      onClick={() => onSellItemSize(item.id, size)}
                      disabled={(item.sizes[size] || 0) === 0}
                      className="btn btn-sell-size"
                      aria-label={`Sell one ${size} of ${item.name}`}
                    >
                      Sell 1
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
};

interface LoginViewProps {
  onLogin: (email: string, password_raw: string) => Promise<void>;
  loginError: string | null;
  onSwitchToRegister: () => void;
  isLoggingIn: boolean;
}

const LoginView: React.FC<LoginViewProps> = ({ onLogin, loginError, onSwitchToRegister, isLoggingIn }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onLogin(email, password);
  };

  return (
    <div className="login-container">
      <form onSubmit={handleSubmit} className="login-form">
        <h2>Login</h2>
        {loginError && <p className="login-error-message">{loginError}</p>}
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-required="true"
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            aria-required="true"
          />
        </div>
        <button type="submit" className="btn btn-primary btn-login" disabled={isLoggingIn}>
          {isLoggingIn ? 'Logging in...' : 'Login'}
        </button>
        <p className="auth-switch-message">
          Don't have an account?{' '}
          <button type="button" onClick={onSwitchToRegister} className="btn-link" disabled={isLoggingIn}>
            Register here
          </button>
        </p>
      </form>
    </div>
  );
};

interface RegistrationViewProps {
  onRegister: (email: string, username: string, password_raw: string, confirmPassword_raw: string) => Promise<void>;
  registrationMessage: { type: 'success' | 'error'; text: string } | null;
  onSwitchToLogin: () => void;
  isRegistering: boolean;
}

const RegistrationView: React.FC<RegistrationViewProps> = ({ onRegister, registrationMessage, onSwitchToLogin, isRegistering }) => {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onRegister(email, username, password, confirmPassword);
  };

  return (
    <div className="login-container">
      <form onSubmit={handleSubmit} className="login-form">
        <h2>Register</h2>
        {registrationMessage && (
          <p className={registrationMessage.type === 'success' ? 'registration-success-message' : 'login-error-message'}>
            {registrationMessage.text}
          </p>
        )}
        <div className="form-group">
          <label htmlFor="reg-email">Email</label>
          <input
            type="email"
            id="reg-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-required="true"
          />
        </div>
         <div className="form-group">
          <label htmlFor="reg-username">Username</label>
          <input
            type="text"
            id="reg-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            aria-required="true"
          />
        </div>
        <div className="form-group">
          <label htmlFor="reg-password">Password (min. 6 characters)</label>
          <input
            type="password"
            id="reg-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            aria-required="true"
            minLength={6}
          />
        </div>
        <div className="form-group">
          <label htmlFor="reg-confirm-password">Confirm Password</label>
          <input
            type="password"
            id="reg-confirm-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            aria-required="true"
            minLength={6}
          />
        </div>
        <button type="submit" className="btn btn-primary btn-login" disabled={isRegistering}>
          {isRegistering ? 'Registering...' : 'Register'}
        </button>
         <p className="auth-switch-message">
          Already have an account?{' '}
          <button type="button" onClick={onSwitchToLogin} className="btn-link" disabled={isRegistering}>
            Login here
          </button>
        </p>
      </form>
    </div>
  );
};

interface AdminCategoryManagerProps {
  categories: CategoryDefinition[];
  onAddCategory: (categoryName: string) => Promise<void>;
  onDeleteCategory: (categoryId: string, categoryName: string) => Promise<void>;
  onAddSubcategory: (categoryId: string, categoryName: string, subcategoryName: string) => Promise<void>;
  onDeleteSubcategory: (categoryId: string, categoryName: string, subcategoryName: string) => Promise<void>;
  items: InventoryItem[]; // To check if category/subcategory is in use
}

const AdminCategoryManager: React.FC<AdminCategoryManagerProps> = ({
  categories,
  onAddCategory,
  onDeleteCategory,
  onAddSubcategory,
  onDeleteSubcategory,
  items
}) => {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [selectedCategoryForNewSub, setSelectedCategoryForNewSub] = useState<string>(categories[0]?.id || '');

  useEffect(() => {
    if (categories.length > 0 && !categories.find(c => c.id === selectedCategoryForNewSub)) {
      setSelectedCategoryForNewSub(categories[0].id);
    } else if (categories.length === 0) {
      setSelectedCategoryForNewSub('');
    }
  }, [categories, selectedCategoryForNewSub]);

  const handleAddCategory = async () => {
    if (newCategoryName.trim() && !categories.find(cat => cat.name.toLowerCase() === newCategoryName.trim().toLowerCase())) {
      await onAddCategory(newCategoryName.trim());
      setNewCategoryName('');
    } else {
      alert("Category name cannot be empty or already exists.");
    }
  };

  const handleAddSubcategory = async () => {
    const category = categories.find(cat => cat.id === selectedCategoryForNewSub);
    if (category && newSubcategoryName.trim() && !category.subcategories.find(sub => sub.toLowerCase() === newSubcategoryName.trim().toLowerCase())) {
      await onAddSubcategory(category.id, category.name, newSubcategoryName.trim());
      setNewSubcategoryName('');
    } else {
       alert("Subcategory name cannot be empty, already exists in this category, or no category is selected.");
    }
  };
  
  const isCategoryInUse = (categoryName: string): boolean => {
    return items.some(item => item.category === categoryName);
  };

  const isSubcategoryInUse = (categoryName: string, subcategoryName: string): boolean => {
    return items.some(item => item.category === categoryName && item.subcategory === subcategoryName);
  };

  return (
    <div className="admin-category-manager">
      <h3>Manage Categories & Subcategories</h3>
      <div className="category-forms-grid">
        <div className="form-section">
          <h4>Add New Category</h4>
          <div className="form-group inline-form-group">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Category Name"
              aria-label="New category name"
            />
            <button onClick={handleAddCategory} className="btn btn-success btn-sm">Add Category</button>
          </div>
        </div>

        <div className="form-section">
          <h4>Add New Subcategory</h4>
          {categories.filter(c => c.name !== 'Uncategorized').length > 0 ? (
            <>
              <div className="form-group">
                <select
                  value={selectedCategoryForNewSub}
                  onChange={(e) => setSelectedCategoryForNewSub(e.target.value)}
                  aria-label="Select category to add subcategory to"
                >
                  {categories.filter(c => c.name !== 'Uncategorized').map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
              <div className="form-group inline-form-group">
                <input
                  type="text"
                  value={newSubcategoryName}
                  onChange={(e) => setNewSubcategoryName(e.target.value)}
                  placeholder="Subcategory Name"
                  aria-label="New subcategory name"
                />
                <button onClick={handleAddSubcategory} className="btn btn-success btn-sm" disabled={!selectedCategoryForNewSub}>Add Subcategory</button>
              </div>
            </>
          ) : <p>Create a non-'Uncategorized' category first to add subcategories.</p>}
        </div>
      </div>

      <h4>Existing Categories</h4>
      {categories.length === 0 && <p>No categories defined yet.</p>}
      <ul className="category-list">
        {categories.map(category => (
          <li key={category.id} className="category-list-item">
            <div className="category-header">
              <strong>{category.name}</strong>
              <button
                onClick={async () => {
                  if (category.name === 'Uncategorized') {
                    alert('The "Uncategorized" category cannot be deleted.');
                    return;
                  }
                  const inUse = isCategoryInUse(category.name);
                  let confirmMessage = `Are you sure you want to delete category "${category.name}" and all its subcategories?`;
                  if (inUse) {
                    confirmMessage += `\n\nProducts currently in this category will be moved to "Uncategorized / Default".`;
                  }
                  if (window.confirm(confirmMessage)) {
                    await onDeleteCategory(category.id, category.name);
                  }
                }}
                className="btn btn-danger btn-xs"
                disabled={category.name === 'Uncategorized'}
                aria-label={`Delete category ${category.name}`}
              >
                Delete Category
              </button>
            </div>
            {category.subcategories.length > 0 ? (
              <ul className="subcategory-list">
                {category.subcategories.map(subcategory => (
                  <li key={subcategory} className="subcategory-list-item">
                    <span>{subcategory}</span>
                    <button
                      onClick={async () => {
                        if (category.name === 'Uncategorized' && subcategory === 'Default') {
                          alert('The "Default" subcategory within "Uncategorized" cannot be deleted.');
                          return;
                        }
                         if (subcategory === 'Default' && category.name !== 'Uncategorized' && category.subcategories.length === 1) {
                            alert(`The "Default" subcategory cannot be deleted from "${category.name}" if it's the only subcategory. Add another subcategory first or delete the parent category.`);
                            return;
                         }
                        const inUse = isSubcategoryInUse(category.name, subcategory);
                        let confirmMessage = `Are you sure you want to delete subcategory "${subcategory}" from "${category.name}"?`;
                        if (inUse) {
                           confirmMessage += `\n\nProducts currently in this subcategory will be moved to the "Default" subcategory of "${category.name}".`;
                        }
                        if (window.confirm(confirmMessage)) {
                          await onDeleteSubcategory(category.id, category.name, subcategory);
                        }
                      }}
                      className="btn btn-danger btn-xs"
                      disabled={(category.name === 'Uncategorized' && subcategory === 'Default') || (subcategory === 'Default' && category.subcategories.length === 1 && category.name !== 'Uncategorized')}
                      aria-label={`Delete subcategory ${subcategory} from ${category.name}`}
                    >
                      Delete Sub
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="no-subcategories-text">No subcategories defined for {category.name}. Add one above.</p>}
             {category.name !== 'Uncategorized' && !category.subcategories.includes('Default') && (
                <p className="no-subcategories-text" style={{marginTop: '0.5em', fontSize: '0.8em'}}>
                    Note: A "Default" subcategory will be automatically created if needed for product reassignment.
                </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};


const App: React.FC = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<CategoryDefinition[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [currentUser, setCurrentUser] = useState<import('firebase/auth').User | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);

  const [authLoading, setAuthLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [registrationMessage, setRegistrationMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [authViewMode, setAuthViewMode] = useState<'login' | 'register'>('login');
  const [isProcessingAuth, setIsProcessingAuth] = useState(false);
  
  const [viewMode, setViewMode] = useState<'admin' | 'stock'>('stock'); // Default to stock view
  const [selectedCategoryForView, setSelectedCategoryForView] = useState<string | null>(null);
  const [selectedSubcategoryForView, setSelectedSubcategoryForView] = useState<string | null>(null);

  // New states for granular loading and seeding control
  const [initialItemsLoaded, setInitialItemsLoaded] = useState(false);
  const [initialCategoriesLoaded, setInitialCategoriesLoaded] = useState(false);
  const [categoriesSeedAttempted, setCategoriesSeedAttempted] = useState(false);
  const [itemsSeedAttempted, setItemsSeedAttempted] = useState(false);


  // Firebase Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthLoading(true);
      if (user) {
        setCurrentUser(user);
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data() as UserDocument;
            setCurrentUsername(userData.username);
            setViewMode('stock'); 
            // Reset data loading flags for new login/data fetch
            setInitialItemsLoaded(false);
            setInitialCategoriesLoaded(false);
            // Seed attempt flags are component-lifetime flags, not reset per login
            // to prevent re-seeding if an admin intentionally clears data.
          } else {
            console.error("User document not found in Firestore for UID:", user.uid);
            setCurrentUsername(null);
            await signOut(auth); 
          }
        } catch (error) {
          console.error("Error fetching user document:", error);
          setCurrentUsername(null);
        }
      } else {
        setCurrentUser(null);
        setCurrentUsername(null);
        setViewMode('stock'); 
        setAuthViewMode('login'); 
        // Data is not relevant when logged out, so mark as "loaded"
        setInitialItemsLoaded(true);
        setInitialCategoriesLoaded(true);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Firestore listeners for items and categories
  useEffect(() => {
    if (!currentUser) { 
        setItems([]); // Clear data on logout
        setCategories([]);
        setInitialItemsLoaded(true); // Effectively "loaded" as there's nothing for logged-out user
        setInitialCategoriesLoaded(true);
        return;
    }

    // When currentUser is valid, start listening and potentially loading data.
    // Ensure flags are reset if user was previously logged out or changed.
    // This is handled in onAuthStateChanged for initial set, this effect runs if currentUser changes.
    // If setInitial...Loaded(false) was missed in onAuthStateChanged for a new user, do it here.
    if (!initialItemsLoaded) setInitialItemsLoaded(false); // Should be false if new user
    if (!initialCategoriesLoaded) setInitialCategoriesLoaded(false); // Should be false if new user

    const categoriesCollectionRef = collection(db, 'categories');
    const unsubscribeCategories = onSnapshot(categoriesCollectionRef, async (snapshot) => {
        const fetchedCategories = snapshot.docs.map(docData => ({ ...docData.data(), id: docData.id } as CategoryDefinition));
        setCategories(fetchedCategories);

        if (snapshot.empty && !categoriesSeedAttempted) {
            console.log("Categories collection is empty. Attempting to seed...");
            setCategoriesSeedAttempted(true); 
            const batch = writeBatch(db);
            INITIAL_CATEGORIES_DATA_NO_ID.forEach(catData => {
                const docRef = doc(collection(db, 'categories'));
                batch.set(docRef, catData);
            });
            try {
                await batch.commit();
                console.log("Initial categories seeded. Listener will update with new data.");
                // onSnapshot will fire again, leading to setInitialCategoriesLoaded(true) then.
            } catch (error) {
                console.error("Error seeding categories:", error);
                setInitialCategoriesLoaded(true); // Unblock UI on seeding error
            }
        } else {
            setInitialCategoriesLoaded(true); // Mark loaded if not empty or seed already attempted
        }
    }, (error) => {
        console.error("Error fetching categories:", error);
        setInitialCategoriesLoaded(true); 
    });

    const itemsCollectionRef = collection(db, 'inventoryItems');
    const unsubscribeItems = onSnapshot(itemsCollectionRef, async (snapshot) => {
        const fetchedItems = snapshot.docs.map(docData => ({ ...docData.data(), id: docData.id } as InventoryItem));
        setItems(fetchedItems);

        if (snapshot.empty && !itemsSeedAttempted && initialCategoriesLoaded) { // Only attempt if categories have processed
            console.log("Items collection is empty. Checking categories before attempting to seed items...");
            setItemsSeedAttempted(true); 

            // Use 'categories' state which is updated by its own listener
            if (categories.length > 0) {
                console.log("Categories exist. Seeding initial items...");
                const batch = writeBatch(db);
                INITIAL_ITEMS_DATA_NO_ID.forEach(itemData => {
                    const docRef = doc(collection(db, 'inventoryItems'));
                    batch.set(docRef, itemData);
                });
                try {
                    await batch.commit();
                    console.log("Initial items seeded. Listener will update with new data.");
                } catch (error) {
                    console.error("Error seeding items:", error);
                    setInitialItemsLoaded(true); // Unblock UI on seeding error
                }
            } else {
                console.log("Skipping item seeding as categories are empty even after category listener processing.");
                setInitialItemsLoaded(true); // Mark loaded as no items to seed due to no categories
            }
        } else {
             setInitialItemsLoaded(true); // Mark loaded if not empty, seed attempted, or categories not ready
        }
    }, (error) => {
        console.error("Error fetching items:", error);
        setInitialItemsLoaded(true); 
    });
    
    return () => {
      unsubscribeItems();
      unsubscribeCategories();
    };
  }, [currentUser]); // Effect re-runs when currentUser changes


  const handleLogin = async (email: string, password_raw: string) => {
    setIsProcessingAuth(true);
    setLoginError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password_raw);
      setRegistrationMessage(null);
      setSelectedCategoryForView(null);
      setSelectedSubcategoryForView(null);
      // onAuthStateChanged will handle setting user state and viewMode
    } catch (error: any) {
      console.error("Login error:", error);
      setLoginError(error.message || "Invalid email or password.");
    }
    setIsProcessingAuth(false);
  };

  const handleRegister = async (email: string, username: string, password_raw: string, confirmPassword_raw: string) => {
    setIsProcessingAuth(true);
    setRegistrationMessage(null);

    if (password_raw !== confirmPassword_raw) {
      setRegistrationMessage({ type: 'error', text: "Passwords do not match." });
      setIsProcessingAuth(false);
      return;
    }
    if (password_raw.length < 6) {
      setRegistrationMessage({ type: 'error', text: "Password should be at least 6 characters." });
      setIsProcessingAuth(false);
      return;
    }

    try {
      const usersRef = collection(db, "users");
      const usernameQuery = query(usersRef, where("username", "==", username));
      const usernameQuerySnapshot = await getDocs(usernameQuery);
      if (!usernameQuerySnapshot.empty) {
          setRegistrationMessage({ type: 'error', text: "Username already taken." });
          setIsProcessingAuth(false);
          return;
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, password_raw);
      const user = userCredential.user;
      
      const newUserDoc: UserDocument = { 
        uid: user.uid, 
        email: user.email!, 
        username, 
        createdAt: Timestamp.now()
      };
      await setDoc(doc(db, 'users', user.uid), newUserDoc);
      
      setRegistrationMessage({ type: 'success', text: "Registration successful! Please login." });
      setAuthViewMode('login'); 
    } catch (error: any) {
      console.error("Registration error:", error);
       if (error.code === 'auth/email-already-in-use') {
        setRegistrationMessage({ type: 'error', text: "Email already registered." });
      } else {
        setRegistrationMessage({ type: 'error', text: error.message || "Registration failed. Please try again." });
      }
    }
    setIsProcessingAuth(false);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setLoginError(null);
      setRegistrationMessage(null);
      setSelectedCategoryForView(null);
      setSelectedSubcategoryForView(null);
      // onAuthStateChanged will clear user state and reset viewMode
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const openModal = (item: InventoryItem | null = null) => {
    setEditingItem(item);
    setIsModalOpen(true);
  };

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingItem(null);
  }, []);

  const handleSaveItem = useCallback(async (itemToSave: InventoryItem) => {
    if (!currentUser || !itemToSave) return; 

    let validatedCategory = itemToSave.category;
    let validatedSubcategory = itemToSave.subcategory;

    const categoryExists = categories.some(c => c.name === validatedCategory);
    if (!categoryExists) {
        validatedCategory = 'Uncategorized';
        validatedSubcategory = 'Default';
    } else {
        const subcategoryExists = categories.find(c => c.name === validatedCategory)?.subcategories.includes(validatedSubcategory);
        if (!subcategoryExists) {
            validatedSubcategory = 'Default';
            const parentCatDef = categories.find(c => c.name === validatedCategory);
            if (parentCatDef && !parentCatDef.subcategories.includes('Default')) {
                 try {
                    await updateDoc(doc(db, 'categories', parentCatDef.id), {
                        subcategories: [...new Set([...parentCatDef.subcategories, 'Default'])].sort()
                    });
                } catch (e) { console.error("Error updating category with Default subcat:", e)}
            }
        }
    }
    
    const finalItemData: Omit<InventoryItem, 'id'> = {
        name: itemToSave.name,
        sku: itemToSave.sku,
        category: validatedCategory,
        subcategory: validatedSubcategory,
        sizes: itemToSave.sizes,
        price: itemToSave.price,
        description: itemToSave.description,
        imageUrl: itemToSave.imageUrl,
        imageStoragePath: itemToSave.imageStoragePath
    };
    
    try {
      if (itemToSave.id) { 
        const itemDocRef = doc(db, 'inventoryItems', itemToSave.id);
        await updateDoc(itemDocRef, finalItemData);
      } else { 
        await addDoc(collection(db, 'inventoryItems'), finalItemData);
      }
      closeModal();
    } catch (error) {
      console.error("Error saving item to Firestore:", error);
      alert("Failed to save item. Please check console for details.");
    }
  }, [closeModal, currentUser, categories]);

  const handleDeleteItem = async (itemId: string) => {
    if (!currentUser || !itemId) return; 
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        const itemDocRef = doc(db, 'inventoryItems', itemId);
        const itemToDelete = items.find(i => i.id === itemId);

        if (itemToDelete?.imageStoragePath) {
          const imageRef = ref(storage, itemToDelete.imageStoragePath);
          await deleteObject(imageRef).catch(err => console.warn("Error deleting image from storage, it might not exist or rules issue:", err));
        }
        await deleteDoc(itemDocRef);
      } catch (error) {
        console.error("Error deleting item from Firestore:", error);
        alert("Failed to delete item. Please check console for details.");
      }
    }
  };

  const handleSellItemSize = useCallback(async (itemId: string, sizeToSell: Size) => {
    if (!currentUser || !itemId) return; 

    const itemRef = doc(db, 'inventoryItems', itemId);
    const item = items.find(i => i.id === itemId);
    if (item) {
        const currentQuantity = item.sizes[sizeToSell] || 0;
        if (currentQuantity > 0) {
            const newSizes = { ...item.sizes, [sizeToSell]: currentQuantity - 1 };
            try {
                await updateDoc(itemRef, { sizes: newSizes });
            } catch (error) {
                console.error("Error selling item size:", error);
                alert("Failed to update stock. Please try again.");
            }
        }
    }
  }, [currentUser, items]); 

  const filteredItemsForAdminTable = items.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const itemsForProductStockView = items.filter(item => 
    item.category === selectedCategoryForView && item.subcategory === selectedSubcategoryForView
  );

  const toggleViewMode = () => {
    setViewMode(prevMode => {
        const newMode = prevMode === 'admin' ? 'stock' : 'admin';
        if (newMode === 'stock') { 
            setSelectedCategoryForView(null);
            setSelectedSubcategoryForView(null);
        }
        return newMode;
    });
  };

  const handleAddCategory = async (categoryName: string) => {
    if (categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase())) {
        alert("Category already exists.");
        return;
    }
    const newCategoryData: Omit<CategoryDefinition, 'id'> = { name: categoryName, subcategories: ['Default'] };
    try {
        await addDoc(collection(db, 'categories'), newCategoryData);
    } catch (error) {
        console.error("Error adding category:", error);
        alert("Failed to add category.");
    }
  };

  const handleDeleteCategory = async (categoryId: string, categoryName: string) => {
    if (categoryName === 'Uncategorized' || !categoryId) return; 
    
    try {
        const batch = writeBatch(db);
        const q = query(collection(db, "inventoryItems"), where("category", "==", categoryName));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((itemDoc) => {
            const itemRef = doc(db, "inventoryItems", itemDoc.id);
            batch.update(itemRef, { category: 'Uncategorized', subcategory: 'Default' });
        });
        
        const categoryDocRef = doc(db, 'categories', categoryId);
        batch.delete(categoryDocRef);
        await batch.commit();

        if (selectedCategoryForView === categoryName) {
            setSelectedCategoryForView(null);
            setSelectedSubcategoryForView(null);
        }
    } catch (error) {
        console.error("Error deleting category and reassigning items:", error);
        alert("Failed to delete category.");
    }
  };

  const handleAddSubcategory = async (categoryId: string, categoryName: string, subcategoryName: string) => {
    if (!categoryId) return;
    const categoryDocRef = doc(db, 'categories', categoryId);
    const category = categories.find(cat => cat.id === categoryId);
    if (category) {
        if (category.subcategories.find(s => s.toLowerCase() === subcategoryName.toLowerCase())) {
            alert("Subcategory already exists in this category.");
            return;
        }
        const newSubcategories = [...new Set([...category.subcategories, subcategoryName])].sort();
        try {
            await updateDoc(categoryDocRef, { subcategories: newSubcategories });
        } catch (error) {
            console.error("Error adding subcategory:", error);
            alert("Failed to add subcategory.");
        }
    }
  };

const handleDeleteSubcategory = async (categoryId: string, categoryName: string, subcategoryName: string) => {
    if ((categoryName === 'Uncategorized' && subcategoryName === 'Default') || !categoryId) {
        return;
    }
    const parentCategory = categories.find(c => c.id === categoryId);
    if (!parentCategory) return;

    if (subcategoryName === 'Default' && parentCategory.subcategories.length === 1 && categoryName !== 'Uncategorized') {
        alert("Cannot delete the only 'Default' subcategory if it's not Uncategorized. Add another subcategory first, or delete the parent category.");
        return;
    }
    
    try {
        const batch = writeBatch(db);
        const categoryDocRef = doc(db, 'categories', categoryId);
        
        let updatedSubcategories = parentCategory.subcategories.filter(sub => sub !== subcategoryName);
        
        const itemsToReassignQuery = query(collection(db, "inventoryItems"), 
            where("category", "==", categoryName), 
            where("subcategory", "==", subcategoryName)
        );
        const itemsToReassignSnapshot = await getDocs(itemsToReassignQuery);
        
        if (!itemsToReassignSnapshot.empty) {
            if (subcategoryName !== 'Default' && !updatedSubcategories.includes('Default')) {
                updatedSubcategories.push('Default');
                updatedSubcategories.sort();
            }
            itemsToReassignSnapshot.forEach((itemDoc) => {
                const itemRef = doc(db, "inventoryItems", itemDoc.id);
                batch.update(itemRef, { subcategory: 'Default' });
            });
        }
        
        if (categoryName !== 'Uncategorized' && updatedSubcategories.length === 0) {
          updatedSubcategories.push('Default'); 
        }

        batch.update(categoryDocRef, { subcategories: updatedSubcategories });
        await batch.commit();

        if (selectedCategoryForView === categoryName && selectedSubcategoryForView === subcategoryName) {
            setSelectedSubcategoryForView(null); 
        }
    } catch (error) {
        console.error("Error deleting subcategory and reassigning items:", error);
        alert("Failed to delete subcategory.");
    }
  };

  const handleSelectCategoryForView = (categoryName: string) => {
    setSelectedCategoryForView(categoryName);
    setSelectedSubcategoryForView(null);
  };
  
  const handleSelectSubcategoryForView = (categoryName: string, subcategoryName: string) => {
    setSelectedCategoryForView(categoryName); 
    setSelectedSubcategoryForView(subcategoryName);
  };

  const handleNavigateBackFromStockView = () => {
    if (selectedSubcategoryForView) {
      setSelectedSubcategoryForView(null); 
    } else if (selectedCategoryForView) {
      setSelectedCategoryForView(null); 
    }
  };

  const getCategoryItemCount = useCallback((categoryName: string, subcategoryName: string): number => {
    return items.filter(item => item.category === categoryName && item.subcategory === subcategoryName).length;
  }, [items]);


  if (authLoading) {
    return <div className="loading-container"><p>Authenticating...</p></div>;
  }
  if (currentUser && (!initialItemsLoaded || !initialCategoriesLoaded)) {
    let statusParts: string[] = [];
    if (!initialCategoriesLoaded) statusParts.push("categories");
    if (!initialItemsLoaded) statusParts.push("inventory data");
    return <div className="loading-container"><p>Loading {statusParts.join(" and ")}...</p></div>; 
  }
  
  if (!currentUser) { 
    if (authViewMode === 'register') {
      return <RegistrationView 
                onRegister={handleRegister} 
                registrationMessage={registrationMessage} 
                onSwitchToLogin={() => { setAuthViewMode('login'); setRegistrationMessage(null); }}
                isRegistering={isProcessingAuth} 
             />;
    }
    return <LoginView 
              onLogin={handleLogin} 
              loginError={loginError} 
              onSwitchToRegister={() => { setAuthViewMode('register'); setLoginError(null); }}
              isLoggingIn={isProcessingAuth} 
           />;
  }

  return (
    <div className="container">
      <header className="app-header">
        <h1>Inventory Management</h1>
        <div className="header-controls">
          {viewMode === 'admin' && (
            <input
              type="text"
              placeholder="Search by name or SKU (in table)..."
              className="search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search inventory items"
            />
          )}
          {currentUser && ( 
            <button 
              onClick={toggleViewMode} 
              className="btn btn-info" 
              aria-label={viewMode === 'admin' ? "Switch to Product Stock View" : "Switch to Admin Panel View"}
            >
              {viewMode === 'admin' ? 'View Product Stock' : 'View Admin Panel'}
            </button>
          )}
          {viewMode === 'admin' && ( 
            <button onClick={() => openModal()} className="btn btn-primary" aria-label="Add new item">
              Add New Item
            </button>
          )}
           <button onClick={handleLogout} className="btn btn-danger" aria-label="Logout">
            Logout ({currentUsername || currentUser.email})
          </button>
        </div>
      </header>

      {viewMode === 'admin' && isModalOpen && ( 
        <ItemModal
          item={editingItem}
          onClose={closeModal}
          onSave={handleSaveItem}
          categories={categories}
          storage={storage} 
          db={db} 
          editingItemId={editingItem?.id || null}
        />
      )}
      
      {viewMode === 'admin' ? ( 
        <>
          <AdminCategoryManager
            categories={categories}
            onAddCategory={handleAddCategory}
            onDeleteCategory={handleDeleteCategory}
            onAddSubcategory={handleAddSubcategory}
            onDeleteSubcategory={handleDeleteSubcategory}
            items={items}
          />
          <main className="inventory-table-container">
            {filteredItemsForAdminTable.length === 0 && !searchTerm && (
               <div className="empty-state">
                 <h2>No items in inventory.</h2>
                 <p>Click "Add New Item" to get started.</p>
               </div>
            )}
            {filteredItemsForAdminTable.length === 0 && searchTerm && (
                <div className="empty-state">
                  <h2>No items match your search "{searchTerm}".</h2>
                  <p>Try a different search term or clear the search.</p>
                </div>
            )}
            {filteredItemsForAdminTable.length > 0 && (
              <table className="inventory-table" aria-label="Inventory Items">
                <thead>
                  <tr>
                    <th>Image</th>
                    <th>Name</th>
                    <th>SKU</th>
                    <th>Category</th>
                    <th>Subcategory</th>
                    <th>Total Quantity</th>
                    <th>Price</th>
                    <th>Description</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItemsForAdminTable.map(item => {
                    const totalQuantity = calculateTotalQuantity(item.sizes);
                    return (
                      <tr key={item.id}>
                        <td data-label="Image" className="cell-image">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="table-item-image" />
                          ) : (
                            <span className="no-image-text">No Image</span>
                          )}
                        </td>
                        <td data-label="Name">{item.name}</td>
                        <td data-label="SKU">{item.sku}</td>
                        <td data-label="Category">{item.category}</td>
                        <td data-label="Subcategory">{item.subcategory}</td>
                        <td data-label="Total Quantity">{totalQuantity}</td>
                        <td data-label="Price">${item.price.toFixed(2)}</td>
                        <td data-label="Description">{item.description || '-'}</td>
                        <td data-label="Actions" className="actions-cell">
                          <button onClick={() => openModal(item)} className="btn btn-secondary btn-sm" aria-label={`Edit ${item.name}`}>Edit</button>
                          <button onClick={() => handleDeleteItem(item.id)} className="btn btn-danger btn-sm" aria-label={`Delete ${item.name}`}>Delete</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </main>
        </>
      ) : ( 
        <ProductStockView
          items={itemsForProductStockView}
          allCategories={categories}
          selectedCategoryName={selectedCategoryForView}
          selectedSubcategoryName={selectedSubcategoryForView}
          onSelectCategory={handleSelectCategoryForView}
          onSelectSubcategory={handleSelectSubcategoryForView}
          onNavigateBack={handleNavigateBackFromStockView}
          onSellItemSize={handleSellItemSize}
          getCategoryItemCount={getCategoryItemCount}
          currentUser={currentUser}
        />
      )}
      <footer className="app-footer">
        <p>&copy; {new Date().getFullYear()} Inventory App. All rights reserved.</p>
      </footer>
    </div>
  );
};

interface ItemModalFormData {
  name: string;
  sku: string;
  category: string;
  subcategory: string;
  sizes: Record<Size, number>;
  price: number;
  description?: string;
  imageUrl?: string; 
  imageStoragePath?: string;
}

interface ItemModalProps {
  item: InventoryItem | null;
  onClose: () => void;
  onSave: (item: InventoryItem) => Promise<void>; 
  categories: CategoryDefinition[];
  storage: import('firebase/storage').FirebaseStorage; 
  db: import('firebase/firestore').Firestore; 
  editingItemId: string | null; 
}

const ItemModal: React.FC<ItemModalProps> = ({ item, onClose, onSave, categories, storage, db, editingItemId }) => {
  
  const getInitialFormData = useCallback((): ItemModalFormData => {
    const defaultSizes = SIZES.reduce((acc, size) => { acc[size] = 0; return acc; }, {} as Record<Size, number>);
    
    let initialCategory = categories.find(c => c.name === 'Uncategorized')?.name || (categories.length > 0 ? categories[0].name : '');
    let initialSubcategory = categories.find(c => c.name === initialCategory)?.subcategories.includes('Default') 
        ? 'Default' 
        : (categories.find(c => c.name === initialCategory)?.subcategories[0] || '');

    if (item) {
       const currentItemSizes = SIZES.reduce((acc, size) => {
        acc[size] = Number(item.sizes?.[size]) || 0;
        return acc;
      }, {} as Record<Size, number>);

      const itemCategoryInState = categories.find(c => c.name === item.category);
      if (itemCategoryInState) {
        initialCategory = itemCategoryInState.name;
        const itemSubcategoryInState = itemCategoryInState.subcategories.includes(item.subcategory) 
            ? item.subcategory 
            : (itemCategoryInState.subcategories.includes('Default') ? 'Default' : itemCategoryInState.subcategories[0]);
        initialSubcategory = itemSubcategoryInState || 'Default'; 
      }
      
      return {
        name: item.name,
        sku: item.sku,
        category: initialCategory,
        subcategory: initialSubcategory,
        sizes: currentItemSizes,
        price: item.price,
        description: item.description || '',
        imageUrl: item.imageUrl || '',
        imageStoragePath: item.imageStoragePath || ''
      };
    }
    
    const uncategorizedCat = categories.find(c => c.name === 'Uncategorized');
    if (uncategorizedCat) {
        initialCategory = 'Uncategorized';
        initialSubcategory = uncategorizedCat.subcategories.includes('Default') ? 'Default' : (uncategorizedCat.subcategories[0] || '');
    } else if (categories.length > 0) { 
        initialCategory = categories[0].name;
        initialSubcategory = categories[0].subcategories[0] || '';
    }

    return {
      name: '',
      sku: '',
      category: initialCategory,
      subcategory: initialSubcategory,
      sizes: defaultSizes,
      price: 0,
      description: '',
      imageUrl: '',
      imageStoragePath: ''
    };
  }, [item, categories]);
  
  const [formData, setFormData] = useState<ItemModalFormData>(getInitialFormData());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [newImageFile, setNewImageFile] = useState<File | null>(null); 

  
  const availableSubcategories = categories.find(c => c.name === formData.category)?.subcategories || [];

  useEffect(() => {
    setFormData(getInitialFormData());
    setErrors({});
    setNewImageFile(null);
  }, [item, getInitialFormData]);

  useEffect(() => {
    const currentCategoryDef = categories.find(c => c.name === formData.category);
    if (currentCategoryDef && !currentCategoryDef.subcategories.includes(formData.subcategory)) {
      setFormData(prev => ({
        ...prev,
        subcategory: currentCategoryDef.subcategories.includes('Default') ? 'Default' : (currentCategoryDef.subcategories[0] || '')
      }));
    } else if (!currentCategoryDef && formData.category) { 
        const uncategorizedOpt = categories.find(c => c.name === 'Uncategorized');
        if (uncategorizedOpt) {
            setFormData(prev => ({
                ...prev,
                category: 'Uncategorized',
                subcategory: uncategorizedOpt.subcategories.includes('Default') ? 'Default' : (uncategorizedOpt.subcategories[0] || '')
            }));
        } else if (categories.length > 0) {
            setFormData(prev => ({
                ...prev,
                category: categories[0].name,
                subcategory: categories[0].subcategories[0] || ''
            }));
        } else { 
             setFormData(prev => ({ ...prev, category: '', subcategory: ''}));
        }
    }
  }, [formData.category, categories, formData.subcategory]);


  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let newErrors = { ...errors };

    if (name.startsWith('size_')) {
      const sizeKey = name.split('_')[1] as Size;
      setFormData(prev => ({
        ...prev,
        sizes: { ...prev.sizes, [sizeKey]: parseInt(value) || 0 }
      }));
      delete newErrors[name];
    } else if (name === 'category') {
      const newCategoryName = value;
      const categoryObj = categories.find(c => c.name === newCategoryName);
      const newSubcategory = categoryObj 
        ? (categoryObj.subcategories.includes('Default') ? 'Default' : (categoryObj.subcategories[0] || ''))
        : '';
      setFormData(prev => ({ ...prev, category: newCategoryName, subcategory: newSubcategory }));
      delete newErrors.category;
      delete newErrors.subcategory;
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'number' && name === 'price' ? parseFloat(value) || 0 : value,
      }));
      delete newErrors[name];
    }
    setErrors(newErrors);
  };
  
  const handleImageFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        setErrors(prev => ({ ...prev, imageUrlFile: "Image size should not exceed 5MB."}));
        event.target.value = ''; 
        setNewImageFile(null);
        return;
      }
      setNewImageFile(file); 
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, imageUrl: reader.result as string })); 
         setErrors(prev => ({ ...prev, imageUrlFile: undefined }));
      };
      reader.onerror = () => {
        console.error("Error reading file for preview");
        setErrors(prev => ({ ...prev, imageUrlFile: "Failed to read image file for preview."}));
      }
      reader.readAsDataURL(file);
    } else {
      setNewImageFile(null);
    }
  };

  const handleRemoveImage = async () => {
    setFormData(prev => ({ ...prev, imageUrl: '', imageStoragePath: '' })); 
    setNewImageFile(null); 
    const fileInput = document.getElementById('imageUrlFile') as HTMLInputElement | null;
    if (fileInput) fileInput.value = ''; 
    setErrors(prev => ({ ...prev, imageUrlFile: undefined }));
  };


  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Name is required.';
    if (!formData.sku.trim()) newErrors.sku = 'SKU is required.';
    if (!formData.category) newErrors.category = 'Category is required.';
    else {
        const catDef = categories.find(c => c.name === formData.category);
        if (!catDef) {
            newErrors.category = 'Selected category does not exist.';
        } else if (!formData.subcategory) {
            newErrors.subcategory = 'Subcategory is required.';
        } else if (!catDef.subcategories.includes(formData.subcategory)) {
            newErrors.subcategory = 'Selected subcategory is not valid for the chosen category. Please re-select.';
        }
    }

    if (formData.price < 0) newErrors.price = 'Price cannot be negative.';
    else if (isNaN(formData.price)) newErrors.price = 'Price must be a number.';
    
    SIZES.forEach(size => {
      const sizeQuantity = formData.sizes[size];
      if (sizeQuantity < 0) newErrors[`size_${size}`] = `Qty for ${size} cannot be negative.`;
      else if (isNaN(sizeQuantity)) newErrors[`size_${size}`] = `Qty for ${size} must be a number.`;
    });
    if (errors.imageUrlFile) newErrors.imageUrlFile = errors.imageUrlFile; 

    setErrors(newErrors);
    return Object.keys(newErrors).filter(key => key !== 'imageUrlFile' || newErrors.imageUrlFile).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsProcessing(true);

    let finalImageUrl = formData.imageUrl; 
    let finalImageStoragePath = formData.imageStoragePath;
    const oldImageStoragePath = item?.imageStoragePath; 

    if (newImageFile) { 
        if (oldImageStoragePath) {
            const oldImageRef = ref(storage, oldImageStoragePath);
            try {
                await deleteObject(oldImageRef);
            } catch (err) {
                console.warn("Could not delete old image, it might have been already deleted:", err);
            }
        }
        finalImageStoragePath = `inventory_images/${Date.now()}_${newImageFile.name}`;
        const newImageRef = ref(storage, finalImageStoragePath);
        try {
            const uploadResult = await uploadString(newImageRef, formData.imageUrl!, 'data_url'); 
            finalImageUrl = await getDownloadURL(uploadResult.ref);
        } catch (uploadError) {
            console.error("Error uploading image to Firebase Storage:", uploadError);
            setErrors(prev => ({ ...prev, imageUrlFile: "Image upload failed." }));
            setIsProcessing(false);
            return;
        }
    } else if (!formData.imageUrl && oldImageStoragePath) { 
        const oldImageRef = ref(storage, oldImageStoragePath);
        try {
            await deleteObject(oldImageRef);
            finalImageStoragePath = ''; 
        } catch (err) {
            console.warn("Could not delete removed image:", err);
        }
    }

    const itemDataForSave: InventoryItem = {
      id: editingItemId || '', 
      name: formData.name,
      sku: formData.sku,
      category: formData.category,
      subcategory: formData.subcategory,
      sizes: formData.sizes,
      price: formData.price,
      description: formData.description,
      imageUrl: finalImageUrl,
      imageStoragePath: finalImageStoragePath,
    };
    
    try {
        await onSave(itemDataForSave);
    } catch (error) {
        console.error("Error during onSave callback in ItemModal:", error);
    } finally {
        setIsProcessing(false);
    }
  };
  
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => { if (event.key === 'Escape' && !isProcessing) onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose, isProcessing]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-content">
        <header className="modal-header">
          <h2 id="modal-title">{item ? 'Edit Item' : 'Add New Item'}</h2>
          <button onClick={onClose} className="btn-close" aria-label="Close modal" disabled={isProcessing}>&times;</button>
        </header>
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="name">Name</label>
            <input type="text" id="name" name="name" value={formData.name} onChange={handleChange} required aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-error" : undefined} disabled={isProcessing} />
            {errors.name && <p id="name-error" className="error-message">{errors.name}</p>}
          </div>
          <div className="form-group">
            <label htmlFor="sku">SKU</label>
            <input type="text" id="sku" name="sku" value={formData.sku} onChange={handleChange} required aria-invalid={!!errors.sku} aria-describedby={errors.sku ? "sku-error" : undefined} disabled={isProcessing} />
            {errors.sku && <p id="sku-error" className="error-message">{errors.sku}</p>}
          </div>

          <div className="form-group">
            <label htmlFor="category">Category</label>
            <select id="category" name="category" value={formData.category} onChange={handleChange} required aria-invalid={!!errors.category} aria-describedby={errors.category ? "category-error" : undefined} disabled={isProcessing}>
              {categories.length === 0 && <option value="">No categories available</option>}
              {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
            </select>
            {errors.category && <p id="category-error" className="error-message">{errors.category}</p>}
          </div>

          <div className="form-group">
            <label htmlFor="subcategory">Subcategory</label>
            <select 
                id="subcategory" 
                name="subcategory" 
                value={formData.subcategory} 
                onChange={handleChange} 
                required 
                disabled={isProcessing || availableSubcategories.length === 0 && !formData.category}
                aria-invalid={!!errors.subcategory} 
                aria-describedby={errors.subcategory ? "subcategory-error" : undefined}
            >
              {!formData.category && <option value="">Select a category first</option>}
              {formData.category && availableSubcategories.length === 0 && <option value="">No subcategories. 'Default' may be used.</option>}
              {availableSubcategories.map(sub => <option key={sub} value={sub}>{sub}</option>)}
            </select>
            {errors.subcategory && <p id="subcategory-error" className="error-message">{errors.subcategory}</p>}
          </div>
          
          <div className="form-group">
            <label htmlFor="imageUrlFile">Product Image</label>
            <input type="file" id="imageUrlFile" name="imageUrlFile" accept="image/png, image/jpeg, image/gif, image/webp" onChange={handleImageFileChange} aria-describedby={errors.imageUrlFile ? "imageUrlFile-error" : undefined} disabled={isProcessing}/>
            {errors.imageUrlFile && <p id="imageUrlFile-error" className="error-message">{errors.imageUrlFile}</p>}
            {formData.imageUrl && ( 
              <div className="image-preview-container">
                <img src={formData.imageUrl} alt="Preview" className="image-preview" />
                <button type="button" onClick={handleRemoveImage} className="btn btn-danger btn-xs btn-remove-image" aria-label="Remove current image" disabled={isProcessing}>Remove Image</button>
              </div>
            )}
          </div>

          <fieldset className="form-group">
            <legend>Quantities by Size</legend>
            <div className="sizes-grid">
              {SIZES.map(size => (
                <div key={size} className="form-group-size">
                  <label htmlFor={`size_${size}`}>{size}</label>
                  <input type="number" id={`size_${size}`} name={`size_${size}`} value={formData.sizes[size]} onChange={handleChange} min="0" required aria-invalid={!!errors[`size_${size}`]} aria-describedby={errors[`size_${size}`] ? `size_${size}-error` : undefined} disabled={isProcessing}/>
                  {errors[`size_${size}`] && <p id={`size_${size}-error`} className="error-message error-message-size">{errors[`size_${size}`]}</p>}
                </div>
              ))}
            </div>
          </fieldset>

          <div className="form-group">
            <label htmlFor="price">Price</label>
            <input type="number" id="price" name="price" value={formData.price} onChange={handleChange} min="0" step="0.01" required aria-invalid={!!errors.price} aria-describedby={errors.price ? "price-error" : undefined} disabled={isProcessing}/>
            {errors.price && <p id="price-error" className="error-message">{errors.price}</p>}
          </div>
          <div className="form-group">
            <label htmlFor="description">Description (Optional)</label>
            <textarea id="description" name="description" value={formData.description || ''} onChange={handleChange} rows={3} disabled={isProcessing}/>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn btn-secondary" disabled={isProcessing}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isProcessing}>
              {isProcessing ? 'Saving...' : (item ? 'Save Changes' : 'Add Item')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<React.StrictMode><App /></React.StrictMode>);
} else {
  console.error('Failed to find the root element');
}