import React, { useState } from "react";
import { InventoryItem } from "../types";
import { db } from "../firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export type DepartmentDocType = "PAR" | "ICS";

interface DepartmentFormsWorkspaceProps {
  office: string;
  items: InventoryItem[];
  userName: string;
  /** Which document is open; null shows the PAR / ICS choice cards */
  docType: DepartmentDocType | null;
  setDocType: (docType: DepartmentDocType | null) => void;
}

const PAR_THRESHOLD = 50000;

const itemCost = (item: InventoryItem) => item.acquisitionCost || item.unitValue || 0;

/**
 * Department workspace for generating official PAR / ICS forms for one office's assets
 * (moved here from the former Accounting dashboard).
 */
const DepartmentFormsWorkspace: React.FC<DepartmentFormsWorkspaceProps> = ({ office, items, userName, docType, setDocType }) => {
  const [formFundCluster, setFormFundCluster] = useState("GENERAL FUND");
  const [formDocNo, setFormDocNo] = useState("");
  const [formReceivedBy, setFormReceivedBy] = useState("");
  const [formIssuedBy, setFormIssuedBy] = useState("");
  const [formApprovedBy, setFormApprovedBy] = useState("");
  const [isFormSending, setIsFormSending] = useState(false);
  const formDateIssued = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  const officeItems = items.filter(item => item.office && item.office.toLowerCase().trim() === office.toLowerCase().trim());
  const isPAR = docType === "PAR";
  const matchedItems = docType ? officeItems.filter(item => (isPAR ? itemCost(item) >= PAR_THRESHOLD : itemCost(item) < PAR_THRESHOLD)) : [];
  const totalValue = matchedItems.reduce((acc, item) => acc + itemCost(item) * (item.qtyPhysicalCount || 1), 0);

  const handleSendForm = async () => {
    if (!docType) return;
    if (matchedItems.length === 0) {
      alert(`Cannot send an empty form. No items match this category for ${office}.`);
      return;
    }

    setIsFormSending(true);
    try {
      const timestamp = new Date().toISOString();
      const reportRows = matchedItems.map(item => ({
        id: item.id,
        article: item.article,
        description: item.description || "",
        propertyNumber: item.propertyNumber || "",
        unitValue: itemCost(item),
        qtyPhysicalCount: item.qtyPhysicalCount || 1,
        qtyPropertyCard: item.qtyPropertyCard || 1,
        unitOfMeasure: item.unitOfMeasure || "unit",
        dateReceived: item.dateReceived || item.acquisitionDate || "",
        personAccountable: item.personAccountable || "",
      }));

      const reportPayload: any = {
        report_type: isPAR ? "Property Acknowledgement Receipt (PAR)" : "Inventory Custodian Slip (ICS)",
        fund_cluster: formFundCluster || "GENERAL FUND",
        report_date: formDateIssued,
        accountable_person: formReceivedBy || matchedItems[0]?.personAccountable || "TBD",
        accountable_position: "Department Representative",
        accountability_date: formDateIssued,
        total_value: totalValue,
        item_count: reportRows.length,
        items_snapshot: reportRows,
        status: "Pending Approval",
        reportMode: isPAR ? "par" : "ics",
        submittedByOffice: office,
        senderName: userName,
        forwardedStatus: "Pending",
        forwardedAt: timestamp,
        history: [
          { id: Math.random().toString(36).substr(2, 9), timestamp, action: "Draft Created", details: `Official ${docType} form draft compiled by ${userName} for ${office}.` },
          { id: Math.random().toString(36).substr(2, 9), timestamp, action: "Submitted", details: `Official ${docType} form submitted to Engineer/Admin by ${userName} for ${office}.` },
        ],
        created_at: serverTimestamp(),
      };

      if (isPAR) {
        reportPayload.parNo = formDocNo;
        reportPayload.spcNotedBy = formApprovedBy;
        reportPayload.spcUnitCost = totalValue;
      } else {
        reportPayload.icsNo = formDocNo;
        reportPayload.icsDateIssued = formDateIssued;
        reportPayload.icsEmployeeName = formReceivedBy || matchedItems[0]?.personAccountable || "TBD";
        reportPayload.icsIssuedBy = formIssuedBy;
      }

      const docRef = await addDoc(collection(db, "reports"), reportPayload);

      // Also list it under the PAR / ICS tabs of the Requests page for Engineer/Admin review
      await addDoc(collection(db, "requests"), {
        requestType: docType,
        requestNumber: formDocNo || `${docType}-${Date.now()}`,
        itemArticle: matchedItems.map(i => i.article).filter(Boolean).join(", ") || `${docType} Form Items`,
        office,
        requestedBy: userName,
        assignedAdmin: "Engineer / GSO Admin",
        amount: totalValue,
        quantity: matchedItems.reduce((acc, item) => acc + (item.qtyPhysicalCount || 1), 0),
        justification: `Official ${docType} form compiled for ${office}.`,
        status: "Submitted",
        reportId: docRef.id,
        items_snapshot: reportRows,
        requestedAt: timestamp,
        history: [{ id: Math.random().toString(36).substr(2, 9), timestamp, action: "Submitted", details: `Official ${docType} form submitted to Engineer/Admin by ${userName} for ${office}.` }],
      });

      await addDoc(collection(db, "notifications"), {
        recipientRole: "ADMIN",
        message: `New Official ${docType} Form has been submitted for ${office} and is awaiting review.`,
        timestamp,
        isRead: false,
        type: "SUBMISSION",
        reportId: docRef.id,
      });

      await addDoc(collection(db, "system_logs"), {
        timestamp,
        user: userName,
        action: `Submitted official ${docType} form for ${office} to Engineer/Admin for review.`,
        module: "Reporting",
      });

      alert(`Official ${docType} Form successfully created and sent to Engineer/Admin!`);
      setDocType(null);
    } catch (err) {
      console.error("Error sending form: ", err);
      alert("Failed to send form. Please verify network connection.");
    } finally {
      setIsFormSending(false);
    }
  };

  // Level 1: choose PAR or ICS
  if (!docType) {
    return (
      <div className="space-y-6 no-print">
        <div className="bg-slate-900 text-white p-8 rounded-[36px] shadow-xl relative overflow-hidden">
          <span className="text-[8px] font-black uppercase text-blue-400 tracking-widest block">Department Workspace</span>
          <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight mt-1 font-brand">{office}</h2>
          <p className="text-xs text-slate-300 font-medium max-w-xl mt-1 leading-relaxed">
            Generate official Property Acknowledgement Receipts (PAR) or Inventory Custodian Slips (ICS) for {office}. Choose a document type below.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* PAR Card */}
          <div className="bg-white p-8 rounded-[36px] border border-slate-100 shadow-sm flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <span className="bg-blue-50 border border-blue-100 text-blue-700 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest">PAR Document</span>
              </div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight font-brand">Property Acknowledgement Receipt (PAR)</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Form for high-value equipment and assets valued at ₱50,000 or greater. Generate, inspect, and send compiled PAR forms to the Administrator.
              </p>
            </div>
            <button
              onClick={() => setDocType("PAR")}
              className="w-full bg-slate-900 hover:bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest py-4 rounded-2xl transition-all shadow-md active:scale-[0.98] cursor-pointer"
            >
              Open PAR Workspace
            </button>
          </div>

          {/* ICS Card */}
          <div className="bg-white p-8 rounded-[36px] border border-slate-100 shadow-sm flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                </div>
                <span className="bg-emerald-50 border border-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest">ICS Document</span>
              </div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight font-brand">Inventory Custodian Slip (ICS)</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Form for semi-expendable assets and supplies valued under ₱50,000. Generate, inspect, and send compiled ICS forms to the Administrator.
              </p>
            </div>
            <button
              onClick={() => setDocType("ICS")}
              className="w-full bg-slate-900 hover:bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest py-4 rounded-2xl transition-all shadow-md active:scale-[0.98] cursor-pointer"
            >
              Open ICS Workspace
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Level 2: form viewer / compiler
  const reportTitle = isPAR ? "PROPERTY ACKNOWLEDGEMENT RECEIPT" : "INVENTORY CUSTODIAN SLIP";
  const reportSubtitle = isPAR ? "Annex B" : "Appendix 59";
  const focusBorder = isPAR ? "focus:border-blue-500" : "focus:border-emerald-500";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print border-b border-gray-100 pb-4">
        <button
          onClick={() => setDocType(null)}
          className="px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center space-x-2 shadow-sm self-start cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
          </svg>
          <span>Back to {office} Forms</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="px-5 py-2.5 bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm cursor-pointer"
          >
            Print Form
          </button>
          <button
            onClick={handleSendForm}
            disabled={isFormSending || matchedItems.length === 0}
            className={`px-6 py-2.5 ${isPAR ? "bg-blue-600 hover:bg-blue-700" : "bg-emerald-600 hover:bg-emerald-700"} text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50`}
          >
            {isFormSending && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Send to Engineer/Admin
          </button>
        </div>
      </div>

      <div className="space-y-6 font-serif select-text">
        <div className="text-right italic font-black text-[12pt] text-gray-400">{reportSubtitle}</div>
        <div className="text-center font-bold text-[9pt] uppercase text-gray-400 tracking-wider">REPUBLIC OF THE PHILIPPINES, PROVINCE OF ANTIQUE</div>
        <div className="text-center mb-8">
          <div className="text-[12pt] font-black text-slate-800 uppercase">MUNICIPALITY OF TIBIAO</div>
          <h1 className="font-extrabold text-[20pt] leading-none mb-1 text-black tracking-tight uppercase mt-1">{reportTitle}</h1>
          <div className="text-[9.5pt] text-gray-500 italic mt-1 uppercase tracking-widest">{office} DEPARTMENT</div>
        </div>

        {/* Editable header fields */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-2 border-dashed border-gray-200 p-6 rounded-2xl bg-slate-50/50 text-sm no-print">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Entity Name:</label>
            <input type="text" value={`LGU TIBIAO - ${office}`} disabled className="w-full bg-white border border-slate-200 p-2 rounded-xl text-xs font-bold outline-none cursor-not-allowed text-gray-400" />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Fund Cluster:</label>
            <input type="text" value={formFundCluster} onChange={e => setFormFundCluster(e.target.value)} className={`w-full bg-white border border-slate-200 ${focusBorder} p-2 rounded-xl text-xs font-bold outline-none`} />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">{isPAR ? "PAR Number" : "ICS Number"}:</label>
            <input type="text" value={formDocNo} onChange={e => setFormDocNo(e.target.value)} className={`w-full bg-white border border-slate-200 ${focusBorder} p-2 rounded-xl text-xs font-bold outline-none`} />
          </div>
        </div>

        {/* Printed header fields */}
        <div className="hidden print:grid grid-cols-3 gap-6 border border-black p-4 text-[9.5pt]">
          <div><span className="font-bold">Entity Name:</span> LGU TIBIAO - {office}</div>
          <div><span className="font-bold">Fund Cluster:</span> {formFundCluster}</div>
          <div><span className="font-bold">{isPAR ? "PAR No:" : "ICS No:"}</span> {formDocNo}</div>
        </div>

        {/* COA standard table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border-2 border-black text-[9.5pt] font-serif">
            <thead>
              <tr className="font-bold uppercase text-center bg-gray-100 text-[8pt]">
                <th className="border-2 border-black p-2.5 w-[8%]" rowSpan={isPAR ? 1 : 2}>Qty</th>
                <th className="border-2 border-black p-2.5 w-[10%]" rowSpan={isPAR ? 1 : 2}>Unit</th>
                {!isPAR && <th className="border-2 border-black p-2.5 w-[24%]" colSpan={2}>Amount</th>}
                <th className="border-2 border-black p-2.5 w-[42%]" rowSpan={isPAR ? 1 : 2}>Description (Article & Specs)</th>
                <th className="border-2 border-black p-2.5 w-[18%]" rowSpan={isPAR ? 1 : 2}>Property/Inventory No</th>
                {isPAR ? (
                  <th className="border-2 border-black p-2.5 w-[12%]">Acquisition Date</th>
                ) : (
                  <th className="border-2 border-black p-2.5 w-[10%]" rowSpan={2}>Useful Life</th>
                )}
                {isPAR && <th className="border-2 border-black p-2.5 w-[12%]">Acquisition Cost</th>}
              </tr>
              {!isPAR && (
                <tr className="font-bold uppercase text-center bg-gray-100 text-[8pt]">
                  <th className="border-2 border-black p-2">Unit Cost</th>
                  <th className="border-2 border-black p-2">Total</th>
                </tr>
              )}
            </thead>
            <tbody>
              {matchedItems.length === 0 ? (
                <tr>
                  <td className="border-2 border-black p-10 text-center text-gray-400 font-bold" colSpan={isPAR ? 6 : 7}>
                    No assets match the criteria for this office.
                  </td>
                </tr>
              ) : (
                matchedItems.map((item, idx) => {
                  const qty = item.qtyPhysicalCount || 1;
                  const cost = itemCost(item);
                  return (
                    <tr key={item.id || idx} style={{ height: "32px" }}>
                      <td className="border border-black p-2.5 text-center font-mono font-bold text-[8.5pt]">{qty}</td>
                      <td className="border border-black p-2.5 text-center uppercase font-mono text-[8pt]">{item.unitOfMeasure || "unit"}</td>
                      {!isPAR && (
                        <>
                          <td className="border border-black p-2.5 text-right font-mono">₱{cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="border border-black p-2.5 text-right font-mono font-bold">₱{(qty * cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </>
                      )}
                      <td className="border border-black p-2.5">
                        <span className="font-bold text-gray-900 block uppercase leading-tight">{item.article}</span>
                        <span className="text-[8.5pt] text-gray-500 mt-1 block leading-normal whitespace-pre-wrap">
                          {item.description}
                          {item.serialNumber ? ` | S/N: ${item.serialNumber}` : ""}
                          {item.modelNumber ? ` | Model: ${item.modelNumber}` : ""}
                        </span>
                      </td>
                      <td className="border border-black p-2.5 text-center font-mono text-[8pt]">{item.propertyNumber || "Pending"}</td>
                      <td className="border border-black p-2.5 text-center font-mono text-[8.5pt]">
                        {isPAR ? item.dateReceived || item.acquisitionDate || "TBD" : `${item.usefulLife || 5} yrs`}
                      </td>
                      {isPAR && (
                        <td className="border border-black p-2.5 text-right font-mono font-extrabold text-blue-900">
                          ₱{cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-12 mt-16 pt-8 border-t border-dashed border-gray-200">
          <div className="space-y-4">
            <span className="text-[8.5pt] font-black text-gray-400 uppercase tracking-widest block">Received By:</span>
            <div className="border-b border-black pb-1.5 max-w-xs text-center no-print">
              <input type="text" placeholder="Enter recipient's name" value={formReceivedBy} onChange={e => setFormReceivedBy(e.target.value)} className="w-full bg-slate-50 border border-slate-100 p-2 rounded-xl text-xs font-bold text-center outline-none" />
            </div>
            <div className="hidden print:block border-b-2 border-black pb-1.5 max-w-xs text-center">
              <span className="font-extrabold uppercase text-[12px] block">{formReceivedBy || matchedItems[0]?.personAccountable || "TBD"}</span>
            </div>
            <span className="text-[8.5pt] text-gray-500 block">Signature over Printed Name</span>
            <span className="text-[8.5pt] text-gray-500 font-bold block uppercase tracking-wider">Accountable Officer / Representative</span>
            <div className="pt-4 text-xs"><span className="font-bold">Date:</span> <span className="font-mono">{formDateIssued}</span></div>
          </div>

          <div className="space-y-4">
            <span className="text-[8.5pt] font-black text-gray-400 uppercase tracking-widest block">{isPAR ? "Approved By:" : "Issued By:"}</span>
            <div className="border-b border-black pb-1.5 max-w-xs text-center no-print">
              <input
                type="text"
                placeholder={isPAR ? "Enter approver's name" : "Enter issuer's name"}
                value={isPAR ? formApprovedBy : formIssuedBy}
                onChange={e => (isPAR ? setFormApprovedBy(e.target.value) : setFormIssuedBy(e.target.value))}
                className="w-full bg-slate-50 border border-slate-100 p-2 rounded-xl text-xs font-bold text-center outline-none"
              />
            </div>
            <div className="hidden print:block border-b-2 border-black pb-1.5 max-w-xs text-center">
              <span className="font-extrabold uppercase text-[12px] block">{isPAR ? formApprovedBy : formIssuedBy}</span>
            </div>
            <span className="text-[8.5pt] text-gray-500 block">Signature over Printed Name</span>
            <span className="text-[8.5pt] text-gray-500 font-bold block uppercase tracking-wider">GSO Head / Admin Representative</span>
            <div className="pt-4 text-xs"><span className="font-bold">Date:</span> <span className="font-mono">{formDateIssued}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DepartmentFormsWorkspace;
