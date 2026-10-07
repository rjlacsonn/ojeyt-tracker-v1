/* ============================================================
   AUTH — Frontend authentication handler (Supabase)
   ============================================================ */

class Auth {
  constructor() {
    this.user = null;
    this.session = null;
    this.isAuthenticated = false;
    this.initializationPromise = null;
  }

  init() {
    if (!this.initializationPromise) {
      this.initializationPromise = this.restoreSession().catch(error => {
        this.initializationPromise = null;
        throw error;
      });
    }
    return this.initializationPromise;
  }

  async restoreSession() {
    // ===== CHECK EXISTING SUPABASE SESSION =====
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (session) {
      this.user = session.user;
      this.session = session;
      this.isAuthenticated = true;
    } else {
      this.user = null;
      this.session = null;
      this.isAuthenticated = false;
    }

    // ===== LISTEN FOR AUTH STATE CHANGES =====
    supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        this.user = session.user;
        this.session = session;
        this.isAuthenticated = true;
      } else {
        this.user = null;
        this.session = null;
        this.isAuthenticated = false;
      }
    });
  }

  // ===== SIGNUP =====
  async signup(fullName, email, password, confirmPassword, requiredHours, registration = {}) {
    try {
      if (!fullName?.trim() || !email?.trim() || !password || !confirmPassword) {
        return { success: false, message: 'All fields are required.' };
      }
      if (password !== confirmPassword) {
        return { success: false, message: 'Passwords do not match.' };
      }
      if (password.length < 6) {
        return { success: false, message: 'Password must be at least 6 characters.' };
      }
      const accountType = registration.accountType || 'student';
      if (!['student', 'professor'].includes(accountType)) return { success: false, message: 'Choose a student or professor account.' };
      if (fullName.trim().length > 160) return { success: false, message: 'Your name must be 160 characters or fewer.' };
      const institution = String(registration.institution || '').trim();
      const department = String(registration.department || '').trim();
      if (accountType === 'professor' && (!institution || institution.length > 160 || department.length > 160)) {
        return { success: false, message: 'Enter your school or institution (up to 160 characters).' };
      }

      const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            full_name: fullName,
            account_type: accountType,
            ...(accountType === 'professor' ? { institution, department } : {})
          }
        }
      });

      if (error) return { success: false, message: error.message };

      // The database signup trigger creates the profile and its initial hour target.
      if (data.user && data.session) {
        this.user = data.user;
        this.session = data.session || this.session;
        this.isAuthenticated = true;
      }

      const needsEmailConfirmation = !data.session;
      return { success: true, needsEmailConfirmation,
        message: needsEmailConfirmation ? 'Check your email to confirm your account, then sign in.' :
          accountType === 'professor' ? 'Professor account created. You can now approve students and review their submissions.' : 'Student account created. Connect to your professor and request approval.' };
    } catch (error) {
      return { success: false, message: 'Signup failed: ' + error.message };
    }
  }

  // ===== LOGIN =====
  async login(email, password) {
    try {
      if (!email || !password) {
        return { success: false, message: 'Email and password are required.' };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (error) return { success: false, message: error.message };

      this.user = data.user;
      this.session = data.session || this.session;
      this.isAuthenticated = true;

      return { success: true, message: 'Login successful!' };
    } catch (error) {
      return { success: false, message: 'Login failed: ' + error.message };
    }
  }

  // ===== FORGOT PASSWORD =====
  async forgotPassword(email) {
    try {
      if (!email) return { success: false, message: 'Email is required.' };

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname + '?reset=true'
      });

      if (error) return { success: false, message: error.message };

      return { success: true, message: 'Password reset link sent! Check your email inbox.' };
    } catch (error) {
      return { success: false, message: 'Failed to send reset email: ' + error.message };
    }
  }

  // ===== RESET PASSWORD (after clicking email link) =====
  async resetPassword(newPassword, confirmPassword) {
    try {
      if (!newPassword || !confirmPassword) {
        return { success: false, message: 'Both fields are required.' };
      }
      if (newPassword !== confirmPassword) {
        return { success: false, message: 'Passwords do not match.' };
      }
      if (newPassword.length < 6) {
        return { success: false, message: 'Password must be at least 6 characters.' };
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) return { success: false, message: error.message };

      return { success: true, message: 'Password updated successfully!' };
    } catch (error) {
      return { success: false, message: 'Failed to update password: ' + error.message };
    }
  }

  getToken() {
    return this.session?.access_token || null;
  }

  setUser(user) {
    this.user = user;
  }

  // ===== REFRESH / GET CURRENT USER =====
  async refreshUser() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        this.logout();
        return null;
      }
      this.user = user;
      this.isAuthenticated = true;
      return user;
    } catch (error) {
      console.error('Refresh user error:', error);
      return null;
    }
  }

  // ===== LOGOUT =====
  async logout() {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.user = null;
      this.session = null;
      this.isAuthenticated = false;
      localStorage.removeItem('authToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
  }

  // ===== GETTERS =====
  getUser() {
    return this.user;
  }

  getUserName() {
    return this.user?.user_metadata?.full_name || this.user?.email || 'User';
  }

  getUserEmail() {
    return this.user?.email || '';
  }

  getUserId() {
    return this.user?.id || null;
  }
}

// ===== GLOBAL AUTH INSTANCE =====
const auth = new Auth();
