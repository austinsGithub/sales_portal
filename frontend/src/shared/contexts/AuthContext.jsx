import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const hasInitialized = useRef(false);

  // Fetch user permissions from backend
  const fetchPermissions = async () => {
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('auth_token');
      if (!token) {
        setPermissions([]);
        return;
      }

      const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/api/permissions/my-keys`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setPermissions(response.data.permissions || []);
    } catch (error) {
      console.error('[AuthContext] Error fetching permissions:', error);
      setPermissions([]);
    }
  };

  // ==================== PERMISSION CHECKS ====================
  
  const hasPermission = (permissionKey) => {
    if (!user) return false;
    if (user.is_super_admin === 1 || user.is_super_admin === true || user.role === 'super_admin') {
      return true;
    }
    return permissions.includes(permissionKey);
  };

  const hasAnyPermission = (permissionKeys = []) => {
    if (!user) return false;
    if (user.is_super_admin === 1 || user.is_super_admin === true || user.role === 'super_admin') {
      return true;
    }
    return permissionKeys.some(key => permissions.includes(key));
  };

  const hasAllPermissions = (permissionKeys = []) => {
    if (!user) return false;
    if (user.is_super_admin === 1 || user.is_super_admin === true || user.role === 'super_admin') {
      return true;
    }
    return permissionKeys.every(key => permissions.includes(key));
  };

  // ==================== ROLE CHECKS ====================
  
  const hasRole = (requiredRole) => {
    if (!user) return false;
    if (user.is_super_admin === 1 || user.is_super_admin === true || user.role === 'super_admin') {
      return true;
    }
    return user.role === requiredRole;
  };

  const hasAnyRole = (roles = []) => {
    if (!user) return false;
    if (user.is_super_admin === 1 || user.is_super_admin === true || user.role === 'super_admin') {
      return true;
    }
    return roles.includes(user.role);
  };

  // ==================== AUTH FUNCTIONS ====================
  
  const login = async (credentials) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await axios.post(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}/api/auth/login`, credentials);
      
      const { token, user: userData } = response.data;
      
      localStorage.setItem('token', token);
      localStorage.setItem('auth_token', token);
      localStorage.setItem('userData', JSON.stringify(userData));
      
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      const userWithRole = {
        ...userData,
        role: userData.is_super_admin === 1 ? 'super_admin' : (userData.role || 'user')
      };
      
      setUser(userWithRole);
      await fetchPermissions();
      
      setError(null);
      setIsLoading(false);
      
      return { success: true };
    } catch (error) {
      console.error('[AuthContext] Login error:', error);
      const errorMsg = error.response?.data?.message || 'Login failed';
      setError(errorMsg);
      setIsLoading(false);
      return { 
        success: false, 
        error: errorMsg
      };
    }
  };

  const logout = async () => {
    try {
      await axios.post('/api/auth/logout').catch(() => {});
    } catch (error) {
      console.error('[AuthContext] Logout error:', error);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('userData');
      delete axios.defaults.headers.common['Authorization'];
      setUser(null);
      setPermissions([]);
      setError(null);
      hasInitialized.current = false;
    }
  };

  // ==================== INITIALIZATION ====================
  
  useEffect(() => {
    if (hasInitialized.current) {
      return;
    }
    
    hasInitialized.current = true;
    
    const checkAuth = async () => {
      const token = localStorage.getItem('token') || localStorage.getItem('auth_token');
      const savedUserData = localStorage.getItem('userData');
      
      if (!token) {
        setIsLoading(false);
        return;
      }

      if (token && savedUserData) {
        try {
          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          
          const parsedUser = JSON.parse(savedUserData);
          const userWithRole = {
            ...parsedUser,
            role: parsedUser.is_super_admin === 1 ? 'super_admin' : (parsedUser.role || 'user')
          };
          
          setUser(userWithRole);
          await fetchPermissions();
          setIsLoading(false);
          
          return;
        } catch (error) {
          console.error('[AuthContext] Error parsing saved user data:', error);
        }
      }
      
      // If no saved user data, clear everything
      localStorage.removeItem('token');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('userData');
      delete axios.defaults.headers.common['Authorization'];
      setUser(null);
      setPermissions([]);
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  // ==================== CONTEXT VALUE ====================
  
  const value = {
    user,
    permissions,
    isLoading,
    error,
    isAuthenticated: !!user,
    login,
    logout,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole,
    hasAnyRole,
    refreshPermissions: fetchPermissions
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
