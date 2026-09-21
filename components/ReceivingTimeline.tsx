import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { 
  doc, 
  onSnapshot, 
  collection, 
  query, 
  where 
} from "firebase/firestore";
import { 
  FileText, 
  Truck, 
  Package, 
  Bell, 
  AlertTriangle, 
  XCircle, 
  CheckCircle2, 
  Clock 
} from "lucide-react";

interface ReceivingTimelineProps {
  req: {
    id: string;
    status: string;
    submittedAt?: string;
    requestedAt?: string;
    sentToEngineerAt?: string;
    receivedAt?: string;
    distributions?: Array<{ date: string; quantity: number; office: string }>;
  };
}

export const ReceivingTimeline: React.FC<ReceivingTimelineProps> = ({ req }) => {
  const [prsData, setPrsData] = useState<any>(req);
  const [accountingNotified, setAccountingNotified] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!req?.id) {
      setLoading(false);
      return;
    }
    
    // Subscribe to live updates of the PRS document
    const prsDocRef = doc(db, 'requests', req.id);
    const unsubscribePrs = onSnapshot(prsDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setPrsData({ id: docSnap.id, ...docSnap.data() });
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching live PRS document:", error);
      setLoading(false);
    });

    // Subscribe to live updates of notifications to check if Accounting has been notified
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('reportId', '==', req.id),
      where('recipientRole', '==', 'ACCOUNTING')
    );
    const unsubscribeNotifs = onSnapshot(q, (querySnap) => {
      if (!querySnap.empty) {
        setAccountingNotified(true);
      } else {
        setAccountingNotified(false);
      }
    }, (error) => {
      console.error("Error checking accounting notifications:", error);
    });

    return () => {
      unsubscribePrs();
      unsubscribeNotifs();
    };
  }, [req?.id]);

  const status = prsData?.status || req.status;

  // Compute status for each milestone step
  let step1: 'pending' | 'current' | 'completed' = 'completed';
  let step2: 'pending' | 'current' | 'completed' | 'warning' | 'error' = 'pending';
  let step3: 'pending' | 'current' | 'completed' = 'pending';
  let step4: 'pending' | 'current' | 'completed' = 'pending';

  const isCompletedOrReceived = status === 'Completed' || status === 'RECEIVED' || status === 'DISTRIBUTED' || prsData?.receivedAt;

  // Milestone 1: SUBMITTED
  if (status === 'PENDING') {
    step1 = 'current';
  } else {
    step1 = 'completed';
  }

  // Milestone 2: PENDING DELIVERY
  if (status === 'PENDING') {
    step2 = 'pending';
  } else if (status === 'Pending Delivery' || status === 'PENDING_RECEIVING' || status === 'Resubmitted') {
    step2 = 'current';
  } else if (status === 'Returned' || status === 'Returned for Correction') {
    step2 = 'warning';
  } else if (status === 'REJECTED' || status === 'Rejected') {
    step2 = 'error';
  } else if (isCompletedOrReceived) {
    step2 = 'completed';
  }

  // Milestone 3: COMPLETE TRANSACTION
  if (isCompletedOrReceived) {
    step3 = 'completed';
  } else {
    step3 = 'pending';
  }

  // Define steps
  const steps = [
    {
      id: 1,
      title: 'SUBMITTED',
      description: status === 'PENDING' ? 'Draft prepared' : 'Purchase request submitted',
      status: step1,
      icon: FileText,
      date: prsData?.submittedAt || prsData?.requestedAt ? new Date(prsData.submittedAt || prsData.requestedAt).toLocaleDateString() : null,
    },
    {
      id: 2,
      title: status === 'Returned' || status === 'Returned for Correction' 
        ? 'RETURNED' 
        : (status === 'REJECTED' || status === 'Rejected') 
          ? 'REJECTED' 
          : 'PENDING DELIVERY',
      description: status === 'Returned' || status === 'Returned for Correction'
        ? 'Needs correction'
        : (status === 'REJECTED' || status === 'Rejected')
          ? 'Cargo rejected'
          : isCompletedOrReceived
            ? 'Delivered & verified'
            : 'Awaiting cargo arrival',
      status: step2,
      icon: status === 'Returned' || status === 'Returned for Correction'
        ? AlertTriangle 
        : (status === 'REJECTED' || status === 'Rejected') 
          ? XCircle 
          : Truck,
      date: prsData?.sentToEngineerAt || prsData?.submittedAt ? new Date(prsData.sentToEngineerAt || prsData.submittedAt).toLocaleDateString() : null,
    },
    {
      id: 3,
      title: 'COMPLETE TRANSACTION',
      description: isCompletedOrReceived ? 'Verified, added to inventory & assigned' : 'Pending verification & completion',
      status: step3,
      icon: CheckCircle2,
      date: prsData?.receivedAt ? new Date(prsData.receivedAt).toLocaleDateString() : null,
    }
  ];

  // Progress Bar width percentage
  let progressWidth = '0%';
  if (step3 === 'completed') {
    progressWidth = '100%';
  } else if (step2 === 'completed' || step2 === 'current' || step2 === 'warning' || step2 === 'error') {
    progressWidth = '50%';
  } else if (step1 === 'completed') {
    progressWidth = '0%';
  }

  return (
    <div className="mt-4 p-5 bg-white rounded-3xl border border-slate-100/80 shadow-xs relative overflow-hidden transition-all duration-300">
      <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
            <Clock className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase text-slate-800 tracking-wider block">
              Receiving Timeline & Progress
            </span>
            <p className="text-[8px] text-slate-400 font-semibold uppercase tracking-widest mt-0.5">
              Live updates from active LGU cargo registry
            </p>
          </div>
        </div>
        <span className={`text-[8px] font-black px-2.5 py-1 rounded-full border shadow-2xs uppercase tracking-widest ${
          status === 'DISTRIBUTED' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
          isCompletedOrReceived ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
          (status === 'Pending Delivery' || status === 'PENDING_RECEIVING') ? 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse' :
          (status === 'Returned' || status === 'Returned for Correction') ? 'bg-orange-50 text-orange-800 border-orange-250' :
          (status === 'REJECTED' || status === 'Rejected') ? 'bg-rose-50 text-rose-700 border-rose-250 font-black' :
          'bg-slate-50 text-slate-600 border-slate-300'
        }`}>
          {status === 'PENDING' ? 'PREPARED - DRAFT' : 
           (status === 'Pending Delivery' || status === 'PENDING_RECEIVING') ? 'SENT - PENDING DELIVERY' : 
           (status === 'Returned' || status === 'Returned for Correction') ? 'RETURNED FOR CORRECTION' : 
           status === 'Completed' ? 'COMPLETED (CARGO RECEIVED)' :
           status === 'RECEIVED' ? 'IN ENGINEER CARGO' : 
           status === 'DISTRIBUTED' ? 'FULLY DISTRIBUTED' : 
           (status === 'REJECTED' || status === 'Rejected') ? 'REJECTED & RETURNED' : 
           status}
        </span>
      </div>

      {loading ? (
        <div className="py-6 flex flex-col items-center justify-center space-y-2">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest animate-pulse">Syncing timeline logs...</span>
        </div>
      ) : (
        <div className="relative flex items-start justify-between w-full mt-2 select-none">
          {/* Progress Bar background connector line */}
          <div className="absolute left-[20px] right-[20px] h-[3px] bg-slate-100 rounded-full" style={{ top: '16px', zIndex: 0 }}>
            {/* Completed active segment */}
            <div 
              className="h-full bg-emerald-500 transition-all duration-700 ease-out rounded-full"
              style={{ width: progressWidth }}
            />
          </div>

          {steps.map((step) => {
            const Icon = step.icon;
            const isCompleted = step.status === 'completed';
            const isCurrent = step.status === 'current';
            const isWarning = step.status === 'warning';
            const isError = step.status === 'error';

            let circleStyle = 'bg-slate-50 border-slate-200 text-slate-400';
            if (isCompleted) {
              circleStyle = 'bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-500/20 scale-105';
            } else if (isCurrent) {
              circleStyle = 'bg-white border-blue-500 text-blue-600 ring-4 ring-blue-50 scale-105 font-bold animate-pulse';
            } else if (isWarning) {
              circleStyle = 'bg-amber-500 border-amber-500 text-white ring-4 ring-amber-50 scale-105';
            } else if (isError) {
              circleStyle = 'bg-rose-500 border-rose-500 text-white ring-4 ring-rose-50 scale-105';
            }

            return (
              <div key={step.id} className="flex flex-col items-center flex-1 relative z-10 text-center">
                {/* Visual Circle */}
                <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${circleStyle}`}>
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>

                {/* Milestone Text */}
                <span className={`text-[9px] font-black uppercase tracking-wider mt-2.5 block ${
                  isCompleted ? 'text-slate-800' :
                  isCurrent ? 'text-blue-600' :
                  isWarning ? 'text-amber-600 font-extrabold' :
                  isError ? 'text-rose-600 font-extrabold' :
                  'text-slate-400 font-bold'
                }`}>
                  {step.title}
                </span>

                {/* Milestone Subtext description */}
                <p className="text-[7.5px] text-slate-400 font-semibold leading-tight mt-1 max-w-[85px] mx-auto uppercase tracking-wide">
                  {step.description}
                </p>

                {/* Milestone timestamp */}
                {step.date && (
                  <span className="text-[7px] font-mono text-slate-500 bg-slate-100 px-1 py-0.5 rounded-md mt-1.5 inline-block border border-slate-200/50">
                    {step.date}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
