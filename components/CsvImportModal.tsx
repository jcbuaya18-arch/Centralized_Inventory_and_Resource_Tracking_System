import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Upload, 
  X, 
  FileSpreadsheet, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight, 
  HelpCircle, 
  Settings, 
  Sliders, 
  Check, 
  CornerDownRight, 
  Download, 
  Loader2, 
  FileText 
} from "lucide-react";
import { InventoryItem, UserRole } from "../types";
import { db } from "../firebase";
import { collection, getDocs, query, where } from "firebase/firestore";

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  offices: Array<{ id: string; name: string }>;
  onAddItem: (item: Partial<InventoryItem>) => Promise<string | undefined>;
  items: InventoryItem[];
  userName: string;
}

interface MappingField {
  key: keyof InventoryItem | string;
  label: string;
  required: boolean;
  description: string;
  autoMapKeywords: string[];
}

const SCHEMA_FIELDS: MappingField[] = [
  { 
    key: "article", 
    label: "Article (Item Name)", 
    required: true, 
    description: "The name or brief title of the asset (e.g., Laptop, Office Chair).",
    autoMapKeywords: ["article", "item name", "item", "name", "asset", "asset name", "product", "description brief"]
  },
  { 
    key: "propertyNumber", 
    label: "Property Number", 
    required: false, 
    description: "LGU Property tag ID. Highly recommended. If omitted, will be auto-generated.",
    autoMapKeywords: ["property number", "property no", "prop no", "prop no.", "property_number", "prop_number", "propertyno", "tag", "tag number"]
  },
  { 
    key: "description", 
    label: "Description", 
    required: false, 
    description: "Detailed description of specs, brands, or dimensions.",
    autoMapKeywords: ["description", "desc", "specifications", "specs", "details", "specification"]
  },
  { 
    key: "category", 
    label: "Category", 
    required: false, 
    description: "Asset category (e.g., ICT Equipment, Office Equipment).",
    autoMapKeywords: ["category", "type", "class", "asset type", "asset category", "classification type"]
  },
  { 
    key: "office", 
    label: "Office / Department", 
    required: false, 
    description: "The municipal office assigned to this asset.",
    autoMapKeywords: ["office", "department", "dept", "location", "assignee office", "assignee_office", "office assigned"]
  },
  { 
    key: "personAccountable", 
    label: "Accountable Officer", 
    required: false, 
    description: "Head of Office or custodian legally accountable.",
    autoMapKeywords: ["person accountable", "accountable officer", "accountable person", "accountable", "officer", "officer in charge", "custodian"]
  },
  { 
    key: "assignedStaff", 
    label: "Assigned Staff / End User", 
    required: false, 
    description: "The specific employee currently utilizing the asset.",
    autoMapKeywords: ["assigned staff", "end user", "user", "assigned to", "staff", "end_user", "assigned_staff", "actual user"]
  },
  { 
    key: "unitOfMeasure", 
    label: "Unit of Measure", 
    required: false, 
    description: "Units, pieces, sets, etc. (e.g., unit, pc, set).",
    autoMapKeywords: ["unit of measure", "unit", "uom", "measure", "unit of measurement"]
  },
  { 
    key: "unitValue", 
    label: "Unit Value (Cost)", 
    required: false, 
    description: "Cost per single item. If empty, Acquisition Cost is used.",
    autoMapKeywords: ["unit value", "unit cost", "value", "cost", "price", "unit_value", "unit_cost", "cost per unit"]
  },
  { 
    key: "acquisitionCost", 
    label: "Acquisition Cost", 
    required: false, 
    description: "Total original purchase price. If empty, Unit Value is used.",
    autoMapKeywords: ["acquisition cost", "total cost", "acquisition price", "purchase cost", "cost total", "total value"]
  },
  { 
    key: "qtyPhysicalCount", 
    label: "Quantity (Physical)", 
    required: false, 
    description: "The actual count found on hand. Defaults to 1.",
    autoMapKeywords: ["quantity", "qty", "qty physical", "qty physical count", "physical count", "physical_count", "count", "amount"]
  },
  { 
    key: "qtyPropertyCard", 
    label: "Quantity (Property Card)", 
    required: false, 
    description: "The quantity recorded in the official ledger.",
    autoMapKeywords: ["qty property card", "qty property", "property card qty", "property_card_qty", "ledger qty"]
  },
  { 
    key: "serialNumber", 
    label: "Serial Number", 
    required: false, 
    description: "Manufacturer's serial number.",
    autoMapKeywords: ["serial number", "serial no", "serial", "serial_number", "serial_no", "sn", "s/n", "manufacturer serial"]
  },
  { 
    key: "modelNumber", 
    label: "Model Number", 
    required: false, 
    description: "Manufacturer's model name or code.",
    autoMapKeywords: ["model number", "model no", "model", "model_number", "model_no", "model code"]
  },
  { 
    key: "acquisitionDate", 
    label: "Acquisition Date", 
    required: false, 
    description: "YYYY-MM-DD format.",
    autoMapKeywords: ["acquisition date", "date received", "date assigned", "purchase date", "date", "acquisition_date", "received date"]
  },
  { 
    key: "supplier", 
    label: "Supplier", 
    required: false, 
    description: "Vendor name or dealership.",
    autoMapKeywords: ["supplier", "vendor", "dealer", "seller", "contractor", "merchant"]
  },
  { 
    key: "fundingSource", 
    label: "Funding Source", 
    required: false, 
    description: "Source of funding (e.g., General Fund, SEF).",
    autoMapKeywords: ["funding source", "funding", "source", "fund", "funding_source", "source of fund"]
  },
  { 
    key: "condition", 
    label: "Condition", 
    required: false, 
    description: "e.g., Brand New, Good, Fair, Damaged.",
    autoMapKeywords: ["condition", "status condition", "state", "physical condition"]
  },
  { 
    key: "remarks", 
    label: "Remarks", 
    required: false, 
    description: "Any extra notes or ledger annotations.",
    autoMapKeywords: ["remarks", "notes", "remark", "comment", "other notes"]
  },
];

const CATEGORIES = [
  "Office Equipment",
  "Furniture & Fixtures",
  "ICT Equipment",
  "Buildings",
  "Machinery",
  "Transportation Equipment",
  "Other Assets",
];

export function CsvImportModal({ 
  isOpen, 
  onClose, 
  offices, 
  onAddItem, 
  items, 
  userName 
}: CsvImportModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [fileName, setFileName] = useState<string>("");
  const [rawCsvData, setRawCsvData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>({}); // Schema key -> CSV Header
  
  // Settings & Defaults
  const [defaultOffice, setDefaultOffice] = useState<string>("");
  const [defaultCategory, setDefaultCategory] = useState<string>("Other Assets");
  const [defaultCondition, setDefaultCondition] = useState<string>("Brand New");
  const [defaultPerson, setDefaultPerson] = useState<string>("");
  const [duplicateMode, setDuplicateMode] = useState<"merge" | "skip">("merge");
  
  // Validation Warnings state
  const [warnings, setWarnings] = useState<{ row: number; msg: string; type: "error" | "warning" }[]>([]);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; percentage: number }>({ current: 0, total: 0, percentage: 0 });
  const [importStatus, setImportStatus] = useState<"idle" | "importing" | "completed" | "failed">("idle");
  const [importedCount, setImportedCount] = useState<number>(0);
  const [skippedCount, setSkippedCount] = useState<number>(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Set default office on open
  useEffect(() => {
    if (offices && offices.length > 0 && !defaultOffice) {
      setDefaultOffice(offices[0].name);
    }
    if (!defaultPerson) {
      setDefaultPerson(userName || "Supply Unit");
    }
  }, [offices, userName]);

  if (!isOpen) return null;

  // Custom CSV parser
  function parseCSV(text: string): string[][] {
    const result: string[][] = [];
    let row: string[] = [];
    let currentVal = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentVal += '"';
          i++; // skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(currentVal.trim());
        currentVal = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++; // skip \n
        }
        row.push(currentVal.trim());
        result.push(row);
        row = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }

    if (currentVal || row.length > 0) {
      row.push(currentVal.trim());
      result.push(row);
    }

    return result.filter(r => r.length > 0 && r.some(cell => cell !== ''));
  }

  const handleFileLoad = (file: File) => {
    if (!file) return;
    setFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        alert("The uploaded CSV file is empty or formatted incorrectly.");
        return;
      }
      
      const fileHeaders = parsed[0].map(h => h.trim());
      setHeaders(fileHeaders);
      setRawCsvData(parsed.slice(1));
      
      // Auto mapping
      const initialMappings: Record<string, string> = {};
      SCHEMA_FIELDS.forEach(field => {
        const matchedHeader = fileHeaders.find(header => {
          const cleanHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '');
          return field.autoMapKeywords.some(kw => {
            const cleanKw = kw.toLowerCase().replace(/[^a-z0-9]/g, '');
            return cleanHeader === cleanKw || cleanHeader.includes(cleanKw) || cleanKw.includes(cleanHeader);
          });
        });
        if (matchedHeader) {
          initialMappings[field.key as string] = matchedHeader;
        }
      });
      setColumnMappings(initialMappings);
      setStep(2);
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.csv')) {
        handleFileLoad(file);
      } else {
        alert("Please upload a valid CSV file (.csv).");
      }
    }
  };

  const downloadTemplate = () => {
    const templateHeaders = SCHEMA_FIELDS.map(f => f.label).join(",");
    const sampleRow = [
      "COMPUTER MONITOR LCD 24-INCH",
      "LGU-ICT-2026-0082",
      "IPS Monitor with HDMI cables and power brick, 1080p resolution",
      "ICT Equipment",
      "Mayor's Office",
      "Hon. Jocelyn R. Cabrera",
      "John Doe",
      "unit",
      "14500",
      "14500",
      "5",
      "5",
      "MONITOR-SN-9918A",
      "LG-24MK600",
      "2026-04-12",
      "PhilGEPS Office Depot",
      "General LGU Appropriations Fund",
      "Brand New",
      "Assigned to support executive staff."
    ].map(val => `"${val.replace(/"/g, '""')}"`).join(",");

    const csvContent = "data:text/csv;charset=utf-8," + templateHeaders + "\n" + sampleRow;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "lgu_tibiao_inventory_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleMappingChange = (schemaKey: string, csvHeader: string) => {
    setColumnMappings(prev => {
      const updated = { ...prev };
      if (!csvHeader) {
        delete updated[schemaKey];
      } else {
        updated[schemaKey] = csvHeader;
      }
      return updated;
    });
  };

  // Run validation
  const validateMappings = () => {
    const newWarnings: typeof warnings = [];
    
    // Check required fields
    const missingRequired = SCHEMA_FIELDS.filter(f => f.required && !columnMappings[f.key as string]);
    if (missingRequired.length > 0) {
      alert(`Please map all required fields. Missing: ${missingRequired.map(f => f.label).join(", ")}`);
      return;
    }

    const articleHeader = columnMappings["article"];
    const propertyNumberHeader = columnMappings["propertyNumber"];
    const unitValueHeader = columnMappings["unitValue"];
    const qtyHeader = columnMappings["qtyPhysicalCount"];

    rawCsvData.forEach((row, rowIndex) => {
      const rowNum = rowIndex + 1;
      
      // Check Article value
      const articleColIdx = headers.indexOf(articleHeader);
      const articleVal = row[articleColIdx];
      if (!articleVal || !articleVal.trim()) {
        newWarnings.push({
          row: rowNum,
          msg: `Row ${rowNum}: Empty "Article (Item Name)". This row will be skipped.`,
          type: "error"
        });
      }

      // Check Property Number duplicates
      if (propertyNumberHeader) {
        const propColIdx = headers.indexOf(propertyNumberHeader);
        const propVal = row[propColIdx]?.trim();
        if (propVal) {
          // Check duplicate within the CSV itself
          const firstDupIndex = rawCsvData.findIndex((r, idx) => {
            const pVal = r[headers.indexOf(propertyNumberHeader)]?.trim();
            return idx < rowIndex && pVal && pVal.toLowerCase() === propVal.toLowerCase();
          });

          if (firstDupIndex >= 0) {
            newWarnings.push({
              row: rowNum,
              msg: `Row ${rowNum}: Duplicate Property Number "${propVal}" found earlier in CSV (Row ${firstDupIndex + 1}).`,
              type: "warning"
            });
          }

          // Check duplicate against existing system database
          const matchedSystemItem = items.find(item => item.propertyNumber?.trim().toLowerCase() === propVal.toLowerCase());
          if (matchedSystemItem) {
            newWarnings.push({
              row: rowNum,
              msg: `Row ${rowNum}: Property Number "${propVal}" matches existing system asset "${matchedSystemItem.article}". Action: ${duplicateMode === "merge" ? "Will increment stock of existing asset" : "Will skip this record"}.`,
              type: "warning"
            });
          }
        }
      }

      // Numeric value warnings
      if (unitValueHeader) {
        const valColIdx = headers.indexOf(unitValueHeader);
        const valueStr = row[valColIdx];
        if (valueStr && isNaN(Number(valueStr.replace(/[^0-9.]/g, "")))) {
          newWarnings.push({
            row: rowNum,
            msg: `Row ${rowNum}: Unit Value "${valueStr}" is not a valid number. Defaulting to 0.`,
            type: "warning"
          });
        }
      }

      if (qtyHeader) {
        const qtyColIdx = headers.indexOf(qtyHeader);
        const qtyStr = row[qtyColIdx];
        if (qtyStr && isNaN(Number(qtyStr.replace(/[^0-9]/g, "")))) {
          newWarnings.push({
            row: rowNum,
            msg: `Row ${rowNum}: Quantity "${qtyStr}" is not a valid number. Defaulting to 1.`,
            type: "warning"
          });
        }
      }
    });

    setWarnings(newWarnings);
    setStep(3);
  };

  const getMappedValue = (row: string[], schemaKey: string, defaultValue: any = ""): string => {
    const csvHeader = columnMappings[schemaKey];
    if (!csvHeader) return defaultValue;
    const colIdx = headers.indexOf(csvHeader);
    if (colIdx === -1) return defaultValue;
    return row[colIdx]?.trim() || defaultValue;
  };

  const executeImport = async () => {
    setImportStatus("importing");
    setImportProgress({ current: 0, total: rawCsvData.length, percentage: 0 });
    
    let imported = 0;
    let skipped = 0;
    const articleHeader = columnMappings["article"];
    const articleColIdx = headers.indexOf(articleHeader);

    for (let i = 0; i < rawCsvData.length; i++) {
      const row = rawCsvData[i];
      const rowNum = i + 1;
      
      // Skip row if no article (item name)
      const articleVal = row[articleColIdx];
      if (!articleVal || !articleVal.trim()) {
        skipped++;
        continue;
      }

      const propNoVal = getMappedValue(row, "propertyNumber")?.trim();
      
      // If duplicate mode is "skip" and property number matches existing
      if (propNoVal && duplicateMode === "skip") {
        const matched = items.find(item => item.propertyNumber?.trim().toLowerCase() === propNoVal.toLowerCase());
        if (matched) {
          skipped++;
          continue;
        }
      }

      // Read values and map
      const unitValStr = getMappedValue(row, "unitValue")?.replace(/[^0-9.]/g, "") || "";
      const acqCostStr = getMappedValue(row, "acquisitionCost")?.replace(/[^0-9.]/g, "") || "";
      const unitValue = Number(unitValStr) || 0;
      const acquisitionCost = Number(acqCostStr) || unitValue || 0;
      
      const qtyStr = getMappedValue(row, "qtyPhysicalCount")?.replace(/[^0-9]/g, "") || "";
      const qtyPhysicalCount = Number(qtyStr) || 1;
      const qtyPropertyCard = Number(getMappedValue(row, "qtyPropertyCard")?.replace(/[^0-9]/g, "")) || qtyPhysicalCount;
      
      const usefulLifeStr = getMappedValue(row, "usefulLife")?.replace(/[^0-9]/g, "") || "";
      const usefulLife = usefulLifeStr ? Number(usefulLifeStr) : 5;

      const categoryVal = getMappedValue(row, "category") || defaultCategory;
      // Map category strictly to our allowed categories if possible
      const matchedCategory = CATEGORIES.find(c => c.toLowerCase() === categoryVal.toLowerCase()) || defaultCategory;

      const itemPayload: Partial<InventoryItem> = {
        article: getMappedValue(row, "article").toUpperCase(),
        propertyNumber: propNoVal || "",
        description: getMappedValue(row, "description"),
        category: matchedCategory,
        office: getMappedValue(row, "office") || defaultOffice,
        personAccountable: getMappedValue(row, "personAccountable") || defaultPerson,
        assignedStaff: getMappedValue(row, "assignedStaff") || "",
        unitOfMeasure: getMappedValue(row, "unitOfMeasure") || "unit",
        unitValue: unitValue || acquisitionCost,
        acquisitionCost: acquisitionCost,
        qtyPhysicalCount,
        qtyPropertyCard,
        serialNumber: getMappedValue(row, "serialNumber"),
        modelNumber: getMappedValue(row, "modelNumber"),
        acquisitionDate: getMappedValue(row, "acquisitionDate") || new Date().toISOString().split('T')[0],
        supplier: getMappedValue(row, "supplier"),
        fundingSource: getMappedValue(row, "fundingSource"),
        condition: (getMappedValue(row, "condition") || defaultCondition) as any,
        remarks: getMappedValue(row, "remarks") || "Bulk CSV Imported Setup",
        status: (getMappedValue(row, "assignedStaff") ? "ASSIGNED" : "AVAILABLE") as any,
      };

      try {
        await onAddItem(itemPayload);
        imported++;
      } catch (err) {
        console.error("Failed to import row: ", rowNum, err);
        skipped++;
      }

      const nextVal = i + 1;
      setImportProgress({
        current: nextVal,
        total: rawCsvData.length,
        percentage: Math.round((nextVal / rawCsvData.length) * 100)
      });
    }

    setImportedCount(imported);
    setSkippedCount(skipped);
    setImportStatus("completed");
    setStep(4);
  };

  const handleReset = () => {
    setStep(1);
    setFileName("");
    setRawCsvData([]);
    setHeaders([]);
    setColumnMappings({});
    setWarnings([]);
    setImportProgress({ current: 0, total: 0, percentage: 0 });
    setImportStatus("idle");
    setImportedCount(0);
    setSkippedCount(0);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 md:p-6 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: "spring", duration: 0.4 }}
        className="bg-white rounded-[32px] md:rounded-[40px] border border-gray-100 shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden max-h-[90vh] text-left"
      >
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 md:px-8 py-5 flex items-center justify-between border-b border-gray-800">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
              <FileSpreadsheet className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-[12px] md:text-sm font-black uppercase tracking-wider leading-none">Unified CSV Import Engine</h2>
              <span className="text-[7.5px] text-gray-400 font-bold uppercase tracking-widest mt-1.5 block">Bulk Setup & Column Schema Mapping</span>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            disabled={importStatus === "importing"}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all border border-transparent hover:border-white/10 disabled:opacity-30 disabled:pointer-events-none"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Wizard Steps indicator */}
        <div className="bg-slate-50 border-b border-gray-100 px-6 md:px-8 py-3.5 flex items-center justify-between overflow-x-auto scrollbar-hide">
          <div className="flex items-center space-x-6 min-w-[500px]">
            <div className={`flex items-center space-x-2 text-[10px] font-black uppercase tracking-widest transition-all ${step === 1 ? "text-blue-600" : "text-gray-400"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${step === 1 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>1</span>
              <span>Upload CSV</span>
            </div>
            <ArrowRight className="w-3 h-3 text-gray-300" />
            <div className={`flex items-center space-x-2 text-[10px] font-black uppercase tracking-widest transition-all ${step === 2 ? "text-blue-600" : "text-gray-400"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${step === 2 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>2</span>
              <span>Map Columns</span>
            </div>
            <ArrowRight className="w-3 h-3 text-gray-300" />
            <div className={`flex items-center space-x-2 text-[10px] font-black uppercase tracking-widest transition-all ${step === 3 ? "text-blue-600" : "text-gray-400"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${step === 3 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>3</span>
              <span>Verify & Defaults</span>
            </div>
            <ArrowRight className="w-3 h-3 text-gray-300" />
            <div className={`flex items-center space-x-2 text-[10px] font-black uppercase tracking-widest transition-all ${step === 4 ? "text-blue-600" : "text-gray-400"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${step === 4 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>4</span>
              <span>Complete</span>
            </div>
          </div>

          {step > 1 && step < 4 && (
            <button 
              onClick={handleReset}
              className="text-[8.5px] font-black text-gray-500 hover:text-red-600 uppercase tracking-widest flex items-center gap-1 hover:bg-red-50 px-2 py-1 rounded-lg border border-transparent hover:border-red-100 transition-all"
            >
              Start Over
            </button>
          )}
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-grow overflow-y-auto p-6 md:p-8 max-h-[60vh] bg-slate-50/30">
          
          {/* STEP 1: UPLOAD FILE */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 md:p-5 flex items-start gap-3">
                <HelpCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <div className="text-left">
                  <h3 className="text-[11px] font-black uppercase tracking-wider text-blue-900">Initial System Setup Streamline</h3>
                  <p className="text-[9.5px] text-blue-700/80 font-bold mt-1 leading-relaxed">
                    Upload your existing asset ledger or inventory sheets directly. Our column mapping engine automatically converts standard municipal tables into active digital records, preserving serial codes, departments, and accountable officers.
                  </p>
                </div>
              </div>

              <div 
                ref={dragRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-[24px] p-8 md:p-12 text-center flex flex-col items-center justify-center cursor-pointer transition-all ${
                  isDragging 
                    ? "border-blue-500 bg-blue-50/30 scale-[0.99]" 
                    : "border-gray-200 bg-white hover:border-gray-300 hover:bg-slate-50/10"
                }`}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={(e) => e.target.files?.[0] && handleFileLoad(e.target.files[0])}
                  className="hidden" 
                  accept=".csv"
                />
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 mb-4 transition-transform group-hover:scale-110">
                  <Upload className="w-6 h-6 text-slate-600" />
                </div>
                <h4 className="text-[11px] font-black uppercase tracking-wider text-gray-800">Drag & Drop Asset CSV Ledger</h4>
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-2">or click to browse your files</p>
                <div className="mt-4 px-3 py-1 bg-slate-50 border border-gray-100 text-[8px] font-black uppercase tracking-widest text-gray-500 rounded-lg">
                  Supports .csv format only
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-gray-100">
                <div className="text-left">
                  <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest block">Need a quick reference?</span>
                  <span className="text-[8px] text-gray-400 font-semibold block mt-0.5">Use our pre-configured standard CSV columns spreadsheet to format your asset list.</span>
                </div>
                <button 
                  onClick={downloadTemplate}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-black rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-sm shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download CSV Template</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: MAP FIELDS */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-gray-900 text-white rounded-2xl p-4 border border-gray-800">
                <div className="text-left">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-400">Ledger Mapping Console</h4>
                  <span className="text-[8px] text-gray-400 font-bold block mt-1">We detected {headers.length} raw headers from "{fileName}". Map them to the system schema.</span>
                </div>
                <div className="px-3 py-1.5 bg-blue-600/20 border border-blue-500/20 text-blue-300 text-[8.5px] font-black uppercase tracking-widest rounded-xl shrink-0">
                  {rawCsvData.length} records parsed
                </div>
              </div>

              <div className="bg-white border border-gray-100 rounded-[24px] overflow-hidden shadow-sm">
                <div className="bg-slate-55 border-b border-gray-100 px-5 py-3 text-[9px] font-black uppercase tracking-wider text-gray-500">
                  Column Mappings Configuration
                </div>
                
                <div className="divide-y divide-gray-100 max-h-[300px] overflow-y-auto">
                  {SCHEMA_FIELDS.map((field) => {
                    const isMapped = !!columnMappings[field.key as string];
                    return (
                      <div key={field.key as string} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/30 transition-all">
                        <div className="text-left max-w-sm">
                          <div className="flex items-center space-x-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-gray-800">
                              {field.label}
                            </span>
                            {field.required && (
                              <span className="text-red-500 font-black text-xs" title="Required field">*</span>
                            )}
                            {isMapped && (
                              <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-md text-[7px] font-black uppercase tracking-wider border border-emerald-100">Mapped</span>
                            )}
                          </div>
                          <span className="text-[8.5px] text-gray-400 font-semibold block mt-1 leading-normal">
                            {field.description}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 md:w-64">
                          {isMapped && <CornerDownRight className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                          <select
                            value={columnMappings[field.key as string] || ""}
                            onChange={(e) => handleMappingChange(field.key as string, e.target.value)}
                            className={`w-full text-[9px] font-black uppercase tracking-wider p-2.5 rounded-xl border outline-none cursor-pointer transition-all ${
                              isMapped 
                                ? "border-blue-200 bg-blue-50/10 text-blue-900" 
                                : field.required 
                                  ? "border-amber-200 bg-amber-50/5 text-amber-900" 
                                  : "border-gray-200 bg-white text-gray-500 focus:border-blue-200"
                            }`}
                          >
                            <option value="">-- Do Not Map --</option>
                            {headers.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Data Preview Table */}
              <div className="bg-white border border-gray-100 rounded-[24px] p-5 shadow-sm space-y-4">
                <div className="text-left border-b border-gray-100 pb-2">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-800">Dynamic Live Mapped Preview</h4>
                  <span className="text-[8px] text-gray-400 font-bold block mt-0.5">Showing first 3 records as mapped based on mapping inputs:</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-[8.5px] font-bold text-left min-w-[600px] divide-y divide-gray-100">
                    <thead>
                      <tr className="text-gray-400 font-black uppercase tracking-wider">
                        <th className="pb-3 pr-4">Row</th>
                        <th className="pb-3 pr-4">Article (Mapped)</th>
                        <th className="pb-3 pr-4">Prop No (Mapped)</th>
                        <th className="pb-3 pr-4">Office (Mapped)</th>
                        <th className="pb-3 pr-4">Unit Value (Mapped)</th>
                        <th className="pb-3 pr-4">Condition (Mapped)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-700">
                      {rawCsvData.slice(0, 3).map((row, idx) => (
                        <tr key={idx}>
                          <td className="py-3 pr-4 text-gray-400">#{idx + 1}</td>
                          <td className="py-3 pr-4 text-gray-900 uppercase">{getMappedValue(row, "article") || <span className="text-red-500 font-black">[Missing *]</span>}</td>
                          <td className="py-3 pr-4 font-mono">{getMappedValue(row, "propertyNumber") || <span className="text-gray-300 italic">[Auto-Gen]</span>}</td>
                          <td className="py-3 pr-4 uppercase">{getMappedValue(row, "office") || <span className="text-gray-300 italic">[Default Office]</span>}</td>
                          <td className="py-3 pr-4">₱{Number(getMappedValue(row, "unitValue")?.replace(/[^0-9.]/g, "")) || 0}</td>
                          <td className="py-3 pr-4 text-blue-600">{getMappedValue(row, "condition") || <span className="text-gray-300 italic">[Default Condition]</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4">
                <button 
                  onClick={() => setStep(1)}
                  className="px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-black rounded-2xl text-[9.5px] font-black uppercase tracking-widest transition-all"
                >
                  Back
                </button>
                <button 
                  onClick={validateMappings}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-[9.5px] font-black uppercase tracking-widest transition-all shadow-md active:scale-95 flex items-center space-x-2"
                >
                  <span>Review & Set Defaults</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW & SET DEFAULTS */}
          {step === 3 && (
            <div className="space-y-6 text-left">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Default Fallback Settings */}
                <div className="bg-white border border-gray-100 rounded-[24px] p-5 shadow-sm space-y-4">
                  <div className="border-b border-gray-100 pb-2">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-800 flex items-center space-x-2">
                      <Settings className="w-4 h-4 text-slate-500" />
                      <span>Fallback Default Settings</span>
                    </h4>
                    <span className="text-[8px] text-gray-400 font-bold block mt-0.5">Applied when CSV column mapping values are blank or unmapped:</span>
                  </div>

                  <div className="space-y-3.5 text-xs">
                    <div>
                      <label className="text-[8px] font-black uppercase tracking-wider text-gray-500 block mb-1">Default Office Destination *</label>
                      <select
                        value={defaultOffice}
                        onChange={(e) => setDefaultOffice(e.target.value)}
                        className="w-full text-[9px] font-black uppercase tracking-wider p-2.5 rounded-xl border border-gray-200 outline-none focus:border-blue-200"
                      >
                        {offices.map(off => (
                          <option key={off.id} value={off.name}>{off.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[8px] font-black uppercase tracking-wider text-gray-500 block mb-1">Default Asset Category *</label>
                      <select
                        value={defaultCategory}
                        onChange={(e) => setDefaultCategory(e.target.value)}
                        className="w-full text-[9px] font-black uppercase tracking-wider p-2.5 rounded-xl border border-gray-200 outline-none focus:border-blue-200"
                      >
                        {CATEGORIES.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[8px] font-black uppercase tracking-wider text-gray-500 block mb-1">Default Accountable Officer</label>
                      <input 
                        type="text"
                        value={defaultPerson}
                        onChange={(e) => setDefaultPerson(e.target.value)}
                        placeholder="e.g. Mayor / Treasurer / Supply Officer"
                        className="w-full text-[9px] font-black uppercase tracking-wider p-2.5 rounded-xl border border-gray-200 outline-none focus:border-blue-200"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[8px] font-black uppercase tracking-wider text-gray-500 block mb-1">Default Condition</label>
                        <select
                          value={defaultCondition}
                          onChange={(e) => setDefaultCondition(e.target.value)}
                          className="w-full text-[9px] font-black uppercase tracking-wider p-2.5 rounded-xl border border-gray-200 outline-none focus:border-blue-200"
                        >
                          <option value="Brand New">Brand New</option>
                          <option value="Good">Good</option>
                          <option value="Fair">Fair</option>
                          <option value="Damaged">Damaged</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[8px] font-black uppercase tracking-wider text-gray-500 block mb-1">Duplicate Property Nos</label>
                        <select
                          value={duplicateMode}
                          onChange={(e) => setDuplicateMode(e.target.value as any)}
                          className="w-full text-[9px] font-black uppercase tracking-wider p-2.5 rounded-xl border border-gray-200 outline-none focus:border-blue-200"
                        >
                          <option value="merge">Merge & Add Qty</option>
                          <option value="skip">Skip Records</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Validation Warnings */}
                <div className="bg-white border border-gray-100 rounded-[24px] p-5 shadow-sm flex flex-col h-full space-y-4">
                  <div className="border-b border-gray-100 pb-2">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-800 flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <span>Ledger Conflict Validation</span>
                    </h4>
                    <span className="text-[8px] text-gray-400 font-bold block mt-0.5">Pre-import integrity analysis on {rawCsvData.length} records:</span>
                  </div>

                  <div className="flex-grow overflow-y-auto max-h-[220px] divide-y divide-gray-50 pr-1 text-xs space-y-2">
                    {warnings.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
                        <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                          <Check className="w-4.5 h-4.5" />
                        </div>
                        <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider">No Conflicts Found!</span>
                        <span className="text-[8px] text-gray-400 font-semibold max-w-[200px]">All parsed rows contain complete required fields and unique serial property codes.</span>
                      </div>
                    ) : (
                      warnings.map((warn, i) => (
                        <div key={i} className="py-2 flex items-start gap-2.5 text-[8.5px]">
                          {warn.type === "error" ? (
                            <span className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded-md font-black shrink-0 border border-red-100">ERROR</span>
                          ) : (
                            <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-md font-black shrink-0 border border-amber-100">WARN</span>
                          )}
                          <p className="text-gray-600 font-semibold leading-normal">{warn.msg}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>

              {/* Ready to Import Summary Box */}
              <div className="bg-slate-900 text-white rounded-2xl p-5 border border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-blue-600/20 border border-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center shadow-lg">
                    <FileText className="w-5.5 h-5.5" />
                  </div>
                  <div>
                    <h5 className="text-[11px] font-black uppercase tracking-wider text-white">Import Configuration Finalized</h5>
                    <span className="text-[8.5px] text-gray-400 font-semibold block mt-1">Ready to create {rawCsvData.length} records on the LGU Cloud Ledger.</span>
                  </div>
                </div>

                <div className="flex items-center space-x-4 shrink-0 bg-gray-950 p-2.5 rounded-xl border border-gray-800 self-start sm:self-auto">
                  <div className="text-center px-4">
                    <span className="text-[7.5px] text-gray-400 font-bold uppercase block">Mapped Total</span>
                    <span className="text-sm font-black text-blue-400 block mt-0.5">{rawCsvData.length}</span>
                  </div>
                  <div className="w-px h-6 bg-gray-800"></div>
                  <div className="text-center px-4">
                    <span className="text-[7.5px] text-gray-400 font-bold uppercase block">Auto property Tag</span>
                    <span className="text-sm font-black text-amber-400 block mt-0.5">
                      {rawCsvData.filter(r => !r[headers.indexOf(columnMappings["propertyNumber"])]?.trim()).length}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4">
                <button 
                  onClick={() => setStep(2)}
                  className="px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-black rounded-2xl text-[9.5px] font-black uppercase tracking-widest transition-all"
                >
                  Back
                </button>
                <button 
                  onClick={executeImport}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[9.5px] font-black uppercase tracking-widest transition-all shadow-md active:scale-95 flex items-center space-x-2"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Start Bulk Import</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: IMPORTING & COMPLETE */}
          {step === 4 && (
            <div className="py-6 text-center space-y-6">
              
              {importStatus === "importing" ? (
                <div className="space-y-5 max-w-md mx-auto">
                  <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto" />
                  <div>
                    <h4 className="text-[11px] font-black uppercase tracking-wider text-gray-800">Writing to Digital Ledger...</h4>
                    <span className="text-[8.5px] text-gray-400 font-bold block mt-1.5 uppercase tracking-widest">
                      Processing row {importProgress.current} of {importProgress.total} ({importProgress.percentage}%)
                    </span>
                  </div>

                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-gray-100">
                    <motion.div 
                      className="bg-blue-600 h-full rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${importProgress.percentage}%` }}
                      transition={{ duration: 0.1 }}
                    />
                  </div>
                  <span className="text-[7.5px] text-gray-400 font-semibold block uppercase tracking-widest">Integrating with master_assets & inventory_items collections</span>
                </div>
              ) : (
                <div className="space-y-6 max-w-lg mx-auto">
                  <div className="w-16 h-16 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-3xl flex items-center justify-center mx-auto shadow-sm">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>

                  <div className="space-y-1.5">
                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">CSV Data Ingestion Complete</h3>
                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">
                      The unified ledger has been successfully populated.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto bg-slate-50 border border-gray-100 p-4 rounded-2xl">
                    <div className="text-center">
                      <span className="text-[7.5px] text-emerald-700 font-black uppercase block">Assets Imported</span>
                      <span className="text-xl font-black text-emerald-950 mt-1 block leading-none">{importedCount}</span>
                    </div>
                    <div className="text-center">
                      <span className="text-[7.5px] text-gray-500 font-black uppercase block">Skipped/Merged</span>
                      <span className="text-xl font-black text-gray-950 mt-1 block leading-none">{skippedCount}</span>
                    </div>
                  </div>

                  <p className="text-[8px] text-gray-400 font-semibold max-w-xs mx-auto">
                    All transactions have been recorded under system logs and digital slips generated for PAR/ICS item classifications.
                  </p>

                  <div className="pt-4">
                    <button
                      onClick={() => {
                        handleReset();
                        onClose();
                      }}
                      className="px-6 py-3 bg-gray-900 hover:bg-black text-white rounded-2xl text-[9.5px] font-black uppercase tracking-widest transition-all shadow-md active:scale-95"
                    >
                      Return to Asset Register
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

        </div>
      </motion.div>
    </div>
  );
}
