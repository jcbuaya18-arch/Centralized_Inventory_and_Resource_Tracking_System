import React, { useState, useEffect } from "react";
import { UserRole, Office } from "../types";
import { db } from "../firebase";
import { collection, addDoc, getDocs } from "firebase/firestore";
import { X, Package, Truck, DollarSign, FileText, Hash, CheckCircle2 } from "lucide-react";

interface SupplierShipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: UserRole;
  userName: string;
  offices?: Office[];
  onLodgeSuccess?: () => void;
}

const CATEGORIES = [
  "Office Equipment",
  "Furniture & Fixtures",
  "ICT Equipment",
  "Buildings",
  "Machinery",
  "Transportation Equipment",
  "Other Assets",
];

export const SupplierShipmentModal: React.FC<SupplierShipmentModalProps> = ({
  isOpen,
  onClose,
  userRole,
  userName,
  offices,
  onLodgeSuccess,
}) => {
  const [itemArticle, setItemArticle] = useState("");
  const [supplier, setSupplier] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [quantity, setQuantity] = useState(1);
  const [unitValue, setUnitValue] = useState(0);
  const [office, setOffice] = useState("");
  const [description, setDescription] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState("");
  const [fundingSource, setFundingSource] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localOffices, setLocalOffices] = useState<Office[]>([]);

  // Set default office when offices load
  useEffect(() => {
    if (offices && offices.length > 0) {
      setLocalOffices(offices);
      if (!office) {
        setOffice(offices[0].name);
      }
    } else {
      const fetchOffices = async () => {
        try {
          const snap = await getDocs(collection(db, "offices"));
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Office[];
          setLocalOffices(list);
          if (list.length > 0 && !office) {
            setOffice(list[0].name);
          }
        } catch (err) {
          console.error("Error fetching offices in modal:", err);
        }
      };
      fetchOffices();
    }
  }, [offices, office]);

  if (!isOpen) return null;

  const isAdminOrSupply = userRole === UserRole.ADMIN || userRole === UserRole.SUPPLY;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemArticle || !supplier || !office) {
      alert("Please fill in the required fields (Item Name, Supplier, and Department).");
      return;
    }

    setSubmitting(true);
    try {
      // Determine initial status based on user role
      // Admins/GSO bypass approval and register directly as APPROVED
      const status = isAdminOrSupply ? "APPROVED" : "PENDING";

      const shipmentData = {
        itemArticle: itemArticle.toUpperCase(),
        description: description || "Lodged Supplier Cargo",
        category,
        quantity: Math.max(1, Number(quantity)),
        unitValue: Math.max(0, Number(unitValue)),
        supplier: supplier.toUpperCase(),
        office,
        deliveryDate: new Date().toISOString(),
        status,
        requestedBy: userName,
        serialNumber: serialNumber || "",
        modelNumber: modelNumber || "",
        purchaseOrderNumber: purchaseOrderNumber || "",
        fundingSource: fundingSource || "",
        lodgedByRole: userRole,
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, "receiving_requests"), shipmentData);

      // Log to system logs
      const actionText = isAdminOrSupply
        ? `Registered Shipment Directly (Approved): ${quantity}x ${itemArticle} for ${office}`
        : `Submitted Shipment Request for Approval: ${quantity}x ${itemArticle} for ${office}`;

      await addDoc(collection(db, "system_logs"), {
        timestamp: new Date().toISOString(),
        user: userName,
        action: actionText,
        module: "Inventory Module",
      });

      alert(
        isAdminOrSupply
          ? "Supplier shipment registered successfully and is now ready for physical verification/distribution!"
          : "Supplier shipment request successfully submitted for executive approval!"
      );

      // Reset form fields
      setItemArticle("");
      setSupplier("");
      setCategory(CATEGORIES[0]);
      setQuantity(1);
      setUnitValue(0);
      setDescription("");
      setSerialNumber("");
      setModelNumber("");
      setPurchaseOrderNumber("");
      setFundingSource("");

      if (onLodgeSuccess) {
        onLodgeSuccess();
      }
      onClose();
    } catch (err) {
      console.error("Error lodging supplier shipment:", err);
      alert("Failed to lodge supplier shipment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-4">
      <div className="bg-white rounded-[32px] w-full max-w-2xl p-6 md:p-8 space-y-6 shadow-2xl animate-in zoom-in duration-200 text-left relative overflow-hidden max-h-[90vh] flex flex-col">
        {/* Decorative corner accent */}
        <div className="absolute top-0 left-0 w-2 h-full bg-blue-600"></div>

        {/* Header */}
        <div className="flex items-start justify-between pb-2 border-b border-gray-100 shrink-0">
          <div>
            <h4 className="font-sans font-black text-lg text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <Truck className="w-5 h-5 text-blue-600" />
              {isAdminOrSupply ? "Register Supplier Shipment" : "Lodge Supplier Shipment"}
            </h4>
            <p className="text-[9px] text-gray-400 uppercase tracking-widest font-black mt-1">
              {isAdminOrSupply
                ? "Directly log cargo into ready-to-receive state (skips self-approval)"
                : "Submit documentation to Mayor & GSO Admin for processing"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="space-y-6 overflow-y-auto pr-2 custom-scrollbar flex-1 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Required Group Banner */}
            <div className="col-span-1 md:col-span-2 text-[9px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1.5 rounded-lg">
              Primary Specifications (Required)
            </div>

            {/* Item Name */}
            <div className="space-y-1">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">
                Item Article / Nomenclature *
              </label>
              <div className="relative">
                <Package className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400" />
                <input
                  required
                  type="text"
                  value={itemArticle}
                  onChange={(e) => setItemArticle(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 focus:bg-white outline-none rounded-xl font-bold text-sm transition-all uppercase"
                  placeholder="e.g., LENOVO THINKPAD L14"
                />
              </div>
            </div>

            {/* Supplier */}
            <div className="space-y-1">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">
                Supplier Name *
              </label>
              <div className="relative">
                <Truck className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400" />
                <input
                  required
                  type="text"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 focus:bg-white outline-none rounded-xl font-bold text-sm transition-all uppercase"
                  placeholder="e.g., PH GLOBAL DISTRIBUTORS INC"
                />
              </div>
            </div>

            {/* Category */}
            <div className="space-y-1">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">
                Category Classification *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 focus:bg-white outline-none rounded-xl font-bold text-sm transition-all"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Target Department */}
            <div className="space-y-1">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">
                Destination Department / Office *
              </label>
              <select
                value={office}
                onChange={(e) => setOffice(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 focus:bg-white outline-none rounded-xl font-bold text-sm transition-all"
              >
                {localOffices.map((o) => (
                  <option key={o.id} value={o.name}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Quantity */}
            <div className="space-y-1">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">
                Quantity *
              </label>
              <input
                type="number"
                required
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 focus:bg-white outline-none rounded-xl font-bold text-sm transition-all"
              />
            </div>

            {/* Est Unit Value */}
            <div className="space-y-1">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">
                Est. Unit Value (₱) *
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400" />
                <input
                  type="number"
                  required
                  min="0"
                  step="any"
                  value={unitValue}
                  onChange={(e) => setUnitValue(Math.max(0, Number(e.target.value)))}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 focus:bg-white outline-none rounded-xl font-bold text-sm transition-all"
                />
              </div>
            </div>

            {/* Optional Metadata Section */}
            <div className="col-span-1 md:col-span-2 text-[9px] font-black text-slate-500 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg mt-2">
              Logistics Metadata (Optional)
            </div>

            {/* Model Number */}
            <div className="space-y-1">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">
                Model Number
              </label>
              <input
                type="text"
                value={modelNumber}
                onChange={(e) => setModelNumber(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 focus:bg-white outline-none rounded-xl font-bold text-sm transition-all"
                placeholder="e.g., T490S"
              />
            </div>

            {/* Serial Number */}
            <div className="space-y-1">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">
                Serial Number / Batch ID
              </label>
              <input
                type="text"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 focus:bg-white outline-none rounded-xl font-bold text-sm transition-all"
                placeholder="e.g., SN-89231-X"
              />
            </div>

            {/* Purchase Order (PO) Number */}
            <div className="space-y-1">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">
                Purchase Order (PO) #
              </label>
              <div className="relative">
                <Hash className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={purchaseOrderNumber}
                  onChange={(e) => setPurchaseOrderNumber(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 focus:bg-white outline-none rounded-xl font-bold text-sm transition-all"
                  placeholder="e.g., PO-2026-0482"
                />
              </div>
            </div>

            {/* Funding Source */}
            <div className="space-y-1">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">
                Funding Source
              </label>
              <input
                type="text"
                value={fundingSource}
                onChange={(e) => setFundingSource(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 focus:bg-white outline-none rounded-xl font-bold text-sm transition-all"
                placeholder="e.g., General Fund / SEF"
              />
            </div>

            {/* Tech Specs */}
            <div className="col-span-1 md:col-span-2 space-y-1">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">
                Technical Specifications & Remarks
              </label>
              <div className="relative">
                <FileText className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400" />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 focus:bg-white outline-none rounded-xl font-bold text-sm h-20 resize-none transition-all"
                  placeholder="Enter specific asset guidelines, warranty term, or special remarks..."
                />
              </div>
            </div>
          </div>

          {/* Value summary widget */}
          <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100 flex items-center justify-between">
            <div>
              <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest block">
                Total Estimated Value
              </span>
              <p className="text-[10px] text-gray-400 uppercase font-black tracking-wider mt-0.5">
                Calculated on units count
              </p>
            </div>
            <span className="font-mono text-lg font-black text-blue-700">
              ₱{(quantity * unitValue).toLocaleString()}
            </span>
          </div>

          {/* Form Action Buttons */}
          <div className="flex gap-3 pt-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-blue-100 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {submitting ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              ) : isAdminOrSupply ? (
                "Directly Register Shipment"
              ) : (
                "Submit Shipment Request"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
