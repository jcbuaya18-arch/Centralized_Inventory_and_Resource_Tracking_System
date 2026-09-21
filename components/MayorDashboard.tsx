import React from 'react';
import { UserProfile, View, UserRole } from '../types';

interface MayorDashboardProps {
  items: any[];
  offices: any[];
  onLogout: () => void;
  userName: string;
  user: UserProfile;
  setView: (view: View) => void;
  onNotificationActionClick: (notif: any) => void;
}

const MayorDashboard: React.FC<MayorDashboardProps> = ({ items, offices, onLogout, userName, user, setView, onNotificationActionClick }) => {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-blue-600 seal-glow">
            <img src="/tibiaoLogo.jpg" alt="Tibiao Seal" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-lg font-black text-gray-900 uppercase tracking-tight">Mayor Dashboard</h1>
            <p className="text-xs text-gray-500 font-bold">Municipality of Tibiao &bull; {userName}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="px-4 py-2 bg-red-50 text-red-600 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-red-100 transition-all"
        >
          Sign Out
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center card-lift">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight mb-2">Welcome, {userName}</h2>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              Your Mayor Dashboard is being prepared. You have access to overview reports and inventory summaries across all municipal offices.
            </p>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => setView(View.DASHBOARD)}
                className="p-4 bg-blue-50 rounded-xl card-lift-sm text-left"
              >
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider">View Dashboard</p>
                <p className="text-xs text-gray-600 mt-1">Full system dashboard</p>
              </button>
              <button
                onClick={() => setView(View.REPORTS)}
                className="p-4 bg-green-50 rounded-xl card-lift-sm text-left"
              >
                <p className="text-[10px] font-black text-green-600 uppercase tracking-wider">Reports</p>
                <p className="text-xs text-gray-600 mt-1">View official reports</p>
              </button>
              <button
                onClick={() => setView(View.PROFILE)}
                className="p-4 bg-purple-50 rounded-xl card-lift-sm text-left"
              >
                <p className="text-[10px] font-black text-purple-600 uppercase tracking-wider">Profile</p>
                <p className="text-xs text-gray-600 mt-1">Manage your account</p>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default MayorDashboard;
