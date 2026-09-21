
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, SystemLog, AccessLog, SystemSettings, UserRole, View } from '../types';
import { db, auth, storage } from '../firebase';
import { collection, doc, updateDoc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { compressImageToBase64 } from '../lib/images';

interface ProfileProps {
  profile: UserProfile;
  setProfile: (profile: UserProfile) => void;
  systemLogs: SystemLog[];
  accessLogs: AccessLog[];
  settings: SystemSettings;
  setSettings: (settings: SystemSettings) => void;
  onLogout: () => void;
  notificationPermission?: string;
  onRequestPermission?: () => void;
}

const Profile: React.FC<ProfileProps> = ({ 
  profile, 
  setProfile,
  systemLogs, 
  accessLogs, 
  settings, 
  setSettings, 
  onLogout,
  notificationPermission,
  onRequestPermission,
}) => {
  const [activeModal, setActiveModal] = useState<'logs' | 'access' | 'params' | 'rbac' | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [editForm, setEditForm] = useState({
    fullName: profile.fullName || '',
    username: profile.username || '',
    office: profile.office || '',
    position: profile.position || '',
    profilePic: profile.profilePic || '',
  });

  const [availableOffices, setAvailableOffices] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // RBAC Admin State
  const [usersList, setUsersList] = useState<any[]>([]);
  const [searchUserQuery, setSearchUserQuery] = useState('');
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editingUserForm, setEditingUserForm] = useState({
    fullName: '',
    office: '',
    position: '',
    role: '' as UserRole,
    status: 'Active'
  });
  
  const [activeRoleTab, setActiveRoleTab] = useState<UserRole | 'users_list'>('users_list');
  const [permissionsMap, setPermissionsMap] = useState<Record<UserRole, View[]>>({} as any);

  // Load all users from Firestore if Admin
  useEffect(() => {
    if (profile.role !== 'ADMIN') return;
    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      const uList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setUsersList(uList);
    }, (error) => {
      console.error("Error loading users for RBAC console:", error);
    });

    return () => unsub();
  }, [profile.role]);

  // Load editable permissions map
  useEffect(() => {
    if (profile.role !== 'ADMIN') return;
    const unsub = onSnapshot(doc(db, 'system_settings', 'permissions'), (snap) => {
      if (snap.exists()) {
        setPermissionsMap(snap.data() as Record<UserRole, View[]>);
      }
    }, (error) => {
      console.error("Error loading permissions in RBAC:", error);
    });
    return () => unsub();
  }, [profile.role]);

  // Sync editForm if profile properties change externally
  useEffect(() => {
    setEditForm({
      fullName: profile.fullName || '',
      username: profile.username || '',
      office: profile.office || '',
      position: profile.position || '',
      profilePic: profile.profilePic || '',
    });
  }, [profile]);

  // Dynamically load office list from firestore 'offices' collection
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'offices'), (snap) => {
      const officeNames = snap.docs.map(d => d.data().name as string).filter(Boolean);
      // Remove duplicates and sort
      const uniqueNames = Array.from(new Set(officeNames)).sort();
      setAvailableOffices(uniqueNames);
    }, (error) => {
      console.error('Error loading offices in Profile:', error);
    });
    return () => unsub();
  }, []);

  const handleApplyParams = () => {
    setActiveModal(null);
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("Image file size must be less than 5 MB to fit profile limits.");
        return;
      }
      try {
        setLoading(true);
        // Compress the image so that even up to 5 MB original images are reduced to tiny, high-quality base64 (<30KB)
        const compressedBase64 = await compressImageToBase64(file, 400, 400, 0.75);
        
        try {
          // Attempt upload to Firebase Storage
          const storageRef = ref(storage, `profile_pics/${auth.currentUser?.uid || Date.now()}-${file.name}`);
          const snapshot = await uploadBytes(storageRef, file);
          const downloadUrl = await getDownloadURL(snapshot.ref);
          setEditForm(prev => ({ ...prev, profilePic: downloadUrl }));
        } catch (storageError) {
          console.warn("Firebase storage upload for Profile Pic failed, falling back to local base64:", storageError);
          setEditForm(prev => ({ ...prev, profilePic: compressedBase64 }));
        }
      } catch (err) {
        console.error("Failed to process profile picture:", err);
        alert("Failed to process profile image. Please choose another image file.");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.fullName.trim()) {
      alert("Name field cannot be empty.");
      return;
    }
    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, {
          fullName: editForm.fullName.trim(),
          username: editForm.username.trim(),
          office: editForm.office,
          position: editForm.position.trim(),
          profilePic: editForm.profilePic,
        });

        // Update active profile state
        setProfile({
          ...profile,
          fullName: editForm.fullName.trim(),
          username: editForm.username.trim(),
          office: editForm.office,
          position: editForm.position.trim(),
          profilePic: editForm.profilePic,
        });

        setIsEditing(false);
      } else {
        alert("Session expired. Please log in again.");
      }
    } catch (err) {
      console.error("Error updating user profile:", err);
      alert("Failed to update profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Get initials for profile fallback
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .filter(Boolean)
      .map(part => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() || 'SA';
  };

  // RBAC handlers
  const handleEditUser = (user: any) => {
    setEditingUser(user.id);
    setEditingUserForm({
      fullName: user.fullName || '',
      office: user.office || '',
      position: user.position || '',
      role: user.role || UserRole.STAFF,
      status: user.status || 'Active'
    });
  };

  const handleSaveUserEdit = async (userId: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        fullName: editingUserForm.fullName.trim(),
        office: editingUserForm.office,
        position: editingUserForm.position.trim(),
        role: editingUserForm.role,
        status: editingUserForm.status
      });
      setEditingUser(null);
      alert("User account updated successfully!");
    } catch (e) {
      console.error("Error updating user:", e);
      alert("Failed to update user account.");
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (userId === auth.currentUser?.uid) {
      alert("You cannot delete your own administrative account!");
      return;
    }
    if (window.confirm("Are you absolutely sure you want to permanently delete this user account? This cannot be undone.")) {
      try {
        await deleteDoc(doc(db, 'users', userId));
        alert("User account deleted successfully.");
      } catch (e) {
        console.error("Error deleting user:", e);
        alert("Failed to delete user account.");
      }
    }
  };

  const handleTogglePermission = (role: UserRole, view: View) => {
    const currentPerms = permissionsMap[role] || [];
    let updatedPerms: View[];
    if (currentPerms.includes(view)) {
      updatedPerms = currentPerms.filter(v => v !== view);
    } else {
      updatedPerms = [...currentPerms, view];
    }
    
    setPermissionsMap(prev => ({
      ...prev,
      [role]: updatedPerms
    }));
  };

  const handleSavePermissions = async () => {
    try {
      await setDoc(doc(db, 'system_settings', 'permissions'), permissionsMap);
      alert("Role-based access permissions saved and updated system-wide!");
    } catch (e) {
      console.error("Error saving permissions:", e);
      alert("Failed to save permissions.");
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col md:flex-row items-center md:items-end space-y-6 md:space-y-0 md:space-x-8">
        <div className="relative group">
          <div className="w-40 h-40 bg-gray-900 rounded-[48px] shadow-2xl overflow-hidden flex items-center justify-center text-white border-4 border-white animate-in zoom-in duration-300">
            {profile.profilePic ? (
              <img src={profile.profilePic} className="w-full h-full object-cover" alt="User Avatar" />
            ) : (
              <div className="font-brand font-black text-5xl tracking-normal">{getInitials(profile.fullName)}</div>
            )}
          </div>
          <button 
            type="button"
            onClick={() => {
              setEditForm({
                fullName: profile.fullName,
                username: profile.username,
                office: profile.office,
                position: profile.position,
                profilePic: profile.profilePic || '',
              });
              setIsEditing(true);
            }}
            className="absolute -bottom-2 -right-2 bg-blue-600 hover:bg-blue-700 w-10 h-10 rounded-2xl border-4 border-white flex items-center justify-center shadow-lg transition-all transform hover:scale-110"
            title="Click to edit profile"
          >
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        </div>
        <div className="text-center md:text-left flex-1">
          <div className="flex flex-col md:flex-row md:items-center md:space-x-4">
            <h2 className="text-4xl font-black text-gray-900 font-brand tracking-tighter uppercase">{profile.fullName}</h2>
            <span className="mt-2 md:mt-0 text-[10px] font-black px-3 py-1 bg-blue-600 text-white rounded-full uppercase tracking-widest self-center md:self-auto shadow-sm">
              {profile.role === 'ADMIN' ? 'System Administrator' : profile.role === 'ACCOUNTING' ? 'Municipal Accountant' : profile.role === 'OFFICE_HEAD' ? 'Office Department Head' : 'Admin Staff'}
            </span>
          </div>
          <p className="text-blue-600 font-black tracking-[0.2em] uppercase text-xs mt-2">{profile.position}</p>
          <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">Authorized Official • LGU {settings.municipality}</p>
          
          <button 
            onClick={() => {
              setEditForm({
                fullName: profile.fullName,
                username: profile.username,
                office: profile.office,
                position: profile.position,
                profilePic: profile.profilePic || '',
              });
              setIsEditing(true);
            }}
            className="mt-4 px-5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all inline-flex items-center space-x-1.5 shadow-sm"
          >
            <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span>Edit Profile Identity</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white p-10 rounded-[48px] border border-gray-100 shadow-sm space-y-8">
            <h3 className="font-black text-gray-900 text-xl uppercase tracking-tight font-brand border-b border-gray-50 pb-6">System Identity</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Access Credentials</label>
                <div className="bg-gray-50 p-4 rounded-2xl font-bold text-gray-800 border border-gray-100 text-xs">{profile.username}</div>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Assigned Department</label>
                <div className="bg-gray-50 p-4 rounded-2xl font-bold text-gray-800 border border-gray-100 text-xs">{profile.office}</div>
              </div>
            </div>

            {/* Browser Notifications Preference Section */}
            <div className="border-t border-gray-100 pt-8 space-y-4">
              <h4 className="font-black text-gray-900 text-xs uppercase tracking-wider ml-1">Real-time Approval Alerts</h4>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-blue-50/50 border border-blue-100/50 rounded-3xl gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-black text-slate-900 uppercase">Browser Native Notifications</p>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">
                    Receive instant alerts on your desktop when a pending Asset Transfer requires your attention and signature.
                  </p>
                </div>
                <div>
                  {notificationPermission === 'granted' ? (
                    <div className="flex items-center space-x-2 px-4 py-2.5 bg-emerald-100 text-emerald-800 rounded-xl text-[9px] font-black uppercase tracking-wider">
                      <span className="w-2 h-2 bg-emerald-600 rounded-full animate-pulse"></span>
                      <span>Alerts Enabled</span>
                    </div>
                  ) : notificationPermission === 'denied' ? (
                    <div className="flex items-center space-x-2 px-4 py-2.5 bg-rose-100 text-rose-800 rounded-xl text-[9px] font-black uppercase tracking-wider">
                      <span className="w-2 h-2 bg-rose-600 rounded-full"></span>
                      <span>Alerts Blocked</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={onRequestPermission}
                      className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[9px] font-black uppercase tracking-wider transition-all shadow-md shadow-blue-100 cursor-pointer whitespace-nowrap"
                    >
                      Enable Alerts
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 p-10 rounded-[48px] shadow-2xl text-white space-y-8 relative overflow-hidden">
            <h3 className="font-brand font-black text-xl uppercase tracking-tight border-b border-white/10 pb-6 relative z-10">System Administrator Info</h3>
            <div className="space-y-6 relative z-10">
              <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.2em]">Centralized Inventory & Resource Tracking: LGU Tibiao</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {['APRIL JOHN C. BUAYA', 'MECCA ELLA B. ELUMBA', 'ROSELYN S. ESCANTILLA', 'ANDREW DAVE A. AMAR', 'JESSIE TAMBA'].map(name => (
                  <div key={name} className="flex items-center space-x-3 bg-white/5 p-3 rounded-2xl border border-white/10">
                    <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-[10px] font-black">{name[0]}</div>
                    <span className="text-xs font-black uppercase tracking-tight">{name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm space-y-6">
            <h3 className="font-black text-gray-900 text-sm uppercase tracking-widest border-b border-gray-50 pb-4">Secure Console</h3>
            <div className="space-y-3">
              <button onClick={() => setActiveModal('logs')} className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-all border border-transparent hover:border-blue-100 group">
                <span className="font-bold text-gray-700 text-[10px] uppercase tracking-widest">Audit Logs</span>
                <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </button>
              <button onClick={() => setActiveModal('access')} className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-all border border-transparent hover:border-blue-100 group">
                <span className="font-bold text-gray-700 text-[10px] uppercase tracking-widest">Access Trail</span>
                <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A10.003 10.003 0 0012 3m0 18a10.003 10.003 0 01-9.857-8.125m1.332-2.126C4.417 8.082 5.918 6.5 7.5 5.25" /></svg>
              </button>
              <button onClick={() => setActiveModal('params')} className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-all border border-transparent hover:border-blue-100 group">
                <span className="font-bold text-gray-700 text-[10px] uppercase tracking-widest">System Parameters</span>
                <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </button>
              {profile.role === 'ADMIN' && (
                <button onClick={() => setActiveModal('rbac')} className="w-full flex items-center justify-between p-4 bg-blue-50 rounded-2xl hover:bg-blue-100 transition-all border border-transparent hover:border-blue-200 group">
                  <span className="font-bold text-blue-700 text-[10px] uppercase tracking-widest">User & Role Management</span>
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              )}
              <button onClick={onLogout} className="w-full flex items-center justify-between p-4 bg-red-50 rounded-2xl hover:bg-red-100 transition-all border border-transparent hover:border-red-200 group mt-8">
                <span className="font-black text-red-600 text-[10px] uppercase tracking-[0.2em]">Terminate Session</span>
                <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Editing Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-[40px] w-full max-w-xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="p-8 border-b border-gray-100 bg-blue-600 text-white flex items-center justify-between">
              <div>
                <h3 className="font-brand font-black text-xl uppercase tracking-tight">Edit Profile Identity</h3>
                <p className="text-[10px] text-blue-100 font-bold uppercase tracking-widest mt-0.5">Customize authorized user profile</p>
              </div>
              <button 
                onClick={() => setIsEditing(false)} 
                type="button"
                className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl. transition-all"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveChanges} className="flex-1 overflow-y-auto p-8 space-y-6">
              {/* Profile Avatar Selection */}
              <div className="flex flex-col items-center space-y-3 pb-4 border-b border-gray-50">
                <div className="relative">
                  <div className="w-24 h-24 bg-gray-900 rounded-[32px] overflow-hidden flex items-center justify-center text-white border-2 border-gray-200">
                    {editForm.profilePic ? (
                      <img src={editForm.profilePic} className="w-full h-full object-cover" alt="Avatar preview" />
                    ) : (
                      <div className="font-brand font-black text-3xl">{getInitials(editForm.fullName)}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 w-8 h-8 bg-blue-600 text-white rounded-xl border-2 border-white flex items-center justify-center hover:bg-blue-700 transition-all shadow"
                    title="Change image"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageChange} 
                  accept="image/*" 
                  className="hidden" 
                />
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[9px] font-black uppercase text-blue-600 hover:underline tracking-widest"
                  >
                    Upload Custom Portrait
                  </button>
                  <p className="text-[8px] text-gray-400 mt-0.5">Maximum size: 5 MB (JPEG, PNG)</p>
                </div>
              </div>

              {/* Form Input fields */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1 block">Full Legal Name</label>
                  <input
                    type="text"
                    required
                    value={editForm.fullName || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, fullName: e.target.value }))}
                    className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm transition-all"
                    placeholder="Enter your full name"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1 block">Staff Designation (Position)</label>
                  <input
                    type="text"
                    required
                    value={editForm.position || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, position: e.target.value }))}
                    className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm transition-all"
                    placeholder="e.g. Municipal Administrator / Admin Clerk"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1 block">Access Username</label>
                  <input
                    type="text"
                    required
                    value={editForm.username || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, username: e.target.value }))}
                    className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm transition-all text-xs font-mono"
                    placeholder="Enter system username"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1 block">Assigned LGU Department / Office</label>
                  <select
                    value={editForm.office || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, office: e.target.value }))}
                    className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm transition-all"
                  >
                    <option value="">Select Department</option>
                    {availableOffices.map((off) => (
                      <option key={off} value={off}>
                        {off}
                      </option>
                    ))}
                    {!availableOffices.includes(editForm.office) && editForm.office && (
                      <option value={editForm.office}>{editForm.office}</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="pt-6 border-t border-gray-100 flex gap-4">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-gray-150 hover:bg-gray-200 text-gray-700 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all text-center shadow-lg shadow-blue-150 disabled:opacity-50"
                >
                  {loading ? "Persisting Changes..." : "Save Profile"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Audit Logs Modal */}
      {activeModal === 'logs' && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-[48px] w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
            <div className="p-10 border-b border-gray-50 flex items-center justify-between bg-blue-600 text-white">
              <h3 className="font-brand font-black text-2xl uppercase tracking-tight">System Audit Registry</h3>
              <button onClick={() => setActiveModal(null)} className="p-3 bg-white/10 rounded-2xl hover:scale-110 transition-all"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto p-12 space-y-6">
              {systemLogs.length > 0 ? systemLogs.map(log => (
                <div key={log.id} className="p-5 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">{log.module}</p>
                    <p className="text-xs font-black text-gray-900 uppercase">{log.action}</p>
                    <p className="text-[9px] text-gray-400 font-bold mt-1">Logged by {log.user}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-bold text-gray-400">{new Date(log.timestamp).toLocaleTimeString()}</p>
                    <p className="text-[8px] font-black text-gray-300 mt-1">{new Date(log.timestamp).toLocaleDateString()}</p>
                  </div>
                </div>
              )) : (
                <div className="py-20 text-center text-gray-300 uppercase tracking-[0.4em] text-[10px] font-black">No system actions recorded yet</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Access Trail Modal */}
      {activeModal === 'access' && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-[48px] w-full max-w-xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
            <div className="p-10 border-b border-gray-50 flex items-center justify-between bg-indigo-900 text-white">
              <h3 className="font-brand font-black text-2xl uppercase tracking-tight">Access Verification History</h3>
              <button onClick={() => setActiveModal(null)} className="p-3 bg-white/10 rounded-2xl hover:scale-110 transition-all"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto p-12 space-y-4">
              {accessLogs.length > 0 ? accessLogs.map(log => (
                <div key={log.id} className="relative pl-8 border-l-2 border-indigo-100 pb-6">
                  <div className={`absolute -left-[7px] top-0 w-3 h-3 rounded-full border-2 border-white ${log.status.includes('Login') ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className={`text-xs font-black uppercase tracking-tight ${log.status.includes('Login') ? 'text-green-700' : 'text-red-700'}`}>{log.status}</p>
                      <p className="text-[9px] text-indigo-500 font-bold mt-1">{log.device} &bull; {log.ip}</p>
                    </div>
                    <p className="text-[9px] font-bold text-gray-400">{new Date(log.timestamp).toLocaleString()}</p>
                  </div>
                </div>
              )) : (
                <div className="py-20 text-center text-gray-300 uppercase tracking-[0.4em] text-[10px] font-black">No access history available</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* System Parameters Modal */}
      {activeModal === 'params' && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-6 animate-in zoom-in duration-200">
          <div className="bg-white rounded-[48px] w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="p-10 border-b border-gray-50 bg-gray-900 text-white flex items-center justify-between">
              <h3 className="font-brand font-black text-2xl uppercase tracking-tight">Global Parameters</h3>
              <button onClick={() => setActiveModal(null)} className="p-3 bg-white/10 rounded-2xl"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="p-12 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Municipality Name</label>
                <input value={settings.municipality || ''} onChange={e => setSettings({...settings, municipality: e.target.value})} className="w-full px-6 py-4 bg-gray-50 rounded-2xl font-bold border-transparent focus:border-blue-500 outline-none transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Province</label>
                <input value={settings.province || ''} onChange={e => setSettings({...settings, province: e.target.value})} className="w-full px-6 py-4 bg-gray-50 rounded-2xl font-bold border-transparent focus:border-blue-500 outline-none transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Current Fiscal Period</label>
                <input value={settings.fiscalYear || ''} onChange={e => setSettings({...settings, fiscalYear: e.target.value})} className="w-full px-6 py-4 bg-gray-50 rounded-2xl font-bold border-transparent focus:border-blue-500 outline-none transition-all" />
              </div>
            </div>
            <div className="p-10 bg-gray-50 border-t border-gray-100 flex justify-center">
               <button onClick={handleApplyParams} className="px-16 py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-blue-700 transition-all">Apply Global Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* User & Role Management (RBAC Console) Modal */}
      {activeModal === 'rbac' && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-4 md:p-6 animate-in zoom-in duration-200">
          <div className="bg-white rounded-[40px] w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col h-[85vh]">
            <div className="p-8 border-b border-gray-100 bg-blue-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-brand font-black text-2xl uppercase tracking-tight">Security & Access Control (RBAC) Console</h3>
                <p className="text-[10px] text-blue-200 font-bold uppercase tracking-widest mt-1">Configure role permissions and manage LGU staff profiles</p>
              </div>
              <button onClick={() => { setActiveModal(null); setEditingUser(null); }} className="p-3 bg-white/10 rounded-2xl hover:scale-110 transition-all">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              {/* Sidebar/Selector tabs for User Management vs Permission Customizer */}
              <div className="w-full md:w-64 border-r border-gray-100 bg-gray-50/50 p-6 flex flex-col gap-2 overflow-y-auto">
                <button 
                  onClick={() => setActiveRoleTab('users_list')}
                  className={`w-full text-left p-4 rounded-2xl text-xs font-black uppercase tracking-wider transition-all border ${activeRoleTab === 'users_list' ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100' : 'bg-white hover:bg-gray-100 text-gray-700 border-gray-200'}`}
                >
                  User Account Directory
                </button>
                <div className="h-px bg-gray-200 my-4"></div>
                <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Configure Permissions By Role</div>
                
                {[UserRole.ADMIN, UserRole.OFFICE_HEAD, UserRole.SUPPLY, UserRole.ACCOUNTING, UserRole.STAFF].map((r) => (
                  <button 
                    key={r}
                    onClick={() => setActiveRoleTab(r)}
                    className={`w-full text-left p-3.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${activeRoleTab === r ? 'bg-indigo-900 text-white border-indigo-900 shadow-md shadow-indigo-150' : 'bg-white hover:bg-gray-100 text-gray-700 border-gray-100'}`}
                  >
                    {r === 'ADMIN' ? 'Super Administrator' : r === 'OFFICE_HEAD' ? 'Office Head' : r === 'SUPPLY' ? 'Property Custodian' : r === 'ACCOUNTING' ? 'Municipal Accountant' : 'Admin Staff'}
                  </button>
                ))}
              </div>

              {/* Main Dynamic Panel */}
              <div className="flex-1 overflow-y-auto p-8 bg-white custom-scrollbar">
                {/* 1. User accounts list */}
                {activeRoleTab === 'users_list' && editingUser === null && (
                  <div className="space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-100">
                      <div>
                        <h4 className="font-black text-gray-900 text-lg uppercase tracking-tight">Admin Accounts List</h4>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Manage active system credentials and office assignments</p>
                      </div>
                      <input 
                        type="text"
                        placeholder="Search users by name, email, or office..."
                        value={searchUserQuery}
                        onChange={(e) => setSearchUserQuery(e.target.value)}
                        className="px-4 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:border-blue-500 w-full md:w-80"
                      />
                    </div>

                    <div className="space-y-4">
                      {usersList
                        .filter(u => {
                          const str = `${u.fullName} ${u.username} ${u.office} ${u.position} ${u.role}`.toLowerCase();
                          return str.includes(searchUserQuery.toLowerCase());
                        })
                        .map(user => (
                          <div key={user.id} className="p-5 border border-gray-100 rounded-2xl bg-gray-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="space-y-1">
                              <div className="flex items-center space-x-3">
                                <span className="font-brand font-black text-gray-900 uppercase tracking-tight text-sm">{user.fullName || 'Anonymous User'}</span>
                                <span className={`text-[8px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full ${user.role === 'ADMIN' ? 'bg-red-100 text-red-800' : user.role === 'ACCOUNTING' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                                  {user.role}
                                </span>
                                <span className={`text-[8px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full ${user.status === 'Suspended' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                                  {user.status || 'Active'}
                                </span>
                              </div>
                              <p className="text-xs font-mono text-gray-400">{user.username}</p>
                              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">{user.position || 'No Position'} &bull; {user.office || 'Unassigned Office'}</p>
                            </div>
                            
                            <div className="flex items-center space-x-2">
                              <button 
                                onClick={() => handleEditUser(user)}
                                className="px-3.5 py-2 bg-white border border-gray-200 hover:border-blue-200 text-[10px] font-black uppercase text-gray-600 hover:text-blue-600 rounded-xl transition-all shadow-sm"
                              >
                                Edit Profile / Role
                              </button>
                              <button 
                                onClick={() => handleDeleteUser(user.id)}
                                className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-all"
                                title="Delete account"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      {usersList.length === 0 && (
                        <p className="text-center text-xs text-gray-400 py-8">No registered user documents found.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Inline Editing for User */}
                {editingUser !== null && (
                  <div className="space-y-6">
                    <div className="pb-6 border-b border-gray-100">
                      <h4 className="font-black text-gray-900 text-lg uppercase tracking-tight">Edit LGU Account Profile</h4>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Modify role, position, department, and status of user account</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Legal Name</label>
                        <input 
                          type="text" 
                          value={editingUserForm.fullName}
                          onChange={(e) => setEditingUserForm({...editingUserForm, fullName: e.target.value})}
                          className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Position / Designation</label>
                        <input 
                          type="text" 
                          value={editingUserForm.position}
                          onChange={(e) => setEditingUserForm({...editingUserForm, position: e.target.value})}
                          className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Assigned Department</label>
                        <select 
                          value={editingUserForm.office}
                          onChange={(e) => setEditingUserForm({...editingUserForm, office: e.target.value})}
                          className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm transition-all"
                        >
                          <option value="">Select Department</option>
                          {availableOffices.map(o => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">System Security Role</label>
                        <select 
                          value={editingUserForm.role}
                          onChange={(e) => setEditingUserForm({...editingUserForm, role: e.target.value as UserRole})}
                          className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm transition-all text-xs font-mono"
                        >
                          <option value={UserRole.STAFF}>LGU STAFF</option>
                          <option value={UserRole.SUPPLY}>PROPERTY CUSTODIAN</option>
                          <option value={UserRole.ACCOUNTING}>MUNICIPAL ACCOUNTANT</option>
                          <option value={UserRole.OFFICE_HEAD}>OFFICE DEPARTMENT HEAD</option>
                          <option value={UserRole.ADMIN}>SUPER ADMINISTRATOR</option>
                          <option value={UserRole.UNAUTHORIZED}>UNAUTHORIZED / ACCESS REVOKED</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Account Lock Status</label>
                        <select 
                          value={editingUserForm.status}
                          onChange={(e) => setEditingUserForm({...editingUserForm, status: e.target.value})}
                          className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm transition-all"
                        >
                          <option value="Active">Active (Unlocked)</option>
                          <option value="Suspended">Suspended (Locked)</option>
                        </select>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-gray-100 flex gap-4">
                      <button 
                        onClick={() => setEditingUser(null)}
                        className="flex-1 py-3.5 bg-gray-100 text-gray-700 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-200 transition-all text-center"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={() => handleSaveUserEdit(editingUser)}
                        className="flex-1 py-3.5 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all text-center shadow-lg shadow-blue-150"
                      >
                        Save User Modifications
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. Permission matrices for the selected Role tab */}
                {activeRoleTab !== 'users_list' && (
                  <div className="space-y-8">
                    <div className="pb-6 border-b border-gray-100">
                      <h4 className="font-black text-gray-900 text-lg uppercase tracking-tight">
                        Role Customizer: {activeRoleTab === 'ADMIN' ? 'Super Administrator' : activeRoleTab === 'OFFICE_HEAD' ? 'Office Head' : activeRoleTab === 'SUPPLY' ? 'Property Custodian' : activeRoleTab === 'ACCOUNTING' ? 'Municipal Accountant' : 'Admin Staff'}
                      </h4>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Toggle dynamic dashboard modules and access permissions for this role</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { id: View.DASHBOARD, label: 'Analytical Dashboard', desc: 'Overview, analytics, stats, and key Admin metrics' },
                        { id: View.ITEMS, label: 'Master Asset Inventory', desc: 'Asset registry, physical count checks, and detailed stock cards' },
                        { id: View.RECEIVING, label: 'Supplier Cargo & Receiving', desc: 'Supplier deliveries tracking, cargo inspections, and receiving logs' },
                        { id: View.STICKERS, label: 'Dynamic Property Stickers', desc: 'QR code barcode sticker creation, previewing, and asset tag printing' },
                        { id: View.REPORTS, label: 'Official reports (RPCSP / RPCPPE)', desc: 'Compile physical counts, inventory reports, and export compliance sheets' },
                        { id: View.REQUESTS, label: 'Requesting Slips', desc: 'Log, approve, and track PAR and ICS requesting slips from the Accounting department' },
                        { id: View.TRANSACTIONS, label: 'Requisition Registry & Logs', desc: 'Detailed log records of all historic transfers, allocations, and operations' },
                        { id: View.AUDIT, label: 'Audit Activity Log', desc: 'System-wide activity logging and immutable action tracking' },
                        { id: View.DATABASE, label: 'Raw Database Console', desc: 'Direct system ledger tables and raw document views' },
                        { id: View.OFFICES, label: 'Office & Department Management', desc: 'Set up offices, assign department heads, and register personnel' },
                        { id: View.PROFILE, label: 'My Personal Profile', desc: 'View individual credentials, update personal details, and avatar selection' }
                      ].map((item) => {
                        const isChecked = (permissionsMap[activeRoleTab as UserRole] || []).includes(item.id);
                        return (
                          <div 
                            key={item.id}
                            onClick={() => handleTogglePermission(activeRoleTab as UserRole, item.id)}
                            className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-start space-x-4 ${isChecked ? 'bg-indigo-50/50 border-indigo-200' : 'bg-white hover:bg-gray-50 border-gray-150'}`}
                          >
                            <div className="pt-0.5">
                              <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${isChecked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300'}`}>
                                {isChecked && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>}
                              </div>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-black text-gray-900 uppercase tracking-wide">{item.label}</p>
                              <p className="text-[10px] text-gray-400 font-bold leading-normal">{item.desc}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-8 border-t border-gray-100 flex justify-end">
                      <button 
                        onClick={handleSavePermissions}
                        className="px-10 py-4 bg-indigo-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-indigo-950 transition-all"
                      >
                        Save {activeRoleTab} Permissions Matrix
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
