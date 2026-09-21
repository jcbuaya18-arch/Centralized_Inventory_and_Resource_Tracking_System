
import React, { useState } from 'react';
import { Office, View, UserRole } from '../types';

interface OfficesProps {
  offices: Office[];
  setOffices: React.Dispatch<React.SetStateAction<Office[]>>;
  setView: (view: View) => void;
  setOfficeFilter: (office: string) => void;
  userRole: UserRole;
  onAddOffice: (office: Partial<Office>) => Promise<void>;
  onRemoveOffice: (id: string) => Promise<void>;
  onUpdateOffice: (id: string, updates: Partial<Office>) => Promise<void>;
  officeTab?: 'stock_card' | 'par' | 'ics';
  setOfficeTab?: (tab: 'stock_card' | 'par' | 'ics') => void;
}

const Offices: React.FC<OfficesProps> = ({ 
  offices, 
  setView, 
  setOfficeFilter, 
  userRole, 
  onAddOffice, 
  onRemoveOffice, 
  onUpdateOffice,
  officeTab,
  setOfficeTab
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editingOffice, setEditingOffice] = useState<Office | null>(null);
  const [formData, setFormData] = useState({ name: '', code: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenAddModal = () => {
    setEditingOffice(null);
    setFormData({ name: '', code: '' });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (office: Office) => {
    setEditingOffice(office);
    setFormData({ name: office.name, code: office.code });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingOffice(null);
    setFormData({ name: '', code: '' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.code) return;

    const trimmedName = formData.name.trim().toLowerCase();
    const trimmedCode = formData.code.trim().toLowerCase();

    // Check for duplicates in current list
    const isDuplicate = offices.some(office => {
      // If editing, skip comparing with self
      if (editingOffice && office.id === editingOffice.id) return false;
      return office.name.trim().toLowerCase() === trimmedName || office.code.trim().toLowerCase() === trimmedCode;
    });

    if (isDuplicate) {
      alert("Error: An office with this name or code already exists! Duplicates are not allowed.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingOffice) {
        await onUpdateOffice(editingOffice.id, formData);
      } else {
        await onAddOffice(formData);
      }
      closeModal();
    } catch (err) {
      console.error('Failed to save office:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (id: string) => {
    setDeleteTarget(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsSubmitting(true);
    try {
      await onRemoveOffice(deleteTarget);
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
    } catch (err) {
      console.error('Failed to remove office:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewItems = (officeName: string) => {
    setOfficeFilter(officeName);
    setView(View.ITEMS);
  };

  const isAdmin = userRole === UserRole.ADMIN;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-50 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-gray-800">List of All Offices</h2>
          <p className="text-xs text-gray-500">Departments under LGU Tibiao Municipal Hall.</p>
        </div>
        {isAdmin && (
          <button 
            onClick={handleOpenAddModal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-blue-100 transition-all active:scale-95"
          >
            + Add Office
          </button>
        )}
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {offices.map(office => (
            <div 
              key={office.id} 
              onClick={() => {
                if (setOfficeTab) setOfficeTab('stock_card');
                setOfficeFilter(office.name);
              }}
              className="bg-gray-50 p-6 rounded-2xl border border-gray-100 hover:border-blue-500 transition-all group relative overflow-hidden flex flex-col cursor-pointer hover:shadow-md hover:bg-slate-50/50"
            >
              <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-all flex gap-1">
                {isAdmin && (
                  <>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleOpenEditModal(office); }}
                      className="text-blue-600 p-2 hover:bg-blue-100 rounded-lg transition-colors"
                      title="Edit Office"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteClick(office.id); }}
                      className="text-red-500 p-2 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remove Office"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h3 className="font-bold text-gray-800">{office.name}</h3>
              <p className="text-xs text-gray-400 font-mono mt-1 uppercase tracking-wider">Office Code: {office.code}</p>
              
              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase text-blue-600 tracking-wider">View Office Directory Ledger</span>
                <svg className="w-4 h-4 text-blue-650 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[32px] w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-10 border-b border-gray-50 flex justify-between items-center bg-gray-50/50 relative">
              <div className="space-y-1">
                <h3 className="text-3xl font-black text-gray-900 tracking-tight">{editingOffice ? 'Edit Office' : 'Add New Office'}</h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] ml-1">Admin Organizational Department</p>
              </div>
              <button 
                onClick={closeModal} 
                className="w-12 h-12 flex items-center justify-center text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full transition-all active:scale-95 shadow-sm"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 ml-1">Office Name</label>
                  <input 
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Municipal Engineering"
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 text-gray-900 font-bold focus:ring-4 focus:ring-blue-100 focus:border-blue-600 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 ml-1">Office Code</label>
                  <input 
                    type="text"
                    required
                    value={formData.code}
                    onChange={e => setFormData(prev => ({ ...prev, code: e.target.value }))}
                    placeholder="e.g. 8711"
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 text-gray-900 font-mono font-bold focus:ring-4 focus:ring-blue-100 focus:border-blue-600 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={closeModal}
                  className="flex-1 bg-white border border-gray-200 text-gray-600 py-4 rounded-2xl font-bold hover:bg-gray-50 transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-[2] bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    editingOffice ? 'Update Office' : 'Register Office'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[32px] w-full max-w-xs p-8 text-center animate-in zoom-in duration-200 shadow-2xl">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight mb-2">Delete Office?</h3>
            <p className="text-xs text-gray-400 font-bold uppercase mb-8 leading-relaxed">
              This will permanently remove the office record from the registry.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => { setShowDeleteConfirm(false); setDeleteTarget(null); }}
                className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                disabled={isSubmitting}
                className="flex-1 py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-red-100 hover:bg-red-700 transition-all active:scale-95 disabled:opacity-50"
              >
                {isSubmitting ? '...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Offices;
