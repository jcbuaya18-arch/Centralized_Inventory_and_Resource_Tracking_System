import React from 'react';
import { ReportRow } from '../types';

interface GAMFormsProps {
  isViewOnly: boolean;
  reportMode: string;
  reportRows: ReportRow[];
  reportType: string;
  setReportType: (val: string) => void;
  reportDate: string;
  setReportDate: (val: string) => void;
  fundCluster: string;
  setFundCluster: (val: string) => void;
  updateCell: (tempId: string, field: keyof ReportRow, value: any) => void;
  onAddRow?: (type: 'par' | 'ics') => void;
  onDeleteRow?: (tempId: string) => void;
  
  // SPC States & Ref Setters
  spcStockNo: string;
  setSpcStockNo: (val: string) => void;
  spcReorderLevel: string;
  setSpcReorderLevel: (val: string) => void;
  spcUnitCost: number;
  setSpcUnitCost: (val: number) => void;
  spcNotedBy: string;
  setSpcNotedBy: (val: string) => void;

  // SPLC States & Ref Setters
  splcStockNo: string;
  setSplcStockNo: (val: string) => void;
  splcUnitCost: number;
  setSplcUnitCost: (val: number) => void;
  splcAccountCode: string;
  setSplcAccountCode: (val: string) => void;
  splcApprovedBy: string;
  setSplcApprovedBy: (val: string) => void;

  // ICS States & Ref Setters
  icsNo: string;
  setIcsNo: (val: string) => void;
  icsDateIssued: string;
  setIcsDateIssued: (val: string) => void;
  icsEmployeeName: string;
  setIcsEmployeeName: (val: string) => void;
  icsEmployeePosition: string;
  setIcsEmployeePosition: (val: string) => void;
  icsIssuedBy: string;
  setIcsIssuedBy: (val: string) => void;

  // REG SIP States & Ref Setters
  regsipPreparedBy: string;
  setRegsipPreparedBy: (val: string) => void;
  regsipApprovedBy: string;
  setRegsipApprovedBy: (val: string) => void;

  // ITR States & Ref Setters
  itrNo: string;
  setItrNo: (val: string) => void;
  itrDate: string;
  setItrDate: (val: string) => void;
  itrFromTransferor: string;
  setItrFromTransferor: (val: string) => void;
  itrToTransferee: string;
  setItrToTransferee: (val: string) => void;
  itrPurpose: string;
  setItrPurpose: (val: string) => void;
  itrType: string;
  setItrType: (val: string) => void;
  itrTypeOthers: string;
  setItrTypeOthers: (val: string) => void;
  itrApprovedBy: string;
  setItrApprovedBy: (val: string) => void;
  itrApprovedPosition: string;
  setItrApprovedPosition: (val: string) => void;
  itrFromPosition: string;
  setItrFromPosition: (val: string) => void;
  itrToPosition: string;
  setItrToPosition: (val: string) => void;

  // RRSP States & Ref Setters
  rrspNo: string;
  setRrspNo: (val: string) => void;
  rrspDate: string;
  setRrspDate: (val: string) => void;
  rrspAccountCode: string;
  setRrspAccountCode: (val: string) => void;
  rrspSupplier: string;
  setRrspSupplier: (val: string) => void;
  rrspOrDvNo: string;
  setRrspOrDvNo: (val: string) => void;
  rrspOrDvDate: string;
  setRrspOrDvDate: (val: string) => void;
  rrspReceivedBy: string;
  setRrspReceivedBy: (val: string) => void;
  rrspApprovedBy: string;
  setRrspApprovedBy: (val: string) => void;
  userRole?: string;
}

export const GAMFormsEditor: React.FC<GAMFormsProps> = ({
  isViewOnly,
  reportMode,
  reportRows,
  reportType,
  setReportType,
  reportDate,
  setReportDate,
  fundCluster,
  setFundCluster,
  updateCell,

  spcStockNo,
  setSpcStockNo,
  spcReorderLevel,
  setSpcReorderLevel,
  spcUnitCost,
  setSpcUnitCost,
  spcNotedBy,
  setSpcNotedBy,

  splcStockNo,
  setSplcStockNo,
  splcUnitCost,
  setSplcUnitCost,
  splcAccountCode,
  setSplcAccountCode,
  splcApprovedBy,
  setSplcApprovedBy,

  icsNo,
  setIcsNo,
  icsDateIssued,
  setIcsDateIssued,
  icsEmployeeName,
  setIcsEmployeeName,
  icsEmployeePosition,
  setIcsEmployeePosition,
  icsIssuedBy,
  setIcsIssuedBy,

  regsipPreparedBy,
  setRegsipPreparedBy,
  regsipApprovedBy,
  setRegsipApprovedBy,

  itrNo,
  setItrNo,
  itrDate,
  setItrDate,
  itrFromTransferor,
  setItrFromTransferor,
  itrToTransferee,
  setItrToTransferee,
  itrPurpose,
  setItrPurpose,
  itrType,
  setItrType,
  itrTypeOthers,
  setItrTypeOthers,
  itrApprovedBy,
  setItrApprovedBy,
  itrApprovedPosition,
  setItrApprovedPosition,
  itrFromPosition,
  setItrFromPosition,
  itrToPosition,
  setItrToPosition,

  rrspNo,
  setRrspNo,
  rrspDate,
  setRrspDate,
  rrspAccountCode,
  setRrspAccountCode,
  rrspSupplier,
  setRrspSupplier,
  rrspOrDvNo,
  setRrspOrDvNo,
  rrspOrDvDate,
  setRrspOrDvDate,
  rrspReceivedBy,
  setRrspReceivedBy,
  rrspApprovedBy,
  setRrspApprovedBy,
  onAddRow,
  onDeleteRow,
  userRole,
}) => {
  // Dynamic Role-Based Access Control Rules
  const isModeAuthorized = (mode: string, role: string, viewOnly: boolean): boolean => {
    if (role === 'ACCOUNTING') {
      return ['par', 'ics'].includes(mode);
    } else {
      if (['par', 'ics'].includes(mode)) {
        return viewOnly;
      }
      return ['spc', 'splc', 'regsip', 'itr', 'rrsp'].includes(mode);
    }
  };

  const currentRole = userRole || 'ADMIN';
  const isAuthorized = isModeAuthorized(reportMode, currentRole, isViewOnly);

  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center my-8 bg-red-50/50 rounded-3xl border border-red-100">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h3 className="font-bold text-lg uppercase text-gray-900 tracking-tight mb-1">HTTP 403 FORBIDDEN</h3>
        <p className="text-gray-500 font-medium text-[10px] uppercase tracking-wider">
          Role "{currentRole}" is not authorized to access form "{reportMode?.toUpperCase()}".
        </p>
      </div>
    );
  }

  // Styles for inline editing
  const inputClass = "bg-transparent border-b border-black text-center focus:border-blue-500 font-bold outline-none uppercase px-1 py-0.5 mt-0.5 text-[11pt]";
  const cellInputClass = "w-full bg-transparent border-none outline-none text-center font-bold px-1 whitespace-pre-wrap";

  if (reportMode === 'spc') {
    return (
      <div className="text-[11pt] tracking-normal font-serif leading-normal w-full select-text">
        <div className="text-right italic font-black text-[12pt] mb-2">Appendix 54</div>
        <div className="text-center font-bold text-[10pt] tracking-tight uppercase mb-6 leading-none text-gray-400">
          PROVINCE OF ANTIQUE, MUNICIPALITY OF TIBIAO
        </div>
        <div className="text-center mb-8">
          <h1 className="font-bold text-[18pt] leading-none mb-1 text-black tracking-tight">SUPPLIES PROPERTY CARD</h1>
          <div className="text-[10pt] italic">Municipal Property Office / General Services Department</div>
        </div>

        {/* Form Metadata Section */}
        <div className="grid grid-cols-2 gap-y-4 mb-8 border border-neutral-300 p-4 rounded-xl leading-[1.8]">
          <div className="flex items-center">
            <span className="font-bold mr-2 w-48">Supplies / Item Description:</span>
            {isViewOnly ? (
              <span className="font-black border-b border-black w-72 text-left px-1 uppercase">{reportType || 'TOWEL, COTTON, LARGE'}</span>
            ) : (
              <input
                className={`${inputClass} text-left w-72`}
                value={reportType}
                onChange={e => setReportType(e.target.value.toUpperCase())}
                placeholder="ITEM DESCRIPTION"
              />
            )}
          </div>
          <div className="flex items-center justify-end">
            <span className="font-bold mr-2">Stock No:</span>
            {isViewOnly ? (
              <span className="font-black border-b border-black w-48 text-center px-1">{spcStockNo || 'ST-2024-001'}</span>
            ) : (
              <input
                className={`${inputClass} w-48`}
                value={spcStockNo}
                onChange={e => setSpcStockNo(e.target.value)}
                placeholder="STOCK NO"
              />
            )}
          </div>
          <div className="flex items-center">
            <span className="font-bold mr-2 w-48">Unit of Measure:</span>
            <span className="font-black border-b border-black w-48 text-left px-1 uppercase">
              {reportRows[0]?.unitOfMeasure || 'PIECE'}
            </span>
          </div>
          <div className="flex items-center justify-end">
            <span className="font-bold mr-2">Reorder Point:</span>
            {isViewOnly ? (
              <span className="font-black border-b border-black w-48 text-center px-1">{spcReorderLevel || '20'}</span>
            ) : (
              <input
                className={`${inputClass} w-48`}
                value={spcReorderLevel}
                onChange={e => setSpcReorderLevel(e.target.value)}
                placeholder="REORDER POINT"
              />
            )}
          </div>
          <div className="flex items-center">
            <span className="font-bold mr-2 w-48">Average Unit Cost:</span>
            {isViewOnly ? (
              <span className="font-black border-b border-black w-48 text-left px-1">₱{(spcUnitCost || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
            ) : (
              <input
                type="number"
                className={`${inputClass} text-left w-48`}
                value={spcUnitCost}
                onChange={e => setSpcUnitCost(parseFloat(e.target.value) || 0)}
                placeholder="UNIT COST"
              />
            )}
          </div>
        </div>

        {/* Property Grid Table */}
        <table className="w-full border-collapse border border-black text-[10pt] mb-8 font-serif">
          <thead>
            <tr className="font-bold uppercase text-center bg-gray-50 text-[9pt]">
              <th className="border border-black p-2 w-[12%]" rowSpan={2}>Date</th>
              <th className="border border-black p-2 w-[18%]" rowSpan={2}>Reference / RIS No.</th>
              <th className="border border-black p-1" colSpan={3}>Quantity</th>
              <th className="border border-black p-2 w-[30%]" rowSpan={2}>Remarks / User Department</th>
            </tr>
            <tr className="font-bold uppercase text-center bg-gray-50 text-[8pt]">
              <th className="border border-black p-1 w-[13%]">Receipt Qty</th>
              <th className="border border-black p-1 w-[13%]">Issue Qty</th>
              <th className="border border-black p-1 w-[14%]">Balance Qty</th>
            </tr>
          </thead>
          <tbody>
            {reportRows.length === 0 ? (
              <tr>
                <td className="border border-black p-4 text-center text-gray-400 font-bold" colSpan={6}>
                  No item metadata mapped to Supplies Card. Click "Choose Assets" to populate.
                </td>
              </tr>
            ) : (
              reportRows.map((row, idx) => {
                const totalReceipts = Number(row.qtyPhysicalCount) || 1;
                const shortage = Number(row.shortageQty) || 0;
                const totalIssues = shortage;
                const balance = Number(row.qtyPropertyCard) || Math.max(0, totalReceipts - totalIssues);
                return (
                  <tr key={row.tempId || idx}>
                    <td className="border border-black p-2 text-center">{row.dateAcquired || reportDate}</td>
                    <td className="border border-black p-2 text-center">{row.propertyNumber || 'RIS-2024-001'}</td>
                    <td className="border border-black p-2 text-center font-bold text-emerald-700">{totalReceipts}</td>
                    <td className="border border-black p-2 text-center font-bold text-rose-700">{totalIssues}</td>
                    <td className="border border-black p-2 text-center font-extrabold text-blue-700 bg-blue-50/20">{balance}</td>
                    <td className="border border-black p-2">
                      {isViewOnly ? (
                        <div className="px-1 text-xs whitespace-pre-wrap">{row.remarks || row.article || 'General stock issued'}</div>
                      ) : (
                        <input
                          className={cellInputClass}
                          value={row.remarks || ''}
                          onChange={e => updateCell(row.tempId, 'remarks', e.target.value)}
                          placeholder="Add Remarks..."
                        />
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Footer Signatures */}
        <div className="grid grid-cols-2 gap-12 mt-12 pt-6 border-t border-black/10">
          <div className="text-left font-serif">
            <div className="font-bold italic text-[11pt] mb-12">Prepared By:</div>
            <div className="text-center">
              <span className="font-black border-b border-black px-8 uppercase block text-[13pt] leading-none mb-1">
                LGU PROPERTY CUSTODIAN
              </span>
              <span className="text-[8.5pt] uppercase tracking-widest text-neutral-400 font-bold">Supply Officer / Custodian</span>
            </div>
          </div>
          <div className="text-left font-serif">
            <div className="font-bold italic text-[11pt] mb-12">Noted By:</div>
            <div className="text-center">
              {isViewOnly ? (
                <span className="font-black border-b border-black px-8 uppercase block text-[13pt] leading-none mb-1 min-h-[20px]">
                  {spcNotedBy || 'MARIA S. REYES'}
                </span>
              ) : (
                <input
                  className={`${inputClass} border-b border-black w-full font-black text-center text-[13pt] uppercase mb-1`}
                  value={spcNotedBy}
                  onChange={e => setSpcNotedBy(e.target.value.toUpperCase())}
                  placeholder="NOTED BY SIGNATORY"
                />
              )}
              <span className="text-[8.5pt] uppercase tracking-widest text-neutral-400 font-bold">Head, General Services Dept</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (reportMode === 'splc') {
    return (
      <div className="text-[11pt] tracking-normal font-serif leading-normal w-full select-text">
        <div className="text-right italic font-black text-[12pt] mb-2">Appendix 55</div>
        <div className="text-center font-bold text-[10pt] uppercase mb-6 text-gray-400">
          PROVINCE OF ANTIQUE, MUNICIPALITY OF TIBIAO
        </div>
        <div className="text-center mb-8">
          <h1 className="font-bold text-[18pt] leading-none mb-1 text-black tracking-tight">SUPPLIES LEDGER CARD</h1>
          <div className="text-[10pt] italic">LGU Accounting Unit / General Ledger Ledger Division</div>
        </div>

        {/* Form Metadata Section */}
        <div className="grid grid-cols-2 gap-y-4 mb-8 border border-neutral-300 p-4 rounded-xl leading-[1.8]">
          <div className="flex items-center">
            <span className="font-bold mr-2 w-48">Description of Supplies:</span>
            {isViewOnly ? (
              <span className="font-black border-b border-black w-72 text-left px-1 uppercase">{reportType || 'OFFICE PAPER A4'}</span>
            ) : (
              <input
                className={`${inputClass} text-left w-72`}
                value={reportType}
                onChange={e => setReportType(e.target.value.toUpperCase())}
                placeholder="ITEM DESCRIPTION"
              />
            )}
          </div>
          <div className="flex items-center justify-end">
            <span className="font-bold mr-2">Stock No:</span>
            {isViewOnly ? (
              <span className="font-black border-b border-black w-48 text-center px-1">{splcStockNo || 'ST-2024-001'}</span>
            ) : (
              <input
                className={`${inputClass} w-48`}
                value={splcStockNo}
                onChange={e => setSplcStockNo(e.target.value)}
                placeholder="STOCK NO"
              />
            )}
          </div>
          <div className="flex items-center">
            <span className="font-bold mr-2 w-48">GL Account Code:</span>
            {isViewOnly ? (
              <span className="font-black border-b border-black w-48 text-left px-1 text-blue-700">{splcAccountCode || '5020401002'}</span>
            ) : (
              <input
                className={`${inputClass} text-left text-blue-700 w-48`}
                value={splcAccountCode}
                onChange={e => setSplcAccountCode(e.target.value)}
                placeholder="ACCOUNT CODE"
              />
            )}
          </div>
          <div className="flex items-center justify-end">
            <span className="font-bold mr-2">Est. Average Unit Cost:</span>
            {isViewOnly ? (
              <span className="font-black border-b border-black w-48 text-center px-1">₱{(splcUnitCost || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
            ) : (
              <input
                type="number"
                className={`${inputClass} w-48`}
                value={splcUnitCost}
                onChange={e => setSplcUnitCost(parseFloat(e.target.value) || 0)}
                placeholder="EST UNIT COST"
              />
            )}
          </div>
        </div>

        {/* ledger Grid Table */}
        <table className="w-full border-collapse border border-black text-[9.5pt] mb-8 font-serif">
          <thead>
            <tr className="font-bold uppercase text-center bg-gray-50">
              <th className="border border-black p-2 w-[10%]" rowSpan={2}>Date</th>
              <th className="border border-black p-2 w-[14%]" rowSpan={2}>Reference No</th>
              <th className="border border-black p-1" colSpan={3}>Receipts</th>
              <th className="border border-black p-1" colSpan={3}>Issues</th>
              <th className="border border-black p-1" colSpan={2}>Balance</th>
            </tr>
            <tr className="font-bold uppercase text-center bg-gray-50 text-[8pt]">
              <th className="border border-black p-1 w-[9%]">Qty</th>
              <th className="border border-black p-1 w-[9%]">Unit Cost</th>
              <th className="border border-black p-1 w-[11%]">Total Amount</th>
              <th className="border border-black p-1 w-[9%]">Qty</th>
              <th className="border border-black p-1 w-[9%]">Unit Cost</th>
              <th className="border border-black p-1 w-[11%]">Total Amount</th>
              <th className="border border-black p-1 w-[9%]">Qty</th>
              <th className="border border-black p-1 w-[11%]">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            {reportRows.length === 0 ? (
              <tr>
                <td className="border border-black p-4 text-center text-gray-400 font-bold" colSpan={10}>
                  No items in report snapshot. Use asset selection first.
                </td>
              </tr>
            ) : (
              reportRows.map((row, idx) => {
                const rQty = Number(row.qtyPhysicalCount) || 1;
                const rUcost = Number(row.unitValue) || splcUnitCost || 0;
                const rTotal = rQty * rUcost;
                
                const iQty = Number(row.shortageQty) || 0;
                const iTotal = iQty * rUcost;

                const bQty = Number(row.qtyPropertyCard) || Math.max(0, rQty - iQty);
                const bTotal = bQty * rUcost;
                return (
                  <tr key={row.tempId || idx}>
                    <td className="border border-black p-1 text-center">{row.dateAcquired || reportDate}</td>
                    <td className="border border-black p-1 text-center font-mono">{row.propertyNumber || 'OR-00213'}</td>
                    <td className="border border-black p-1 text-center text-emerald-700 font-bold">{rQty}</td>
                    <td className="border border-black p-1 text-right">₱{rUcost.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                    <td className="border border-black p-1 text-right bg-emerald-50/10">₱{rTotal.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                    <td className="border border-black p-1 text-center text-rose-700 font-bold">{iQty || '-'}</td>
                    <td className="border border-black p-1 text-right">{iQty > 0 ? `₱${rUcost.toLocaleString(undefined, {minimumFractionDigits:2})}` : '-'}</td>
                    <td className="border border-black p-1 text-right text-rose-700">{iQty > 0 ? `₱${iTotal.toLocaleString(undefined, {minimumFractionDigits:2})}` : '-'}</td>
                    <td className="border border-black p-1 text-center font-extrabold text-blue-700 bg-blue-50/15">{bQty}</td>
                    <td className="border border-black p-1 text-right text-blue-700 bg-blue-50/20 font-bold">₱{bTotal.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-12 mt-12 pt-6 border-t border-black/10">
          <div className="text-left font-serif">
            <div className="font-bold italic text-[11pt] mb-12">Certified Prepared:</div>
            <div className="text-center">
              <span className="font-black border-b border-black px-8 uppercase block text-[13pt] mb-1 leading-none">
                LGU ACCOUNTING CLERK
              </span>
              <span className="text-[8.5pt] uppercase tracking-widest text-neutral-400 font-bold">Bookkeeper / Accounting Dept</span>
            </div>
          </div>
          <div className="text-left font-serif">
            <div className="font-bold italic text-[11pt] mb-12">Approved / Noted:</div>
            <div className="text-center">
              {isViewOnly ? (
                <span className="font-black border-b border-black px-8 uppercase block text-[13pt] leading-none mb-1 min-h-[20px]">
                  {splcApprovedBy || 'MARIA S. REYES'}
                </span>
              ) : (
                <input
                  className={`${inputClass} border-b border-black w-full font-black text-center text-[13pt] uppercase mb-1`}
                  value={splcApprovedBy}
                  onChange={e => setSplcApprovedBy(e.target.value.toUpperCase())}
                  placeholder="APPROVED BY SIGNATORY"
                />
              )}
              <span className="text-[8.5pt] uppercase tracking-widest text-neutral-400 font-bold">Municipal Accountant</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (reportMode === 'ics') {
    return (
      <div className="text-[11pt] tracking-normal font-serif leading-tight w-full select-text">
        <div className="text-right italic font-black text-[12pt] mb-2">Appendix 59</div>
        <div className="text-center font-bold text-[10pt] uppercase mb-6 text-gray-400">
          PROVINCE OF ANTIQUE, MUNICIPALITY OF TIBIAO
        </div>
        <div className="text-center mb-10">
          <h1 className="font-bold text-[19pt] leading-none mb-1 text-black tracking-tight">INVENTORY CUSTODIAN SLIP</h1>
          <div className="text-[10pt] italic">Required for LGU Semi-Expendable Items Under ₱50,000 threshold</div>
        </div>

        {/* Slip Metadata section */}
        <div className="flex flex-wrap justify-between items-center mb-8 gap-4 border border-teal-200/50 bg-teal-50/10 p-4 rounded-2xl">
          <div className="flex items-center">
            <span className="font-bold mr-2 text-teal-850">ICS No:</span>
            {isViewOnly ? (
              <span className="font-black border-b border-black px-4 min-w-[200px] text-center">{icsNo || 'ICS-2024-001'}</span>
            ) : (
              <input
                className={`${inputClass} text-teal-900 min-w-[200px]`}
                value={icsNo}
                onChange={e => setIcsNo(e.target.value)}
                placeholder="ICS NUMBER"
              />
            )}
          </div>
          <div className="flex items-center">
            <span className="font-bold mr-2 text-teal-850">LGU Cluster:</span>
            <span className="font-black border-b border-black px-4 text-center text-indigo-700">{fundCluster || 'GENERAL FUND (01)'}</span>
          </div>
          <div className="flex items-center">
            <span className="font-bold mr-2 text-teal-850">Date Issued:</span>
            {isViewOnly ? (
              <span className="font-black border-b border-black px-4 min-w-[180px] text-center">{icsDateIssued || 'Jan 10, 2024'}</span>
            ) : (
              <input
                className={`${inputClass} min-w-[180px]`}
                value={icsDateIssued}
                onChange={e => setIcsDateIssued(e.target.value)}
                placeholder="DATE"
              />
            )}
          </div>
        </div>

        {/* Main ICS Registry Table */}
        <table className="w-full border-collapse border border-black text-[10pt] mb-8 font-serif">
          <thead>
            <tr className="font-bold uppercase text-center bg-gray-50 text-[9pt]">
              <th className="border border-black p-2 w-[8%]">Quantity</th>
              <th className="border border-black p-2 w-[10%]">Unit</th>
              <th className="border border-black p-2 w-[14%]">Amount / Value</th>
              <th className="border border-black p-2 w-[35%]">Description (Article Name & Specifications)</th>
              <th className="border border-black p-2 w-[18%]">Inventory Property No.</th>
              <th className="border border-black p-2 w-[15%]">Est. Useful Life</th>
            </tr>
          </thead>
          <tbody>
            {reportRows.length === 0 ? (
              <tr>
                <td className="border border-black p-4 text-center text-gray-400 font-bold" colSpan={6}>
                  No semi-expendable assets added to this Slip.
                </td>
              </tr>
            ) : (
              reportRows.map((row, idx) => {
                const cleanQty = Number(row.qtyPhysicalCount) || 1;
                const cleanPrice = Number(row.unitValue) || 0;
                return (
                  <tr key={row.tempId || idx}>
                    <td className="border border-black p-2 text-center font-bold">{cleanQty}</td>
                    <td className="border border-black p-2 text-center font-bold uppercase">{row.unitOfMeasure || 'PC'}</td>
                    <td className="border border-black p-2 text-right font-bold">₱{cleanPrice.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                    <td className="border border-black p-2 uppercase text-left pl-3">
                      <div className="font-bold">{row.article || 'OFFICE EQUIPMENT'}</div>
                      <div className="text-[8.5pt] text-gray-500 lowercase normal-case">{row.description || 'no specifications added'}</div>
                    </td>
                    <td className="border border-black p-2 text-center font-mono text-sm">{row.propertyNumber || 'PR-2024-0012'}</td>
                    <td className="border border-black p-2 text-center">3 to 5 Years</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Double Signature Columns block */}
        <table className="w-full border-collapse border border-black text-[10pt] leading-normal font-serif">
          <tbody>
            <tr>
              <td className="border border-black p-4 w-1/2 text-left vertical-top" style={{ verticalAlign: 'top' }}>
                <p className="font-bold italic text-[11pt] mb-12">Received By (LGU Custodian Employee):</p>
                <div className="text-center mt-6">
                  {isViewOnly ? (
                    <span className="font-black border-b border-black text-center px-4 w-full block uppercase text-[12pt] mb-1 min-h-[20px]">
                      {icsEmployeeName || 'JUAN DELA CRUZ'}
                    </span>
                  ) : (
                    <input
                      className={`${inputClass} w-full text-center text-[12pt] mb-1`}
                      value={icsEmployeeName}
                      onChange={e => setIcsEmployeeName(e.target.value.toUpperCase())}
                      placeholder="EMPLOYEE PRINTED NAME"
                    />
                  )}
                  {isViewOnly ? (
                    <span className="text-[8.5pt] uppercase text-gray-500 font-bold antialiased block">{icsEmployeePosition || 'Administrative Aide VI'}</span>
                  ) : (
                    <input
                      className={`${inputClass} w-full text-center !text-[8.5pt] !text-gray-500 lowercase normal-case !font-bold pt-0.5 border-none`}
                      value={icsEmployeePosition}
                      onChange={e => setIcsEmployeePosition(e.target.value)}
                      placeholder="Employee Position/Department"
                    />
                  )}
                  <span className="text-[7.5pt] uppercase tracking-widest text-neutral-400 font-bold block border-t border-neutral-250 mt-4 pt-1">Signature over Printed Name</span>
                </div>
              </td>
              <td className="border border-black p-4 w-1/2 text-left vertical-top" style={{ verticalAlign: 'top' }}>
                <p className="font-bold italic text-[11pt] mb-12">Received From (Supply Officer):</p>
                <div className="text-center mt-6">
                  {isViewOnly ? (
                    <span className="font-black border-b border-black text-center px-4 w-full block uppercase text-[12pt] mb-1 min-h-[20px]">
                      {icsIssuedBy || 'MARIA S. REYES'}
                    </span>
                  ) : (
                    <input
                      className={`${inputClass} w-full text-center text-[12pt] mb-1`}
                      value={icsIssuedBy}
                      onChange={e => setIcsIssuedBy(e.target.value.toUpperCase())}
                      placeholder="ISSUED BY (SUPPLY CUSTODIAN)"
                    />
                  )}
                  <span className="text-[8.5pt] uppercase text-gray-500 font-bold antialiased block">Supply Officer II / Custodian</span>
                  <span className="text-[7.5pt] uppercase tracking-widest text-neutral-400 font-bold block border-t border-neutral-250 mt-4 pt-1">Signature over Printed Name</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  if (reportMode === 'par') {
    // Split the items into PAR and ICS sections
    const parItems = reportRows.filter(row => !row.propertyNumber?.includes('ICS') && !row.remarks?.includes('ICS'));
    const icsItems = reportRows.filter(row => row.propertyNumber?.includes('ICS') || row.remarks?.includes('ICS'));

    return (
      <div className="space-y-12 select-text font-serif">
        {/* ========================================================================= */}
        {/* PAR SECTION - PROPERTY ACKNOWLEDGEMENT RECEIPT */}
        {/* ========================================================================= */}
        <div className="bg-white border-2 border-neutral-800 p-8 shadow-md rounded-[32px] text-[10pt] tracking-normal leading-tight w-full max-w-5xl mx-auto relative">
          <div className="absolute top-4 right-6 italic font-black text-[12pt] text-neutral-400">Annex B</div>
          
          {/* Header */}
          <div className="text-center mb-6 border-b border-neutral-300 pb-4">
            <div className="text-gray-500 font-bold text-[9pt] uppercase tracking-wider">Republic of the Philippines</div>
            <div className="text-gray-600 italic text-[8.5pt]">Province of Antique</div>
            <div className="text-neutral-800 font-bold text-[12pt] uppercase tracking-normal">MUNICIPALITY OF TIBIAO</div>
            <div className="text-indigo-900 font-bold text-[10pt] uppercase tracking-wider mt-1">MDRRMO / OFFICE OF EMERGENCY MANAGEMENT</div>
            
            <h1 className="font-extrabold text-[19pt] leading-none mt-4 text-black tracking-tight uppercase">PROPERTY ACKNOWLEDGEMENT RECEIPT</h1>
            <div className="text-[8.5pt] text-gray-500 italic mt-1">Required for LGU Equipment with acquisition cost exceeding threshold</div>
          </div>

          {/* PAR Metadata section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 border-2 border-dashed border-neutral-255 p-4 rounded-2xl bg-neutral-50/50">
            <div className="flex items-center">
              <span className="font-bold mr-2 text-neutral-700 text-sm">Entity Name:</span>
              <span className="font-black border-b border-black px-2 flex-grow text-xs text-neutral-800">MUNICIPALITY OF TIBIAO / MDRRMO</span>
            </div>
            <div className="flex items-center">
              <span className="font-bold mr-2 text-neutral-700 text-sm">Fund Cluster:</span>
              {isViewOnly ? (
                <span className="font-black border-b border-black px-2 flex-grow text-center text-xs text-indigo-700">{fundCluster || 'GENERAL FUND (01)'}</span>
              ) : (
                <input
                  className="bg-transparent border-b border-black text-center focus:border-blue-500 font-bold outline-none uppercase px-1 text-xs text-indigo-700 flex-grow"
                  value={fundCluster}
                  onChange={e => setFundCluster(e.target.value)}
                  placeholder="Fund Cluster"
                />
              )}
            </div>
            <div className="flex items-center">
              <span className="font-bold mr-2 text-neutral-700 text-sm">PAR No:</span>
              {isViewOnly ? (
                <span className="font-black border-b border-black px-2 flex-grow text-center text-xs text-neutral-800">{icsNo || 'MDRRMO-PAR-2024-001'}</span>
              ) : (
                <input
                  className="bg-transparent border-b border-black text-center focus:border-blue-500 font-bold outline-none uppercase px-1 text-xs text-neutral-800 flex-grow"
                  value={icsNo}
                  onChange={e => setIcsNo(e.target.value)}
                  placeholder="PAR NUMBER"
                />
              )}
            </div>
          </div>

          {/* PAR Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-black text-[9pt] mb-4 font-serif">
              <thead>
                <tr className="font-bold uppercase text-center bg-gray-100 text-[8pt]">
                  <th className="border border-black p-2 w-[8%]">Quantity</th>
                  <th className="border border-black p-2 w-[10%]">Unit</th>
                  <th className="border border-black p-2 w-[42%]">Description</th>
                  <th className="border border-black p-2 w-[16%]">Property Number</th>
                  <th className="border border-black p-2 w-[12%]">Date Acquired</th>
                  <th className="border border-black p-2 w-[12%]">Amount</th>
                  {!isViewOnly && <th className="border border-black p-2 w-[6%] no-print">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {parItems.length === 0 ? (
                  <tr>
                    <td className="border border-black p-4 text-center text-gray-400 font-bold" colSpan={isViewOnly ? 6 : 7}>
                      No PAR equipment added.
                    </td>
                  </tr>
                ) : (
                  parItems.map((row, idx) => {
                    const cleanQty = Number(row.qtyPhysicalCount) || 1;
                    const cleanPrice = Number(row.unitValue) || 0;
                    const totalVal = cleanQty * cleanPrice;
                    return (
                      <tr key={row.tempId || idx} className="hover:bg-neutral-50/40 relative group">
                        {/* Qty */}
                        <td className="border border-black p-1 text-center font-bold">
                          {isViewOnly ? (
                            cleanQty
                          ) : (
                            <input
                              type="number"
                              className="w-full bg-transparent text-center font-bold outline-none"
                              value={row.qtyPhysicalCount}
                              onChange={e => updateCell(row.tempId, 'qtyPhysicalCount', Number(e.target.value))}
                            />
                          )}
                        </td>
                        
                        {/* Unit */}
                        <td className="border border-black p-1 text-center uppercase text-[8.5pt]">
                          {isViewOnly ? (
                            row.unitOfMeasure || 'unit'
                          ) : (
                            <input
                              className="w-full bg-transparent text-center font-semibold uppercase outline-none"
                              value={row.unitOfMeasure}
                              onChange={e => updateCell(row.tempId, 'unitOfMeasure', e.target.value)}
                            />
                          )}
                        </td>

                        {/* Description */}
                        <td className="border border-black p-1 pl-3 text-left">
                          {isViewOnly ? (
                            <div>
                              <div className="font-bold text-neutral-850 uppercase text-[9pt]">{row.article || 'OFFICE EQUIPMENT'}</div>
                              <div className="text-[8pt] text-gray-500 font-sans mt-0.5 whitespace-pre-wrap">{row.description || 'No detailed specifications.'}</div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <input
                                className="w-full bg-transparent font-bold text-neutral-850 uppercase outline-none focus:border-b focus:border-indigo-400"
                                value={row.article}
                                onChange={e => updateCell(row.tempId, 'article', e.target.value)}
                                placeholder="Article Name"
                              />
                              <textarea
                                className="w-full bg-transparent text-[8pt] text-gray-600 font-sans outline-none focus:border-b focus:border-indigo-450 resize-none h-12"
                                value={row.description}
                                onChange={e => updateCell(row.tempId, 'description', e.target.value)}
                                placeholder="Detailed specs..."
                              />
                            </div>
                          )}
                        </td>

                        {/* Property Number */}
                        <td className="border border-black p-1 text-center font-mono text-[8pt]">
                          {isViewOnly ? (
                            row.propertyNumber || 'Pending'
                          ) : (
                            <input
                              className="w-full bg-transparent text-center font-mono outline-none"
                              value={row.propertyNumber}
                              onChange={e => updateCell(row.tempId, 'propertyNumber', e.target.value)}
                              placeholder="Property Number"
                            />
                          )}
                        </td>

                        {/* Date Acquired */}
                        <td className="border border-black p-1 text-center text-[8pt]">
                          {isViewOnly ? (
                            row.dateAcquired || row.acquisitionDate || 'N/A'
                          ) : (
                            <input
                              className="w-full bg-transparent text-center outline-none"
                              value={row.dateAcquired || row.acquisitionDate || ''}
                              onChange={e => updateCell(row.tempId, 'dateAcquired', e.target.value)}
                              placeholder="MM/DD/YYYY"
                            />
                          )}
                        </td>

                        {/* Amount */}
                        <td className="border border-black p-1 text-right font-bold text-neutral-800 pr-2">
                          {isViewOnly ? (
                            cleanPrice > 0 ? `₱${totalVal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '-'
                          ) : (
                            <div className="flex items-center justify-end">
                              <span className="text-gray-400 mr-0.5 text-[8.5pt]">₱</span>
                              <input
                                type="number"
                                className="w-20 bg-transparent text-right font-bold outline-none"
                                value={row.unitValue}
                                onChange={e => updateCell(row.tempId, 'unitValue', Number(e.target.value))}
                              />
                            </div>
                          )}
                        </td>

                        {/* Actions column if editable & not official */}
                        {!isViewOnly && (
                          <td className="border border-black p-1 text-center no-print">
                            {row.isFixed ? (
                              <span className="text-[7.5pt] px-1.5 py-0.5 bg-neutral-100 text-neutral-500 font-sans rounded-full uppercase font-bold" title="Official LGU Master Data Core Row is Protected from removal">Official</span>
                            ) : (
                              <button
                                onClick={() => onDeleteRow && onDeleteRow(row.tempId)}
                                className="text-red-500 hover:text-red-700 hover:scale-105 active:scale-95 transition-all p-1"
                                title="Remove added item"
                              >
                                <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
                
                {/* Visual Empty Rows like Grid lines in the image */}
                {Array.from({ length: Math.max(1, 4 - parItems.length) }).map((_, idx) => (
                  <tr key={`empty-par-${idx}`} style={{ height: '24px' }} className="opacity-40">
                    <td className="border border-black">&nbsp;</td>
                    <td className="border border-black">&nbsp;</td>
                    <td className="border border-black">&nbsp;</td>
                    <td className="border border-black">&nbsp;</td>
                    <td className="border border-black">&nbsp;</td>
                    <td className="border border-black">&nbsp;</td>
                    {!isViewOnly && <td className="border border-black no-print">&nbsp;</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add custom PAR item button inside sheet */}
          {!isViewOnly && onAddRow && (
            <div className="flex justify-start mb-6 no-print">
              <button
                type="button"
                onClick={() => onAddRow('par')}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[9px] uppercase tracking-widest rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95 flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                Add Custom PAR Registry Line
              </button>
            </div>
          )}

          {/* Dual Signatures block for PAR */}
          <table className="w-full border-collapse border border-black text-[10pt] leading-normal font-serif page-break-inside-avoid">
            <tbody>
              <tr>
                <td className="border border-black p-4 w-1/2 text-left" style={{ verticalAlign: 'top' }}>
                  <p className="font-bold italic text-[11pt] mb-12">Received By:</p>
                  <div className="text-center mt-6">
                    {isViewOnly ? (
                      <span className="font-extrabold border-b border-black text-center px-4 w-full block uppercase text-[11pt] mb-0.5 min-h-[22px]">
                        {icsEmployeeName || 'NORMAN I. ALABADO'}
                      </span>
                    ) : (
                      <input
                        className="bg-transparent border-b border-black text-center focus:border-blue-500 font-extrabold outline-none uppercase px-1 text-[11pt] mb-0.5 w-full block"
                        value={icsEmployeeName}
                        onChange={e => setIcsEmployeeName(e.target.value.toUpperCase())}
                        placeholder="End-User / Accountable Recipient"
                      />
                    )}
                    {isViewOnly ? (
                      <span className="text-[8.5pt] uppercase text-gray-500 font-bold antialiased block">{icsEmployeePosition || 'LDRRMO II/ MDRRMO'}</span>
                    ) : (
                      <input
                        className="bg-transparent text-center text-[8.5pt] text-gray-500 outline-none w-full block font-bold pt-0.5"
                        value={icsEmployeePosition}
                        onChange={e => setIcsEmployeePosition(e.target.value)}
                        placeholder="Employee Position/Department"
                      />
                    )}
                    <span className="text-[7.5pt] uppercase tracking-widest text-neutral-400 font-bold block border-t border-neutral-250 mt-4 pt-1">Signature over Printed Name of End User</span>
                  </div>
                </td>
                <td className="border border-black p-4 w-1/2 text-left" style={{ verticalAlign: 'top' }}>
                  <p className="font-bold italic text-[11pt] mb-12">Issued By:</p>
                  <div className="text-center mt-6">
                    {isViewOnly ? (
                      <span className="font-extrabold border-b border-black text-center px-4 w-full block uppercase text-[11pt] mb-0.5 min-h-[22px]">
                        {icsIssuedBy || 'CLEMENS G. BANDOJA'}
                      </span>
                    ) : (
                      <input
                        className="bg-transparent border-b border-black text-center focus:border-blue-550 font-extrabold outline-none uppercase px-1 text-[11pt] mb-0.5 w-full block"
                        value={icsIssuedBy}
                        onChange={e => setIcsIssuedBy(e.target.value.toUpperCase())}
                        placeholder="Supply Officer / Custodian Signatory"
                      />
                    )}
                    <span className="text-[8.5pt] uppercase text-gray-500 font-bold antialiased block">Supply and/or Property Custodian</span>
                    <span className="text-[7.5pt] uppercase tracking-widest text-neutral-400 font-bold block border-t border-neutral-250 mt-4 pt-1">Signature over Printed Name</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ========================================================================= */}
        {/* INTER-SLIP DIVIDER */}
        {/* ========================================================================= */}
        <div className="relative py-4 no-print flex items-center justify-center">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t-2 border-dashed border-gray-300"></span></div>
          <span className="relative bg-neutral-100 px-6 py-2 rounded-full text-[9px] font-black uppercase tracking-widest text-gray-500 border border-gray-200">
            ✂️ Printable Form Partition (Unified Registry Page)
          </span>
        </div>

        {/* ========================================================================= */}
        {/* ICS SECTION - INVENTORY CUSTODIAN SLIP */}
        {/* ========================================================================= */}
        <div className="bg-white border-2 border-neutral-800 p-8 shadow-md rounded-[32px] text-[10pt] tracking-normal leading-tight w-full max-w-5xl mx-auto relative page-break-before-always">
          <div className="absolute top-4 right-6 italic font-black text-[12pt] text-neutral-400">Appendix 59</div>
          
          {/* Header */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-neutral-300 pb-4 mb-6">
            <div className="flex items-center gap-4">
              {/* Retro Graphic emblem mimicking the official round seal */}
              <div className="w-14 h-14 rounded-full border-2 border-neutral-700 flex items-center justify-center font-black text-[10px] text-neutral-600 tracking-tighter uppercase p-1 text-center leading-none">
                Official Seal
              </div>
              <div className="text-left font-serif">
                <div className="text-gray-500 font-bold text-[8.5pt] uppercase">Republic of the Philippines</div>
                <div className="text-gray-650 italic text-[8.5pt]">Province of Antique</div>
                <div className="text-neutral-900 font-black text-[11.5pt] uppercase">MUNICIPALITY OF TIBIAO</div>
              </div>
            </div>
            
            <div className="text-right md:text-right">
              <h1 className="font-extrabold text-[17pt] text-black tracking-tight uppercase leading-none">INVENTORY CUSTODIAN SLIP</h1>
              <div className="text-[8.5pt] text-gray-500 italic mt-1 font-sans">Semi-Expendable Property Issued Ledger</div>
            </div>
          </div>

          {/* ICS Metadata section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 border-2 border-dashed border-neutral-255 p-4 rounded-2xl bg-neutral-50/50">
            <div className="flex items-center">
              <span className="font-bold mr-2 text-neutral-700 text-sm">Entity Name:</span>
              <span className="font-black border-b border-black px-2 flex-grow text-xs text-neutral-800">MUNICIPALITY OF TIBIAO / MDRRMO</span>
            </div>
            <div className="flex items-center">
              <span className="font-bold mr-2 text-neutral-700 text-sm">Fund Cluster:</span>
              <span className="font-black border-b border-black px-2 flex-grow text-xs text-indigo-700">{fundCluster || 'GENERAL FUND (01)'}</span>
            </div>
            <div className="flex items-center">
              <span className="font-bold mr-2 text-neutral-700 text-sm">ICS No:</span>
              <span className="font-black border-b border-black px-2 flex-grow text-center text-xs text-neutral-800">MDRRMO-ICS-{icsNo ? icsNo.replace(/[^0-9]/g, '') : '2024-001'}</span>
            </div>
          </div>

          {/* ICS Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-black text-[9pt] mb-4 font-serif">
              <thead>
                <tr className="font-bold uppercase text-center bg-gray-100 text-[8pt]">
                  <th className="border border-black p-2 w-[8%]">Quantity</th>
                  <th className="border border-black p-2 w-[10%]">Unit</th>
                  <th className="border border-black p-2 w-[52%]">Description</th>
                  <th className="border border-black p-2 w-[16%]">Inventory Item No.</th>
                  <th className="border border-black p-2 w-[14%]">Est. Useful Life</th>
                  {!isViewOnly && <th className="border border-black p-2 w-[6%] no-print">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {icsItems.length === 0 ? (
                  <tr>
                    <td className="border border-black p-4 text-center text-gray-400 font-bold" colSpan={isViewOnly ? 5 : 6}>
                       No semi-expendable assets added.
                    </td>
                  </tr>
                ) : (
                  icsItems.map((row, idx) => {
                    const cleanQty = Number(row.qtyPhysicalCount) || row.qtyPropertyCard || 1;
                    const useful = row.usefulLife || 'N/A';
                    return (
                      <tr key={row.tempId || idx} className="hover:bg-neutral-50/40 relative group">
                        {/* Qty */}
                        <td className="border border-black p-1 text-center font-bold">
                          {isViewOnly ? (
                            cleanQty
                          ) : (
                            <input
                              type="number"
                              className="w-full bg-transparent text-center font-bold outline-none"
                              value={row.qtyPhysicalCount}
                              onChange={e => updateCell(row.tempId, 'qtyPhysicalCount', Number(e.target.value))}
                            />
                          )}
                        </td>
                        
                        {/* Unit */}
                        <td className="border border-black p-1 text-center uppercase text-[8.5pt]">
                          {isViewOnly ? (
                            row.unitOfMeasure || 'unit'
                          ) : (
                            <input
                              className="w-full bg-transparent text-center font-semibold uppercase outline-none"
                              value={row.unitOfMeasure}
                              onChange={e => updateCell(row.tempId, 'unitOfMeasure', e.target.value)}
                            />
                          )}
                        </td>

                        {/* Description */}
                        <td className="border border-black p-1 pl-3 text-left">
                          {isViewOnly ? (
                            <div>
                              <div className="font-bold text-neutral-850 uppercase text-[9pt]">{row.article || 'SEMI-EXPENDABLE PROPERTY'}</div>
                              <div className="text-[8pt] text-gray-500 font-sans mt-0.5">{row.description || 'No detailed specifications loaded.'}</div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <input
                                className="w-full bg-transparent font-bold text-neutral-850 uppercase outline-none focus:border-b focus:border-indigo-400"
                                value={row.article}
                                onChange={e => updateCell(row.tempId, 'article', e.target.value)}
                                placeholder="Article Name"
                              />
                              <textarea
                                className="w-full bg-transparent text-[8pt] text-gray-600 font-sans outline-none focus:border-b focus:border-indigo-455 h-10 resize-none"
                                value={row.description}
                                onChange={e => updateCell(row.tempId, 'description', e.target.value)}
                                placeholder="Specs..."
                              />
                            </div>
                          )}
                        </td>

                        {/* Inventory Item No */}
                        <td className="border border-black p-1 text-center font-mono text-[8pt]">
                          {isViewOnly ? (
                            row.propertyNumber || 'Pending'
                          ) : (
                            <input
                              className="w-full bg-transparent text-center font-mono outline-none"
                              value={row.propertyNumber}
                              onChange={e => updateCell(row.tempId, 'propertyNumber', e.target.value)}
                              placeholder="Inventory No."
                            />
                          )}
                        </td>

                        {/* Useful Life */}
                        <td className="border border-black p-1 text-center text-[8pt]">
                          {isViewOnly ? (
                            useful !== 'N/A' ? `${useful} yrs` : 'N/A'
                          ) : (
                            <input
                              className="w-full bg-transparent text-center outline-none"
                              value={row.usefulLife || ''}
                              onChange={e => updateCell(row.tempId, 'usefulLife', Number(e.target.value))}
                              placeholder="Yrs"
                            />
                          )}
                        </td>

                        {/* Actions column if editable & not official */}
                        {!isViewOnly && (
                          <td className="border border-black p-1 text-center no-print">
                            {row.isFixed ? (
                              <span className="text-[7.5pt] px-1.5 py-0.5 bg-neutral-100 text-neutral-500 font-sans rounded-full uppercase font-bold" title="Official LGU Master Data Core Row is Protected from removal">Official</span>
                            ) : (
                              <button
                                onClick={() => onDeleteRow && onDeleteRow(row.tempId)}
                                className="text-red-500 hover:text-red-700 hover:scale-105 active:scale-95 transition-all p-1"
                                title="Remove added item"
                              >
                                <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
                
                {/* Visual Empty Rows like Grid lines in the image */}
                {Array.from({ length: Math.max(1, 3 - icsItems.length) }).map((_, idx) => (
                  <tr key={`empty-ics-${idx}`} style={{ height: '24px' }} className="opacity-40">
                    <td className="border border-black">&nbsp;</td>
                    <td className="border border-black">&nbsp;</td>
                    <td className="border border-black">&nbsp;</td>
                    <td className="border border-black">&nbsp;</td>
                    <td className="border border-black">&nbsp;</td>
                    {!isViewOnly && <td className="border border-black no-print">&nbsp;</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add custom ICS item button inside sheet */}
          {!isViewOnly && onAddRow && (
            <div className="flex justify-start mb-6 no-print">
              <button
                type="button"
                onClick={() => onAddRow('ics')}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[9px] uppercase tracking-widest rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95 flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                Add Custom ICS Registry Line
              </button>
            </div>
          )}

          {/* Dual Signatures block for ICS */}
          <table className="w-full border-collapse border border-black text-[10pt] leading-normal font-serif page-break-inside-avoid">
            <tbody>
              <tr>
                <td className="border border-black p-4 w-1/2 text-left" style={{ verticalAlign: 'top' }}>
                  <p className="font-bold italic text-[11pt] mb-12">Received By:</p>
                  <div className="text-center mt-6">
                    <span className="font-extrabold border-b border-black text-center px-4 w-full block uppercase text-[11pt] mb-0.5 min-h-[22px]">
                      {icsEmployeeName || 'NORMAN I. ALABADO'}
                    </span>
                    <span className="text-[8.5pt] uppercase text-gray-500 font-bold antialiased block">{icsEmployeePosition || 'LDRRMO II/ MDRRMO'}</span>
                    <span className="text-[7.5pt] uppercase tracking-widest text-neutral-400 font-bold block border-t border-neutral-250 mt-4 pt-1">Signature over Printed Name of End User</span>
                  </div>
                </td>
                <td className="border border-black p-4 w-1/2 text-left" style={{ verticalAlign: 'top' }}>
                  <p className="font-bold italic text-[11pt] mb-12">Released / Issued By:</p>
                  <div className="text-center mt-6">
                    <span className="font-extrabold border-b border-black text-center px-4 w-full block uppercase text-[11pt] mb-0.5 min-h-[22px]">
                      {icsIssuedBy || 'CLEMENS G. BANDOJA'}
                    </span>
                    <span className="text-[8.5pt] uppercase text-gray-500 font-bold antialiased block">Supply Officer / properties Representative</span>
                    <span className="text-[7.5pt] uppercase tracking-widest text-neutral-400 font-bold block border-t border-neutral-250 mt-4 pt-1">Signature over Printed Name</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (reportMode === 'regsip') {
    return (
      <div className="text-[11pt] tracking-normal font-serif leading-normal w-full select-text">
        <div className="text-right italic font-black text-[12pt] mb-2">Appendix 64</div>
        <div className="text-center font-bold text-[10pt] uppercase mb-6 text-gray-400">
          PROVINCE OF ANTIQUE, MUNICIPALITY OF TIBIAO
        </div>
        <div className="text-center mb-8">
          <h1 className="font-bold text-[18pt] leading-none mb-1 text-black tracking-tight uppercase">Registry of Semi-Expendable Property Issued</h1>
          <div className="text-[10pt] italic">Control Registry Log (REG-SIP) - High Value Office Ledger</div>
        </div>

        {/* Parameters Section */}
        <div className="flex justify-between items-baseline mb-6 border-b border-black pb-2 text-[11pt]">
          <div><span className="font-bold">LGU Office:</span> <span className="uppercase font-bold text-blue-700">{reportRows[0]?.officeAssociated || 'GENERAL SERVICES'}</span></div>
          <div><span className="font-bold">Date of Audit:</span> <span className="font-bold">{reportDate || 'December 31, 2024'}</span></div>
        </div>

        {/* Control grid Table */}
        <table className="w-full border-collapse border border-black text-[10pt] mb-8 font-serif">
          <thead>
            <tr className="font-bold uppercase text-center bg-gray-50 text-[9pt]">
              <th className="border border-black p-2 w-[12%]">Date Issued</th>
              <th className="border border-black p-2 w-[14%]">ICS Slip No.</th>
              <th className="border border-black p-2 w-[30%]">Semi-Expendable Description</th>
              <th className="border border-black p-2 w-[8%]">Qty</th>
              <th className="border border-black p-2 w-[12%]">Unit Cost</th>
              <th className="border border-black p-2 w-[12%]">Total Value</th>
              <th className="border border-black p-2 w-[12%]">End-User Custodian</th>
            </tr>
          </thead>
          <tbody>
            {reportRows.length === 0 ? (
              <tr>
                <td className="border border-black p-4 text-center text-gray-400 font-bold" colSpan={7}>
                  No semi-expendable assets on active registry.
                </td>
              </tr>
            ) : (
              reportRows.map((row, idx) => {
                const qtyVal = Number(row.qtyPhysicalCount) || 1;
                const costVal = Number(row.unitValue) || 0;
                return (
                  <tr key={row.tempId || idx}>
                    <td className="border border-black p-2 text-center">{row.dateAcquired || reportDate}</td>
                    <td className="border border-black p-2 text-center font-mono">ICS-2024-{(idx*13+45).toString().padStart(3, '0')}</td>
                    <td className="border border-black p-2 uppercase">
                      <div className="font-bold">{row.article || 'OFFICE ASSET'}</div>
                      <div className="text-[8.5pt] text-gray-500 normal-case">{row.description || 'Specification details'}</div>
                    </td>
                    <td className="border border-black p-2 text-center font-bold">{qtyVal}</td>
                    <td className="border border-black p-2 text-right">₱{costVal.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                    <td className="border border-black p-2 text-right font-extrabold bg-blue-50/10">₱{(qtyVal * costVal).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                    <td className="border border-black p-2 text-center text-xs uppercase font-semibold">{row.officeAssociated || 'OFFICE STAFF'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Prepared By block */}
        <div className="grid grid-cols-2 gap-12 mt-12 pt-6 border-t border-black/10">
          <div className="text-left font-serif">
            <div className="font-bold italic text-[11pt] mb-12">Registry Clerk:</div>
            <div className="text-center">
              {isViewOnly ? (
                <span className="font-black border-b border-black px-8 uppercase block text-[13pt] leading-none mb-1 min-h-[22px]">
                  {regsipPreparedBy || 'MARIA S. REYES'}
                </span>
              ) : (
                <input
                  className={`${inputClass} border-b border-black w-full font-black text-center text-[13pt] uppercase mb-1`}
                  value={regsipPreparedBy}
                  onChange={e => setRegsipPreparedBy(e.target.value.toUpperCase())}
                  placeholder="PREPARED BY SIGNATORY"
                />
              )}
              <span className="text-[8.5pt] uppercase tracking-widest text-neutral-400 font-bold">Property Ledger Officer</span>
            </div>
          </div>
          <div className="text-left font-serif">
            <div className="font-bold italic text-[11pt] mb-12">Authorized Approved:</div>
            <div className="text-center">
              {isViewOnly ? (
                <span className="font-black border-b border-black px-8 uppercase block text-[13pt] leading-none mb-1 min-h-[22px]">
                  {regsipApprovedBy || 'PEDRO L. SANTOS'}
                </span>
              ) : (
                <input
                  className={`${inputClass} border-b border-black w-full font-black text-center text-[13pt] uppercase mb-1`}
                  value={regsipApprovedBy}
                  onChange={e => setRegsipApprovedBy(e.target.value.toUpperCase())}
                  placeholder="APPROVED BY SIGNATORY"
                />
              )}
              <span className="text-[8.5pt] uppercase tracking-widest text-neutral-400 font-bold">Heads of Office / Treasurer</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (reportMode === 'itr') {
    return (
      <div className="text-[11pt] tracking-normal font-serif leading-normal w-full select-text">
        <div className="text-right italic font-black text-[12pt] mb-2">Appendix 71</div>
        <div className="text-center font-bold text-[10pt] uppercase mb-6 text-gray-400">
          PROVINCE OF ANTIQUE, MUNICIPALITY OF TIBIAO
        </div>
        <div className="text-center mb-8">
          <h1 className="font-bold text-[18pt] leading-none mb-1 text-black tracking-tight uppercase">INVENTORY TRANSFER REPORT</h1>
          <div className="text-[10pt] italic">Departmental Property Custody Transfer Control Form</div>
        </div>

        {/* Metadata Section */}
        <div className="grid grid-cols-2 gap-4 mb-8 border border-neutral-300 p-4 rounded-xl leading-[1.8] text-[11.5pt]">
          <div className="flex items-center">
            <span className="font-bold mr-2 w-48">Transfer Report No:</span>
            <input
              className={`${inputClass} text-left w-60`}
              value={itrNo}
              onChange={e => setItrNo(e.target.value)}
              placeholder="ITR NO"
            />
          </div>
          <div className="flex items-center justify-end">
            <span className="font-bold mr-2">Transfer Date:</span>
            <input
              className={`${inputClass} w-48`}
              value={itrDate}
              onChange={e => setItrDate(e.target.value)}
              placeholder="TRANSFER DATE"
            />
          </div>
          <div className="flex items-center">
            <span className="font-bold mr-2 w-48">From (Transferor):</span>
            <input
              className={`${inputClass} text-left text-indigo-800 w-60`}
              value={itrFromTransferor}
              onChange={e => setItrFromTransferor(e.target.value.toUpperCase())}
              placeholder="FROM USER/TREASURER"
            />
          </div>
          <div className="flex items-center justify-end">
            <span className="font-bold mr-2">To (Transferee):</span>
            <input
              className={`${inputClass} text-emerald-800 w-64`}
              value={itrToTransferee}
              onChange={e => setItrToTransferee(e.target.value.toUpperCase())}
              placeholder="TO RECIPIENT OFFICE HEAD"
            />
          </div>
          <div className="col-span-2 flex items-center">
            <span className="font-bold mr-2 w-48">Purpose of Transfer:</span>
            <input
              className={`${inputClass} text-left w-full text-xs font-normal italic`}
              value={itrPurpose}
              onChange={e => setItrPurpose(e.target.value)}
              placeholder="State the reasons for property custody transfer..."
            />
          </div>
        </div>

        {/* Type of Transfer Selection Card */}
        <div className="mb-8 p-4 border border-teal-250/30 bg-teal-50/5 rounded-2xl">
          <div className="text-[10px] font-black uppercase tracking-wider text-teal-800 mb-3">Type of Transfer</div>
          <div className="flex flex-wrap items-center gap-6 text-[13px]">
            {['donation', 'relocation', 'reassignment', 'sale', 'others'].map((type) => (
              <label key={type} className="flex items-center gap-2 font-bold cursor-pointer select-none">
                <input
                  type="radio"
                  disabled={isViewOnly}
                  checked={itrType === type}
                  onChange={() => setItrType(type)}
                  className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-neutral-300"
                />
                <span className="capitalize">{type}</span>
              </label>
            ))}
            {itrType === 'others' && (
              <div className="flex items-center gap-2 ml-4">
                <span className="text-[11px] font-bold text-gray-400">Specify:</span>
                {isViewOnly ? (
                  <span className="font-bold border-b border-black text-xs px-2">{itrTypeOthers || 'N/A'}</span>
                ) : (
                  <input
                    type="text"
                    value={itrTypeOthers}
                    onChange={(e) => setItrTypeOthers(e.target.value)}
                    placeholder="Other transfer type..."
                    className={`${inputClass} !py-1 !px-2 !text-xs w-48`}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Transfer Table Grid */}
        <table className="w-full border-collapse border border-black text-[10pt] mb-8 font-serif">
          <thead>
            <tr className="font-bold uppercase text-center bg-gray-50 text-[9pt]">
              <th className="border border-black p-2 w-[12%]">Acquisition Date</th>
              <th className="border border-black p-2 w-[16%]">Property No.</th>
              <th className="border border-black p-2 w-[10%]">Unit</th>
              <th className="border border-black p-2 w-[28%]">Description (Specification of Transfer)</th>
              <th className="border border-black p-2 w-[6%]">Qty</th>
              <th className="border border-black p-2 w-[13%]">Unit Cost</th>
              <th className="border border-black p-2 w-[15%]">Total Cost</th>
              <th className="border border-black p-2 w-[10%]">Condition</th>
            </tr>
          </thead>
          <tbody>
            {reportRows.length === 0 ? (
              <tr>
                <td className="border border-black p-4 text-center text-gray-400 font-bold" colSpan={8}>
                  No items listed for transfer.
                </td>
              </tr>
            ) : (
              reportRows.map((row, idx) => {
                const cleanQty = Number(row.qtyPhysicalCount) || 1;
                const cleanCost = Number(row.unitValue) || 0;
                const totalCost = cleanQty * cleanCost;
                return (
                  <tr key={row.tempId || idx}>
                    <td className="border border-black p-2 text-center text-xs">{row.dateAcquired || reportDate || 'N/A'}</td>
                    <td className="border border-black p-2 text-center font-mono text-xs">{row.propertyNumber || 'Pending'}</td>
                    <td className="border border-black p-2 text-center text-xs font-bold uppercase">{row.unitOfMeasure || 'unit'}</td>
                    <td className="border border-black p-2 uppercase text-left">
                      <div className="font-bold text-xs">{row.article || 'Transferred Prop'}</div>
                      <div className="text-[8.5pt] text-gray-500 normal-case lowercase">{row.description || 'no specifications'}</div>
                    </td>
                    <td className="border border-black p-2 text-center font-bold">{cleanQty}</td>
                    <td className="border border-black p-2 text-right font-bold text-xs">₱{cleanCost.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                    <td className="border border-black p-2 text-right font-bold text-xs text-neutral-800">₱{totalCost.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                    <td className="border border-black p-2 text-center text-indigo-600 font-bold text-xs">{row.condition || 'Good'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* ITR Signatures */}
        <div className="grid grid-cols-3 gap-8 mt-12 pt-6 border-t border-black/10">
          <div className="text-left font-serif">
            <div className="font-bold italic text-[11pt] mb-12">Released / Transferred By:</div>
            <div className="text-center">
              {isViewOnly ? (
                <span className="font-black border-b border-black w-full block text-[13pt] uppercase mb-1 leading-tight min-h-[22px] text-center">
                  {itrFromTransferor || 'JUAN DELA CRUZ'}
                </span>
              ) : (
                <input
                  className={`${inputClass} w-full text-center text-[13pt] mb-1 font-black`}
                  value={itrFromTransferor}
                  onChange={e => setItrFromTransferor(e.target.value.toUpperCase())}
                  placeholder="TRANSFEROR NAME"
                />
              )}
              {isViewOnly ? (
                <span className="text-[8.5pt] uppercase tracking-widest text-neutral-400 font-bold block">{itrFromPosition || 'Property Custodian'}</span>
              ) : (
                <input
                  className={`${inputClass} w-full text-center !text-[8.5pt] !text-gray-500 lowercase normal-case !font-bold pt-0.5 border-none mt-1 mt-0`}
                  value={itrFromPosition}
                  onChange={e => setItrFromPosition(e.target.value)}
                  placeholder="Designation"
                />
              )}
              <span className="text-[7.5pt] uppercase tracking-widest text-neutral-400 font-bold block border-t border-neutral-250 mt-4 pt-1">Signature over Printed Name</span>
            </div>
          </div>

          <div className="text-left font-serif">
            <div className="font-bold italic text-[11pt] mb-12">Approved By:</div>
            <div className="text-center">
              {isViewOnly ? (
                <span className="font-black border-b border-black w-full block text-[13pt] uppercase mb-1 leading-tight min-h-[22px] text-center">
                  {itrApprovedBy || 'JUDGE B. CABRERA'}
                </span>
              ) : (
                <input
                  className={`${inputClass} w-full text-center text-[13pt] mb-1 font-black`}
                  value={itrApprovedBy}
                  onChange={e => setItrApprovedBy(e.target.value.toUpperCase())}
                  placeholder="APPROVING HEAD"
                />
              )}
              {isViewOnly ? (
                <span className="text-[8.5pt] uppercase tracking-widest text-neutral-400 font-bold block">{itrApprovedPosition || 'Municipal Mayor'}</span>
              ) : (
                <input
                  className={`${inputClass} w-full text-center !text-[8.5pt] !text-gray-500 lowercase normal-case !font-bold pt-0.5 border-none mt-1 mt-0`}
                  value={itrApprovedPosition}
                  onChange={e => setItrApprovedPosition(e.target.value)}
                  placeholder="Approver Position"
                />
              )}
              <span className="text-[7.5pt] uppercase tracking-widest text-neutral-400 font-bold block border-t border-neutral-250 mt-4 pt-1">Signature over Printed Name</span>
            </div>
          </div>

          <div className="text-left font-serif">
            <div className="font-bold italic text-[11pt] mb-12">Received / Transferee:</div>
            <div className="text-center">
              {isViewOnly ? (
                <span className="font-black border-b border-black w-full block text-[13pt] uppercase mb-1 leading-tight min-h-[22px] text-center">
                  {itrToTransferee || 'MARIA REYES'}
                </span>
              ) : (
                <input
                  className={`${inputClass} w-full text-center text-[13pt] mb-1 font-black`}
                  value={itrToTransferee}
                  onChange={e => setItrToTransferee(e.target.value.toUpperCase())}
                  placeholder="TRANSFEREE NAME"
                />
              )}
              {isViewOnly ? (
                <span className="text-[8.5pt] uppercase tracking-widest text-neutral-400 font-bold block">{itrToPosition || 'Administrative Assistant III'}</span>
              ) : (
                <input
                  className={`${inputClass} w-full text-center !text-[8.5pt] !text-gray-500 lowercase normal-case !font-bold pt-0.5 border-none mt-1 mt-0`}
                  value={itrToPosition}
                  onChange={e => setItrToPosition(e.target.value)}
                  placeholder="Designation"
                />
              )}
              <span className="text-[7.5pt] uppercase tracking-widest text-neutral-400 font-bold block border-t border-neutral-250 mt-4 pt-1">Signature over Printed Name</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (reportMode === 'rrsp') {
    return (
      <div className="text-[11pt] tracking-normal font-serif leading-normal w-full select-text">
        <div className="text-right italic font-black text-[12pt] mb-2">Appendix 63</div>
        <div className="text-center font-bold text-[10pt] uppercase mb-6 text-gray-400">
          PROVINCE OF ANTIQUE, MUNICIPALITY OF TIBIAO
        </div>
        <div className="text-center mb-8">
          <h1 className="font-bold text-[18pt] leading-none mb-1 text-black tracking-tight uppercase">REPORT ON THE RECEIPT OF PROPERTY</h1>
          <div className="text-[10pt] italic">LGU Receipt of Semi-Expendable Property (RRSP) Control Document</div>
        </div>

        {/* RRSP Information Cards */}
        <div className="grid grid-cols-2 gap-4 mb-8 border border-neutral-300 p-4 rounded-xl leading-[1.8] text-[11pt]">
          <div className="flex items-center">
            <span className="font-bold mr-2 w-48">RRSP Form No:</span>
            {isViewOnly ? (
              <span className="font-black border-b border-black w-60 text-left px-1 uppercase">{rrspNo || 'RRSP-2024-001'}</span>
            ) : (
              <input
                className={`${inputClass} text-left w-60`}
                value={rrspNo}
                onChange={e => setRrspNo(e.target.value)}
                placeholder="RRSP NO"
              />
            )}
          </div>
          <div className="flex items-center justify-end">
            <span className="font-bold mr-2">RRSP Date:</span>
            {isViewOnly ? (
              <span className="font-black border-b border-black w-48 text-center px-1">{rrspDate || 'Jan 18, 2024'}</span>
            ) : (
              <input
                className={`${inputClass} w-48`}
                value={rrspDate}
                onChange={e => setRrspDate(e.target.value)}
                placeholder="RECEIPT DATE"
              />
            )}
          </div>
          <div className="flex items-center">
            <span className="font-bold mr-2 w-48">Accountable Code:</span>
            {isViewOnly ? (
              <span className="font-black border-b border-black w-60 text-left px-1 text-indigo-700">{rrspAccountCode || '5020402002'}</span>
            ) : (
              <input
                className={`${inputClass} text-indigo-700 text-left w-60`}
                value={rrspAccountCode}
                onChange={e => setRrspAccountCode(e.target.value)}
                placeholder="GL ACCOUNT CODE"
              />
            )}
          </div>
          <div className="flex items-center justify-end">
            <span className="font-bold mr-2">Supplier / Source:</span>
            {isViewOnly ? (
              <span className="font-black border-b border-black w-64 text-center px-1 uppercase font-semibold text-teal-850">{rrspSupplier || 'ABC SUPPLIES LTD'}</span>
            ) : (
              <input
                className={`${inputClass} text-teal-900 w-64`}
                value={rrspSupplier}
                onChange={e => setRrspSupplier(e.target.value)}
                placeholder="SUPPLIER CORPORATE NAME"
              />
            )}
          </div>
          <div className="flex items-center">
            <span className="font-bold mr-2 w-48">OR / DV Reference:</span>
            {isViewOnly ? (
              <span className="font-black border-b border-black w-60 text-left px-1">{rrspOrDvNo || 'OR 221342'}</span>
            ) : (
              <input
                className={`${inputClass} text-left w-60`}
                value={rrspOrDvNo}
                onChange={e => setRrspOrDvNo(e.target.value)}
                placeholder="OR OR DV NUMBER"
              />
            )}
          </div>
          <div className="flex items-center justify-end">
            <span className="font-bold mr-2">Date of invoice:</span>
            {isViewOnly ? (
              <span className="font-black border-b border-black w-64 text-center px-1">{rrspOrDvDate || 'Jan 15, 2024'}</span>
            ) : (
              <input
                className={`${inputClass} w-64`}
                value={rrspOrDvDate}
                onChange={e => setRrspOrDvDate(e.target.value)}
                placeholder="OR OR DV DATE"
              />
            )}
          </div>
        </div>

        {/* RRSP Grid Table */}
        <table className="w-full border-collapse border border-black text-[10pt] mb-8 font-serif">
          <thead>
            <tr className="font-bold uppercase text-center bg-gray-50 text-[9pt]">
              <th className="border border-black p-2 w-[15%]">Invoice Stock No.</th>
              <th className="border border-black p-2 w-[40%]">Item Description</th>
              <th className="border border-black p-2 w-[10%]">Qty Received</th>
              <th className="border border-black p-2 w-[15%]">Unit Cost</th>
              <th className="border border-black p-2 w-[20%]">Total Values</th>
            </tr>
          </thead>
          <tbody>
            {reportRows.length === 0 ? (
              <tr>
                <td className="border border-black p-4 text-center text-gray-400 font-bold" colSpan={5}>
                  No items listed on property receipt report.
                </td>
              </tr>
            ) : (
              reportRows.map((row, idx) => {
                const countVal = Number(row.qtyPhysicalCount) || 1;
                const costVal = Number(row.unitValue) || 0;
                return (
                  <tr key={row.tempId || idx}>
                    <td className="border border-black p-2 text-center font-mono">{row.propertyNumber || 'PR-0023'}</td>
                    <td className="border border-black p-2 uppercase">
                      <div className="font-bold">{row.article || 'RECEIPT ITEM'}</div>
                      <div className="text-[8.5pt] text-gray-500 normal-case lowercase">{row.description || 'Description'}</div>
                    </td>
                    <td className="border border-black p-2 text-center font-bold">{countVal}</td>
                    <td className="border border-black p-2 text-right">₱{costVal.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                    <td className="border border-black p-2 text-right font-extrabold text-blue-800 bg-blue-50/10">₱{(countVal * costVal).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Prepared By block */}
        <div className="grid grid-cols-2 gap-12 mt-12 pt-6 border-t border-black/10">
          <div className="text-left font-serif">
            <div className="font-bold italic text-[11pt] mb-12">Received By (Supply Clerk):</div>
            <div className="text-center">
              {isViewOnly ? (
                <span className="font-black border-b border-black px-8 block text-[13pt] uppercase mb-1 leading-none min-h-[22px]">
                  {rrspReceivedBy || 'JUAN DELA CRUZ'}
                </span>
              ) : (
                <input
                  className={`${inputClass} border-b border-black w-full font-black text-center text-[13pt] uppercase mb-1`}
                  value={rrspReceivedBy}
                  onChange={e => setRrspReceivedBy(e.target.value.toUpperCase())}
                  placeholder="RECEIVER PRINTED NAME"
                />
              )}
              <span className="text-[8.5pt] uppercase tracking-widest text-neutral-400 font-bold">Supply Officer I / Clerk</span>
            </div>
          </div>
          <div className="text-left font-serif">
            <div className="font-bold italic text-[11pt] mb-12">Approved & Verified By:</div>
            <div className="text-center">
              {isViewOnly ? (
                <span className="font-black border-b border-black px-8 block text-[13pt] uppercase mb-1 leading-none min-h-[22px]">
                  {rrspApprovedBy || 'PEDRO L. SANTOS'}
                </span>
              ) : (
                <input
                  className={`${inputClass} border-b border-black w-full font-black text-center text-[13pt] uppercase mb-1`}
                  value={rrspApprovedBy}
                  onChange={e => setRrspApprovedBy(e.target.value.toUpperCase())}
                  placeholder="TREASURER / HEAD OF AGENCY"
                />
              )}
              <span className="text-[8.5pt] uppercase tracking-widest text-neutral-400 font-bold">Treasurer / Mayor Designee</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
